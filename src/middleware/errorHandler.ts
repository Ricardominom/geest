import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `No existe la ruta ${req.method} ${req.path}.`,
    },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo del request no es JSON valido.' },
    });
    return;
  }

  console.error('[error] no controlado:', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrio un error inesperado.' },
  });
}

export function asyncHandler(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}