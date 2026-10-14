import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { LegalLinks } from '../legal/LegalLinks';

// Tela de aceite da Política de Privacidade e dos Termos (LGPD, D6 do plano
// de segurança). Aparece no primeiro acesso e sempre que a versão das
// políticas mudar; o backend recusa as rotas de dados até o aceite.
export function ConsentScreen() {
  const { t } = useTranslation('legal');
  const { acceptConsent, logout } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const points = t('consent.points', { returnObjects: true }) as string[];

  async function accept() {
    setPending('accept');
    setError(null);
    try {
      await acceptConsent();
    } catch (err) {
      setError((err as Error).message);
      setPending(null);
    }
  }

  async function decline() {
    setPending('decline');
    try {
      await logout('device');
      navigate('/login', { replace: true });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 w-full max-w-lg"
        data-testid="consent-screen"
      >
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={22} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('consent.title')}</h1>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('consent.intro')}</p>
        <ul className="space-y-2 mb-4">
          {points.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Check size={16} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <LegalLinks i18nKey="consent.readFull" newTab className="text-sm text-gray-600 dark:text-gray-300 mb-4" />

        <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100 mb-4 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            data-testid="consent-checkbox"
          />
          <span>{t('consent.checkbox')}</span>
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={decline} loading={pending === 'decline'} disabled={pending !== null}>
            {t('consent.decline')}
          </Button>
          <Button
            onClick={accept}
            loading={pending === 'accept'}
            disabled={!checked || pending !== null}
            data-testid="consent-accept"
          >
            {t('consent.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
