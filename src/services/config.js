// Configuração da camada de dados. As telas não leem import.meta.env: leem daqui.
//
// VITE_API_MODE=mock (padrão) responde nas MESMAS rotas do back-end com dados
// de exemplo, sem servidor. VITE_API_MODE=http chama o Gateway de verdade.

// `?? {}`: os módulos de serviço também rodam fora do Vite (testes em Node).
const env = import.meta.env ?? {};

export const API_MODE = env.VITE_API_MODE === 'http' ? 'http' : 'mock';
export const IS_MOCK = API_MODE === 'mock';

// O front chama sempre o Gateway. O Gateway remove o prefixo do serviço
// (/api/drop ou /api/store) e os controllers ficam em /api/..., então o caminho
// externo tem /api duas vezes: /api/store/api/storefront/store.
export const DROP_BASE = env.VITE_DROP_API_BASE_URL || '/api/drop/api';
export const STORE_BASE = env.VITE_STORE_API_BASE_URL || '/api/store/api';

// Loja do cliente. O back identifica a loja pelo slug no caminho:
// /api/store/api/storefront/{slug}/products, /api/drop/api/storefront/{slug}/drop/events...
// Ordem: VITE_STORE_SLUG; senão, a primeira parte do endereço do site
// (teste.stores.localhost -> "teste"); no mock, a loja de exemplo.
export const MOCK_STORE_SLUG = 'veloce-labs';

const subdomainSlug = () => {
  const host = globalThis.location?.hostname ?? '';
  const labels = host.split('.');
  if (labels.length < 2 || /^\d+$/.test(labels.at(-1)) || labels[0] === 'www') return '';
  return labels[0];
};

export const STORE_SLUG = (env.VITE_STORE_SLUG || subdomainSlug() || (IS_MOCK ? MOCK_STORE_SLUG : '')).trim().toLowerCase();

// storefrontPath(STORE_BASE, 'products') -> /api/store/api/storefront/{slug}/products
export const storefrontPath = (base, path) => `${base}/storefront/${encodeURIComponent(STORE_SLUG)}/${path}`;

export const REQUEST_TIMEOUT_MS = 15000;
export const MOCK_LATENCY_MS = 280;

// O painel só monta em desenvolvimento ou com a flag explícita.
export const ADMIN_ENABLED = Boolean(env.DEV) || env.VITE_ADMIN_ENABLED === 'true';
