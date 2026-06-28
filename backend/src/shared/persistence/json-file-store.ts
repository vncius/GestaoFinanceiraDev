import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

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
    const content = await fs.readFile(this.filePath, 'utf-8');
    if (!content.trim()) return [];
    return JSON.parse(content) as T[];
  }

  private async writeAll(items: T[]): Promise<void> {
    await this.ensureFile();
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  async findAll(): Promise<T[]> {
    return this.readAll();
  }

  async findById(id: string): Promise<T | null> {
    const items = await this.readAll();
    return items.find((item) => item.id === id) ?? null;
  }

  async create(data: T): Promise<T> {
    const items = await this.readAll();
    items.push(data);
    await this.writeAll(items);
    return data;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const items = await this.readAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(`Registro com id ${id} não encontrado`);
    items[index] = { ...items[index], ...data };
    await this.writeAll(items);
    return items[index];
  }

  async delete(id: string): Promise<void> {
    const items = await this.readAll();
    const filtered = items.filter((item) => item.id !== id);
    await this.writeAll(filtered);
  }
}
