// Configuração da camada de dados. As telas não leem import.meta.env: leem daqui.
//
// VITE_API_MODE=http (padrão) chama o Gateway de verdade. VITE_API_MODE=mock
// responde nas MESMAS rotas do back-end com dados de exemplo, sem servidor: só
// no servidor de desenvolvimento. O build recusa o modo mock (vite.config.js).

// `?? {}`: os módulos de serviço também rodam fora do Vite (testes em Node).
const env = import.meta.env ?? {};

// Leitura direta de import.meta.env (sem `?.`): o Vite troca por `false` no build e o
// minificador descarta tudo o que depende do mock (servidor, seed e textos de exemplo).
export const IS_MOCK = import.meta.env.DEV === true && import.meta.env.VITE_API_MODE === 'mock';
export const API_MODE = IS_MOCK ? 'mock' : 'http';

// Dicas das telas de login no modo mock. Ficam aqui, e não no template nem em
// mock/seed.js, para nenhum texto de exemplo entrar no build de produção.
export const MOCK_HINTS = IS_MOCK
  ? {
    customer: 'Modo de exemplo: entre com camila.duarte@exemplo.com e qualquer senha. '
      + 'bloqueado@exemplo.com simula o bloqueio por tentativas.',
    backoffice: 'Modo de exemplo: qualquer e-mail e senha entram como o lojista de exemplo. '
      + 'varias@exemplo.com tem duas lojas, nova@exemplo.com nenhuma e bloqueado@exemplo.com simula o bloqueio por tentativas.',
    planSignup: 'Modo de exemplo: os dados não saem do navegador.',
  }
  : null;

// O front chama sempre o Gateway. O Gateway remove o prefixo do serviço
// (/api/drop ou /api/store) e os controllers ficam em /api/..., então o caminho
// externo tem /api duas vezes: /api/store/api/storefront/store.
export const DROP_BASE = env.VITE_DROP_API_BASE_URL || '/api/drop/api';
export const STORE_BASE = env.VITE_STORE_API_BASE_URL || '/api/store/api';

// Loja do cliente. O back identifica a loja pelo slug no caminho:
// /api/store/api/storefront/{slug}/products, /api/drop/api/storefront/{slug}/drop/events...
// Ordem: VITE_STORE_SLUG; senão, a primeira parte do endereço do site
// (teste.stores.localhost -> "teste"); no mock, a loja de exemplo.
export const MOCK_STORE_SLUG = IS_MOCK ? 'veloce-labs' : '';

const subdomainSlug = () => {
  const host = globalThis.location?.hostname ?? '';
  const labels = host.split('.');
  if (labels.length < 2 || /^\d+$/.test(labels.at(-1)) || labels[0] === 'www') return '';
  return labels[0];
};

export const STORE_SLUG = (env.VITE_STORE_SLUG || subdomainSlug() || MOCK_STORE_SLUG).trim().toLowerCase();

// storefrontPath(STORE_BASE, 'products') -> /api/store/api/storefront/{slug}/products
export const storefrontPath = (base, path) => `${base}/storefront/${encodeURIComponent(STORE_SLUG)}/${path}`;

export const REQUEST_TIMEOUT_MS = 15000;
export const MOCK_LATENCY_MS = 280;

// O painel só monta em desenvolvimento ou com a flag explícita.
export const ADMIN_ENABLED = Boolean(env.DEV) || env.VITE_ADMIN_ENABLED === 'true';
