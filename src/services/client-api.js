import { DROP_BASE, STORE_BASE } from './config';
import { request } from './http';
import { crud } from './resources';
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
  store: (path) => `${STORE_BASE}/storefront/${path}`,
  drop: (path) => `${DROP_BASE}/storefront/drop/${path}`,
};

const dropEvents = crud('drop/drop-events', { realm });
const dropProducts = crud('drop/drop-products', { realm });
const dropCoupons = crud('drop/drop-coupons', { realm });
const dropReservations = crud('drop/drop-reservations', { realm });
const dropRegistrations = crud('drop/drop-registrations', { realm });
const dropNotifications = crud('drop/drop-notifications', { realm });
const dropOrders = crud('drop/drop-orders', { realm });
const waitlist = crud('drop/waitlist-entries', { realm });
const storeOrders = crud('store/orders', { realm });
const orderItems = crud('store/order-items', { realm });
const transactions = crud('store/transactions', { realm });
const coupons = crud('store/coupons', { realm });
const documents = crud('store/documents', { realm });
const shipments = crud('store/shipments', { realm });
const invoices = crud('store/invoices', { realm });

// ------------------------------------------------------------------ CONTA ---

export const getMe = () => request('GET', sf.store('me'), opts());
export const updateMe = (profile) => request('PUT', sf.store('me'), opts(profile));
export const deactivateMe = () => request('DELETE', sf.store('me'), opts());

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

export const listPublicDrops = () => request('GET', sf.drop('events'), opts());

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

// --------------------------------------------------------------- PEDIDOS ---

// Lista unificada de pedidos (drop + vitrine) com título e miniatura.
// storefront/orders e storefront/drop/orders trazem status e total; itens,
// data do pedido de drop e capa vêm do CRUD e da vitrine.
export const listMyOrders = async () => {
  const [store, drop, drops, products] = await Promise.all([
    request('GET', sf.store('orders'), opts()),
    request('GET', sf.drop('orders'), opts()),
    listPublicDrops(),
    listStoreProducts(),
  ]);
  const [storeItems, dropFull] = await Promise.all([
    store.length ? orderItems.getAll() : [],
    dropOrders.getByIds(drop.map((o) => o.id)).catch(() => []),
  ]);
  const productImage = (id) => products.find((p) => p.id === id)?.imageUrls?.split(',')[0] ?? '';

  const fromStore = store.map((o) => {
    const items = storeItems.filter((i) => i.orderId === o.id);
    const first = items[0];
    return {
      source: 'store', id: o.id, createdAt: o.createdAt, totalAmount: o.totalAmount,
      statusId: o.orderStatusId, paymentStatusId: o.orderPaymentStatusId,
      title: first ? `${first.itemName}${items.length > 1 ? ` + ${items.length - 1} ${items.length === 2 ? 'item' : 'itens'}` : ''}` : 'Pedido da vitrine',
      imageUrl: first?.productId ? productImage(first.productId) : '',
    };
  });
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

// Detalhe completo (endereço, subtotal, desconto, frete) só existe no CRUD.
export const getOrderDetail = async (source, id) => {
  if (source === 'drop') {
    const [order, summary] = await Promise.all([dropOrders.getById(id), request('GET', sf.drop(`orders/${id}`), opts())]);
    return { order, items: summary.items ?? [], shipment: null, invoice: null };
  }
  const [order, summary, allShipments, allInvoices] = await Promise.all([
    storeOrders.getById(id),
    request('GET', sf.store(`orders/${id}`), opts()),
    shipments.getAll(),
    invoices.getAll(),
  ]);
  return {
    order,
    items: summary.items ?? [],
    shipment: allShipments.find((s) => s.orderId === id) ?? null,
    invoice: allInvoices.find((i) => i.orderId === id && i.invoiceStatusId !== 4) ?? null,
  };
};

export const cancelOrder = (source, order) =>
  (source === 'drop' ? dropOrders : storeOrders).patch(order, source === 'drop' ? { dropOrderStatusId: 6 } : { orderStatusId: 6 });

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

export const listStoreProducts = () => request('GET', sf.store('products?page=1&pageSize=100'), { realm: null });

// Cupom da vitrine: válido, dentro da janela e com uso disponível.
export const findStoreCoupon = async (code, subTotal) => {
  const normalized = code.trim().toUpperCase();
  const coupon = (await coupons.getAll()).find((c) => c.code.toUpperCase() === normalized);
  const now = Date.now();
  if (!coupon || !coupon.isActive) return { coupon: null, error: 'Cupom inválido.' };
  if (now < Date.parse(coupon.startsAt) || now > Date.parse(coupon.expiresAt)) return { coupon: null, error: 'Cupom fora da validade.' };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return { coupon: null, error: 'Cupom esgotado.' };
  if (subTotal < coupon.minOrderValue) return { coupon: null, error: `Cupom válido a partir de R$ ${coupon.minOrderValue.toFixed(2).replace('.', ',')}.` };
  return { coupon, error: '' };
};

export const couponDiscount = (coupon, subTotal) => {
  if (!coupon) return 0;
  const raw = coupon.couponTypeId === 1 ? (subTotal * coupon.discountValue) / 100 : coupon.discountValue;
  const capped = coupon.maxDiscountCap > 0 ? Math.min(raw, coupon.maxDiscountCap) : raw;
  return Math.round(Math.min(capped, subTotal) * 100) / 100;
};

// Pedido da vitrine em quatro chamadas, na ordem do design (C10):
//   orders/add -> order-items/add-range -> transactions/add -> coupons/update
export const placeStoreOrder = async ({ customer, lines, coupon, shipping, address, methodId }) => {
  const subTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountAmount = couponDiscount(coupon, subTotal);
  const totalAmount = Math.round((subTotal - discountAmount + shipping.cost) * 100) / 100;

  const order = await storeOrders.add({
    enterpriseId: customer.enterpriseId,
    customerId: customer.id,
    couponId: coupon?.id ?? null,
    orderStatusId: 1,
    orderPaymentStatusId: 1,
    subTotal,
    discountAmount,
    shippingCost: shipping.cost,
    taxAmount: 0,
    totalAmount,
    shippingAddressLine: address.addressLine,
    shippingCity: address.city,
    // O comando recebe a UF como texto; a entidade guarda shippingStateId.
    shippingState: String(address.stateId),
    shippingStateId: address.stateId,
    shippingZipCode: address.zipCode,
    notes: `Frete ${shipping.label}`,
  });

  await orderItems.addRange(lines.map((l) => ({
    orderId: order.id,
    productId: l.productId,
    serviceId: null,
    itemName: l.name,
    sku: l.sku,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountAmount: 0,
    totalPrice: Math.round(l.unitPrice * l.quantity * 100) / 100,
  })));

  await transactions.add({
    orderId: order.id,
    customerId: customer.id,
    transactionTypeId: 1,
    transactionMethodId: methodId,
    transactionStatusId: 1,
    amount: totalAmount,
    fee: 0,
    gatewayReference: '',
    gatewayProvider: '',
    gatewayPayload: '{}',
    paidAt: null,
    refundedAt: null,
  });

  if (coupon) await coupons.patch(coupon, { usedCount: coupon.usedCount + 1 });

  return order;
};

export const isCountedOrder = (statusId) => !ORDER_STATUS_EXCLUDED.includes(statusId);
