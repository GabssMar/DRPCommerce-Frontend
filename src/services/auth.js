import { STORE_BASE } from './config';
import { onUnauthorized, request } from './http';
import { clearSession, REALMS, setSession } from './session';

// Login, cadastro e renovação. O back-end exige CSRF (cabeçalho X-CSRF-TOKEN)
// nas rotas de autenticação e grava o refresh em cookie HttpOnly.
//   cliente: /api/store/storefront/auth/*
//   equipe:  /api/store/auth/*

const AUTH_BASE = {
  [REALMS.storefront]: `${STORE_BASE}/storefront/auth`,
  [REALMS.backoffice]: `${STORE_BASE}/auth`,
};

const csrfCache = {};

const csrfHeaders = async (realm) => {
  if (!csrfCache[realm]) {
    csrfCache[realm] = request('GET', `${AUTH_BASE[realm]}/csrf`, { realm: null }).catch((err) => {
      delete csrfCache[realm];
      throw err;
    });
  }
  const { requestToken, headerName } = await csrfCache[realm];
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
