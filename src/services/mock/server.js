import { createSeed, SIGNED_IN_CUSTOMER_ID, SIGNED_IN_EMPLOYEE_ID } from './seed';
import { toEntity } from '../resources';
import { createPlansMock } from './plans';
import { createCatalogMock } from './catalog';
import { createAddressesMock } from './addresses';
import { createCartMock } from './cart';
import { createCheckoutMock } from './checkout';
import { createIntegrationsMock } from './integrations';
import { createDropQueueMock } from './drop-queue';
import { serverNow } from '../clock';
import { getAccessToken, REALMS } from '../session';

// Servidor falso que responde nas MESMAS rotas do Gateway (/api/store/api/...,
// /api/drop/api/...), com os mesmos formatos:
//   - CRUD (BaseController): envelope Result<T>; add/update devolvem lista.
//   - storefront/{slug}/*, auth/*, enterprises/*: objeto cru (como o back faz).
//   - erros em application/problem+json, com `code`.
// Os dados vivem só na memória da aba: um F5 volta ao seed.

let db = null;
const data = () => {
  if (!db) db = createSeed();
  return db;
};

export const resetMockData = () => {
  db = null;
  plans.forget();
};

const ok = (content) => ({ status: 200, data: { isSuccess: true, isFailure: false, content, errors: [], listMessageErrors: [] } });
const raw = (body, status = 200) => ({ status, data: body });
const noContent = () => ({ status: 204, data: null });
const problem = (status, code, title) => ({
  status,
  data: { type: `https://httpstatuses.com/${status}`, title, status, code, traceId: `mock-${Date.now()}` },
});

const nowIso = () => new Date().toISOString();

const catalog = createCatalogMock({ data: () => data(), ok: (content) => ok(content), problem: (...a) => problem(...a) });

const addresses = createAddressesMock({ data: () => data(), ok: (content) => ok(content), problem: (...a) => problem(...a) });

const cart = createCartMock({ data: () => data(), ok: (content) => ok(content), problem: (...a) => problem(...a), catalog });

const integrations = createIntegrationsMock({ data: () => data(), raw: (body, status) => raw(body, status), problem: (...a) => problem(...a), now: serverNow });

const checkout = createCheckoutMock({
  data: () => data(), ok: (content) => ok(content), problem: (...a) => problem(...a), cart, catalog,
  paymentGateway: () => integrations.paymentGateway(),
  addressesOf: (customerId) => addresses.route('GET', 'me/addresses', null, { realm: 'storefront', id: customerId })?.data?.content ?? [],
});

const dropQueue = createDropQueueMock({ data: () => data(), raw: (body, status) => raw(body, status), problem: (...a) => problem(...a), now: serverNow });

const signedCustomerId = () => Number(String(getAccessToken(REALMS.storefront) ?? '').match(/customer-(\d+)$/)?.[1]) || null;
// Atalhos do SimulationPanel (só desenvolvimento): fila e pagamento do cliente logado e estoque do drop.
export const mockDropControl = {
  setPosition: (eventId, position) => signedCustomerId() && dropQueue.control.setPosition(eventId, signedCustomerId(), position),
  admit: (eventId) => signedCustomerId() && dropQueue.control.admit(eventId, signedCustomerId()),
  expire: (eventId) => signedCustomerId() && dropQueue.control.expire(eventId, signedCustomerId()),
  approvePayment: (eventId) => signedCustomerId() && dropQueue.control.approvePayment(eventId, signedCustomerId()),
  failPayment: (eventId) => signedCustomerId() && dropQueue.control.failPayment(eventId, signedCustomerId()),
  setStock: (eventId, mode) => dropQueue.control.setStock(eventId, mode),
};

// Pagamento da vitrine (task 43): o "webhook" do Mercado Pago no mock.
export const mockStoreControl = {
  approvePayment: () => signedCustomerId() && checkout.control.approvePayment(signedCustomerId()),
  requestRefund: () => signedCustomerId() && checkout.control.requestRefund(signedCustomerId()),
};

const plans = createPlansMock({ data: () => data(), raw: (body, status) => raw(body, status), problem: (...a) => problem(...a), nowIso });

