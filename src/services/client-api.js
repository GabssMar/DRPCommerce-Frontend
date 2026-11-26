import { DROP_BASE, STORE_BASE, storefrontPath } from './config';
import { request } from './http';
import { crud } from './resources';
import { toPage } from './paging';
import { cpfDigits } from './cpf';
import { REALMS } from './session';
import { ORDER_STATUS_EXCLUDED } from './status';

// Funções das telas do CLIENTE (conta, inscrição, lista de espera, checkout).
// Rotas conferidas no back-end (origin/main):
//   - storefront/* : rotas do cliente autenticado (JWT de cliente), resposta crua.
//   - CRUD (drop-events, waitlist-entries…): usadas onde o storefront ainda não tem
//     rota própria. Estão marcadas com "CRUD" e listadas em docs/telas-design.md.

const realm = REALMS.storefront;
const opts = (body) => ({ realm, body });

const sf = {
  store: (path) => storefrontPath(STORE_BASE, path),
  drop: (path) => storefrontPath(DROP_BASE, `drop/${path}`),
};

const dropEvents = crud('drop/drop-events', { realm });
const dropProducts = crud('drop/drop-products', { realm });
const dropCoupons = crud('drop/drop-coupons', { realm });
const dropReservations = crud('drop/drop-reservations', { realm });
const dropRegistrations = crud('drop/drop-registrations', { realm });
const dropNotifications = crud('drop/drop-notifications', { realm });
const dropOrders = crud('drop/drop-orders', { realm });
const waitlist = crud('drop/waitlist-entries', { realm });
const documents = crud('store/documents', { realm });

// ------------------------------------------------------------------ CONTA ---

export const getMe = () => request('GET', sf.store('me'), opts());
export const updateMe = (profile) => request('PUT', sf.store('me'), opts(profile));
// Prévia da exclusão: { canDelete, blockers: [{ code, message, count }] }. É só
// informativa: o DELETE (auth.js, deleteCustomerAccount) confere tudo de novo.
export const getDeletionEligibility = () => request('GET', sf.store('me/deletion'), opts());

// CPF do cliente: Document com referenceType "Customer" (CRUD).
export const getMyDocuments = async (customerId) =>
  (await documents.getAll()).filter((d) => d.referenceType === 'Customer' && d.referenceId === customerId);

export const sendDocument = (customerId, { number, fileUrl }) =>
  documents.add({
    enterpriseId: 0, // o back carimba a loja da sessão
    referenceId: customerId,
    referenceType: 'Customer',
    documentTypeId: 1,
    number,
    fileUrl,
    documentStatusId: 2, // Aguardando validação
    issuedAt: new Date().toISOString(),
    expiresAt: null,
  });

// ------------------------------------------------------------------ DROPS ---

// Portal e detalhe do drop (task 16). Rotas públicas do DROP (StorefrontDropEventController):
//   GET storefront/{slug}/drop/events       DropStorefrontEventSummary[] (sem estoque nem horário da fila)
//   GET storefront/{slug}/drop/events/{id}  DropStorefrontEventResponse: datas e products[] (participações)
//     com variants[] { id, sku, optionsJson, price, available }. 404 = evento não público.
// A resposta pública não traz status: a fase sai das datas comparadas com serverNow().
export const listPublicDrops = () => request('GET', sf.drop('events'), { realm: null });

