// Único tenant existente hoje. Preparação para multi-tenant (futuro SaaS):
// todo dado é isolado por tenantId de ponta a ponta, mas como ainda não há
// autenticação/login, o middleware de tenant sempre resolve para esta
// constante a menos que o header X-Tenant-Id seja informado explicitamente
// (útil para testar isolamento antes de existir uma tela de login real).
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