// Identidade a partir do token "mock-storefront-customer-12" / "mock-backoffice-employee-1".
// Token da equipe sem loja escolhida termina em "-global" (o id é o do usuário).
const identity = (headers) => {
  const token = (headers?.Authorization ?? '').replace(/^Bearer\s+/i, '');
  const match = token.match(/^mock-(storefront|backoffice)-(customer|employee)-(\d+)(-global)?$/);
  return match ? { realm: match[1], id: Number(match[3]), global: Boolean(match[4]) } : null;
};

// ------------------------------------------------- AUTH (cliente e equipe) ---

// E-mails de exemplo para testar os fluxos da task 28 no modo mock:
//   bloqueado@exemplo.com  login responde 429 com Retry-After (nas duas áreas)
//   varias@exemplo.com     lojista com duas lojas: escolhe qual abrir
//   nova@exemplo.com       lojista sem loja: cria a primeira
const MOCK_EMAILS = {
  rateLimited: 'bloqueado@exemplo.com',
  multiStore: 'varias@exemplo.com',
  newOwner: 'nova@exemplo.com',
};
const MULTI_STORE_USER_ID = 901;
const NEW_OWNER_USER_ID = 900;
const RETRY_AFTER_SECONDS = 30;

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const passwordPolicyError = (password) =>
  typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX
    ? null
    : problem(400, 'Identity.PasswordPolicy', `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`);

const rateLimited = () => ({
  ...problem(429, 'Security.RateLimited', 'Muitas tentativas.'),
  headers: { 'retry-after': String(RETRY_AFTER_SECONDS) },
});

const isEmail = (body, email) => String(body?.email ?? '').trim().toLowerCase() === email;

// Famílias de sessão por área ({ familyId, createdAt, expiresAt, isCurrent }),
// como GET auth/sessions devolve. Cada login abre uma família nova e atual.
const hoursFromNow = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const familyId = (n) => `7f1c2a9e-0000-4000-8000-${String(n).padStart(12, '0')}`;

const authSessions = (realm) => {
  const d = data();
  d.mockAuthSessions ??= {};
  d.mockAuthSessions[realm] ??= [
    { familyId: familyId(1), createdAt: hoursFromNow(-2), expiresAt: hoursFromNow(24 * 12), isCurrent: true },
    { familyId: familyId(2), createdAt: hoursFromNow(-72), expiresAt: hoursFromNow(24 * 4), isCurrent: false },
    { familyId: familyId(3), createdAt: hoursFromNow(-24 * 9), expiresAt: hoursFromNow(20), isCurrent: false },
  ];
  return d.mockAuthSessions[realm];
};

const openFamily = (realm) => {
  const list = authSessions(realm);
  if (list.some((s) => s.isCurrent)) return;
  const next = list.reduce((max, s) => Math.max(max, Number(s.familyId.slice(-12))), 0) + 1;
  list.unshift({ familyId: familyId(next), createdAt: nowIso(), expiresAt: hoursFromNow(24 * 14), isCurrent: true });
};

// Login (as duas áreas) troca a família atual por uma nova.
const loginFamily = (realm) => {
  authSessions(realm).forEach((s) => {
    s.isCurrent = false;
  });
  openFamily(realm);
};

// Rotas de sessão e senha comuns às duas áreas (o `who` já foi conferido).
function authAccount(realm, method, path, body) {
  if (path === 'auth/sessions' && method === 'GET') return raw(authSessions(realm));
  const revoke = path.match(/^auth\/sessions\/([0-9a-f-]+)$/);
  if (revoke && method === 'DELETE') {
    const list = authSessions(realm);
    const index = list.findIndex((s) => s.familyId === revoke[1]);
    if (index < 0) return problem(404, 'Identity.SessionNotFound', 'Sessão não encontrada.');
    list.splice(index, 1);
    return noContent();
  }
  if (path === 'auth/logout-all' && method === 'POST') {
    data().mockAuthSessions[realm] = [];
    return noContent();
  }
  if (path === 'auth/change-password' && method === 'POST') {
    if (!body?.currentPassword) return problem(400, 'Identity.InvalidCredentials', 'Senha atual incorreta.');
    const weak = passwordPolicyError(body?.newPassword);
    if (weak) return weak;
    data().mockAuthSessions[realm] = [];
    return noContent();
  }
  return null;
}

