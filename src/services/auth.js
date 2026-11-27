import { STORE_BASE, storefrontPath } from './config';
import { onUnauthorized, request } from './http';
import { clearSession, getAccessToken, REALMS, setSession, tokenExpiresSoon } from './session';

// Login, cadastro, renovação, sessões e senha. O back-end exige CSRF (cabeçalho
// X-CSRF-TOKEN) nas rotas de autenticação e grava o refresh em cookie HttpOnly.
//   cliente: /api/store/api/storefront/{slug}/auth/*
//   equipe:  /api/store/api/auth/*

const AUTH_BASE = {
  [REALMS.storefront]: storefrontPath(STORE_BASE, 'auth'),
  [REALMS.backoffice]: `${STORE_BASE}/auth`,
};

// O token CSRF vale para o contexto de autenticação em que foi emitido: o GET de
// CSRF e o POST seguinte vão os dois com o mesmo Bearer, ou os dois sem Bearer.
// O cache é por access token: login, renovação, troca de loja e logout (inclusive
// vindos de outra aba) mudam o token e o próximo POST busca um CSRF novo.
const csrfCache = {};

const fetchCsrf = (realm, { anonymous }) =>
  request('GET', `${AUTH_BASE[realm]}/csrf`, { realm: anonymous ? null : realm, retry: false });

const toCsrfHeader = ({ requestToken, headerName }) => ({ [headerName || 'X-CSRF-TOKEN']: requestToken });

const csrfHeaders = async (realm) => {
  const owner = getAccessToken(realm) ?? '';
  if (!csrfCache[realm] || csrfCache[realm].owner !== owner) {
    const promise = fetchCsrf(realm, { anonymous: !owner }).catch((err) => {
      if (csrfCache[realm]?.promise === promise) delete csrfCache[realm];
      throw err;
    });
    csrfCache[realm] = { owner, promise };
  }
  return toCsrfHeader(await csrfCache[realm].promise);
};

const authPost = async (realm, action, body) =>
  request('POST', `${AUTH_BASE[realm]}/${action}`, { realm, body, headers: await csrfHeaders(realm), retry: false });

const authDelete = async (realm, action) =>
  request('DELETE', `${AUTH_BASE[realm]}/${action}`, { realm, headers: await csrfHeaders(realm), retry: false });

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
  await request('DELETE', storefrontPath(STORE_BASE, 'me'), {
    realm: REALMS.storefront,
    body: { currentPassword },
    headers: await csrfHeaders(REALMS.storefront),
    retry: false,
  });
  clearSession(REALMS.storefront);
};

// ----------------------------------------------------------------- equipe ---

// Com uma loja só, o back já devolve o token dela. Com várias (ou nenhuma), o
// token é global e o painel leva à escolha de loja (#/admin/entrar/loja).
export const selectEnterprise = async (membershipId) =>
  startSession(REALMS.backoffice, await authPost(REALMS.backoffice, 'select-enterprise', { membershipId }));

export const loginEmployee = async ({ email, password }) => {
  const result = startSession(REALMS.backoffice, await authPost(REALMS.backoffice, 'login', { email, password }));
  if (result?.requiresEnterpriseSelection && result.enterprises?.length === 1) {
    return selectEnterprise(result.enterprises[0].membershipId);
  }
  return result;
};

// Conta nova de lojista (POST auth/register) e login em seguida. Sem loja ainda:
// o token é de usuário global, que pode criar a loja em enterprises/register.
export const registerEmployee = async ({ fullName, email, password }) => {
  await authPost(REALMS.backoffice, 'register', { fullName, email, password });
  return loginEmployee({ email, password });
};

export const logoutEmployee = async () => {
  try {
    await authPost(REALMS.backoffice, 'logout');
  } finally {
    clearSession(REALMS.backoffice);
  }
};

// ------------------------------------------------ sessões e senha (ambos) ---

// Famílias de sessão da conta: { familyId, createdAt, expiresAt, isCurrent }.
export const listSessions = (realm) => request('GET', `${AUTH_BASE[realm]}/sessions`, { realm });

// Encerra outra sessão (outro aparelho/navegador). A atual sai com o logout.
export const revokeSession = (realm, familyId) => authDelete(realm, `sessions/${encodeURIComponent(familyId)}`);

export const logoutAll = async (realm) => {
  try {
    await authPost(realm, 'logout-all');
  } finally {
    clearSession(realm);
  }
};

// O back invalida todas as sessões ao trocar a senha: entra de novo com a nova.
export const changePassword = async (realm, { currentPassword, newPassword }) => {
  await authPost(realm, 'change-password', { currentPassword, newPassword });
  clearSession(realm);
};

// ------------------------------------------------------------- renovação ---

// Duas renovações com o mesmo cookie revogam a família no back: a renovação roda
// numa trava entre abas (Web Locks), única para cliente e equipe porque o cookie
// CSRF do back é um só. Sem Web Locks, as renovações da aba entram numa fila.
const REFRESH_LOCK = 'drp-refresh';
let localQueue = Promise.resolve();

const withRefreshLock = (task) => {
  if (globalThis.navigator?.locks?.request) return globalThis.navigator.locks.request(REFRESH_LOCK, task);
  const run = localQueue.then(task, task);
  localQueue = run.catch(() => {});
  return run;
};

const renew = async (realm) => {
  // CSRF e refresh vão sem Bearer: o token pode já estar vencido.
  const headers = toCsrfHeader(await fetchCsrf(realm, { anonymous: true }));
  return request('POST', `${AUTH_BASE[realm]}/refresh`, { realm: null, headers, retry: false });
};

const refreshing = {};

const refresh = (realm) => {
  if (!refreshing[realm]) {
    const before = getAccessToken(realm);
    refreshing[realm] = withRefreshLock(async () => {
      const current = getAccessToken(realm);
      // Outra aba renovou enquanto esta esperava: reaproveita o token anunciado.
      if (current && current !== before && !tokenExpiresSoon(current)) return true;
      try {
        return Boolean(startSession(realm, await renew(realm))?.accessToken);
      } catch {
        clearSession(realm, { broadcast: false });
        return false;
      }
    }).finally(() => {
      delete refreshing[realm];
    });
  }
  return refreshing[realm];
};

onUnauthorized(refresh);

// F5: o access token some da memória, mas o cookie de refresh continua.
export const restoreSession = (realm) => refresh(realm);
