import { NextFunction, Request, Response } from 'express';
import { DEFAULT_TENANT_ID } from '../tenant/tenant.constants';

// Resolve o tenant da requisição. Sem autenticação ainda, então hoje só
// existe o tenant default — mas todo o resto do backend já trata tenantId
// como um parâmetro real (não hardcoded internamente), então plugar login
// depois é só popular req.tenantId a partir da sessão em vez do header/default.
export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.tenantId = req.header('X-Tenant-Id') || DEFAULT_TENANT_ID;
  next();
}