// Lojas de quem tem token global (antes de escolher). Quem já escolheu continua
// vendo a loja do seed, como antes.
const memberships = () => {
  const d = data();
  d.mockMemberships ??= {
    [MULTI_STORE_USER_ID]: [
      { membershipId: 1, enterpriseId: d.enterprise.id, tradeName: d.enterprise.tradeName, kindId: 1 },
      { membershipId: 2, enterpriseId: 2, tradeName: 'Veloce Outlet', kindId: 2 },
    ],
    [NEW_OWNER_USER_ID]: [],
  };
  return d.mockMemberships;
};

// ------------------------------------------------------------------ CRUD ---

const nextIdOf = (rows) => rows.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;

function crud(key, action, param, body) {
  const rows = data()[key];
  if (!rows) return problem(404, 'Route.NotFound', 'Recurso inexistente.');

  switch (action) {
    case 'get-all':
      return ok(rows.filter((r) => !r.isDeleted));
    case 'get-by-id': {
      const row = rows.find((r) => r.id === Number(param));
      return row ? ok(row) : problem(404, 'Entity.NotFound', 'Registro não encontrado.');
    }
    case 'get-list-by-list-id': {
      const ids = new Set((body ?? []).map(Number));
      return ok(rows.filter((r) => ids.has(r.id)));
    }
    case 'add':
    case 'add-range': {
      const commands = action === 'add' ? [body] : body?.commands ?? [];
      const created = commands.map((command) => {
        const entity = { ...toEntity(key, command), id: nextIdOf(rows), createdAt: nowIso(), updatedAt: null };
        if ('isDeleted' in (rows[0] ?? {})) Object.assign(entity, { isDeleted: false, deletedAt: null });
        rows.push(entity);
        return entity;
      });
      return ok(created);
    }
    case 'update':
    case 'update-range': {
      const commands = action === 'update' ? [body] : body?.commands ?? [];
      const missing = commands.find((c) => !rows.some((r) => r.id === c.id));
      if (missing) return problem(404, 'Entity.NotFound', `Registro ${missing.id} não encontrado.`);
      const updated = commands.map((command) => {
        const index = rows.findIndex((r) => r.id === command.id);
        rows[index] = { ...rows[index], ...toEntity(key, command), updatedAt: nowIso() };
        return rows[index];
      });
      return ok(updated);
    }
    case 'delete':
    case 'delete-range': {
      const ids = action === 'delete' ? [Number(param)] : (body ?? []).map(Number);
      ids.forEach((id) => {
        const index = rows.findIndex((r) => r.id === id);
        if (index < 0) return;
        if ('isDeleted' in rows[index]) rows[index] = { ...rows[index], isDeleted: true, deletedAt: nowIso() };
        else rows.splice(index, 1);
      });
      return ok(true);
    }
    default:
      return null;
  }
}

// ------------------------------------------------------- STOREFRONT (cliente) ---

const customerResponse = (c) => ({
  id: c.id, enterpriseId: c.enterpriseId, fullName: c.fullName, email: c.email, phone: c.phone,
  normalizedEmail: c.normalizedEmail, emailConfirmed: c.emailConfirmed, addressLine: c.addressLine, city: c.city,
  stateId: c.stateId, zipCode: c.zipCode, country: c.country, gender: c.gender, dateOfBirth: c.dateOfBirth,
  isVerified: c.isVerified, isActive: c.isActive, isDeleted: c.isDeleted, deletedAt: c.deletedAt,
  createdAt: c.createdAt, updatedAt: c.updatedAt,
});

// Como o cookie de refresh do back: guarda a última sessão emitida em cada área.
const session = (realm, id) => {
  const d = data();
  d.refreshCookie ??= {};
  d.refreshCookie[realm] = id;
  return sessionBody(realm, id);
};

const sessionBody = (realm, id) => ({
  accessToken: `mock-${realm}-${realm === 'storefront' ? 'customer' : 'employee'}-${id}`,
  accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  requiresEnterpriseSelection: false,
  enterprises: [],
});

