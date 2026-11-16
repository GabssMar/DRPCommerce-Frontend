import { reactive } from 'vue';
import { IS_MOCK } from './config';

// Sessões em memória, uma por área. O access token nunca vai para o localStorage:
// o refresh fica no cookie HttpOnly que o back-end grava, e um F5 renova a sessão.
//   storefront: cliente final (POST /api/store/api/storefront/auth/login)
//   backoffice: equipe da loja (POST /api/store/api/auth/login)
export const REALMS = {
  storefront: 'storefront',
  backoffice: 'backoffice',
};

// Modo mock: a equipe já começa logada; o cliente começa deslogado (a loja
// abre no login, como no back real). O token do cliente de exemplo fica na
// sessionStorage para o F5 não deslogar, papel do cookie de refresh no modo http.
const MOCK_BACKOFFICE = { accessToken: 'mock-backoffice-employee-1', expiresAt: null };
const MOCK_STOREFRONT_KEY = 'mock-storefront-session';

const readMockStorefront = () => {
  try {
    return JSON.parse(sessionStorage.getItem(MOCK_STOREFRONT_KEY));
  } catch {
    return null;
  }
};

const persistMockStorefront = (value) => {
  try {
    if (value) sessionStorage.setItem(MOCK_STOREFRONT_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(MOCK_STOREFRONT_KEY);
  } catch {
    /* sem storage: a sessão de exemplo vale só até o F5 */
  }
};

export const session = reactive({
  storefront: IS_MOCK ? readMockStorefront() : null,
  backoffice: IS_MOCK ? { ...MOCK_BACKOFFICE } : null,
});

// Aviso para a tela de login depois de uma saída forçada (ex.: senha alterada).
export const authNotice = reactive({ storefront: '' });

export const getAccessToken = (realm) => session[realm]?.accessToken ?? null;

export const setSession = (realm, { accessToken, accessTokenExpiresAt }) => {
  session[realm] = { accessToken, expiresAt: accessTokenExpiresAt ?? null };
  if (IS_MOCK && realm === REALMS.storefront) persistMockStorefront(session[realm]);
};

export const clearSession = (realm) => {
  session[realm] = null;
  if (IS_MOCK && realm === REALMS.storefront) persistMockStorefront(null);
};

export const isSignedIn = (realm) => Boolean(session[realm]?.accessToken);

// Claims do access token (JWT, sem validar a assinatura: só leitura na tela).
// Token que não é JWT (mock) devolve null.
export const tokenClaims = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

// Loja em que a equipe está trabalhando: claim EnterpriseId do token, gravado no
// login (ou no select-enterprise, para quem tem mais de uma loja). Cadastros novos
// (produto, categoria, fornecedor, cupom, drop...) levam esse id.
const MOCK_ENTERPRISE_ID = 1;
export const currentEnterpriseId = () => {
  const id = Number(tokenClaims(getAccessToken(REALMS.backoffice))?.EnterpriseId);
  if (id > 0) return id;
  if (IS_MOCK) return MOCK_ENTERPRISE_ID;
  throw new Error('Sessão sem loja selecionada. Entre de novo no painel.');
};
