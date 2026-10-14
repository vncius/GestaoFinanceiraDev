import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '../../utils/date';
import { CONSENT_VERSION, LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, LEGAL_LAST_UPDATED } from '../../config/legal';

interface LegalSection {
  title: string;
  paragraphs: string[];
}

// Política de Privacidade e Termos de Uso — rotas públicas (/privacy,
// /terms), legíveis antes do login e a partir da tela de aceite.
export default function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const { t } = useTranslation('legal');
  const navigate = useNavigate();
  const title = t(doc === 'privacy' ? 'privacyTitle' : 'termsTitle');
  const sections = t(doc, {
    returnObjects: true,
    controller: LEGAL_CONTROLLER,
    email: LEGAL_CONTACT_EMAIL,
  }) as LegalSection[];

  useEffect(() => {
    document.title = title;
  }, [title]);

  function goBack() {
    // Aberta em nova aba (sem histórico), volta para o início do app.
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <article className="max-w-2xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft size={16} />
          {t('back')}
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-6">
          {t('lastUpdated', { date: formatDate(LEGAL_LAST_UPDATED), version: CONSENT_VERSION })}
        </p>
        {sections.map((section) => (
          <section key={section.title} className="mb-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">{section.title}</h2>
            {section.paragraphs.map((p) => (
              <p key={p} className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-2">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
