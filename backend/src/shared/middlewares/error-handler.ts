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
      params: error.params,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Erro de validação',
      code: 'validation.generic',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        code: e.message,
      })),
    });
    return;
  }

  // Erros do body-parser (express.json): corpo acima do limite da rota ou
  // JSON malformado. Não são falha do servidor.
  const parserErrorType = (error as Error & { type?: string }).type;
  if (parserErrorType === 'entity.too.large') {
    res.status(413).json({ error: 'Conteúdo grande demais', code: 'common.payloadTooLarge' });
    return;
  }
  if (parserErrorType === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido', code: 'common.invalidJson' });
    return;
  }

  console.error('[Unhandled Error]', error);
  res.status(500).json({ error: 'Erro interno do servidor', code: 'common.internalError' });
}