function storeStorefront(method, path, body, who) {
  const d = data();
  const customers = d['store/customers'];

  if (path === 'auth/csrf') return raw({ requestToken: 'mock-csrf', headerName: 'X-CSRF-TOKEN' });
  if (path === 'auth/login' && method === 'POST') {
    if (isEmail(body, MOCK_EMAILS.rateLimited)) return rateLimited();
    const c = customers.find((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase() && x.isActive);
    if (!c) return problem(401, 'Identity.InvalidCredentials', 'E-mail ou senha inválidos.');
    loginFamily('storefront');
    return raw(session('storefront', c.id));
  }
  if (path === 'auth/register' && method === 'POST') {
    if (customers.some((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase())) {
      return problem(409, 'Identity.EmailTaken', 'Já existe uma conta com este e-mail.');
    }
    const weak = passwordPolicyError(body?.password);
    if (weak) return weak;
    const c = {
      id: nextIdOf(customers), enterpriseId: 1, fullName: body.fullName, email: body.email, phone: body.phone,
      normalizedEmail: String(body.email).toUpperCase(), emailConfirmed: false, addressLine: body.addressLine,
      city: body.city, stateId: body.stateId, zipCode: body.zipCode, country: body.country, gender: body.gender,
      dateOfBirth: body.dateOfBirth, isVerified: false, isActive: true, isDeleted: false, deletedAt: null,
      createdAt: nowIso(), updatedAt: null,
    };
    customers.push(c);
    return raw(customerResponse(c));
  }
  if (path === 'auth/refresh') return problem(401, 'Identity.RefreshRequired', 'Sessão de renovação ausente.');
  if (path === 'auth/logout') return noContent();
  if (path === 'products' && method === 'GET') {
    return raw(d['store/products'].filter((p) => p.isActive).map((p) => ({
      id: p.id, name: p.name, slug: p.slug, description: p.description, price: p.price, brand: p.brand,
      imageUrls: p.imageUrls, categoryId: p.categoryId,
    })));
  }
  if (path === 'store' && method === 'GET') {
    return raw({ tradeName: d.enterprise.tradeName, email: { value: d.enterprise.email }, phone: { value: d.enterprise.phone } });
  }

  if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
  const me = customers.find((c) => c.id === who.id);

  const account = authAccount('storefront', method, path, body);
  if (account) return account;
  if (path === 'me' && method === 'GET') return raw(customerResponse(me));
  if (path === 'me' && method === 'PUT') {
    Object.assign(me, {
      fullName: body.fullName, phone: body.phone, addressLine: body.addressLine, city: body.city, stateId: body.stateId,
      zipCode: body.zipCode, country: body.country, gender: body.gender, dateOfBirth: body.dateOfBirth, updatedAt: nowIso(),
    });
    return raw(customerResponse(me));
  }
  // Exclusão: mesmos impedimentos que o back confere (pedido aguardando pagamento ou em atendimento).
  const deletionBlockers = () => {
    const open = d['store/orders'].filter((o) => o.customerId === me.id && !o.isDeleted && o.orderStatusId <= 4).length;
    return open ? [{ code: 'Account.OrdersInProgress', message: 'Você tem pedidos ainda em andamento.', count: open }] : [];
  };
  if (path === 'me/deletion' && method === 'GET') {
    const blockers = deletionBlockers();
    return raw({ canDelete: blockers.length === 0, blockers });
  }
  if (path === 'me' && method === 'DELETE') {
    if (!body?.currentPassword) return problem(400, 'Validation.CurrentPassword', 'Informe a senha atual.');
    if (deletionBlockers().length) return problem(409, 'Account.DeletionBlocked', 'Há pendências que impedem a exclusão da conta.');
    Object.assign(me, { isActive: false, isDeleted: true, deletedAt: nowIso() });
    return noContent();
  }
  // Pedidos e checkout: mock/checkout.js (task 32).
  return null;
}

function dropStorefront(method, path, who, body) {
  const d = data();
  if (path === 'events' && method === 'GET') {
    return raw(d['drop/drop-events'].filter((e) => e.isPublic && !e.isDeleted)
      .sort((a, b) => Date.parse(a.dropStartsAt) - Date.parse(b.dropStartsAt))
      .map((e) => ({
        id: e.id, name: e.name, slug: e.slug, description: e.description, price: e.price, coverImageUrl: e.coverImageUrl,
        dropStartsAt: e.dropStartsAt, dropEndsAt: e.dropEndsAt, requiresRegistration: e.requiresRegistration,
      })));
  }
  // Detalhe público (task 16), como DropStorefrontEventResponse: uma participação por
  // produto do evento, com uma variação por SKU e o saldo livre (alocado − vendido − reservado).
  const eventMatch = path.match(/^events\/(\d+)$/);
  if (eventMatch && method === 'GET') {
    const ev = d['drop/drop-events'].find((e) => e.id === Number(eventMatch[1]) && e.isPublic && !e.isDeleted);
    if (!ev) return problem(404, 'Drop.NotFound', 'Evento não encontrado.');
    const rows = d['drop/drop-products'].filter((p) => p.dropEventId === ev.id && p.isActive && !p.isDeleted);
    const reserved = (rowId) => d['drop/drop-reservations']
      .filter((r) => r.dropProductId === rowId && r.dropReservationStatusId === 1 && !r.isDeleted)
      .reduce((sum, r) => sum + r.quantity, 0);
    const byProduct = new Map();
    rows.forEach((row) => byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row]));
    const products = [...byProduct.entries()].map(([productId, skus]) => {
      const base = d['store/products'].find((p) => p.id === productId);
      // SKU com sufixo (VCX-39, HHV2-M) vira a opção Tamanho; SKU único não tem opções.
      const variants = skus.sort((a, b) => a.id - b.id).map((row) => ({
        id: row.id, sku: row.sku,
        optionsJson: JSON.stringify(skus.length > 1 ? { Tamanho: row.sku.split('-').pop() } : {}),
        price: row.price, available: Math.max(0, row.unitsAllocated - row.unitsSold - reserved(row.id)),
      }));
      const maxPerCustomer = Math.max(...skus.map((row) => row.maxPerCustomer ?? 1));
      const total = variants.reduce((sum, v) => sum + v.available, 0);
      return {
        participationId: skus[0].id, name: base?.name ?? ev.name, description: base?.description ?? ev.description,
        maxPerCustomer, concentrationWarning: total > 0 && maxPerCustomer >= total, variants,
      };
    });
    return raw({
      id: ev.id, name: ev.name, slug: ev.slug, description: ev.description, coverImageUrl: ev.coverImageUrl,
      bannerImageUrl: ev.bannerImageUrl, requiresRegistration: ev.requiresRegistration,
      registrationStartsAt: ev.registrationStartsAt, registrationEndsAt: ev.registrationEndsAt,
      queueOpensAt: ev.queueOpensAt, dropStartsAt: ev.dropStartsAt, dropEndsAt: ev.dropEndsAt,
      purchaseWindowMinutes: 15, products,
    });
  }

  // Fila, reserva e compra (tasks 17 e 18): mock/drop-queue.js.
  const queue = dropQueue.route(method, path, body, who);
  if (queue) return queue;

  if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
  const mine = (rows) => rows.filter((r) => r.customerId === who.id && !r.isDeleted);

  const registerMatch = path.match(/^events\/(\d+)\/register$/);
  if (registerMatch && method === 'POST') {
    const eventId = Number(registerMatch[1]);
    const ev = d['drop/drop-events'].find((e) => e.id === eventId);
    if (!ev) return problem(404, 'Drop.NotFound', 'Evento indisponível.');
    const now = Date.now();
    if (now < Date.parse(ev.registrationStartsAt) || now > Date.parse(ev.registrationEndsAt)) {
      return problem(409, 'Drop.RegistrationClosed', 'Inscrições fora do período permitido.');
    }
    const rows = d['drop/drop-registrations'];
    let reg = rows.find((r) => r.dropEventId === eventId && r.customerId === who.id && !r.isDeleted);
    if (!reg) {
      reg = {
        id: nextIdOf(rows), dropEventId: eventId, customerId: who.id, dropRegistrationStatusId: 1, isEligible: false,
        eligibilityReason: 'Aguardando avaliação de elegibilidade', registeredAt: nowIso(), eligibilityCheckedAt: null,
        isDeleted: false, deletedAt: null, createdAt: nowIso(), updatedAt: null,
      };
      rows.push(reg);
    }
    return raw({ id: reg.id, dropRegistrationStatusId: reg.dropRegistrationStatusId, isEligible: reg.isEligible });
  }
  if (path === 'registrations') {
    return raw(mine(d['drop/drop-registrations']).map((r) => ({
      id: r.id, dropEventId: r.dropEventId, dropRegistrationStatusId: r.dropRegistrationStatusId, isEligible: r.isEligible, registeredAt: r.registeredAt,
    })));
  }
  if (path === 'waitlist') {
    return raw(mine(d['drop/waitlist-entries']).map((w) => ({
      id: w.id, dropEventId: w.dropEventId, dropProductId: w.dropProductId, position: w.position, waitlistEntryStatusId: w.waitlistEntryStatusId,
    })));
  }
  if (path === 'notifications') {
    return raw(mine(d['drop/drop-notifications']).map((n) => ({ id: n.id, subject: n.subject, body: n.body, scheduledAt: n.scheduledAt })));
  }
  if (path === 'orders') {
    return raw(mine(d['drop/drop-orders']).map((o) => ({
      id: o.id, dropEventId: o.dropEventId, totalAmount: o.totalAmount, dropOrderStatusId: o.dropOrderStatusId, dropOrderPaymentStatusId: o.dropOrderPaymentStatusId,
    })));
  }
  const orderMatch = path.match(/^orders\/(\d+)$/);
  if (orderMatch) {
    const o = mine(d['drop/drop-orders']).find((x) => x.id === Number(orderMatch[1]));
    if (!o) return problem(404, 'Order.NotFound', 'Pedido não encontrado.');
    return raw({
      id: o.id, totalAmount: o.totalAmount, dropOrderStatusId: o.dropOrderStatusId, dropOrderPaymentStatusId: o.dropOrderPaymentStatusId,
      items: d['drop/drop-order-items'].filter((i) => i.dropOrderId === o.id).map((i) => ({ itemName: i.itemName, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })),
    });
  }
  return null;
}

