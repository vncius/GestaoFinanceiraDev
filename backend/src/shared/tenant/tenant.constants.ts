// Tenant usado por todos os dados criados antes de existir login. O primeiro
// usuário a fazer login (Google) herda este tenantId — ver
// AuthService.findOrCreateUser — então nenhuma migração de dados é necessária.
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
