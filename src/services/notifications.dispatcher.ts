import { env } from '../config/env';
import { AppDataSource } from '../db/data-source';
import { rows } from '../db/raw';

const TAMANO_LOTE = 20;

type Pendiente = {
  id: string;
  task_id: number;
  payload: unknown;
  attempts: number;
};

type Resultado = {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  ms: number;
};

function backoffMs(intento: number): number {
  return 2 ** (intento - 1) * env.notifyBackoffMs;
}

async function enviar(payload: unknown): Promise<Resultado> {
  const inicio = Date.now();
  try {
    const respuesta = await fetch(env.notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.notifyTimeoutMs),
    });
    return {
      ok: respuesta.ok,
      httpStatus: respuesta.status,
      error: respuesta.ok ? null : `El receptor respondio ${respuesta.status}.`,
      ms: Date.now() - inicio,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - inicio,
    };
  }
}

async function reservarLote(): Promise<Pendiente[]> {
  return AppDataSource.transaction(async (manager) => {
    const lote = rows<Pendiente>(
      await manager.query(
        `SELECT "id", "task_id", "payload", "attempts"
           FROM "notifications"
          WHERE "status" = 'pending' AND "next_attempt_at" <= now()
          ORDER BY "next_attempt_at" ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [TAMANO_LOTE],
      ),
    );

    if (lote.length > 0) {
      await manager.query(
        `UPDATE "notifications"
            SET "next_attempt_at" = now() + ($2 || ' milliseconds')::interval
          WHERE "id" = ANY($1::bigint[])`,
        [lote.map((n) => n.id), String(env.notifyTimeoutMs * 2)],
      );
    }
    return lote;
  });
}

async function procesar(pendiente: Pendiente): Promise<void> {
  const intento = pendiente.attempts + 1;
  const resultado = await enviar(pendiente.payload);

  await AppDataSource.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO "notification_attempts"
         ("notification_id", "attempt_number", "http_status", "error", "duration_ms")
       VALUES ($1, $2, $3, $4, $5)`,
      [pendiente.id, intento, resultado.httpStatus, resultado.error, resultado.ms],
    );

    if (resultado.ok) {
      await manager.query(
        `UPDATE "notifications"
            SET "status" = 'sent', "attempts" = $2, "sent_at" = now(), "last_error" = NULL
          WHERE "id" = $1`,
        [pendiente.id, intento],
      );
      console.log(`[notify] tarea ${pendiente.task_id} entregada en el intento ${intento}`);
      return;
    }

    const reintentable = resultado.httpStatus === null || resultado.httpStatus >= 500;
    const agotado = intento >= env.notifyMaxAttempts;

    if (!reintentable || agotado) {
      await manager.query(
        `UPDATE "notifications"
            SET "status" = 'failed', "attempts" = $2, "last_error" = $3
          WHERE "id" = $1`,
        [pendiente.id, intento, resultado.error],
      );
      console.error(
        `[notify] tarea ${pendiente.task_id} descartada tras ${intento} intento(s): ${resultado.error}`,
      );
      return;
    }

    const espera = backoffMs(intento);
    await manager.query(
      `UPDATE "notifications"
          SET "attempts" = $2, "last_error" = $3,
              "next_attempt_at" = now() + ($4 || ' milliseconds')::interval
        WHERE "id" = $1`,
      [pendiente.id, intento, resultado.error, String(espera)],
    );
    console.warn(
      `[notify] tarea ${pendiente.task_id} fallo el intento ${intento}, reintento en ${espera} ms`,
    );
  });
}

export async function despacharPendientes(): Promise<number> {
  if (!env.notifyUrl) return 0;

  const lote = await reservarLote();
  for (const pendiente of lote) {
    try {
      await procesar(pendiente);
    } catch (error) {
      console.error(`[notify] error procesando la notificacion ${pendiente.id}:`, error);
    }
  }
  return lote.length;
}

export function iniciarDespachador(): void {
  if (!env.notifyUrl) {
    console.warn('[notify] NOTIFY_URL sin configurar: el despachador no se inicia.');
    return;
  }
  setInterval(() => {
    void despacharPendientes().catch((error) =>
      console.error('[notify] fallo el ciclo de despacho:', error),
    );
  }, env.notifyPollMs).unref();
  console.log(`[notify] despachador activo cada ${env.notifyPollMs} ms hacia ${env.notifyUrl}`);
}
