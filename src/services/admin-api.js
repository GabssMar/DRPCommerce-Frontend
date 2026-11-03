import { STORE_BASE } from './config';
import { request } from './http';
import { crud } from './resources';
import { getAccessToken, REALMS } from './session';

// Funções do PAINEL DA LOJA. Os recursos CRUD ficam expostos como objetos
// (admin.dropEvents.getAll()); as operações compostas — as que mexem em mais de
// um registro ou precisam do objeto inteiro — ficam aqui, para nenhuma tela
// montar corpo de comando à mão.

const realm = REALMS.backoffice;

export const admin = {
  // Drop
  dropEvents: crud('drop/drop-events', { realm }),
  dropProducts: crud('drop/drop-products', { realm }),
  dropCoupons: crud('drop/drop-coupons', { realm }),
  dropOrders: crud('drop/drop-orders', { realm }),
  dropOrderItems: crud('drop/drop-order-items', { realm }),
  dropRegistrations: crud('drop/drop-registrations', { realm }),
  dropReservations: crud('drop/drop-reservations', { realm }),
  dropTransactions: crud('drop/drop-transactions', { realm }),
  dropNotifications: crud('drop/drop-notifications', { realm }),
  dropAuditLogs: crud('drop/drop-audit-logs', { realm }),
  fraudSignals: crud('drop/fraud-signals', { realm }),
  queueEntries: crud('drop/queue-entries', { realm }),
  queueSessions: crud('drop/queue-sessions', { realm }),
  waitlist: crud('drop/waitlist-entries', { realm }),
  // Store
  products: crud('store/products', { realm }),
  categories: crud('store/categories', { realm }),
  coupons: crud('store/coupons', { realm }),
  customers: crud('store/customers', { realm }),
  documents: crud('store/documents', { realm }),
  orders: crud('store/orders', { realm }),
  orderItems: crud('store/order-items', { realm }),
  shipments: crud('store/shipments', { realm }),
  invoices: crud('store/invoices', { realm }),
  transactions: crud('store/transactions', { realm }),
  suppliers: crud('store/suppliers', { realm }),
  services: crud('store/services', { realm }),
  employees: crud('store/employees', { realm }),
  positions: crud('store/employee-positions', { realm }),
  departments: crud('store/departments', { realm }),
};

const store = (path) => `${STORE_BASE}/${path}`;
const opts = (body) => ({ realm, body });

// ------------------------------------------------------------ IDENTIDADE ---

// Quem está operando o painel: MembershipId vem do JWT; o funcionário é o
// Employee com aquele enterpriseMembershipId.
const membershipIdFromToken = () => {
  const token = getAccessToken(realm);
  if (!token) return null;
  if (token.startsWith('mock-')) return Number(token.split('-').pop());
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number(payload.MembershipId) || null;
  } catch {
    return null;
  }
};

export const getCurrentEmployee = async () => {
  const membershipId = membershipIdFromToken();
  if (!membershipId) return null;
  const employees = await admin.employees.getAll();
  return employees.find((e) => e.enterpriseMembershipId === membershipId) ?? null;
};

// ----------------------------------------------------------------- DROPS ---

// Mudar a fase = reenviar o evento inteiro com outro dropEventStatusId.
export const setDropStatus = (event, dropEventStatusId) => admin.dropEvents.patch(event, { dropEventStatusId });

export const listEventVariants = async (eventId) =>
  (await admin.dropProducts.getAll()).filter((p) => p.dropEventId === eventId && !p.isDeleted);

export const listEventCoupons = async (eventId) =>
  (await admin.dropCoupons.getAll()).filter((c) => c.dropEventId === eventId && !c.isDeleted);

// Chamar um lote da fila: os N primeiros "Aguardando" viram "Chamado".
export const callQueueBatch = (entries, size) => {
  const batch = entries
    .filter((e) => e.queueEntryStatusId === 1)
    .sort((a, b) => a.position - b.position)
    .slice(0, size);
  return batch.length ? admin.queueEntries.patchRange(batch, { queueEntryStatusId: 2, calledAt: new Date().toISOString() }) : Promise.resolve([]);
};

export const removeQueueEntries = (entries) => admin.queueEntries.patchRange(entries, { queueEntryStatusId: 6 });

// Inscrições: aprovar (2 Elegível) ou reprovar (3 Inelegível) em lote.
export const decideRegistrations = (registrations, approve, reason = '') =>
  admin.dropRegistrations.patchRange(registrations, {
    dropRegistrationStatusId: approve ? 2 : 3,
    isEligible: approve,
    eligibilityReason: approve ? '' : reason || 'Reprovado na revisão',
    eligibilityCheckedAt: new Date().toISOString(),
  });

// Lista de espera: avisar = status 2 Notificado + prazo de 10 min para comprar.
export const notifyWaitlistEntries = (entries) => {
  const now = Date.now();
  return admin.waitlist.patchRange(entries, {
    waitlistEntryStatusId: 2,
    notificationSent: true,
    notifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
  });
};

