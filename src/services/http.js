import { IS_MOCK, MOCK_LATENCY_MS, REQUEST_TIMEOUT_MS } from './config';
import { ApiError, networkError, timeoutError } from './api-error';
import { logRequest } from './request-log';
import { getAccessToken, tokenExpiresSoon } from './session';
import { syncServerClock } from './clock';

// Cliente HTTP único. Nenhuma tela chama fetch: tudo passa por request().
//
// Respostas aceitas (decididas pelo corpo, não por lista de rotas):
//   - envelope Result<T> { isSuccess, content, ... }   -> devolve content
//   - DTO direto (identidade, storefront/me, store...) -> devolve como veio
//   - 204 sem corpo                                    -> null
// Erros viram ApiError com `kind` (ProblemDetails, envelope com isSuccess false,
// rede, timeout). Com { withMeta: true } devolve { data, etag } para quem precisa
// mandar If-Match depois (estoque, configurações, aparência).

let refreshHandler = null;

// auth.js registra aqui como renovar a sessão quando a API responde 401.
export const onUnauthorized = (handler) => {
  refreshHandler = handler;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseBody = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const httpTransport = async (method, url, { headers, body }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    });
    syncServerClock(res.headers.get('Date'));
    return {
      status: res.status,
      data: parseBody(await res.text()),
      headers: { etag: res.headers.get('ETag'), 'retry-after': res.headers.get('Retry-After') },
    };
  } finally {
    clearTimeout(timer);
  }
};

// O servidor do mock só é carregado no modo mock. Em VITE_API_MODE=http o Vite troca a
// condição por `false` no build e deixa o mock (seed, dados de exemplo) fora do pacote.
const loadMock = import.meta.env?.VITE_API_MODE === 'http' ? null : () => import('./mock/server');

const mockTransport = async (method, url, { headers, body }) => {
  const { mockFetch } = await loadMock();
  await delay(MOCK_LATENCY_MS);
  // Cópia: o mock nunca recebe nem devolve referência viva da tela.
  const payload = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  const res = mockFetch(method, url, payload, headers);
  return {
    status: res.status,
    data: res.data === undefined ? null : JSON.parse(JSON.stringify(res.data)),
    headers: res.headers ?? {},
  };
};

const unwrap = (data, status) => {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'isSuccess' in data) {
    if (!data.isSuccess) throw ApiError.fromEnvelope(data, status);
    return data.content;
  }
  return data;
};

/**
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} url caminho no Gateway, ex.: /api/drop/api/drop-events/get-all
 * @param {{ body?: unknown, realm?: 'storefront'|'backoffice'|null, headers?: object, withMeta?: boolean }} [options]
 */
// 401 com token ainda válido = a rota não aceita este token (ex.: CRUD da equipe
// chamado com token de cliente). Renovar não resolve e gasta o limite de requisições
// das rotas de autenticação do back. Só renova se o token venceu ou vence em 30 s.
export async function request(method, url, { body, realm = 'backoffice', headers = {}, retry = true, withMeta = false } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  const token = realm ? getAccessToken(realm) : null;
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await (IS_MOCK ? mockTransport : httpTransport)(method, url, { headers: finalHeaders, body });
  } catch (err) {
    logRequest({ method, url, status: 0, body, simulated: IS_MOCK });
    throw err?.name === 'AbortError' ? timeoutError() : networkError();
  }

  logRequest({ method, url, status: res.status, body, simulated: IS_MOCK });

  if (res.status === 401 && retry && realm && refreshHandler && (!token || tokenExpiresSoon(token))) {
    const renewed = await refreshHandler(realm);
    if (renewed) return request(method, url, { body, realm, headers, retry: false, withMeta });
  }

  if (res.status < 200 || res.status >= 300) throw ApiError.fromResponse(res.status, res.data, res.headers);

  const data = res.status === 204 ? null : unwrap(res.data, res.status);
  return withMeta ? { data, etag: res.headers?.etag ?? null } : data;
}

export const get = (url, options) => request('GET', url, options);
export const post = (url, body, options) => request('POST', url, { ...options, body });
export const put = (url, body, options) => request('PUT', url, { ...options, body });
export const del = (url, options) => request('DELETE', url, options);
