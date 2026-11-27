import { DROP_BASE, STORE_BASE, storefrontPath } from './config';
import { request } from './http';
import { searchQuery, toPage } from './paging';
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

// Fila: a admissão é automática no back (worker FIFO). O CRUD de queue-entries
// e queue-sessions não grava (403 DropPurchase.UseWorkflow), então o painel só lê.

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

// -------------------------------------------------------- CONFIGURAÇÕES ---

// Task 39 (settings.manage). Sem configuração salva, o GET devolve o padrão (id 0).
// { currencyCode, minOrderValue, maxItemsPerOrder, allowBackorder, pendingOrderExpirationMinutes }
export const getStoreSettings = () => request('GET', store('store-settings'), opts());
export const updateStoreSettings = ({ currencyCode, minOrderValue, maxItemsPerOrder, allowBackorder, pendingOrderExpirationMinutes }) =>
  request('PUT', store('store-settings'), opts({ currencyCode, minOrderValue, maxItemsPerOrder, allowBackorder, pendingOrderExpirationMinutes }));

// --------------------------------------------------------------- CLIENTES ---

// Task 38. Filtros: term (nome, e-mail ou telefone), isActive, isVerified, emailConfirmed, stateId,
// hasOrders (com compra concluída), createdFrom, createdTo, sort (newest | oldest | name |
// total_spent_desc | last_order_desc), page, pageSize. As métricas vêm calculadas do back:
// { id, fullName, email, phone, city, stateId, isActive, isVerified, completedOrders, totalSpent, lastOrderAt }.
export const searchCustomers = async (filters) => toPage(await request('GET', store(`customers/search${searchQuery(filters)}`), opts()));

// [{ id, label, recipientName, addressLine, city, stateId, state, zipCode, country, isDefault }]
export const listCustomerAddresses = (id) => request('GET', store(`customers/${id}/addresses`), opts());

// ---------------------------------------------------------------- PEDIDOS ---

// Vitrine (task 37): busca paginada e uma rota por transição, que movimenta
// estoque e cupom na mesma transação. Cada transição devolve o detalhe atualizado.
//   Filtros: number, statusIds[], paymentStatusIds[], customerId, couponId, createdFrom, createdTo,
//   minTotal, maxTotal, sort (newest | oldest | total_desc | total_asc), page, pageSize.
export const searchOrders = async (filters) => toPage(await request('GET', store(`orders/search${searchQuery(filters)}`), opts()));

// Itens, cobrança, envios e histórico (linha do tempo).
export const getOrderDetail = (id) => request('GET', store(`orders/${id}/detail`), opts());

const transition = (id, action, body) => request('POST', store(`orders/${id}/${action}`), opts(body));

// Pagamento conferido à mão. O método só é pedido quando o pedido ainda não tem cobrança.
export const confirmPayment = (id, { transactionMethodId, gatewayReference, note } = {}) =>
  transition(id, 'confirm-payment', { transactionMethodId, gatewayReference, note });
export const startProcessing = (id) => transition(id, 'start-processing');
// Produto físico exige shipmentTypeId, estimatedDelivery e, fora da retirada, carrierName.
export const shipOrder = (id, { shipmentTypeId, carrierName, trackingCode, estimatedDelivery, note } = {}) =>
  transition(id, 'ship', { shipmentTypeId, carrierName, trackingCode, estimatedDelivery, note });
export const deliverOrder = (id) => transition(id, 'deliver');
// Pedido pago: o estorno é registrado e a devolução do dinheiro é feita fora do sistema.
export const cancelOrder = (id, reason) => transition(id, 'cancel', { reason });

// Compra do drop: o CRUD de drop-orders/drop-transactions responde 403
// DropPurchase.UseWorkflow. Depois do pagamento confirmado e sem revisão financeira,
// o pedido só avança para 3/4/5 por POST drop-purchases/{id}/fulfillment.
// Não há rota de cancelamento nem de estorno de compra do drop.
export const DROP_FULFILLMENT_STATUSES = [3, 4, 5];

