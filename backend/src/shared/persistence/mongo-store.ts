import { Collection } from 'mongodb';
import { getDb } from './mongo-client';
import { getActiveSession } from './mongo-transaction';
import { decryptFields, encryptFields } from '../crypto/field-crypto';

const indexedCollections = new Set<string>();

export interface MongoStoreOptions<T> {
  /**
   * Campos de texto livre gravados criptografados (D8 do plano de segurança).
   * Só campos que nunca entram em filtro/ordenação no banco — o MongoStore
   * filtra tudo em memória, então hoje isso vale para qualquer campo.
   */
  encryptedFields?: readonly (keyof T & string)[];
}

export class MongoStore<T extends { id: string; tenantId: string }> {
  private readonly collectionName: string;
  private readonly extraIndexes: Record<string, 1 | -1>[];
  private readonly encrypted: readonly string[];

  constructor(
    collectionName: string,
    extraIndexes: Record<string, 1 | -1>[] = [],
    options: MongoStoreOptions<T> = {},
  ) {
    this.collectionName = collectionName;
    this.extraIndexes = extraIndexes;
    this.encrypted = options.encryptedFields ?? [];
  }

  private collection(): Collection<T> {
    const collection = getDb().collection<T>(this.collectionName);
    // createIndex não pode rodar dentro de uma transação; adiar para a próxima
    // chamada fora dela evita um erro logado quando a primeira operação da
    // coleção por acaso acontece dentro de runInTransaction.
    if (!indexedCollections.has(this.collectionName) && !getActiveSession()) {
      indexedCollections.add(this.collectionName);
      // Não aguarda: criação de índice não deve bloquear a primeira operação.
      collection.createIndex({ tenantId: 1, id: 1 }, { unique: true }).catch((err) => {
        console.error(`[mongo] Falha ao criar índice em ${this.collectionName}:`, err);
      });
      for (const index of this.extraIndexes) {
        collection.createIndex(index as never).catch((err) => {
          console.error(`[mongo] Falha ao criar índice extra em ${this.collectionName}:`, err);
        });
      }
    }
    return collection;
  }

  // Toda operação carrega a sessão ativa (quando há uma): é assim que as
  // escritas feitas dentro de runInTransaction entram na mesma transação.
  private get session() {
    return getActiveSession();
  }

  private toDb<D extends object>(data: D): D {
    return encryptFields(data, this.encrypted);
  }

  private fromDb<D extends object>(doc: D): D {
    return decryptFields(doc, this.encrypted);
  }

  async findAll(tenantId: string): Promise<T[]> {
    const docs = (await this.collection()
      .find({ tenantId } as never, { projection: { _id: 0 }, session: this.session })
      .toArray()) as T[];
    return this.encrypted.length ? docs.map((d) => this.fromDb(d)) : docs;
  }

  async findById(id: string, tenantId: string): Promise<T | null> {
    const doc = (await this.collection().findOne(
      { id, tenantId } as never,
      { projection: { _id: 0 }, session: this.session },
    )) as T | null;
    return doc ? this.fromDb(doc) : null;
  }

  async create(data: T): Promise<T> {
    await this.collection().insertOne(this.toDb({ ...data }) as never, { session: this.session });
    return data;
  }

  async createMany(dataList: T[]): Promise<T[]> {
    if (dataList.length === 0) return [];
    await this.collection().insertMany(dataList.map((d) => this.toDb({ ...d })) as never[], { session: this.session });
    return dataList;
  }

  async update(id: string, data: Partial<T>, tenantId: string): Promise<T> {
    const result = await this.collection().findOneAndUpdate(
      { id, tenantId } as never,
      { $set: this.toDb(data) as never },
      { returnDocument: 'after', projection: { _id: 0 }, session: this.session },
    );
    if (!result) throw new Error(`Registro com id ${id} não encontrado`);
    return this.fromDb(result as T);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.collection().deleteOne({ id, tenantId } as never, { session: this.session });
  }

  // Substitui TODOS os registros de um tenant pelos informados — usado pela
  // restauração de backup (import). Registros de outros tenants na mesma
  // coleção não são tocados.
  async replaceAllForTenant(tenantId: string, newItems: T[]): Promise<void> {
    await this.collection().deleteMany({ tenantId } as never, { session: this.session });
    if (newItems.length > 0) {
      await this.collection().insertMany(newItems.map((d) => this.toDb({ ...d })) as never[], { session: this.session });
    }
  }
}
