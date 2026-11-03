// Configuração da camada de dados. As telas não leem import.meta.env: leem daqui.
//
// VITE_API_MODE=mock (padrão) responde nas MESMAS rotas do back-end com dados
// de exemplo, sem servidor. VITE_API_MODE=http chama o Gateway de verdade.

// `?? {}`: os módulos de serviço também rodam fora do Vite (testes em Node).
const env = import.meta.env ?? {};

export const API_MODE = env.VITE_API_MODE === 'http' ? 'http' : 'mock';
export const IS_MOCK = API_MODE === 'mock';

// O front chama sempre o Gateway: /api/drop/** vai para o DropCommerce.Api,
// /api/store/** para o StoreCommerce.Api.
export const DROP_BASE = env.VITE_DROP_API_BASE_URL || '/api/drop';
export const STORE_BASE = env.VITE_STORE_API_BASE_URL || '/api/store';

export const REQUEST_TIMEOUT_MS = 15000;
export const MOCK_LATENCY_MS = 280;

// O painel só monta em desenvolvimento ou com a flag explícita.
export const ADMIN_ENABLED = Boolean(env.DEV) || env.VITE_ADMIN_ENABLED === 'true';