// ------------------------------------------------------- BACKOFFICE (equipe) ---

function storeBackoffice(method, path, body, who) {
  const d = data();
  if (path === 'auth/csrf') return raw({ requestToken: 'mock-csrf', headerName: 'X-CSRF-TOKEN' });
  if (path === 'auth/login' && method === 'POST') {
    if (isEmail(body, MOCK_EMAILS.rateLimited)) return rateLimited();
    if (!body?.password) return problem(401, 'Identity.InvalidCredentials', 'E-mail ou senha inválidos.');
    loginFamily('backoffice');
    // Várias lojas ou nenhuma: token global (sem loja) até o select-enterprise.
    const userId = isEmail(body, MOCK_EMAILS.multiStore) ? MULTI_STORE_USER_ID
      : isEmail(body, MOCK_EMAILS.newOwner) ? NEW_OWNER_USER_ID : null;
    if (userId) {
      const choices = memberships()[userId];
      return raw({
        ...session('backoffice', `${userId}-global`),
        requiresEnterpriseSelection: choices.length > 1,
        enterprises: choices,
      });
    }
    return raw(session('backoffice', SIGNED_IN_EMPLOYEE_ID));
  }
  // Com token da equipe, renova (o front renova depois que o plano é concedido).
  if (path === 'auth/refresh') {
    const id = who?.realm === 'backoffice' ? who.id : d.refreshCookie?.backoffice;
    return id != null ? raw(session('backoffice', id)) : problem(401, 'Identity.RefreshRequired', 'Sessão de renovação ausente.');
  }
  if (path === 'auth/logout') {
    if (d.refreshCookie) d.refreshCookie.backoffice = null;
    return noContent();
  }
  if (path === 'auth/register' && method === 'POST') {
    if (!body?.fullName || !body?.email || String(body?.password ?? '').length < 8) {
      return problem(400, 'Identity.InvalidRegistration', 'Informe nome, e-mail e uma senha de ao menos 8 caracteres.');
    }
    // Conta nova ainda sem loja: enterprises/mine fica vazio até enterprises/register.
    d.newOwnerWithoutStore = true;
    return raw({ id: 99, fullName: body.fullName, email: body.email });
  }
  if (path === 'enterprise-plans' && method === 'GET') return raw(plans.catalog());

  if (!who || who.realm !== 'backoffice') return null;

  const account = authAccount('backoffice', method, path, body);
  if (account) return account;

  const integration = integrations.route(method, path, body);
  if (integration) return integration;

  // Token global (várias lojas ou nenhuma) escolhe entre as suas; com loja, renova a mesma.
  if (path === 'auth/select-enterprise' && method === 'POST') {
    if (!who.global) return raw(session('backoffice', who.id));
    const choice = (memberships()[who.id] ?? []).find((m) => m.membershipId === Number(body?.membershipId));
    if (!choice) return problem(403, 'Identity.MembershipUnavailable', 'Loja indisponível para esta conta.');
    return raw(session('backoffice', choice.membershipId));
  }
  if (path === 'enterprises/mine' && method === 'GET') {
    if (who.global) return raw(memberships()[who.id] ?? []);
    if (d.newOwnerWithoutStore) return raw([]);
    return raw([{
      membershipId: 1, enterpriseId: d.enterprise.id, tradeName: d.enterprise.tradeName, kindId: 1,
      planId: plans.state().planId, contractRevision: plans.state().revision,
    }]);
  }
  if (path === 'enterprises/register' && method === 'POST') {
    const slug = String(body?.slug ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug) || ['www', 'api', 'admin', 'backoffice'].includes(slug)) {
      return problem(400, 'Enterprise.InvalidSlug', 'Identificador público da loja inválido ou reservado.');
    }
    if (slug === 'veloce-labs') return problem(409, 'Enterprise.SlugUnavailable', 'Este endereço público já está em uso.');
    // O mock tem uma loja só: o cadastro passa a descrever a loja de exemplo, no Gratuito.
    Object.assign(d.enterprise, {
      tradeName: body.tradeName, legalName: body.legalName, email: body.email, phone: body.phone, addressLine: body.addressLine,
      city: body.city, stateId: body.stateId, zipCode: body.zipCode, country: body.country, slug,
    });
    plans.reset();
    d.newOwnerWithoutStore = false;
    if (who.global) {
      const owned = memberships()[who.id] ?? (memberships()[who.id] = []);
      if (!owned.some((m) => m.enterpriseId === d.enterprise.id)) owned.push({ membershipId: 1, enterpriseId: d.enterprise.id, tradeName: body.tradeName, kindId: 1 });
    }
    return raw({
      id: d.enterprise.id, tradeName: d.enterprise.tradeName, isActive: true, planId: 1, contractRevision: 1,
      storefrontSlug: slug, storefrontUrl: `https://drpcommerce.example/${slug}`,
    });
  }
  const planRoute = plans.route(method, path, body);
  if (planRoute) return planRoute;
  if (path === 'enterprises/current' && method === 'PUT') {
    Object.assign(d.enterprise, body);
    return raw({ id: d.enterprise.id, tradeName: d.enterprise.tradeName, isActive: d.enterprise.isActive });
  }
  if (path === 'invitations' && method === 'GET') return raw(d['store/invitations']);
  if (path === 'invitations' && method === 'POST') {
    const invitation = {
      id: nextIdOf(d['store/invitations']), email: body.email, kindId: body.kindId,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), acceptedAt: null, revokedAt: null,
    };
    d['store/invitations'].push(invitation);
    return raw({ id: invitation.id, token: 'mock-invite-token', expiresAt: invitation.expiresAt });
  }
  const invitationMatch = path.match(/^invitations\/(\d+)$/);
  if (invitationMatch && method === 'DELETE') {
    const inv = d['store/invitations'].find((i) => i.id === Number(invitationMatch[1]));
    if (inv) inv.revokedAt = nowIso();
    return noContent();
  }
  if (path === 'access-roles/get-all') return ok(d['store/access-roles']);
  if (path === 'enterprise-memberships/get-all') return ok(d['store/enterprise-memberships']);

  // Task 19 (ainda não existe no back-end): movimentação de estoque.
  if (path === 'products/adjust-stock' && method === 'POST') {
    const p = d['store/products'].find((x) => x.id === Number(body?.productId));
    if (!p) return problem(404, 'Product.NotFound', 'Produto não encontrado.');
    const next = p.stockQuantity + Number(body.delta);
    if (next < 0) return problem(409, 'Stock.Insufficient', 'O ajuste deixaria o estoque negativo.');
    p.stockQuantity = next;
    return ok({ productId: p.id, stockQuantity: p.stockQuantity, stockReserved: p.stockReserved });
  }
  return null;
}

