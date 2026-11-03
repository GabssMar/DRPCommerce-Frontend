import { IS_MOCK, MOCK_LATENCY_MS, REQUEST_TIMEOUT_MS } from './config';
import { ApiError } from './api-error';
import { logRequest } from './request-log';
import { getAccessToken } from './session';
import { mockFetch } from './mock/server';

// Cliente HTTP único. Nenhuma tela chama fetch: tudo passa por request().
//
// Respostas aceitas:
//   - envelope Result<T> { isSuccess, content, ... } dos CRUDs  -> devolve content
//   - objeto/lista crua dos endpoints storefront/*              -> devolve como veio
//   - 204                                                       -> null
// Erros viram ApiError (ProblemDetails, envelope com isSuccess false, rede, timeout).

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
    return { status: res.status, data: parseBody(await res.text()) };
  } finally {
    clearTimeout(timer);
  }
};

const mockTransport = async (method, url, { headers, body }) => {
  await delay(MOCK_LATENCY_MS);
  // Cópia: o mock nunca recebe nem devolve referência viva da tela.
  const payload = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  const res = mockFetch(method, url, payload, headers);
  return { status: res.status, data: res.data === undefined ? null : JSON.parse(JSON.stringify(res.data)) };
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
 * @param {string} url caminho no Gateway, ex.: /api/drop/drop-events/get-all
 * @param {{ body?: unknown, realm?: 'storefront'|'backoffice'|null, headers?: object }} [options]
 */
export async function request(method, url, { body, realm = 'backoffice', headers = {}, retry = true } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  const token = realm ? getAccessToken(realm) : null;
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await (IS_MOCK ? mockTransport : httpTransport)(method, url, { headers: finalHeaders, body });
  } catch (err) {
    const timeout = err?.name === 'AbortError';
    logRequest({ method, url, status: 0, body, simulated: IS_MOCK });
    throw new ApiError({ status: 0, code: timeout ? 'Timeout' : 'Network' });
  }

  logRequest({ method, url, status: res.status, body, simulated: IS_MOCK });

  if (res.status === 401 && retry && realm && refreshHandler) {
    const renewed = await refreshHandler(realm);
    if (renewed) return request(method, url, { body, realm, headers, retry: false });
  }

  if (res.status < 200 || res.status >= 300) throw ApiError.fromResponse(res.status, res.data);

  return unwrap(res.data, res.status);
}

export const get = (url, options) => request('GET', url, options);
export const post = (url, body, options) => request('POST', url, { ...options, body });
export const put = (url, body, options) => request('PUT', url, { ...options, body });
export const del = (url, options) => request('DELETE', url, options);
