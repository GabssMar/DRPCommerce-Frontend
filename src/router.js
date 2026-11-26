import { shallowRef } from 'vue';

// Roteamento por hash (#/conta/pedidos), sem Vue Router: sobrevive ao F5 e
// voltar/avançar do navegador funcionam. Cada rota tem um nome e parâmetros.

const ROUTES = [
  // Loja
  ['portal', '/'],
  ['login', '/entrar'],
  ['register', '/criar-conta'],
  ['drop', '/drops/:id'],
  ['drop-registration', '/drops/:id/inscricao'],
  ['drop-waitlist', '/drops/:id/lista-de-espera'],
  ['vitrine', '/vitrine'],
  ['vitrine-category', '/vitrine/c/:slug'],
  ['product', '/vitrine/p/:slug'],
  // Link antigo por id: redireciona para /vitrine/p/:slug se o id existir.
  ['product-legacy', '/vitrine/:id'],
  ['cart', '/sacola'],
  ['checkout', '/checkout'],
  ['account', '/conta'],
  ['account-orders', '/conta/pedidos'],
  ['account-order', '/conta/pedidos/:source/:id'],
  ['account-notifications', '/conta/notificacoes'],
  ['account-addresses', '/conta/enderecos'],
  // Painel
  ['admin-dashboard', '/admin'],
  ['admin-dashboard', '/admin/dashboard'],
  ['admin-drops', '/admin/drops'],
  ['admin-drop-new', '/admin/drops/novo'],
  ['admin-drop', '/admin/drops/:id'],
  ['admin-drop-tab', '/admin/drops/:id/:tab'],
  ['admin-live', '/admin/ao-vivo'],
  ['admin-live', '/admin/ao-vivo/:id'],
  ['admin-orders', '/admin/pedidos'],
  ['admin-finance', '/admin/financeiro'],
  ['admin-finance', '/admin/financeiro/:tab'],
  ['admin-catalog', '/admin/catalogo'],
  ['admin-catalog', '/admin/catalogo/categorias'],
  ['admin-coupons', '/admin/catalogo/cupons'],
  ['admin-suppliers', '/admin/catalogo/fornecedores'],
  ['admin-customers', '/admin/clientes'],
  ['admin-fraud', '/admin/fraude'],
  ['admin-plan', '/admin/plano'],
  ['admin-plan', '/admin/plano/:planId'],
  // Cadastro de lojista a partir da landing page (sem sessão).
  ['admin-signup', '/admin/assinar/:planId'],
  ['admin-settings', '/admin/configuracoes'],
  ['admin-settings', '/admin/configuracoes/:tab'],
].map(([name, pattern]) => ({ name, pattern, parts: pattern.split('/').filter(Boolean) }));

const NOT_FOUND = { name: 'portal', params: {}, path: '/', query: {} };

// Query do hash (#/vitrine?busca=tenis&pagina=2) como objeto simples.
const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search ?? ''));

export const parseHash = (hash) => {
  const [rawPath, search] = (hash.replace(/^#/, '') || '/').split('?');
  const path = rawPath || '/';
  const query = parseQuery(search);
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  for (const route of ROUTES) {
    if (route.parts.length !== segments.length) continue;
    const params = {};
    const matches = route.parts.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (matches) return { name: route.name, params, path: `/${segments.join('/')}`, query };
  }
  return { ...NOT_FOUND, path, query };
};

export const route = shallowRef(parseHash(window.location.hash.startsWith('#/') ? window.location.hash : ''));

// Skip link: leva o foco ao conteúdo sem mexer no hash (que é a rota).
export const focusMain = () => {
  const main = document.getElementById('main');
  main?.focus();
  main?.scrollIntoView();
};

window.addEventListener('hashchange', () => {
  // "#main" e outras âncoras da página não são rota: mantém a tela atual.
  if (window.location.hash && !window.location.hash.startsWith('#/')) return;
  const previous = route.value;
  route.value = parseHash(window.location.hash);
  // Só a query mudou (filtro, ordem, página): mesma tela, o foco fica no controle usado.
  if (previous.path === route.value.path) return;
  // Troca de tela: leva o foco ao conteúdo e o scroll ao topo.
  window.scrollTo({ top: 0 });
  document.getElementById('main')?.focus({ preventScroll: true });
});

export const href = (path) => `#${path}`;

// withQuery('/vitrine', { busca: 'tênis', pagina: 1 }) -> "/vitrine?busca=t%C3%AAnis&pagina=1".
// Valores vazios ficam de fora.
export const withQuery = (path, query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

export const navigate = (path) => {
  if (window.location.hash === `#${path}`) return;
  window.location.hash = path;
};

// Troca a URL sem criar entrada no histórico (redirecionamentos).
export const redirect = (path) => {
  window.location.replace(`${window.location.pathname}${window.location.search}#${path}`);
};

export const isAdminRoute = (r) => r.name.startsWith('admin-');
