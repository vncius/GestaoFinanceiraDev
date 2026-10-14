import { NextFunction, Request, Response } from 'express';

// Logger de requisições mínimo (método, path, status, duração) para não
// depender de morgan/pino num backend local de arquivo único por processo.
// Sem query string (S9 do plano de segurança): hoje ela só leva mês/ano/ids,
// mas log de hospedagem fica fora do nosso controle — melhor não registrar
// nada que um parâmetro futuro possa carregar. Corpo nunca é logado.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[http] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
    );
  });

  next();
}
