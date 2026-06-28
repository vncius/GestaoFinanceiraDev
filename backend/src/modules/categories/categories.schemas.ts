import { z } from 'zod';
import { CategoryType } from './categories.types';

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.nativeEnum(CategoryType, { message: 'Tipo de categoria inválido' }),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(CategoryType).optional(),
});

export const categoryQuerySchema = z.object({
  type: z.nativeEnum(CategoryType).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
