export interface BaseRepository<T extends { id: string }> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(data: T): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
