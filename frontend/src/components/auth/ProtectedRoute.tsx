import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ConsentScreen } from './ConsentScreen';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // LGPD: nada do app (nem o onboarding) antes do aceite das políticas.
  if (user.consentRequired) return <ConsentScreen />;

  return <Outlet />;
}
