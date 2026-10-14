declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      userId: string;
      /** IP real de quem fez a requisição (ver client-ip.middleware.ts). */
      clientIp: string;
    }
  }
}

export {};
