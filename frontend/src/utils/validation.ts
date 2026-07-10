import i18n from '../i18n';

export interface RequiredField {
  label: string;
  valid: boolean;
}

export function getMissingFields(fields: RequiredField[]): string[] {
  return fields.filter((f) => !f.valid).map((f) => f.label);
}

export function missingFieldsMessage(missing: string[]): string {
  return i18n.t('common:validation.missingFields', { fields: missing.join(', ') });
}
