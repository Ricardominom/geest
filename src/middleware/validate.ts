import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { AppError } from '../errors/AppError';

function toDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(raiz)',
    message: issue.message,
  }));
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        AppError.badRequest(
          'VALIDATION_ERROR',
          'El cuerpo del request no es valido.',
          toDetails(result.error),
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function parseIdParam(req: Request, param: string): number {
  const raw = req.params[param];
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw AppError.badRequest(
      'INVALID_ID',
      `El parametro ${param} debe ser un entero positivo, se recibio "${raw}".`,
    );
  }
  return value;
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw AppError.badRequest(
      'VALIDATION_ERROR',
      'Los parametros de consulta no son validos.',
      toDetails(result.error),
    );
  }
  return result.data;
}