// Drop: a compra só anda pelo fluxo (POST drop-purchases/{id}/fulfillment). O CRUD
// das entidades de compra responde 403, como o guard do DropCommerceDbContext.
const DROP_PURCHASE_CRUD = new Set([
  'drop/queue-entries', 'drop/queue-sessions', 'drop/drop-reservations', 'drop/drop-orders', 'drop/drop-order-items', 'drop/drop-transactions',
]);
const CRUD_WRITES = new Set(['add', 'add-range', 'update', 'update-range', 'delete', 'delete-range']);

function dropBackoffice(method, path, body, who) {
  if (!who || who.realm !== 'backoffice') return null;
  const fulfillment = path.match(/^drop-purchases\/(\d+)\/fulfillment$/);
  if (fulfillment && method === 'POST') {
    const o = data()['drop/drop-orders'].find((x) => x.id === Number(fulfillment[1]) && !x.isDeleted);
    if (!o) return problem(404, 'DropPurchase.OrderNotFound', 'Pedido não encontrado.');
    const statusId = Number(body?.statusId);
    if (o.dropOrderPaymentStatusId !== 2 || o.financialReviewCode || statusId < o.dropOrderStatusId || statusId < 3 || statusId > 5) {
      return problem(409, 'DropPurchase.InvalidTransition', 'Transição de entrega inválida.');
    }
    Object.assign(o, { dropOrderStatusId: statusId, updatedAt: nowIso() });
    return noContent();
  }
  return null;
}

