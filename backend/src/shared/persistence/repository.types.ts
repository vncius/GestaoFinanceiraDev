export interface BaseRepository<T extends { id: string; tenantId: string }> {
  findAll(tenantId: string): Promise<T[]>;
  findById(id: string, tenantId: string): Promise<T | null>;
  create(data: T): Promise<T>;
  update(id: string, data: Partial<T>, tenantId: string): Promise<T>;
  delete(id: string, tenantId: string): Promise<void>;
  // Substitui todos os registros do tenant pelos informados — usado pela
  // restauração de backup.
  replaceAll(tenantId: string, items: T[]): Promise<void>;
}
