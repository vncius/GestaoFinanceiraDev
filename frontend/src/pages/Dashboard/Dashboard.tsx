import { useQuery } from '@tanstack/react-query';
import { checkHealth } from '../../services/health.service';
import { Server, Wifi, WifiOff } from 'lucide-react';

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral das suas finanças</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="p-2.5 bg-gray-100 rounded-lg">
            <Server size={20} className="text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Status do Servidor
            </p>
            {isLoading && (
              <p className="text-sm text-gray-400 mt-0.5">Verificando...</p>
            )}
            {isError && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <WifiOff size={14} className="text-red-500" />
                <p className="text-sm text-red-600 font-medium">Desconectado</p>
              </div>
            )}
            {data && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Wifi size={14} className="text-green-500" />
                <p className="text-sm text-green-700 font-medium">Conectado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-400 text-sm">
          Os indicadores financeiros serão exibidos aqui nas próximas entregas.
        </p>
      </div>
    </div>
  );
}