// Aviso em massa: um registro por destinatário × canal, todos "Agendado".
export const scheduleNotifications = ({ eventId, customerIds, channelIds, typeId, subject, body, scheduledAt }) =>
  admin.dropNotifications.addRange(customerIds.flatMap((customerId) => channelIds.map((channelId) => ({
    dropEventId: eventId,
    customerId,
    dropNotificationChannelId: channelId,
    dropNotificationTypeId: typeId,
    subject,
    body,
    dropNotificationStatusId: 1,
    scheduledAt,
    sentAt: null,
  }))));

// ---------------------------------------------------------------- PEDIDOS ---

export const setOrderStatus = (source, order, statusId) =>
  source === 'drop'
    ? admin.dropOrders.patch(order, { dropOrderStatusId: statusId })
    : admin.orders.patch(order, { orderStatusId: statusId });

// Reembolso: transação tipo 2 (Reembolso) + pedido 7 Reembolsado / pagamento 4.
export const refundOrder = async (source, order, payment) => {
  const now = new Date().toISOString();
  const refund = {
    customerId: order.customerId,
    amount: order.totalAmount,
    fee: 0,
    gatewayReference: '',
    gatewayProvider: payment?.gatewayProvider ?? '',
    gatewayPayload: '{}',
    paidAt: null,
    refundedAt: now,
  };
  if (source === 'drop') {
    await admin.dropTransactions.add({
      ...refund, dropOrderId: order.id, dropTransactionTypeId: 2,
      dropTransactionMethodId: payment?.dropTransactionMethodId ?? 1, dropTransactionStatusId: 6,
    });
    return admin.dropOrders.patch(order, { dropOrderStatusId: 7, dropOrderPaymentStatusId: 4 });
  }
  await admin.transactions.add({
    ...refund, orderId: order.id, transactionTypeId: 2,
    transactionMethodId: payment?.transactionMethodId ?? 1, transactionStatusId: 6,
  });
  return admin.orders.patch(order, { orderStatusId: 7, orderPaymentStatusId: 4 });
};

// Envio da vitrine: cria ou atualiza o Shipment do pedido.
export const saveShipment = (order, existing, { carrierName, shipmentTypeId, trackingCode, stateUf }) => {
  const now = new Date().toISOString();
  const fields = {
    carrierName,
    shipmentTypeId,
    trackingCode,
    shipmentStatusId: trackingCode ? 3 : 1,
    shippedAt: trackingCode ? existing?.shippedAt ?? now : null,
    // O comando recebe a UF como texto.
    state: stateUf,
  };
  if (existing) return admin.shipments.patch(existing, fields);
  return admin.shipments.add({
    orderId: order.id,
    supplierId: null,
    shippingCost: order.shippingCost,
    addressLine: order.shippingAddressLine,
    city: order.shippingCity,
    stateId: order.shippingStateId,
    zipCode: order.shippingZipCode,
    country: 'Brasil',
    estimatedDelivery: new Date(Date.now() + 7 * 864e5).toISOString(),
    deliveredAt: null,
    ...fields,
  });
};

// Nota fiscal (só pedidos da vitrine têm Invoice no back).
export const issueInvoice = (order, sequence) =>
  admin.invoices.add({
    orderId: order.id,
    customerId: order.customerId,
    enterpriseId: order.enterpriseId,
    number: String(sequence).padStart(6, '0'),
    series: '1',
    accessKey: '',
    invoiceTypeId: 1,
    invoiceStatusId: 1,
    totalAmount: order.totalAmount,
    taxAmount: order.taxAmount,
    fileUrl: '',
    issuedAt: null,
  });

// -------------------------------------------------------------- CATÁLOGO ---

// Task 19: o back-end ainda não tem estoque em Product. Rota planejada.
export const adjustStock = ({ productId, delta, reason }) =>
  request('POST', store('products/adjust-stock'), opts({ productId, delta, reason }));

// ------------------------------------------------------------- AUDITORIA ---

export const writeAudit = async ({ eventId, customerId = null, action, entityName, entityId, oldValues, newValues }) => {
  const employee = await getCurrentEmployee().catch(() => null);
  return admin.dropAuditLogs.add({
    dropEventId: eventId,
    customerId,
    employeeId: employee?.id ?? null,
    action,
    entityName,
    entityId,
    oldValues: oldValues ? JSON.stringify(oldValues) : '',
    newValues: newValues ? JSON.stringify(newValues) : '',
    ipAddress: '',
    userAgent: navigator.userAgent.slice(0, 200),
    occurredAt: new Date().toISOString(),
  });
};

// --------------------------------------------------------- EQUIPE/EMPRESA ---

export const listMyEnterprises = () => request('GET', store('enterprises/mine'), opts());
export const updateEnterprise = (payload) => request('PUT', store('enterprises/current'), opts(payload));
// Dados públicos da loja (nome, e-mail, telefone): o back não tem GET completo da empresa.
export const getPublicStore = () => request('GET', store('storefront/store'), { realm: null });

export const listInvitations = () => request('GET', store('invitations'), opts());
export const inviteMember = ({ email, kindId, accessRoleIds }) => request('POST', store('invitations'), opts({ email, kindId, accessRoleIds }));
export const revokeInvitation = (id) => request('DELETE', store(`invitations/${id}`), opts());
export const listAccessRoles = () => request('GET', store('access-roles/get-all'), opts());
