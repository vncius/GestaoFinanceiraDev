export interface RequiredField {
  label: string;
  valid: boolean;
}

export function getMissingFields(fields: RequiredField[]): string[] {
  return fields.filter((f) => !f.valid).map((f) => f.label);
}

export function missingFieldsMessage(missing: string[]): string {
  return `Preencha os campos obrigatórios: ${missing.join(', ')}.`;
}
