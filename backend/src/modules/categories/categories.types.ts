export enum CategoryType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  type: CategoryType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
