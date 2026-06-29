import { api } from './api';
import { Category } from '../types';

export interface CreateCategoryPayload {
  name: string;
  type: Category['type'];
}

export const CategoriesService = {
  findAll: (): Promise<Category[]> =>
    api.get<Category[]>('/categories').then((r) => r.data),

  findByType: (type: Category['type']): Promise<Category[]> =>
    api.get<Category[]>('/categories', { params: { type } }).then((r) => r.data),

  create: (payload: CreateCategoryPayload): Promise<Category> =>
    api.post<Category>('/categories', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateCategoryPayload>): Promise<Category> =>
    api.put<Category>(`/categories/${id}`, payload).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/categories/${id}`).then(() => undefined),
};
