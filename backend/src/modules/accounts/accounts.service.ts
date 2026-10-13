import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from './accounts.repository';
import { Account } from './accounts.types';
import { CreateAccountInput, UpdateAccountInput } from './accounts.schemas';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository';

export class AccountsService {
  constructor(
    private readonly repo: AccountsRepository,
    // Opcional: quando presente, impede desativar uma conta que paga a fatura
    // de algum cartão ativo (U2) — a fatura sumiria de todos os fluxos.
    private readonly cardsRepo?: Pick<CreditCardsRepository, 'findActive'>,
  ) {}

  findAll(tenantId: string): Promise<Account[]> {
    return this.repo.findActive(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<Account> {
    const account = await this.repo.findById(id, tenantId);
    if (!account || !account.active) {
      throw new AppError('Conta não encontrada', 404, 'account.notFound');
    }
    return account;
  }

  async create(tenantId: string, input: CreateAccountInput): Promise<Account> {
    const now = nowISO();
    // Sem validação de origem/destino aqui de propósito: uma regra
    // incompleta (enabled sem target) fica apenas inerte — createIncome/
    // receiveIncome no CashFlowService ignora regras sem target. A
    // validação de fato só entra em update(), quando o usuário configura a
    // regra pela tela de Contas com as duas contas já existentes.
    return this.repo.create({
      id: generateId(),
      tenantId,
      name: input.name,
      accountTypeId: input.accountTypeId ?? null,
      initialBalance: input.initialBalance ?? 0,
      initialBalanceDate: input.initialBalanceDate ?? now,
      active: true,
      autoReserveEnabled: input.autoReserveEnabled ?? false,
      autoReservePercentage: input.autoReservePercentage ?? 0,
      autoReserveTargetAccountId: input.autoReserveTargetAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, input: UpdateAccountInput, tenantId: string): Promise<Account> {
    const existing = await this.findById(id, tenantId);
    const enabled = input.autoReserveEnabled ?? existing.autoReserveEnabled;
    if (enabled) {
      const targetId = input.autoReserveTargetAccountId !== undefined
        ? input.autoReserveTargetAccountId
        : existing.autoReserveTargetAccountId;
      if (!targetId) {
        throw new AppError(
          'Selecione a conta de destino da reserva automática.',
          400,
          'account.autoReserveTargetRequired',
        );
      }
      if (targetId === id) {
        throw new AppError(
          'A conta de origem e destino da reserva automática devem ser diferentes.',
          400,
          'account.autoReserveSameAccount',
        );
      }
      const target = await this.repo.findById(targetId, tenantId);
      if (!target || !target.active) {
        throw new AppError(
          'Conta de destino da reserva automática não encontrada ou inativa.',
          404,
          'account.autoReserveTargetNotFound',
        );
      }
    }
    return this.repo.update(id, { ...input, updatedAt: nowISO() }, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    const payingCards = (await this.cardsRepo?.findActive(tenantId) ?? []).filter(
      (c) => c.defaultPaymentAccountId === id,
    );
    if (payingCards.length > 0) {
      const names = payingCards.map((c) => c.name).join(', ');
      throw new AppError(
        `Esta conta paga a fatura de: ${names}. Troque a conta pagadora desses cartões antes de desativá-la.`,
        409,
        'account.paysCreditCard',
        { cards: names },
      );
    }
    await this.repo.update(id, { active: false, updatedAt: nowISO() }, tenantId);
  }
}
