import { reactive } from 'vue';
import { IS_MOCK } from './config';

// Sessões em memória, uma por área. O access token nunca vai para o localStorage:
// o refresh fica no cookie HttpOnly que o back-end grava, e um F5 renova a sessão.
//   storefront: cliente final (POST /api/store/storefront/auth/login)
//   backoffice: equipe da loja (POST /api/store/auth/login)
export const REALMS = {
  storefront: 'storefront',
  backoffice: 'backoffice',
};

const MOCK_SESSIONS = {
  storefront: { accessToken: 'mock-storefront-customer-1', expiresAt: null },
  backoffice: { accessToken: 'mock-backoffice-employee-1', expiresAt: null },
};

export const session = reactive({
  storefront: IS_MOCK ? { ...MOCK_SESSIONS.storefront } : null,
  backoffice: IS_MOCK ? { ...MOCK_SESSIONS.backoffice } : null,
});

export const getAccessToken = (realm) => session[realm]?.accessToken ?? null;

export const setSession = (realm, { accessToken, accessTokenExpiresAt }) => {
  session[realm] = { accessToken, expiresAt: accessTokenExpiresAt ?? null };
};

export const clearSession = (realm) => {
  session[realm] = null;
};

export const isSignedIn = (realm) => Boolean(session[realm]?.accessToken);
