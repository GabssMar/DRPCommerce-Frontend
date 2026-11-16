// Paginação das rotas `search` do back-end, que devolvem PagedResponse<T>:
//   { items, totalCount, page, pageSize }
// Limites do back: page de 1 a 100.000, pageSize de 1 a 100.

export const PAGE_MIN = 1;
export const PAGE_MAX = 100000;
export const PAGE_SIZE_MAX = 100;
export const DEFAULT_PAGE_SIZE = 20;

const clamp = (value, min, max, fallback) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * PagedResponse<T> -> formato das telas. Aceita também lista crua (rotas antigas).
 * @returns {{ items: unknown[], total: number, page: number, pageSize: number, pages: number }}
 */
export function toPage(response) {
  if (Array.isArray(response)) {
    return { items: response, total: response.length, page: 1, pageSize: response.length, pages: response.length ? 1 : 0 };
  }
  const items = response?.items ?? [];
  const total = Number(response?.totalCount ?? response?.total ?? items.length);
  const page = Number(response?.page ?? 1);
  const pageSize = Number(response?.pageSize ?? (items.length || DEFAULT_PAGE_SIZE));
  return { items, total, page, pageSize, pages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
}

const isEmpty = (value) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Monta a query de uma rota `search`. Filtros vazios ficam de fora; page e
 * pageSize respeitam os limites do back. Nomes em PascalCase, como no Swagger.
 *   searchQuery({ page: 2, term: 'tênis', categoryId: null }) -> "?Page=2&PageSize=20&Term=t%C3%AAnis"
 */
export function searchQuery({ page = 1, pageSize = DEFAULT_PAGE_SIZE, ...filters } = {}) {
  const params = new URLSearchParams();
  params.set('Page', String(clamp(page, PAGE_MIN, PAGE_MAX, 1)));
  params.set('PageSize', String(clamp(pageSize, 1, PAGE_SIZE_MAX, DEFAULT_PAGE_SIZE)));
  Object.entries(filters).forEach(([key, value]) => {
    if (isEmpty(value)) return;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    if (Array.isArray(value)) value.forEach((v) => params.append(name, String(v)));
    else params.set(name, String(value));
  });
  return `?${params.toString()}`;
}
