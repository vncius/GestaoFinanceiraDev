import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_TENANT_ID } from '../tenant/tenant.constants';

const DATA_DIR = path.join(process.cwd(), 'data');

// Serializa todas as operações por arquivo (entre todas as instâncias que
// apontam para o mesmo caminho) para evitar leitura-modificação-escrita
// concorrente sobrescrever alterações de outra requisição (lost update).
const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<R>(filePath: string, task: () => Promise<R>): Promise<R> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  const run = previous.then(task, task);
  fileLocks.set(
    filePath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export class JsonFileStore<T extends { id: string; tenantId: string }> {
  private readonly filePath: string;

  constructor(fileName: string) {
    this.filePath = path.join(DATA_DIR, fileName);
  }

  private async ensureFile(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, '[]', 'utf-8');
    }
  }

  // Lê todos os registros do arquivo, sem filtro de tenant. Registros
  // gravados antes da introdução de tenantId (dado legado em disco) são
  // tratados como pertencentes ao DEFAULT_TENANT_ID, para não desaparecer
  // silenciosamente após esta migração.
  private async readAll(): Promise<T[]> {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, 'utf-8');
    const content = raw.replace(/^﻿/, '');
    if (!content.trim()) return [];
    const items = JSON.parse(content) as T[];
    return items.map((item) => (item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID }));
  }

  private async writeAll(items: T[]): Promise<void> {
    await this.ensureFile();
    // Escreve em arquivo temporário e renomeia (operação atômica no sistema
    // de arquivos) para que um crash no meio da escrita nunca deixe o JSON
    // final truncado/corrompido.
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(items, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  async findAll(tenantId: string): Promise<T[]> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      return items.filter((item) => item.tenantId === tenantId);
    });
  }

  async findById(id: string, tenantId: string): Promise<T | null> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      return items.find((item) => item.id === id && item.tenantId === tenantId) ?? null;
    });
  }

  async create(data: T): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      items.push(data);
      await this.writeAll(items);
      return data;
    });
  }

  // Insere múltiplos registros com uma única leitura+escrita do arquivo,
  // em vez de uma leitura+escrita completa por item (ver create()).
  async createMany(dataList: T[]): Promise<T[]> {
    if (dataList.length === 0) return [];
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      items.push(...dataList);
      await this.writeAll(items);
      return dataList;
    });
  }

  async update(id: string, data: Partial<T>, tenantId: string): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      const index = items.findIndex((item) => item.id === id && item.tenantId === tenantId);
      if (index === -1) throw new Error(`Registro com id ${id} não encontrado`);
      items[index] = { ...items[index], ...data };
      await this.writeAll(items);
      return items[index];
    });
  }

  async delete(id: string, tenantId: string): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      const filtered = items.filter((item) => !(item.id === id && item.tenantId === tenantId));
      await this.writeAll(filtered);
    });
  }

  // Substitui TODOS os registros de um tenant pelos informados — usado pela
  // restauração de backup (import). Registros de outros tenants no mesmo
  // arquivo não são tocados.
  async replaceAllForTenant(tenantId: string, newItems: T[]): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      const others = items.filter((item) => item.tenantId !== tenantId);
      await this.writeAll([...others, ...newItems]);
    });
  }
}
