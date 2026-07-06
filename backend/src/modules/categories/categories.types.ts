export enum CategoryType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  active: boolean;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
}
