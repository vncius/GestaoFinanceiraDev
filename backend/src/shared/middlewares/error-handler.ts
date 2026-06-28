import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Erro de validação',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  console.error('[Unhandled Error]', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
}
