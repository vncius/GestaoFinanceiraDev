// Lê o log de auditoria com e-mail e IP legíveis (eles ficam criptografados
// no banco — S12 do plano de segurança). Para investigar incidente.
//
// Uso: npm run audit:read -- [--user <userId>] [--tenant <tenantId>] [--action <ação>] [--limit 50]
// Precisa de MONGODB_URI, MONGODB_DB_NAME e da mesma ENCRYPTION_KEY do servidor.
import 'dotenv/config';
import { connectMongo, closeMongo } from '../shared/persistence/mongo-client';
import { decryptFields } from '../shared/crypto/field-crypto';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = await connectMongo();
  const filter: Record<string, string> = {};
  if (arg('user')) filter.userId = arg('user')!;
  if (arg('tenant')) filter.tenantId = arg('tenant')!;
  if (arg('action')) filter.action = arg('action')!;
  const limit = Number(arg('limit') ?? 50);

  const entries = await db
    .collection('audit_log')
    .find(filter, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  for (const entry of entries) {
    const e = decryptFields(entry, ['email', 'ip']);
    console.log(
      [
        new Date(e.createdAt).toISOString(),
        e.action,
        `user=${e.userId ?? '-'}`,
        `tenant=${e.tenantId ?? '-'}`,
        `email=${e.email ?? '-'}`,
        `ip=${e.ip ?? '-'}`,
        e.details ? JSON.stringify(e.details) : '',
      ].join('  '),
    );
  }
  console.log(`(${entries.length} registro(s))`);
  await closeMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
