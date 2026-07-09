import { NextFunction, Request, Response } from 'express';

// Logger de requisições mínimo (método, path, status, duração) para não
// depender de morgan/pino num backend local de arquivo único por processo.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
    );
  });

  next();
}
