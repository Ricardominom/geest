import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../db/data-source';
import { rows } from '../db/raw';
import { AppError } from '../errors/AppError';
import { log } from '../utils/logger';

const ESPERA_MAX_MS = 5_000;
const INTERVALO_MS = 50;
const VIGENCIA_HORAS = 24;

type Registro = {
  endpoint: string;
  request_hash: string;
  status: 'in_progress' | 'completed';
  response_status: number | null;
  response_body: unknown;
};

function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(canonicalizar).join(',')}]`;
  }
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizar(v)}`).join(',')}}`;
}

const dormir = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function leerRegistro(key: string): Promise<Registro | undefined> {
  return rows<Registro>(
    await AppDataSource.query(
      `SELECT "endpoint", "request_hash", "status", "response_status", "response_body"
         FROM "idempotency_keys" WHERE "key" = $1`,
      [key],
    ),
  )[0];
}

function interceptarRespuesta(res: Response, key: string): void {
  const enviarOriginal = res.json.bind(res);

  res.json = function (body: unknown): Response {
    const status = res.statusCode;

    void (async () => {
      try {
        if (status >= 500) {
          await AppDataSource.query(
            `DELETE FROM "idempotency_keys" WHERE "key" = $1`, [key],
          );
        } else {
          await AppDataSource.query(
            `UPDATE "idempotency_keys"
                SET "status" = 'completed', "response_status" = $2,
                    "response_body" = $3::json, "completed_at" = now()
              WHERE "key" = $1`,
            [key, status, JSON.stringify(body ?? null)],
          );
        }
      } catch (error) {
        log.error('[idempotency] no se pudo registrar la respuesta:', error);
        await AppDataSource
          .query(`DELETE FROM "idempotency_keys" WHERE "key" = $1`, [key])
          .catch(() => undefined);
      }

      enviarOriginal(body);
    })();

    return res;
  };
}

async function resolverExistente(
  key: string,
  endpoint: string,
  hash: string,
): Promise<{ status: number; body: unknown }> {
  const limite = Date.now() + ESPERA_MAX_MS;

  for (;;) {
    const registro = await leerRegistro(key);

    if (!registro) {
      throw AppError.conflict(
        'IDEMPOTENCY_RETRY',
        'La peticion anterior con esta clave no se completo. Vuelve a intentarlo.',
      );
    }

    if (registro.endpoint !== endpoint || registro.request_hash !== hash) {
      throw AppError.unprocessable(
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key ya fue utilizada para una peticion diferente.',
      );
    }

    if (registro.status === 'completed') {
      return { status: registro.response_status ?? 200, body: registro.response_body };
    }

    if (Date.now() >= limite) {
      throw AppError.conflict(
        'IDEMPOTENCY_IN_PROGRESS',
        'Otra peticion con esta clave sigue en curso. Reintenta en unos segundos.',
      );
    }
    await dormir(INTERVALO_MS);
  }
}

export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.get('Idempotency-Key')?.trim();

    if (!key) {
      next();
      return;
    }

    if (key.length > 255) {
      next(AppError.badRequest(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key no puede exceder 255 caracteres.',
      ));
      return;
    }

    const endpoint = `${req.method} ${req.path}`;
    const hash = createHash('sha256').update(canonicalizar(req.body)).digest('hex');

    try {
      const reservada = rows<{ id: string }>(
        await AppDataSource.query(
          `INSERT INTO "idempotency_keys" ("key", "endpoint", "request_hash", "status")
           VALUES ($1, $2, $3, 'in_progress')
           ON CONFLICT ("key") DO NOTHING
           RETURNING "id"`,
          [key, endpoint, hash],
        ),
      ).length > 0;

      if (reservada) {
        interceptarRespuesta(res, key);
        next();
        return;
      }

      const guardada = await resolverExistente(key, endpoint, hash);
      res.status(guardada.status).json(guardada.body);
    } catch (error) {
      next(error);
    }
  };
}

export async function purgarClavesVencidas(): Promise<void> {
  try {
    await AppDataSource.query(
      `DELETE FROM "idempotency_keys"
        WHERE "created_at" < now() - ($1 || ' hours')::interval`,
      [String(VIGENCIA_HORAS)],
    );
  } catch (error) {
    log.error('[idempotency] fallo la purga de claves vencidas:', error);
  }
}