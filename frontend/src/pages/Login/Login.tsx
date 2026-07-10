import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID;

declare global {
  interface Window {
    google?: any;
    AppleID?: any;
  }
}

export default function Login() {
  const { t } = useTranslation('auth');
  const { user, loginWithGoogle, loginWithApple } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          await loginWithGoogle(response.credential);
          navigate('/dashboard', { replace: true });
        } catch (err) {
          console.error('[login] Google:', err);
        }
      },
    });

    if (googleButtonRef.current) {
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
      });
    }
  }, [loginWithGoogle, navigate]);

  async function handleAppleLogin() {
    if (!window.AppleID || !APPLE_CLIENT_ID) return;

    window.AppleID.auth.init({
      clientId: APPLE_CLIENT_ID,
      scope: 'name email',
      redirectURI: window.location.origin,
      usePopup: true,
    });

    try {
      const response = await window.AppleID.auth.signIn();
      const idToken = response.authorization.id_token;
      const name = response.user?.name
        ? `${response.user.name.firstName ?? ''} ${response.user.name.lastName ?? ''}`.trim()
        : undefined;
      await loginWithApple(idToken, name || undefined);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[login] Apple:', err);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-8 w-full max-w-sm flex flex-col items-center gap-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('subtitle')}</p>

        <div ref={googleButtonRef} />

        <button
          onClick={handleAppleLogin}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 rounded-md py-2 px-4 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t('continueWithApple')}
        </button>
      </div>
    </div>
  );
}
