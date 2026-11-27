import { STORE_BASE } from './config';
import { request } from './http';
import { searchQuery, toPage } from './paging';
import { REALMS } from './session';

// Catálogo do painel (task 33): produtos editados por seção, cada uma com a sua
// permissão, e variantes (SKUs). O produto simples tem uma variante padrão.
//   products/search · products/get-by-id · products/add · products/{id}/details|pricing|dimensions|category|active
//   products/{id}/variants/enable · products/{id}/variants[/{vid}[/pricing|/dimensions]]

const realm = REALMS.backoffice;
const store = (path) => `${STORE_BASE}/${path}`;
const opts = (body) => ({ realm, body });

// ------------------------------------------------------------ PRODUTOS ---

// Filtros: term, categoryId, includeSubcategories, brand, minPrice, maxPrice,
// inStock, isActive, sort (name | price_asc | price_desc | newest), page, pageSize.
export const searchProducts = async (filters) =>
  toPage(await request('GET', store(`products/search${searchQuery(filters)}`), opts()));

export const getProduct = (id) => request('GET', store(`products/get-by-id/${id}`), opts());

// O add devolve lista com um item.
export const createProduct = async (product) => (await request('POST', store('products/add'), opts(product)))[0];

export const updateProductDetails = (id, { name, slug, description, sku, barCode, brand, imageUrls, isDigital }) =>
  request('PUT', store(`products/${id}/details`), opts({ name, slug, description, sku, barCode, brand, imageUrls, isDigital }));

// Exige products.change_price.
export const updateProductPricing = (id, { price, costPrice }) =>
  request('PUT', store(`products/${id}/pricing`), opts({ price, costPrice }));

export const updateProductDimensions = (id, { weight, height, width, length }) =>
  request('PUT', store(`products/${id}/dimensions`), opts({ weight, height, width, length }));

export const updateProductCategory = (id, { categoryId, supplierId }) =>
  request('PUT', store(`products/${id}/category`), opts({ categoryId, supplierId: supplierId || null }));

export const setProductActive = (id, isActive) => request('PUT', store(`products/${id}/active`), opts({ isActive }));

// Só com o SKU padrão sem saldo e sem reserva. Não há volta.
export const enableVariants = (id) => request('PUT', store(`products/${id}/variants/enable`), opts());

// ----------------------------------------------------------- VARIANTES ---

const variants = (productId, path = '') => store(`products/${productId}/variants${path}`);

// { details: { name, sku, barCode, attributes, isActive }, pricing?, dimensions? }
export const createVariant = (productId, variant) => request('POST', variants(productId), opts(variant));

export const updateVariant = (productId, id, { name, sku, barCode, attributes, isActive }) =>
  request('PUT', variants(productId, `/${id}`), opts({ name, sku, barCode, attributes, isActive }));

// Valores nulos voltam a herdar do produto.
export const updateVariantPricing = (productId, id, { price, costPrice }) =>
  request('PUT', variants(productId, `/${id}/pricing`), opts({ price, costPrice }));

export const updateVariantDimensions = (productId, id, { weight, height, width, length }) =>
  request('PUT', variants(productId, `/${id}/dimensions`), opts({ weight, height, width, length }));

export const deleteVariant = (productId, id) => request('DELETE', variants(productId, `/${id}`), opts());

// ------------------------------------------------------------- ESTOQUE ---

// Task 34 (inventory.manage). O saldo é do SKU: a rota devolve a variante, com
// stockQuantity, reservedQuantity, availableQuantity e version.
export const getStock = (variantId) => request('GET', store(`inventory/variants/${variantId}`), opts());

// quantityChange ≠ 0 (entrada positiva, saída negativa). expectedVersion evita
// sobrescrever um saldo que mudou: 409 Inventory.StaleVersion. A mesma
// idempotencyKey repetida devolve a movimentação original.
export const adjustStock = (variantId, { quantityChange, reason, idempotencyKey, expectedVersion }) =>
  request('PUT', store(`inventory/variants/${variantId}/adjust`), opts({ quantityChange, reason, idempotencyKey, expectedVersion }));

export const listMovements = async (filters) =>
  toPage(await request('GET', store(`inventory/movements${searchQuery(filters)}`), opts()));

// Reservas avulsas: o back não lista; guarde o id devolvido.
export const createReservation = ({ idempotencyKey, reference, items }) =>
  request('POST', store('inventory/reservations'), opts({ idempotencyKey, reference, items }));
export const getReservation = (id) => request('GET', store(`inventory/reservations/${id}`), opts());
// Reserva de pedido: 409 Inventory.OrderReservationProtected.
export const releaseReservation = (id) => request('PUT', store(`inventory/reservations/${id}/release`), opts());
export const commitReservation = (id) => request('PUT', store(`inventory/reservations/${id}/commit`), opts());
