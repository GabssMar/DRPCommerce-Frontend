import { STORE_BASE, storefrontPath } from './config';
import { request } from './http';
import { searchQuery, toPage } from './paging';

// Catálogo público da vitrine (task 29). Rotas anônimas do Store, conferidas no
// back-end (StorefrontProductController e StorefrontCategoryController):
//   GET storefront/{slug}/products/search      PagedResponse<StorefrontProductResponse>
//   GET storefront/{slug}/products/by-slug/{s} { product, variants: StorefrontVariantResponse[] }
//   GET storefront/{slug}/categories/tree      CategoryTreeResponse[] (children aninhados)
//   GET storefront/{slug}/categories/by-slug/{s} CategoryResponse (404 se ela ou um ancestral estiver inativo)
// Preço, saldo e disponibilidade vêm do back: o front não calcula estoque.

const sf = (path) => storefrontPath(STORE_BASE, path);
const anonymous = { realm: null };

// Ordenações aceitas pelo back (ProductSearchRequestValidator).
export const SORTS = [
  { value: 'name', label: 'Nome (A–Z)' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'newest', label: 'Novidades' },
];
export const DEFAULT_SORT = 'name';
export const SHOWCASE_PAGE_SIZE = 12;

/** @returns {Promise<{ items: object[], total: number, page: number, pageSize: number, pages: number }>} */
export const searchProducts = async ({ term, categoryId, sort = DEFAULT_SORT, inStock, page = 1, pageSize = SHOWCASE_PAGE_SIZE } = {}) =>
  toPage(await request('GET', sf(`products/search${searchQuery({
    page,
    pageSize,
    term: term?.trim(),
    categoryId,
    // Categoria pai mostra também os produtos das filhas.
    includeSubcategories: categoryId ? true : undefined,
    sort,
    inStock: inStock ? true : undefined,
  })}`), anonymous));

export const getProductBySlug = (slug) =>
  request('GET', sf(`products/by-slug/${encodeURIComponent(slug)}`), anonymous);

export const getCategoryBySlug = (slug) =>
  request('GET', sf(`categories/by-slug/${encodeURIComponent(slug)}`), anonymous);

// A árvore muda pouco: uma busca por carga da página, compartilhada pelas telas.
let treePromise = null;
export const getCategoryTree = () => {
  if (!treePromise) {
    treePromise = request('GET', sf('categories/tree'), anonymous).catch((err) => {
      treePromise = null;
      throw err;
    });
  }
  return treePromise;
};

/** Árvore -> lista plana em ordem de exibição, com a profundidade de cada nó. */
export const flattenTree = (nodes, depth = 0) => (nodes ?? []).flatMap((node) => [
  { ...node, depth },
  ...flattenTree(node.children, depth + 1),
]);

// Link antigo #/vitrine/:id. O catálogo público não tem busca por id: a listagem
// legada (até 100 produtos) só serve para achar o slug e redirecionar.
export const findProductSlugById = async (id) => {
  const list = await request('GET', sf('products?page=1&pageSize=100'), anonymous);
  return list.find((p) => p.id === Number(id))?.slug ?? null;
};

export const productImage = (product) => product?.imageUrls?.split(',')[0]?.trim() ?? '';

// "Tamanho 40 · Cor Preto" a partir dos atributos do SKU.
export const variantLabel = (variant) => Object.values(variant?.attributes ?? {}).join(' · ');

// ------------------------------------------------------------- CARRINHO ---
// Carrinho do cliente logado (task 30). Rotas conferidas no back-end
// (StorefrontCartController); todas devolvem o CartResponse atualizado:
//   GET    storefront/{slug}/cart?couponCode=        ler (com prévia do cupom)
//   POST   storefront/{slug}/cart/items              { productId, productVariantId?, quantity } (soma no mesmo SKU)
//   PUT    storefront/{slug}/cart/items/{itemId}     { quantity }
//   DELETE storefront/{slug}/cart/items/{itemId}     · DELETE cart/items [ids] · DELETE cart
//   PUT    storefront/{slug}/cart/selection          { itemIds?, selected } (sem itemIds: todos os disponíveis)
//   PUT    storefront/{slug}/cart/items/{itemId}/await-stock
// Os ids são do ITEM do carrinho, não do produto. Totais, desconto e
// disponibilidade vêm do back; só a leitura (GET) traz a prévia do cupom.

const customer = (body) => ({ realm: 'storefront', body });

// O enum CartItemAvailability pode chegar como número ou como nome.
const AVAILABILITY = { 1: 'available', 2: 'insufficient', 3: 'out-of-stock', 4: 'unavailable' };
const availabilityOf = (value) => AVAILABILITY[value]
  ?? { available: 'available', insufficientstock: 'insufficient', outofstock: 'out-of-stock', unavailable: 'unavailable' }[String(value).toLowerCase()]
  ?? 'unavailable';

const parseAttributes = (json) => {
  try {
    const parsed = JSON.parse(json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeCart = (cart) => ({
  ...cart,
  items: (cart?.items ?? []).map((item) => {
    const attributes = parseAttributes(item.variantAttributesJson);
    return {
      ...item,
      availability: availabilityOf(item.availability),
      attributes,
      variantLabel: variantLabel({ attributes }),
      imageUrl: productImage(item),
    };
  }),
});

export const getCart = async (couponCode) => normalizeCart(await request(
  'GET',
  sf(`cart${couponCode ? `?couponCode=${encodeURIComponent(couponCode)}` : ''}`),
  customer(),
));

export const addCartItem = async ({ productId, variantId, quantity }) =>
  normalizeCart(await request('POST', sf('cart/items'), customer({ productId, productVariantId: variantId ?? null, quantity })));

export const updateCartItem = async (itemId, quantity) =>
  normalizeCart(await request('PUT', sf(`cart/items/${itemId}`), customer({ quantity })));

export const removeCartItems = async (itemIds) => normalizeCart(itemIds.length === 1
  ? await request('DELETE', sf(`cart/items/${itemIds[0]}`), customer())
  : await request('DELETE', sf('cart/items'), customer(itemIds)));

export const clearCart = async () => normalizeCart(await request('DELETE', sf('cart'), customer()));

export const setCartSelection = async ({ itemIds = null, selected }) =>
  normalizeCart(await request('PUT', sf('cart/selection'), customer({ itemIds, selected })));

export const awaitCartItemStock = async (itemId) =>
  normalizeCart(await request('PUT', sf(`cart/items/${itemId}/await-stock`), customer()));
