import { promises as fs } from 'fs';
import path from 'path';

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

export class JsonFileStore<T extends { id: string }> {
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

  private async readAll(): Promise<T[]> {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, 'utf-8');
    const content = raw.replace(/^﻿/, '');
    if (!content.trim()) return [];
    return JSON.parse(content) as T[];
  }

  private async writeAll(items: T[]): Promise<void> {
    await this.ensureFile();
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  async findAll(): Promise<T[]> {
    return withFileLock(this.filePath, () => this.readAll());
  }

  async findById(id: string): Promise<T | null> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      return items.find((item) => item.id === id) ?? null;
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

  async update(id: string, data: Partial<T>): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) throw new Error(`Registro com id ${id} não encontrado`);
      items[index] = { ...items[index], ...data };
      await this.writeAll(items);
      return items[index];
    });
  }

  async delete(id: string): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const items = await this.readAll();
      const filtered = items.filter((item) => item.id !== id);
      await this.writeAll(filtered);
    });
  }
}