const parseOptions = (json) => {
  try {
    const parsed = JSON.parse(json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

// Variação no formato do VariantPicker (task 29): attributes + canPurchase.
const toDropVariant = (variant) => ({
  ...variant,
  attributes: parseOptions(variant.optionsJson),
  availableQuantity: variant.available,
  canPurchase: variant.available > 0,
});

export const getDropEvent = async (id) => {
  const event = await request('GET', sf.drop(`events/${id}`), { realm: null });
  const products = (event?.products ?? []).map((product) => ({
    ...product,
    variants: (product.variants ?? []).map(toDropVariant),
  }));
  const available = products.reduce((sum, p) => sum + p.variants.reduce((s, v) => s + Math.max(0, v.available), 0), 0);
  const prices = products.flatMap((p) => p.variants.map((v) => v.price));
  return {
    ...event,
    products,
    available,
    soldOut: products.length > 0 && available === 0,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
};

// ------------------------------------------------------------ FILA DO DROP ---
// Fila (task 17). Rotas do DROP (StorefrontQueueEntryController), cliente logado:
//   POST storefront/{slug}/drop/events/{id}/queue { cpf } -> DropQueueStatusResponse
//   GET  storefront/{slug}/drop/events/{id}/queue         -> DropQueueStatusResponse
//        { id, position, queueEntryStatusId, session: { id, issuedAt, expiresAt } | null }
//        404 Drop.QueueNotFound = o cliente ainda não entrou.
// Não há rota para sair: quem expira (5) ou foi removido (6) entra de novo e vai
// para o fim da fila, com o MESMO CPF (a identidade fica presa ao evento).
export const QUEUE_STATUS = { WAITING: 1, CALLED: 2, CHECKING_OUT: 3, COMPLETED: 4, EXPIRED: 5, REMOVED: 6 };

export const getDropQueueStatus = async (eventId) => {
  try {
    return await request('GET', sf.drop(`events/${eventId}/queue`), opts());
  } catch (err) {
    if (err?.kind === 'not-found' && (!err.code || err.code === 'Drop.QueueNotFound')) return null;
    throw err;
  }
};

export const joinDropQueue = (eventId, cpf) =>
  request('POST', sf.drop(`events/${eventId}/queue`), opts({ cpf: cpfDigits(cpf) }));

// ---------------------------------------------------------- COMPRA DO DROP ---
// Reserva e pagamento (task 18). Rotas do DROP (StorefrontQueueEntryController,
// StorefrontDropReservationController, StorefrontDropPurchaseController), cliente logado:
//   POST storefront/{slug}/drop/events/{id}/reservations
//        { participationId, sessionId, idempotencyKey, lines: [{ variantId, quantity }] } -> DropReservationResponse
//   GET  storefront/{slug}/drop/reservations(/{id})        -> resumos (com status) · reserva com linhas
//   POST storefront/{slug}/drop/reservations/{id}/checkout -> DropPurchaseResponse (idempotente pela reserva)
//   GET  storefront/{slug}/drop/purchases/{id}             -> DropPurchaseResponse
// A reserva vive dentro da sessão da fila (mesmo prazo, 15 min fixos). O checkout cria o
// pedido com o endereço do cadastro e devolve a URL do Mercado Pago da loja; voltar dessa
// página NÃO confirma a compra: quem confirma é o back, pelo webhook.
export const RESERVATION_STATUS = { ACTIVE: 1, CONFIRMED: 2, EXPIRED: 3, CANCELLED: 4 };
export const DROP_PAYMENT_STATUS = { PENDING: 1, PAID: 2, PARTIAL_REFUND: 3, FULL_REFUND: 4, FAILED: 5 };

export const reserveDrop = (eventId, { participationId, sessionId, idempotencyKey, lines }) =>
  request('POST', sf.drop(`events/${eventId}/reservations`), opts({
    participationId,
    sessionId,
    idempotencyKey,
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
  }));

export const listMyDropReservations = () => request('GET', sf.drop('reservations'), opts());
export const getDropReservation = (id) => request('GET', sf.drop(`reservations/${id}`), opts());
export const checkoutDrop = (reservationId) => request('POST', sf.drop(`reservations/${reservationId}/checkout`), opts());
export const getDropPurchase = (id) => request('GET', sf.drop(`purchases/${id}`), opts());

/**
 * Fase do drop pelas datas (a resposta pública não traz dropEventStatusId).
 * @returns {'upcoming'|'queue'|'live'|'ended'}
 */
export const dropPhase = (event, now) => {
  if (!event) return 'upcoming';
  if (now >= Date.parse(event.dropEndsAt)) return 'ended';
  if (now >= Date.parse(event.dropStartsAt)) return 'live';
  if (event.queueOpensAt && now >= Date.parse(event.queueOpensAt)) return 'queue';
  return 'upcoming';
};

// O storefront só lista eventos; agenda completa (inscrição, fila) vem do CRUD.
export const getDrop = (id) => dropEvents.getById(id);

export const getDropStock = async (eventId) => {
  const [products, reservations] = await Promise.all([dropProducts.getAll(), dropReservations.getAll()]);
  const variants = products.filter((p) => p.dropEventId === eventId && !p.isDeleted);
  const active = reservations.filter((r) => r.dropEventId === eventId && r.dropReservationStatusId === 1);
  const allocated = variants.reduce((s, p) => s + p.unitsAllocated, 0);
  const sold = variants.reduce((s, p) => s + p.unitsSold, 0);
  const reserved = active.reduce((s, r) => s + r.quantity, 0);
  return { variants, allocated, sold, reserved, available: Math.max(0, allocated - sold - reserved) };
};

export const getDropCoupons = async (eventId) =>
  (await dropCoupons.getAll()).filter((c) => c.dropEventId === eventId && c.isActive);

// Inscrição prévia (C3).
export const getMyRegistration = async (eventId) => {
  const mine = (await request('GET', sf.drop('registrations'), opts())).find((r) => r.dropEventId === eventId);
  if (!mine) return null;
  // O motivo da inelegibilidade (eligibilityReason) só vem no CRUD.
  try {
    return { ...(await dropRegistrations.getById(mine.id)), ...mine };
  } catch {
    return mine;
  }
};

export const registerForDrop = (eventId) => request('POST', sf.drop(`events/${eventId}/register`), opts());

// Canais escolhidos: um aviso "Inscrição confirmada" por canal (CRUD add-range).
export const scheduleRegistrationNotices = (eventId, customerId, channelIds, eventName) =>
  channelIds.length
    ? dropNotifications.addRange(channelIds.map((channelId) => ({
      dropEventId: eventId,
      customerId,
      dropNotificationChannelId: channelId,
      dropNotificationTypeId: 1,
      subject: `Inscrição no ${eventName} recebida`,
      body: 'Avisamos o resultado da elegibilidade, a abertura da fila e quando for a sua vez.',
      dropNotificationStatusId: 1,
      scheduledAt: new Date().toISOString(),
      sentAt: null,
    })))
    : Promise.resolve([]);

export const cancelRegistration = (registrationId) => dropRegistrations.remove(registrationId);

// Lista de espera (C6).
export const getMyWaitlistEntry = async (eventId) => {
  const mine = (await request('GET', sf.drop('waitlist'), opts())).find((w) => w.dropEventId === eventId);
  if (!mine) return null;
  // O storefront não traz expiresAt/notifiedAt: o detalhe vem do CRUD.
  try {
    return await waitlist.getById(mine.id);
  } catch {
    return mine;
  }
};

// Quantos aguardam e qual a minha colocação entre os que aguardam.
export const getWaitlistStats = async (eventId, myPosition = null) => {
  const waiting = (await waitlist.getAll()).filter((w) => w.dropEventId === eventId && w.waitlistEntryStatusId === 1);
  return {
    waiting: waiting.length,
    rank: myPosition == null ? null : waiting.filter((w) => w.position <= myPosition).length,
  };
};

// Não há rota de cliente para entrar na lista: CRUD add, com a posição no fim da fila.
export const joinWaitlist = async ({ eventId, dropProductId, customerId, dropEndsAt }) => {
  const entries = (await waitlist.getAll()).filter((w) => w.dropEventId === eventId);
  const position = entries.reduce((max, w) => Math.max(max, w.position), 0) + 1;
  return waitlist.add({
    dropEventId: eventId,
    dropProductId: dropProductId ?? null,
    customerId,
    position,
    waitlistEntryStatusId: 1,
    notificationSent: false,
    joinedAt: new Date().toISOString(),
    notifiedAt: null,
    expiresAt: dropEndsAt,
  });
};

export const leaveWaitlist = (entryId) => waitlist.remove(entryId);

// ------------------------------------------------------------- ENDEREÇOS ---

// Endereços de entrega (task 31). Toda escrita devolve a lista inteira, o padrão
// primeiro: a tela troca a lista pela resposta, sem reler.
// Regras do back: até 20; o primeiro vira padrão; excluir o padrão promove o mais
// recente; editar não muda pedidos já feitos (o pedido copia o endereço).
const addressBody = (address) => ({
  label: address.label?.trim() || null,
  recipientName: address.recipientName?.trim() || null,
  addressLine: address.addressLine.trim(),
  city: address.city.trim(),
  stateId: Number(address.stateId),
  zipCode: address.zipCode.trim(),
  country: address.country?.trim() || null,
  isDefault: Boolean(address.isDefault),
});

export const MAX_ADDRESSES = 20;
export const listAddresses = () => request('GET', sf.store('me/addresses'), opts());
export const addAddress = (address) => request('POST', sf.store('me/addresses'), opts(addressBody(address)));
export const updateAddress = (id, address) => request('PUT', sf.store(`me/addresses/${id}`), opts(addressBody(address)));
export const setDefaultAddress = (id) => request('PUT', sf.store(`me/addresses/${id}/default`), opts());
export const deleteAddress = (id) => request('DELETE', sf.store(`me/addresses/${id}`), opts());

// --------------------------------------------------------------- PEDIDOS ---

// Lista unificada de pedidos (drop + vitrine).
// Vitrine (task 32): GET storefront/orders, PagedResponse<OrderSummaryResponse>, com
// número comercial, status e se o cliente ainda pode cancelar. Drop: storefront/drop/orders
// + CRUD para a data (task 18 troca pelo fluxo novo).
const STORE_ORDERS_PAGE_SIZE = 100;

export const listMyOrders = async () => {
  const [store, drop, drops] = await Promise.all([
    request('GET', sf.store(`orders?page=1&pageSize=${STORE_ORDERS_PAGE_SIZE}`), opts()).then(toPage),
    request('GET', sf.drop('orders'), opts()),
    listPublicDrops(),
  ]);
  const dropFull = await dropOrders.getByIds(drop.map((o) => o.id)).catch(() => []);

  const fromStore = store.items.map((o) => ({
    source: 'store', id: o.id, number: o.number, createdAt: o.createdAt, totalAmount: o.totalAmount,
    statusId: o.statusId, paymentStatusId: o.paymentStatusId, paymentExpiresAt: o.paymentExpiresAt,
    canCustomerCancel: o.canCustomerCancel, title: `Pedido nº ${o.number}`, imageUrl: '',
  }));
  const fromDrop = drop.map((o) => {
    const event = drops.find((d) => d.id === o.dropEventId);
    return {
      source: 'drop', id: o.id, createdAt: dropFull.find((f) => f.id === o.id)?.createdAt ?? null, totalAmount: o.totalAmount,
      statusId: o.dropOrderStatusId, paymentStatusId: o.dropOrderPaymentStatusId,
      title: event?.name ?? `Drop #${o.dropEventId}`, imageUrl: event?.coverImageUrl ?? '', eventId: o.dropEventId,
    };
  });
  return [...fromStore, ...fromDrop].sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0));
};

// Detalhe. Vitrine: GET storefront/orders/{id} (OrderDetailResponse) traz itens, totais,
// endereço, cobrança, envios e histórico. Nota fiscal ainda não tem rota do cliente.
export const getOrderDetail = async (source, id) => {
  if (source === 'drop') {
    const [order, summary] = await Promise.all([dropOrders.getById(id), request('GET', sf.drop(`orders/${id}`), opts())]);
    return { order, items: summary.items ?? [], shipment: null, invoice: null };
  }
  const order = await request('GET', sf.store(`orders/${id}`), opts());
  return {
    order,
    items: (order.items ?? []).map((i) => ({ ...i, itemName: i.variantName ? `${i.itemName} (${i.variantName})` : i.itemName })),
    shipment: order.shipments?.at(-1) ?? null,
    invoice: null,
  };
};

// Drop: o back não tem rota de cancelamento da compra e o CRUD de drop-orders
// responde 403 DropPurchase.UseWorkflow; a reserva expira sozinha se não for paga.
// Vitrine: POST storefront/orders/{id}/cancel; só pedido aguardando pagamento
// (canCustomerCancel). O back libera o estoque reservado.
export const cancelOrder = (source, order, reason) => {
  if (source === 'drop') throw new Error('Compras de drop não podem ser canceladas por aqui.');
  return request('POST', sf.store(`orders/${order.id}/cancel`), opts({ reason: reason?.trim() || null }));
};

// ---------------------------------------------------------- NOTIFICAÇÕES ---

export const listMyNotifications = async () => {
  const list = await request('GET', sf.drop('notifications'), opts());
  // Tipo, canal e status não vêm no storefront: tenta completar pelo CRUD.
  try {
    const full = await dropNotifications.getByIds(list.map((n) => n.id));
    const byId = new Map(full.map((n) => [n.id, n]));
    return list.map((n) => ({ ...byId.get(n.id), ...n }));
  } catch {
    return list;
  }
};

export const deleteNotification = (id) => dropNotifications.remove(id);

// ------------------------------------------------------- VITRINE/CHECKOUT ---

// ---------------------------------------------------------------- CHECKOUT ---
// Checkout real (task 32). Rotas conferidas no back (StorefrontOrderController):
//   POST storefront/{slug}/checkout/shipping-quotes  { addressId? | useProfileAddress | campos } -> cotações
//   POST storefront/{slug}/checkout                  CheckoutRequest -> OrderDetailResponse
// O pedido compra os itens MARCADOS do carrinho; o front não manda itens, preço nem
// desconto. A mesma idempotencyKey devolve o mesmo pedido (clique duplo, F5, timeout).

// Formas de pagamento do back (TransactionMethod). Saldo Mercado Pago (4) só com a conta conectada.
export const PAYMENT_METHODS = [
  { id: 2, label: 'Pix' },
  { id: 1, label: 'Cartão de crédito' },
  { id: 3, label: 'Boleto' },
];

/**
 * Onde entregar: um endereço salvo, o do cadastro ou um digitado (o back recusa
 * addressId com useProfileAddress).
 * @param {{ kind: 'saved'|'profile'|'new', addressId?: number, addressLine?: string, city?: string, stateId?: number, zipCode?: string }} choice
 */
const destinationBody = (choice) => {
  if (choice.kind === 'saved') return { addressId: choice.addressId, useProfileAddress: false };
  if (choice.kind === 'profile') return { addressId: null, useProfileAddress: true };
  return {
    addressId: null,
    useProfileAddress: false,
    shippingAddressLine: choice.addressLine?.trim() ?? '',
    shippingCity: choice.city?.trim() ?? '',
    shippingStateId: Number(choice.stateId) || null,
    shippingZipCode: choice.zipCode?.trim() ?? '',
  };
};

export const getShippingQuotes = (choice) =>
  request('POST', sf.store('checkout/shipping-quotes'), opts(destinationBody(choice)));

/**
 * @param {{ idempotencyKey: string, paymentMethodId: number, couponCode?: string|null, destination: object,
 *   pickupAtStore?: boolean, shippingQuoteToken?: string|null, notes?: string }} checkout
 */
export const placeOrder = ({ idempotencyKey, paymentMethodId, couponCode, destination, pickupAtStore, shippingQuoteToken, notes }) =>
  request('POST', sf.store('checkout'), opts({
    idempotencyKey,
    paymentMethodId,
    couponCode: couponCode || null,
    ...(pickupAtStore ? { addressId: null, useProfileAddress: false } : destinationBody(destination)),
    shippingQuoteToken: pickupAtStore ? null : shippingQuoteToken ?? null,
    pickupAtStore: Boolean(pickupAtStore),
    notes: notes?.trim() || null,
  }));

export const isCountedOrder = (statusId) => !ORDER_STATUS_EXCLUDED.includes(statusId);