/** Status para os quais a compra do drop pode avançar agora (vazio se ainda não pode). */
export const dropNextStatuses = (order) => {
  if (order.dropOrderPaymentStatusId !== 2 || order.financialReviewCode) return [];
  return DROP_FULFILLMENT_STATUSES.filter((s) => s > order.dropOrderStatusId);
};

export const advanceDropOrder = (order, statusId) =>
  request('POST', `${DROP_BASE}/drop-purchases/${order.id}/fulfillment`, opts({ statusId }));

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

// ---------------------------------------------------------------- EMPRESA ---

// Lojas da conta: [{ membershipId, enterpriseId, tradeName, kindId }]. Aceita o
// token global (antes de escolher a loja).
export const listMyEnterprises = () => request('GET', store('enterprises/mine'), opts());
// Primeira loja (ou mais uma): cria a empresa com a conta como dona principal.
// Devolve { id, tradeName, isActive }; a sessão continua sem loja até o select-enterprise.
export const registerEnterprise = (payload) => request('POST', store('enterprises/register'), opts(payload));
export const updateEnterprise = (payload) => request('PUT', store('enterprises/current'), opts(payload));
// Dados públicos da loja (nome, e-mail, telefone): o back não tem GET completo da empresa.
// Rota do storefront: a loja vem do slug do endereço (STORE_SLUG), não do token.
export const getPublicStore = () => request('GET', storefrontPath(STORE_BASE, 'store'), { realm: null });

// ------------------------------------------------------------ INTEGRAÇÕES ---
// Task 43. Rotas do Store (MercadoPagoController, MelhorEnvioController,
// ProviderConnectionController), equipe com `settings.manage`. Respostas sem tokens.
//   GET    integrations/mercado-pago               { enabled, productionAllowed, applicationId,
//                                                    selectedProvider, selectedEnvironment, connections[] }
//   POST   integrations/mercado-pago/oauth/start   { environment } -> { authorizationUrl, expiresAt } + cookie HttpOnly
//   POST   integrations/mercado-pago/sandbox/connect  vendedor de teste configurado no servidor
//   PUT    integrations/mercado-pago/selection     { provider: 'mercado-pago' | 'manual', environment }
//   GET    integrations/mercado-pago/notifications últimas 100 pendentes/em revisão
//   POST   integrations/melhor-envio/oauth/start   { environment } -> { authorizationUrl, expiresAt } + cookie
//   GET    provider-connections                    metadados de todas as conexões
//   DELETE provider-connections/{provider}/{environment}  desconexão local (apaga os tokens)
// O OAuth termina no back, que volta para o painel com ?mercadoPago=connected ou
// ?melhorEnvio=connected; o resultado vale pelo status autenticado, não pela URL.
export const INTEGRATION_ENV = { SANDBOX: 1, PRODUCTION: 2 };
const ENV_NAMES = { 1: 'Sandbox', 2: 'Production' };
// O enum pode chegar como número ou como nome.
export const envId = (value) => (typeof value === 'number' ? value : value === 'Production' ? 2 : 1);

export const getMercadoPagoIntegration = () => request('GET', store('integrations/mercado-pago'), opts());
export const startMercadoPagoOAuth = (environment) =>
  request('POST', store('integrations/mercado-pago/oauth/start'), opts({ environment }));
export const connectMercadoPagoSandbox = () => request('POST', store('integrations/mercado-pago/sandbox/connect'), opts());
export const selectPaymentProvider = (provider, environment) =>
  request('PUT', store('integrations/mercado-pago/selection'), opts({ provider, environment }));
export const listMercadoPagoNotifications = () => request('GET', store('integrations/mercado-pago/notifications'), opts());
export const startMelhorEnvioOAuth = (environment) =>
  request('POST', store('integrations/melhor-envio/oauth/start'), opts({ environment }));
export const listProviderConnections = () => request('GET', store('provider-connections'), opts());
export const disconnectProvider = (provider, environment) =>
  request('DELETE', store(`provider-connections/${provider}/${ENV_NAMES[envId(environment)]}`), opts());
