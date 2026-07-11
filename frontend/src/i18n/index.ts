import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptCommon from '../locales/pt/common.json';
import ptLayout from '../locales/pt/layout.json';
import ptDashboard from '../locales/pt/dashboard.json';
import ptReport from '../locales/pt/report.json';
import ptBackup from '../locales/pt/backup.json';
import ptSettings from '../locales/pt/settings.json';
import ptReceivables from '../locales/pt/receivables.json';
import ptCreditCards from '../locales/pt/creditCards.json';
import ptCashFlow from '../locales/pt/cashFlow.json';
import ptAuth from '../locales/pt/auth.json';
import ptErrors from '../locales/pt/errors.json';
import ptOnboarding from '../locales/pt/onboarding.json';

import enCommon from '../locales/en/common.json';
import enLayout from '../locales/en/layout.json';
import enDashboard from '../locales/en/dashboard.json';
import enReport from '../locales/en/report.json';
import enBackup from '../locales/en/backup.json';
import enSettings from '../locales/en/settings.json';
import enReceivables from '../locales/en/receivables.json';
import enCreditCards from '../locales/en/creditCards.json';
import enCashFlow from '../locales/en/cashFlow.json';
import enAuth from '../locales/en/auth.json';
import enErrors from '../locales/en/errors.json';
import enOnboarding from '../locales/en/onboarding.json';

import esCommon from '../locales/es/common.json';
import esLayout from '../locales/es/layout.json';
import esDashboard from '../locales/es/dashboard.json';
import esReport from '../locales/es/report.json';
import esBackup from '../locales/es/backup.json';
import esSettings from '../locales/es/settings.json';
import esReceivables from '../locales/es/receivables.json';
import esCreditCards from '../locales/es/creditCards.json';
import esCashFlow from '../locales/es/cashFlow.json';
import esAuth from '../locales/es/auth.json';
import esErrors from '../locales/es/errors.json';
import esOnboarding from '../locales/es/onboarding.json';

export type Language = 'pt' | 'en' | 'es';

const SUPPORTED_LANGUAGES: Language[] = ['pt', 'en', 'es'];

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem('language');
  if (SUPPORTED_LANGUAGES.includes(stored as Language)) return stored as Language;
  return 'pt';
}

i18n.use(initReactI18next).init({
  resources: {
    pt: {
      common: ptCommon,
      layout: ptLayout,
      dashboard: ptDashboard,
      report: ptReport,
      backup: ptBackup,
      settings: ptSettings,
      receivables: ptReceivables,
      creditCards: ptCreditCards,
      cashFlow: ptCashFlow,
      auth: ptAuth,
      errors: ptErrors,
      onboarding: ptOnboarding,
    },
    en: {
      common: enCommon,
      layout: enLayout,
      dashboard: enDashboard,
      report: enReport,
      backup: enBackup,
      settings: enSettings,
      receivables: enReceivables,
      creditCards: enCreditCards,
      cashFlow: enCashFlow,
      auth: enAuth,
      errors: enErrors,
      onboarding: enOnboarding,
    },
    es: {
      common: esCommon,
      layout: esLayout,
      dashboard: esDashboard,
      report: esReport,
      backup: esBackup,
      settings: esSettings,
      receivables: esReceivables,
      creditCards: esCreditCards,
      cashFlow: esCashFlow,
      auth: esAuth,
      errors: esErrors,
      onboarding: esOnboarding,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'pt',
  ns: [
    'common',
    'layout',
    'dashboard',
    'report',
    'backup',
    'settings',
    'receivables',
    'creditCards',
    'cashFlow',
    'auth',
    'errors',
    'onboarding',
  ],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
