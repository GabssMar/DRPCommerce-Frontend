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

// Loja do cliente. Cada loja mora num caminho do site: https://www.drpcommerce.com.br/nome-da-loja/
// (StorefrontPorLoja.md no back), e as rotas da loja usam o mesmo slug:
// /api/store/api/storefront/{slug}/products, /api/drop/api/storefront/{slug}/drop/events...
// Ordem: VITE_STORE_SLUG (fixa uma loja no dev); senão, o primeiro segmento do caminho;
// no mock, a loja de exemplo. Sem slug, o site é a plataforma (apresentação, planos e painel).
export const MOCK_STORE_SLUG = IS_MOCK ? 'veloce-labs' : '';

// Mesma regra do back (StorefrontSlug.Normalize): 3 a 63 caracteres, letras minúsculas,
// números e hífen, sem hífen nas pontas. Os nomes reservados nunca são loja.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'backoffice', 'mail', 'internal', 'swagger', 'openapi']);
export const normalizeSlug = (value) => {
  const slug = String(value ?? '').trim().toLowerCase();
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : '';
};

const pathSlug = () => {
  const [first] = (globalThis.location?.pathname ?? '/').split('/').filter(Boolean);
  return normalizeSlug(first ? decodeURIComponent(first) : '');
};

export const STORE_SLUG = normalizeSlug(env.VITE_STORE_SLUG) || pathSlug() || MOCK_STORE_SLUG;
// A página está dentro de uma loja (cliente compra, entra e acompanha pedidos).
export const HAS_STORE = Boolean(STORE_SLUG);

// Endereço público da loja: /nome-da-loja/ (o hash da rota vem depois).
export const storeHomePath = (slug = STORE_SLUG) => (slug ? `/${encodeURIComponent(slug)}/` : '/');

// storefrontPath(STORE_BASE, 'products') -> /api/store/api/storefront/{slug}/products
export const storefrontPath = (base, path, slug = STORE_SLUG) => `${base}/storefront/${encodeURIComponent(slug)}/${path}`;

export const REQUEST_TIMEOUT_MS = 15000;
export const MOCK_LATENCY_MS = 280;

// O painel só monta em desenvolvimento ou com a flag explícita.
export const ADMIN_ENABLED = Boolean(env.DEV) || env.VITE_ADMIN_ENABLED === 'true';