// ------------------------------------------------------------------ ROTEADOR ---

const RESERVED_SLUGS = ['www', 'api', 'admin', 'backoffice', 'mail', 'internal', 'swagger', 'openapi'];
const isStorefrontSlug = (slug) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug) && !RESERVED_SLUGS.includes(slug);

/**
 * Responde como o Gateway responderia.
 * @returns {{ status: number, data: unknown }}
 */
export function mockFetch(method, url, body, headers) {
  const path = url.split('?')[0];
  const who = identity(headers);
  // Mesmo caminho duplo do Gateway: /api/<serviço>/api/<rota>.
  const match = path.match(/^\/api\/(drop|store)\/api\/(.+)$/);
  if (!match) return problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
  const [, service, rest] = match;

  // Storefront: /storefront/{slug}/... O mock tem uma loja só e aceita qualquer
  // slug válido (StorefrontSlug.Normalize); slug ausente ou inválido é 404, como no back.
  const storefront = rest.match(/^storefront\/([^/]+)\/(.+)$/);
  if (storefront) {
    const [, slug, sfPath] = storefront;
    if (!isStorefrontSlug(decodeURIComponent(slug))) return problem(404, 'Enterprise.Unavailable', 'Loja indisponível.');
    const result = service === 'store'
      ? catalog.route(method, sfPath, new URLSearchParams(url.split('?')[1] ?? ''))
        ?? addresses.route(method, sfPath, body, who)
        ?? cart.route(method, sfPath, body, who, new URLSearchParams(url.split('?')[1] ?? ''))
        ?? checkout.route(method, sfPath, body, who, new URLSearchParams(url.split('?')[1] ?? ''))
        ?? storeStorefront(method, sfPath, body, who)
      : sfPath.startsWith('drop/') && dropStorefront(method, sfPath.slice('drop/'.length), who, body);
    return result || problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
  }
  if (rest.startsWith('storefront/')) return problem(404, 'Enterprise.Unavailable', 'Loja indisponível.');

  if (service === 'store') {
    const special = storeBackoffice(method, rest, body, who);
    if (special) return special;
  }
  if (service === 'drop') {
    const special = dropBackoffice(method, rest, body, who);
    if (special) return special;
  }

  // CRUD: /api/<svc>/<resource>/<action>[/<id>]
  const crudMatch = rest.match(/^([a-z-]+)\/([a-z-]+)(?:\/(\d+))?$/);
  if (crudMatch) {
    if (!who) return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const [, resource, action, param] = crudMatch;
    if (DROP_PURCHASE_CRUD.has(`${service}/${resource}`) && CRUD_WRITES.has(action)) {
      return problem(403, 'DropPurchase.UseWorkflow', 'Use a fila e as reservas controladas; o CRUD não confirma compras.');
    }
    const result = crud(`${service}/${resource}`, action, param, body);
    if (result) return result;
  }

  return problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
}

export { SIGNED_IN_CUSTOMER_ID };
