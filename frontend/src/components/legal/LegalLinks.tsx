import { Trans } from 'react-i18next';
import { Link } from 'react-router-dom';

const linkClass = 'underline text-blue-600 dark:text-blue-400 hover:text-blue-700';

interface LegalLinksProps {
  /** Chave do namespace `legal` com as marcações <privacy> e <terms>. */
  i18nKey: string;
  className?: string;
  /** Abre em nova aba (ex.: na tela de aceite, para não perder o estado). */
  newTab?: boolean;
}

// Texto com links para a Política de Privacidade e os Termos de Uso.
export function LegalLinks({ i18nKey, className, newTab = false }: LegalLinksProps) {
  const target = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <p className={className}>
      <Trans
        ns="legal"
        i18nKey={i18nKey}
        components={{
          privacy: <Link to="/privacy" className={linkClass} {...target} />,
          terms: <Link to="/terms" className={linkClass} {...target} />,
        }}
      />
    </p>
  );
}
