import { AccountsFileRepository } from '../../modules/accounts/accounts.file-repository';
import { AccountTypesFileRepository } from '../../modules/account-types/account-types.file-repository';
import { SettingsFileRepository } from '../../modules/settings/settings.file-repository';
import { generateId } from '../utils/id.utils';
import { nowISO } from '../utils/date.utils';
import { DEFAULT_TENANT_ID } from '../tenant/tenant.constants';

// Antes desta versão, `Account.type` era um enum fixo (MAIN/EMERGENCY_RESERVE/COMMON)
// e a separação automática de reserva era global (settings.defaultReservePercentage +
// settings.emergencyReserveAccountId). Esta migração roda uma única vez por tenant,
// de forma idempotente: contas gravadas antes desta versão não têm a chave
// `accountTypeId` no JSON em disco; uma vez migradas, sempre têm (mesmo que `null`),
// então esta função vira no-op nas próximas inicializações.
export async function migrateLegacyAccountConfig(): Promise<void> {
  const accountsRepo = new AccountsFileRepository();
  const accountTypesRepo = new AccountTypesFileRepository();
  const settingsRepo = new SettingsFileRepository();

  const accounts = await accountsRepo.findAll(DEFAULT_TENANT_ID);
  const pending = accounts.filter((a) => (a as unknown as Record<string, unknown>).accountTypeId === undefined);
  if (pending.length === 0) return;

  console.log(`[migration] Migrando ${pending.length} conta(s) para tipos parametrizáveis...`);

  const LEGACY_TYPE_NAMES: Record<string, string> = {
    MAIN: 'Conta Principal',
    EMERGENCY_RESERVE: 'Reserva de Emergência',
    COMMON: 'Conta Comum',
  };

  const existingTypes = await accountTypesRepo.findAll(DEFAULT_TENANT_ID);
  const typeByName = new Map(existingTypes.map((t) => [t.name, t]));
  const now = nowISO();

  const legacyTypeValues = [
    ...new Set(
      pending
        .map((a) => (a as unknown as Record<string, unknown>).type as string | undefined)
        .filter((t): t is string => !!t),
    ),
  ];

  for (const legacyType of legacyTypeValues) {
    const name = LEGACY_TYPE_NAMES[legacyType] ?? legacyType;
    if (!typeByName.has(name)) {
      const created = await accountTypesRepo.create({
        id: generateId(),
        tenantId: DEFAULT_TENANT_ID,
        name,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      typeByName.set(name, created);
    }
  }

  for (const account of pending) {
    const legacyType = (account as unknown as Record<string, unknown>).type as string | undefined;
    const typeName = legacyType ? LEGACY_TYPE_NAMES[legacyType] ?? legacyType : null;
    const accountTypeId = typeName ? typeByName.get(typeName)?.id ?? null : null;
    await accountsRepo.update(
      account.id,
      {
        accountTypeId,
        autoReserveEnabled: false,
        autoReservePercentage: 0,
        updatedAt: now,
      },
      DEFAULT_TENANT_ID,
    );
  }

  // Preserva o comportamento atual: a conta que era `emergencyReserveAccountId`
  // global passa a ter a separação automática configurada nela mesma.
  const settings = await settingsRepo.get(DEFAULT_TENANT_ID);
  const legacyReserveAccountId = (settings as unknown as Record<string, unknown> | null)?.emergencyReserveAccountId as
    | string
    | undefined;
  const legacyReservePercentage = (settings as unknown as Record<string, unknown> | null)?.defaultReservePercentage as
    | number
    | undefined;

  if (legacyReserveAccountId) {
    const reserveAccount = await accountsRepo.findById(legacyReserveAccountId, DEFAULT_TENANT_ID);
    if (reserveAccount) {
      await accountsRepo.update(
        reserveAccount.id,
        {
          autoReserveEnabled: true,
          autoReservePercentage: legacyReservePercentage ?? 30,
          updatedAt: nowISO(),
        },
        DEFAULT_TENANT_ID,
      );
      console.log(
        `[migration] Conta "${reserveAccount.name}" configurada com separação automática de ${legacyReservePercentage ?? 30}%.`,
      );
    }
  }

  console.log('[migration] Concluída.');
}
