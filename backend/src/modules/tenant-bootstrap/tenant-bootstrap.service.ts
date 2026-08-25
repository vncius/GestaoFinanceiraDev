import { AccountTypesService } from '../account-types/account-types.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { CategoryType } from '../categories/categories.types';
import { SettingsService } from '../settings/settings.service';

const MAIN_ACCOUNT_TYPE_NAME = 'Conta Principal';
const RESERVE_ACCOUNT_TYPE_NAME = 'Reserva de Emergência';

const DEFAULT_INCOME_CATEGORIES = [
  'Salário',
  'Projeto PJ',
  'Serviço avulso',
  'Reembolso',
  'Rendimento',
  'Ajuste positivo',
  'Outros recebimentos',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Carro',
  'Saúde',
  'Lazer',
  'Impostos',
  'Educação',
  'Assinaturas',
  'Viagem',
  'Emergência',
  'Cartão de crédito',
  'Outros pagamentos',
];

/** Cria a base mínima (conta, tipos de conta, categorias) para um tenant novo. */
export class TenantBootstrapService {
  constructor(
    private readonly accountTypesService: AccountTypesService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly settingsService: SettingsService,
  ) {}

  async seedDefaults(tenantId: string): Promise<void> {
    const { mainTypeId } = await this.ensureAccountTypes(tenantId);
    const mainAccountId = await this.ensureMainAccount(tenantId, mainTypeId);
    await this.ensureCategories(tenantId);
    await this.ensureMainAccountSetting(tenantId, mainAccountId);
  }

  private async ensureAccountTypes(tenantId: string): Promise<{ mainTypeId: string }> {
    const existing = await this.accountTypesService.findAll(tenantId);
    if (existing.length > 0) {
      const main = existing.find((t) => t.name === MAIN_ACCOUNT_TYPE_NAME) ?? existing[0];
      return { mainTypeId: main.id };
    }

    const mainType = await this.accountTypesService.create(tenantId, { name: MAIN_ACCOUNT_TYPE_NAME });
    await this.accountTypesService.create(tenantId, { name: RESERVE_ACCOUNT_TYPE_NAME });
    return { mainTypeId: mainType.id };
  }

  private async ensureMainAccount(tenantId: string, mainTypeId: string): Promise<string | null> {
    const existing = await this.accountsService.findAll(tenantId);
    if (existing.length > 0) return null;

    const account = await this.accountsService.create(tenantId, {
      name: MAIN_ACCOUNT_TYPE_NAME,
      accountTypeId: mainTypeId,
      initialBalance: 0,
      autoReserveEnabled: false,
      autoReservePercentage: 0,
    });
    return account.id;
  }

  private async ensureCategories(tenantId: string): Promise<void> {
    const existing = await this.categoriesService.findAll(tenantId);
    if (existing.length > 0) return;

    for (const name of DEFAULT_INCOME_CATEGORIES) {
      await this.categoriesService.create(tenantId, { name, type: CategoryType.INCOME });
    }
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      await this.categoriesService.create(tenantId, { name, type: CategoryType.EXPENSE });
    }
  }

  private async ensureMainAccountSetting(tenantId: string, mainAccountId: string | null): Promise<void> {
    if (!mainAccountId) return;
    const settings = await this.settingsService.get(tenantId);
    if (settings.mainAccountId) return;
    await this.settingsService.update(tenantId, { mainAccountId });
  }
}
