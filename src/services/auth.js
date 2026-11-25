import { STORE_BASE } from './config';
import { onUnauthorized, request } from './http';
import { clearSession, getAccessToken, REALMS, setSession } from './session';

// Login, cadastro e renovação. O back-end exige CSRF (cabeçalho X-CSRF-TOKEN)
// nas rotas de autenticação e grava o refresh em cookie HttpOnly.
//   cliente: /api/store/api/storefront/auth/*
//   equipe:  /api/store/api/auth/*

const AUTH_BASE = {
  [REALMS.storefront]: `${STORE_BASE}/storefront/auth`,
  [REALMS.backoffice]: `${STORE_BASE}/auth`,
};

// O token CSRF vale para o contexto de autenticação em que foi emitido: o pedido
// vai com o access token atual, e o cache é por token. Depois de login, troca de
// loja ou renovação, o próximo POST busca um CSRF novo (com o antigo, o back
// responde 403 "Token CSRF inválido").
const csrfCache = {};

const csrfHeaders = async (realm) => {
  const owner = getAccessToken(realm) ?? '';
  if (!csrfCache[realm] || csrfCache[realm].owner !== owner) {
    const promise = request('GET', `${AUTH_BASE[realm]}/csrf`, { realm, retry: false }).catch((err) => {
      if (csrfCache[realm]?.promise === promise) delete csrfCache[realm];
      throw err;
    });
    csrfCache[realm] = { owner, promise };
  }
  const { requestToken, headerName } = await csrfCache[realm].promise;
  return { [headerName || 'X-CSRF-TOKEN']: requestToken };
};

const authPost = async (realm, action, body) =>
  request('POST', `${AUTH_BASE[realm]}/${action}`, { realm, body, headers: await csrfHeaders(realm), retry: false });

const startSession = (realm, result) => {
  if (result?.accessToken) setSession(realm, result);
  return result;
};

// ---------------------------------------------------------------- cliente ---

export const loginCustomer = async ({ email, password }) =>
  startSession(REALMS.storefront, await authPost(REALMS.storefront, 'login', { email, password }));

// Cadastro devolve o cliente; a sessão começa com um login logo em seguida.
export const registerCustomer = async (payload) => {
  const customer = await authPost(REALMS.storefront, 'register', payload);
  await loginCustomer({ email: payload.email, password: payload.password });
  return customer;
};

export const changeCustomerPassword = async ({ currentPassword, newPassword }) => {
  await authPost(REALMS.storefront, 'change-password', { currentPassword, newPassword });
  // O back invalida as sessões ao trocar a senha: entra de novo com a nova.
  clearSession(REALMS.storefront);
};

export const logoutCustomer = async () => {
  try {
    await authPost(REALMS.storefront, 'logout');
  } finally {
    clearSession(REALMS.storefront);
  }
};

// Exclusão da conta nesta loja: DELETE storefront/me com a senha atual no corpo
// e X-CSRF-TOKEN, como no login. A senha vai em texto pelo HTTPS: o back confere
// com o PasswordHasher dele, então um hash feito no navegador nunca bateria.
// Sucesso (204) apaga o cookie de refresh e invalida as sessões no back.
export const deleteCustomerAccount = async (currentPassword) => {
  await request('DELETE', `${STORE_BASE}/storefront/me`, {
    realm: REALMS.storefront,
    body: { currentPassword },
    headers: await csrfHeaders(REALMS.storefront),
    retry: false,
  });
  clearSession(REALMS.storefront);
};

// ----------------------------------------------------------------- equipe ---

export const loginEmployee = async ({ email, password }) => {
  const result = await authPost(REALMS.backoffice, 'login', { email, password });
  startSession(REALMS.backoffice, result);
  // Usuário com mais de uma loja escolhe; com uma só, seleciona automaticamente.
  if (result?.requiresEnterpriseSelection && result.enterprises?.length === 1) {
    const [choice] = result.enterprises;
    startSession(REALMS.backoffice, await authPost(REALMS.backoffice, 'select-enterprise', { membershipId: choice.membershipId }));
  }
  return result;
};

// Conta nova de lojista (POST auth/register) e login em seguida. Sem loja ainda:
// o token é de usuário global, que pode criar a loja em enterprises/register.
export const registerEmployee = async ({ fullName, email, password }) => {
  await authPost(REALMS.backoffice, 'register', { fullName, email, password });
  return loginEmployee({ email, password });
};

export const selectEnterprise = async (membershipId) =>
  startSession(REALMS.backoffice, await authPost(REALMS.backoffice, 'select-enterprise', { membershipId }));

export const logoutEmployee = async () => {
  try {
    await authPost(REALMS.backoffice, 'logout');
  } finally {
    clearSession(REALMS.backoffice);
  }
};

// ------------------------------------------------------------- renovação ---

const refreshing = {};

const refresh = (realm) => {
  if (!refreshing[realm]) {
    refreshing[realm] = authPost(realm, 'refresh')
      .then((result) => Boolean(startSession(realm, result)?.accessToken))
      .catch(() => {
        clearSession(realm);
        return false;
      })
      .finally(() => {
        delete refreshing[realm];
      });
  }
  return refreshing[realm];
};

onUnauthorized(refresh);

// F5: o access token some da memória, mas o cookie de refresh continua.
export const restoreSession = (realm) => refresh(realm);
