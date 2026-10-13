import { getDb } from '../persistence/mongo-client';
import { nowISO } from '../utils/date.utils';
import { hasValidPaymentAccount, fallbackPaymentAccountId } from '../../modules/credit-cards/card-payment-account.utils';

interface AccountDoc {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
}

interface CardDoc {
  id: string;
  tenantId: string;
  name: string;
  defaultPaymentAccountId?: string | null;
}

// Conta pagadora obrigatória no cartão (U2 do plano de simplificação de UX):
// preenche cartões sem pagadora válida (nula, ausente, conta inexistente ou
// inativa) com a primeira conta ativa do tenant em ordem alfabética. Só
// escreve onde falta, então roda em todo boot como no-op depois da primeira vez.
// dryRun: só lista o que mudaria, sem gravar (usado pelo script avulso).
export async function migrateCardPaymentAccount({ dryRun = false } = {}): Promise<void> {
  const db = getDb();
  const cards = await db
    .collection<CardDoc>('credit_cards')
    .find({}, { projection: { _id: 0, id: 1, tenantId: 1, name: 1, defaultPaymentAccountId: 1 } })
    .toArray();
  if (cards.length === 0) return;

  const tenantIds = [...new Set(cards.map((c) => c.tenantId))];
  const accounts = await db
    .collection<AccountDoc>('accounts')
    .find({ tenantId: { $in: tenantIds } }, { projection: { _id: 0, id: 1, tenantId: 1, name: 1, active: 1 } })
    .toArray();

  let fixed = 0;
  for (const tenantId of tenantIds) {
    const tenantAccounts = accounts.filter((a) => a.tenantId === tenantId);
    const fallback = fallbackPaymentAccountId(tenantAccounts);
    if (!fallback) continue;

    const broken = cards.filter(
      (c) =>
        c.tenantId === tenantId &&
        !hasValidPaymentAccount({ defaultPaymentAccountId: c.defaultPaymentAccountId ?? null }, tenantAccounts),
    );
    for (const card of broken) {
      if (dryRun) {
        console.log(
          `[migration][dry-run] tenant ${tenantId}: cartão "${card.name}" (${card.defaultPaymentAccountId ?? 'sem pagadora'}) → ${fallback}`,
        );
        fixed++;
        continue;
      }
      await db
        .collection('credit_cards')
        .updateOne({ tenantId, id: card.id }, { $set: { defaultPaymentAccountId: fallback, updatedAt: nowISO() } });
      fixed++;
    }
  }

  if (dryRun) {
    console.log(`[migration][dry-run] ${fixed} cartão(ões) seriam alterados (de ${cards.length} no total).`);
  } else if (fixed > 0) {
    console.log(`[migration] Conta pagadora definida em ${fixed} cartão(ões) sem pagadora válida (U2).`);
  }
}
