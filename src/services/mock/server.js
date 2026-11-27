import { createSeed, SIGNED_IN_CUSTOMER_ID, SIGNED_IN_EMPLOYEE_ID } from './seed';
import { toEntity } from '../resources';
import { ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_STATUS, SHIPMENT_TYPE, STATES, TRANSACTION_METHOD, TRANSACTION_STATUS } from '../status';
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
    return raw({
      tradeName: d.enterprise.tradeName, email: { value: d.enterprise.email }, phone: { value: d.enterprise.phone },
      pendingOrderExpirationMinutes: d['store/settings']?.pendingOrderExpirationMinutes ?? 60,
    });
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

// ------------------------------------------------- EQUIPE E ACESSOS (task 40) ---

const minutesFromNow = (m) => new Date(Date.now() + m * 60e3).toISOString();

function teamRoutes(method, path, body) {
  const d = data();
  const roles = d['store/access-roles'];
  const memberRows = d['store/enterprise-memberships'];
  const invitations = d['store/invitations'];

  if (path === 'permissions/get-all') return ok(d['store/permissions']);
  if (path === 'access-roles/get-all') return raw(roles);
  if (path === 'access-role-permissions/get-all') return raw(d['store/access-role-permissions']);
  if (path === 'membership-access-roles/get-all') return raw(d['store/membership-access-roles']);
  if (path === 'enterprise-memberships/get-all') return raw(memberRows);

  const setRolePermissions = (accessRoleId, ids = []) => {
    d['store/access-role-permissions'] = d['store/access-role-permissions']
      .filter((r) => r.accessRoleId !== accessRoleId)
      .concat(ids.map((permissionId) => ({ enterpriseId: 1, accessRoleId, permissionId })));
  };
  if (path === 'access-roles/add' && method === 'POST') {
    if (!body?.name?.trim()) return problem(400, 'Validation.InvalidInput', 'Os dados informados são inválidos.');
    const role = { id: nextIdOf(roles), enterpriseId: 1, name: body.name, normalizedName: body.name.toUpperCase(), description: body.description ?? '', isActive: body.isActive };
    roles.push(role);
    setRolePermissions(role.id, body.permissionIds);
    return raw(role);
  }
  const roleMatch = path.match(/^access-roles\/(\d+)$/);
  if (roleMatch) {
    const role = roles.find((r) => r.id === Number(roleMatch[1]));
    if (!role) return problem(404, 'Access.RoleNotFound', 'Perfil não encontrado.');
    if (method === 'PUT') {
      Object.assign(role, { name: body.name, normalizedName: body.name.toUpperCase(), description: body.description ?? '', isActive: body.isActive });
      setRolePermissions(role.id, body.permissionIds);
      return raw(role);
    }
    if (method === 'DELETE') {
      const inUse = d['store/membership-access-roles'].some((r) => r.accessRoleId === role.id);
      if (inUse) return problem(409, 'Access.RoleInUse', 'O perfil está em uso. Desative-o em vez de excluir.');
      d['store/access-roles'] = roles.filter((r) => r !== role);
      setRolePermissions(role.id);
      return noContent();
    }
  }

  const memberMatch = path.match(/^enterprise-memberships\/(\d+)(\/access-roles)?$/);
  if (memberMatch && method === 'PUT') {
    const member = memberRows.find((m) => m.id === Number(memberMatch[1]));
    if (!member) return problem(404, 'Access.MembershipNotFound', 'Membro não encontrado.');
    if (member.kindId === 1) return problem(409, 'Access.PrimaryOwnerProtected', 'O dono principal não pode ser alterado.');
    if (memberMatch[2]) {
      d['store/membership-access-roles'] = d['store/membership-access-roles']
        .filter((r) => r.enterpriseMembershipId !== member.id)
        .concat((body?.accessRoleIds ?? []).map((accessRoleId) => ({ enterpriseId: 1, enterpriseMembershipId: member.id, accessRoleId })));
      return noContent();
    }
    if (![2, 3].includes(Number(body?.kindId))) return problem(400, 'Access.UseOwnershipTransfer', 'Use a transferência de propriedade.');
    Object.assign(member, { kindId: Number(body.kindId), isActive: Boolean(body.isActive) });
    return raw(member);
  }

  const deactivateMatch = path.match(/^employees\/(\d+)\/deactivate$/);
  if (deactivateMatch && method === 'PUT') {
    const employee = d['store/employees'].find((e) => e.id === Number(deactivateMatch[1]));
    if (!employee) return problem(404, 'Employee.NotFound', 'Funcionário não encontrado.');
    employee.isActive = false;
    const member = memberRows.find((m) => m.id === employee.enterpriseMembershipId);
    if (member) member.isActive = false;
    return noContent();
  }

  if (path === 'invitations' && method === 'GET') return raw(invitations);
  if (path === 'invitations' && method === 'POST') {
    const email = String(body?.email ?? '').trim().toUpperCase();
    invitations.filter((i) => i.email === email && !i.acceptedAt && !i.revokedAt).forEach((i) => { i.revokedAt = nowIso(); });
    const invitation = { id: nextIdOf(invitations), email, kindId: body.kindId, expiresAt: hoursFromNow(48), acceptedAt: null, revokedAt: null };
    invitations.push(invitation);
    return raw({ id: invitation.id, token: `mock-convite-${invitation.id}`, expiresAt: invitation.expiresAt });
  }
  const invitationMatch = path.match(/^invitations\/(\d+)$/);
  if (invitationMatch && method === 'DELETE') {
    const inv = invitations.find((i) => i.id === Number(invitationMatch[1]));
    if (inv) inv.revokedAt = nowIso();
    return noContent();
  }
  if (path === 'identity/invitations/accept' && method === 'POST') {
    const inv = invitations.find((i) => `mock-convite-${i.id}` === body?.token && !i.acceptedAt && !i.revokedAt);
    if (!inv) return problem(400, 'Access.InvalidLink', 'Link inválido ou expirado.');
    inv.acceptedAt = nowIso();
    const member = { id: nextIdOf(memberRows), enterpriseId: 1, userId: nextIdOf(memberRows), kindId: inv.kindId, isActive: true, joinedAt: nowIso() };
    memberRows.push(member);
    return raw(member);
  }

  d.mockTransfers ??= [];
  if (path === 'ownership-transfers' && method === 'POST') {
    if (!body?.currentPassword) return problem(401, 'Identity.InvalidCredentials', 'Senha atual incorreta.');
    const recipient = memberRows.find((m) => m.id === Number(body.recipientMembershipId) && m.isActive && m.kindId !== 1);
    if (!recipient) return problem(404, 'Access.MembershipNotFound', 'Membro não encontrado.');
    const transfer = { id: d.mockTransfers.length + 1, recipientId: recipient.id, expiresAt: minutesFromNow(30), open: true };
    d.mockTransfers.forEach((t) => { t.open = false; });
    d.mockTransfers.push(transfer);
    return raw({ id: transfer.id, token: `mock-transferencia-${transfer.id}`, expiresAt: transfer.expiresAt });
  }
  const transferMatch = path.match(/^ownership-transfers\/(\d+)$/);
  if (transferMatch && method === 'DELETE') {
    const transfer = d.mockTransfers.find((t) => t.id === Number(transferMatch[1]));
    if (transfer) transfer.open = false;
    return noContent();
  }
  if (path === 'identity/ownership-transfers/accept' && method === 'POST') {
    const transfer = d.mockTransfers.find((t) => `mock-transferencia-${t.id}` === body?.token && t.open);
    if (!transfer || !body?.currentPassword) return problem(400, 'Access.InvalidLink', 'Link inválido ou expirado.');
    transfer.open = false;
    memberRows.forEach((m) => {
      if (m.kindId === 1) m.kindId = 2;
      if (m.id === transfer.recipientId) m.kindId = 1;
    });
    return noContent();
  }
  return null;
}

// ---------------------------------------------- PRODUTOS E VARIANTES (task 33) ---

const PRODUCT_SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
};
const DIMENSIONS = ['weight', 'height', 'width', 'length'];

const variantResponse = (p, v) => {
  const tracksStock = !p.isDigital && !(p.hasVariants && v.isDefault);
  const effective = Object.fromEntries(DIMENSIONS.map((k) => [k, v[`${k}Override`] ?? p[k]]));
  return {
    ...v,
    tracksStock,
    price: v.priceOverride ?? p.price,
    costPrice: v.costPriceOverride ?? p.costPrice,
    ...effective,
    availableQuantity: tracksStock ? v.stockQuantity - v.reservedQuantity : 0,
  };
};

const productVariants = (p) => data()['store/product-variants']
  .filter((v) => v.productId === p.id)
  .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id);

const productResponse = (p) => ({
  id: p.id, enterpriseId: p.enterpriseId, categoryId: p.categoryId, supplierId: p.supplierId, name: p.name, slug: p.slug,
  description: p.description, sku: p.sku, barCode: p.barCode, brand: p.brand, imageUrls: p.imageUrls,
  price: p.price, costPrice: p.costPrice, weight: p.weight, height: p.height, width: p.width, length: p.length,
  isActive: p.isActive, isDigital: p.isDigital, hasVariants: Boolean(p.hasVariants), isTransferredToDrop: Boolean(p.isTransferredToDrop),
  createdAt: p.createdAt, updatedAt: p.updatedAt,
  variants: productVariants(p).map((v) => variantResponse(p, v)),
});

const available = (p) => productResponse(p).variants.reduce((sum, v) => sum + v.availableQuantity, 0);
const queryBool = (value) => (value == null ? null : value === 'true');

function catalogRoutes(method, path, body, query) {
  const d = data();
  const products = d['store/products'].filter((p) => !p.isDeleted);
  const allVariants = d['store/product-variants'];
  const duplicate = (field, value, exceptId) => products.some((p) => p.id !== exceptId && String(p[field]).toLowerCase() === String(value).toLowerCase());

  if (path === 'products/search' && method === 'GET') {
    const term = (query.get('Term') ?? '').trim().toLowerCase();
    const min = query.get('MinPrice');
    const max = query.get('MaxPrice');
    const rows = products.filter((p) => {
      const skus = productVariants(p).map((v) => v.sku).join(' ');
      if (term && !`${p.name} ${p.sku} ${p.brand} ${skus}`.toLowerCase().includes(term)) return false;
      if (query.get('CategoryId') && p.categoryId !== Number(query.get('CategoryId'))) return false;
      if (query.get('Brand') && p.brand.toLowerCase() !== query.get('Brand').toLowerCase()) return false;
      if (min && p.price < Number(min)) return false;
      if (max && p.price > Number(max)) return false;
      const inStock = queryBool(query.get('InStock'));
      if (inStock !== null && (available(p) > 0) !== inStock) return false;
      const isActive = queryBool(query.get('IsActive'));
      return isActive === null || p.isActive === isActive;
    }).sort(PRODUCT_SORTS[query.get('Sort')] ?? PRODUCT_SORTS.name);
    const page = Number(query.get('Page') ?? 1);
    const pageSize = Number(query.get('PageSize') ?? 20);
    return ok({ items: rows.slice((page - 1) * pageSize, page * pageSize).map(productResponse), totalCount: rows.length, page, pageSize });
  }

  const byIdMatch = path.match(/^products\/get-by-id\/(\d+)$/);
  if (byIdMatch && method === 'GET') {
    const p = products.find((x) => x.id === Number(byIdMatch[1]));
    return p ? ok(productResponse(p)) : problem(404, 'Product.NotFound', 'Produto não encontrado.');
  }

  if (path === 'products/add' && method === 'POST') {
    if (duplicate('slug', body.slug)) return problem(409, 'Product.DuplicateSlug', 'Já existe um produto com este slug.');
    if (duplicate('sku', body.sku)) return problem(409, 'Product.DuplicateSku', 'Já existe um produto com este SKU.');
    const p = {
      ...body, id: nextIdOf(d['store/products']), enterpriseId: 1, hasVariants: false, isDeleted: false, deletedAt: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    d['store/products'].push(p);
    allVariants.push({
      id: p.id * 10, productId: p.id, name: 'Padrão', sku: p.sku, barCode: p.barCode ?? '', attributes: {}, isDefault: true,
      isActive: true, version: 1, priceOverride: null, costPriceOverride: null, weightOverride: null, heightOverride: null,
      widthOverride: null, lengthOverride: null, stockQuantity: 0, reservedQuantity: 0,
    });
    return ok([productResponse(p)]);
  }

  const sectionMatch = path.match(/^products\/(\d+)\/(details|pricing|dimensions|category|active|variants\/enable)$/);
  if (sectionMatch && method === 'PUT') {
    const p = products.find((x) => x.id === Number(sectionMatch[1]));
    if (!p) return problem(404, 'Product.NotFound', 'Produto não encontrado.');
    const section = sectionMatch[2];
    if (section === 'details') {
      if (duplicate('slug', body.slug, p.id)) return problem(409, 'Product.DuplicateSlug', 'Já existe um produto com este slug.');
      if (duplicate('sku', body.sku, p.id)) return problem(409, 'Product.DuplicateSku', 'Já existe um produto com este SKU.');
    }
    if (section === 'pricing' && Number(body.costPrice) > Number(body.price)) {
      return problem(400, 'Validation.InvalidInput', 'Os dados informados são inválidos.');
    }
    if (section === 'variants/enable') {
      const standard = productVariants(p).find((v) => v.isDefault);
      if (!p.hasVariants && (standard.stockQuantity > 0 || standard.reservedQuantity > 0)) {
        return problem(400, 'Validation.InvalidInput', 'Os dados informados são inválidos.');
      }
      p.hasVariants = true;
    } else {
      Object.assign(p, body);
    }
    p.updatedAt = nowIso();
    return ok(productResponse(p));
  }

  const variantMatch = path.match(/^products\/(\d+)\/variants(?:\/(\d+))?(?:\/(pricing|dimensions))?$/);
  if (variantMatch) {
    const p = products.find((x) => x.id === Number(variantMatch[1]));
    if (!p) return problem(404, 'Product.NotFound', 'Produto não encontrado.');
    const [, , variantId, section] = variantMatch;
    if (!variantId && method === 'GET') return ok(productVariants(p).map((v) => variantResponse(p, v)));
    const others = (exceptId) => productVariants(p).filter((v) => !v.isDefault && v.id !== exceptId);
    const conflict = (details, exceptId) => {
      if (allVariants.some((v) => v.id !== exceptId && v.sku.toLowerCase() === String(details.sku).toLowerCase())) {
        return problem(409, 'ProductVariant.DuplicateSku', 'Já existe um SKU com este código.');
      }
      const keys = Object.keys(details.attributes ?? {}).sort().join('|');
      const siblings = others(exceptId);
      if (siblings.length && siblings.some((v) => Object.keys(v.attributes).sort().join('|') !== keys)) {
        return problem(400, 'ProductVariant.OptionSchema', 'Todas as variantes precisam usar as mesmas opções.');
      }
      const combo = JSON.stringify(Object.entries(details.attributes ?? {}).sort());
      if (siblings.some((v) => JSON.stringify(Object.entries(v.attributes).sort()) === combo)) {
        return problem(409, 'ProductVariant.DuplicateCombination', 'Já existe uma variante com esta combinação.');
      }
      return null;
    };
    if (!variantId && method === 'POST') {
      if (!p.hasVariants) return problem(409, 'Product.VariantsDisabled', 'Habilite as variantes do produto primeiro.');
      const error = conflict(body.details);
      if (error) return error;
      const v = {
        id: nextIdOf(allVariants), productId: p.id, ...body.details, sku: body.details.sku.toUpperCase(), isDefault: false, version: 1,
        priceOverride: body.pricing?.price ?? null, costPriceOverride: body.pricing?.costPrice ?? null,
        ...Object.fromEntries(DIMENSIONS.map((k) => [`${k}Override`, body.dimensions?.[k] ?? null])),
        stockQuantity: 0, reservedQuantity: 0,
      };
      allVariants.push(v);
      return ok(variantResponse(p, v));
    }
    const v = allVariants.find((x) => x.id === Number(variantId) && x.productId === p.id);
    if (!v) return problem(404, 'ProductVariant.NotFound', 'Variante não encontrada.');
    if (v.isDefault && method !== 'GET') return problem(400, 'ProductVariant.DefaultProtected', 'O SKU padrão não pode ser alterado.');
    if (method === 'DELETE') {
      if (v.stockQuantity > 0 || v.reservedQuantity > 0) return problem(400, 'Validation.InvalidInput', 'Os dados informados são inválidos.');
      d['store/product-variants'] = allVariants.filter((x) => x !== v);
      return ok(true);
    }
    if (method === 'PUT' && section === 'pricing') {
      Object.assign(v, { priceOverride: body.price ?? null, costPriceOverride: body.costPrice ?? null });
    } else if (method === 'PUT' && section === 'dimensions') {
      DIMENSIONS.forEach((k) => { v[`${k}Override`] = body[k] ?? null; });
    } else if (method === 'PUT') {
      const error = conflict(body, v.id);
      if (error) return error;
      Object.assign(v, { ...body, sku: body.sku.toUpperCase() });
    }
    v.version += 1;
    return ok(variantResponse(p, v));
  }
  return null;
}

// ------------------------------------------------------- ESTOQUE (task 34) ---

const OPERATION_TYPES = { adjustment: 'Adjustment', reservation: 'Reservation', release: 'Release', commit: 'Commit' };

function inventoryRoutes(method, path, body, query) {
  const d = data();
  d['store/stock-movements'] ??= [];
  d['store/stock-reservations'] ??= [];
  const movements = d['store/stock-movements'];
  const reservations = d['store/stock-reservations'];
  const variantOf = (id) => d['store/product-variants'].find((v) => v.id === Number(id));
  const productOf = (v) => d['store/products'].find((p) => p.id === v.productId);
  const stockOf = (v) => variantResponse(productOf(v), v);
  const log = (v, type, key, quantityChange, reservedChange, reason, reservationId = null) => {
    const movement = {
      id: nextIdOf(movements), productVariantId: v.id, stockReservationId: reservationId, sku: v.sku, type, operationKey: key,
      quantityChange, reservedChange, stockAfter: v.stockQuantity, reservedAfter: v.reservedQuantity, reason, actorUserId: 1, occurredAt: nowIso(),
    };
    movements.push(movement);
    return movement;
  };

  const stockMatch = path.match(/^inventory\/variants\/(\d+)(\/adjust)?$/);
  if (stockMatch) {
    const v = variantOf(stockMatch[1]);
    if (!v) return problem(404, 'ProductVariant.NotFound', 'Variante não encontrada.');
    if (!stockMatch[2]) return method === 'GET' ? ok(stockOf(v)) : null;
    const { quantityChange, reason, idempotencyKey, expectedVersion } = body;
    const previous = movements.find((m) => m.operationKey === idempotencyKey);
    if (previous) {
      return previous.quantityChange === quantityChange && previous.reason === reason
        ? ok(previous)
        : problem(409, 'Inventory.IdempotencyConflict', 'A chave já foi usada em outro ajuste.');
    }
    if (!stockOf(v).tracksStock) return problem(400, 'Inventory.UntrackedSku', 'Este SKU não controla estoque.');
    if (expectedVersion && expectedVersion !== v.version) return problem(409, 'Inventory.StaleVersion', 'O saldo mudou desde a leitura.');
    if (v.stockQuantity + quantityChange < v.reservedQuantity) {
      return problem(409, 'Inventory.InvalidAdjustment', 'O ajuste deixaria o saldo abaixo do reservado.');
    }
    v.stockQuantity += quantityChange;
    v.version += 1;
    return ok(log(v, OPERATION_TYPES.adjustment, idempotencyKey, quantityChange, 0, reason));
  }

  if (path === 'inventory/movements' && method === 'GET') {
    const variantId = Number(query.get('ProductVariantId')) || null;
    const rows = movements.filter((m) => !variantId || m.productVariantId === variantId).sort((a, b) => b.id - a.id);
    const page = Number(query.get('Page') ?? 1);
    const pageSize = Number(query.get('PageSize') ?? 20);
    return ok({ items: rows.slice((page - 1) * pageSize, page * pageSize), totalCount: rows.length, page, pageSize });
  }

  const reservationResponse = (r) => ({ ...r, items: r.items.map((i) => ({ ...i, allowsBackorder: false })) });
  if (path === 'inventory/reservations' && method === 'POST') {
    const found = reservations.find((r) => r.idempotencyKey === body.idempotencyKey);
    if (found) return ok(reservationResponse(found));
    const lines = body.items ?? [];
    for (const line of lines) {
      const v = variantOf(line.productVariantId);
      if (!v) return problem(404, 'ProductVariant.NotFound', 'Variante não encontrada.');
      if (stockOf(v).availableQuantity < line.quantity) return problem(409, 'Inventory.InsufficientStock', 'Saldo insuficiente.');
    }
    const r = {
      id: nextIdOf(reservations), idempotencyKey: body.idempotencyKey, reference: body.reference ?? '', status: 'Reserved',
      expiresAt: hoursFromNow(1), completedAt: null, items: lines.map((l) => ({ productVariantId: l.productVariantId, quantity: l.quantity })),
    };
    r.items.forEach((i) => { variantOf(i.productVariantId).reservedQuantity += i.quantity; });
    reservations.push(r);
    r.items.forEach((i) => log(variantOf(i.productVariantId), OPERATION_TYPES.reservation, `${r.idempotencyKey}:${i.productVariantId}`, 0, i.quantity, r.reference, r.id));
    return ok(reservationResponse(r));
  }
  const reservationMatch = path.match(/^inventory\/reservations\/(\d+)(?:\/(release|commit))?$/);
  if (reservationMatch) {
    const r = reservations.find((x) => x.id === Number(reservationMatch[1]));
    if (!r) return problem(404, 'Inventory.ReservationNotFound', 'Reserva não encontrada.');
    const action = reservationMatch[2];
    if (!action) return ok(reservationResponse(r));
    if (r.status !== 'Reserved') return problem(409, 'Inventory.ReservationClosed', 'A reserva já foi encerrada.');
    r.status = action === 'release' ? 'Released' : 'Committed';
    r.completedAt = nowIso();
    r.items.forEach((i) => {
      const v = variantOf(i.productVariantId);
      v.reservedQuantity -= i.quantity;
      if (action === 'commit') v.stockQuantity -= i.quantity;
      log(v, OPERATION_TYPES[action], `${r.idempotencyKey}:${action}:${v.id}`, action === 'commit' ? -i.quantity : 0, -i.quantity, r.reference, r.id);
    });
    return ok(reservationResponse(r));
  }
  return null;
}

// -------------------------------------------------------- CATEGORIAS (task 35) ---

const MAX_CATEGORY_DEPTH = 3;
const categorySlug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function categoryRoutes(method, path, body) {
  const d = data();
  const live = () => d['store/categories'].filter((c) => !c.isDeleted);
  const childrenOf = (id) => live().filter((c) => c.parentCategoryId === id);
  const subtreeIds = (id) => [id, ...childrenOf(id).flatMap((c) => subtreeIds(c.id))];
  const depthOf = (c) => (c.parentCategoryId ? 1 + depthOf(live().find((x) => x.id === c.parentCategoryId)) : 1);
  const sorted = (rows) => rows.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name) || a.id - b.id);
  const node = (c) => ({
    id: c.id, parentCategoryId: c.parentCategoryId, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl,
    displayOrder: c.displayOrder, isActive: c.isActive, children: sorted(childrenOf(c.id)).map(node),
  });
  const validParent = (c, parentId) => {
    if (!parentId) return null;
    const parent = live().find((x) => x.id === parentId);
    if (!parent || (c?.id && subtreeIds(c.id).includes(parentId))) return problem(400, 'Category.Cycle', 'A categoria-mãe criaria um ciclo.');
    if (depthOf(parent) >= MAX_CATEGORY_DEPTH) return problem(400, 'Category.MaximumDepth', 'A árvore aceita até 3 níveis.');
    return null;
  };

  if (path === 'categories/tree' && method === 'GET') return ok(sorted(live().filter((c) => !c.parentCategoryId)).map(node));

  if (path === 'categories/add' && method === 'POST') {
    const error = validParent(null, body.parentCategoryId);
    if (error) return error;
    const slug = body.slug?.trim() || categorySlug(body.name);
    if (live().some((c) => c.slug === slug)) return problem(409, 'Category.DuplicateSlug', 'Já existe uma categoria com este slug.');
    const c = { ...body, slug, id: nextIdOf(d['store/categories']), enterpriseId: 1, isDeleted: false, deletedAt: null, createdAt: nowIso(), updatedAt: null };
    d['store/categories'].push(c);
    return ok([c]);
  }
  if (path === 'categories/update' && method === 'PUT') {
    const c = live().find((x) => x.id === body.id);
    if (!c) return problem(404, 'Category.NotFound', 'Categoria não encontrada.');
    const error = validParent(c, body.parentCategoryId);
    if (error) return error;
    const slug = body.slug?.trim() || categorySlug(body.name);
    if (live().some((x) => x.id !== c.id && x.slug === slug)) return problem(409, 'Category.DuplicateSlug', 'Já existe uma categoria com este slug.');
    Object.assign(c, body, { slug, updatedAt: nowIso() });
    return ok([c]);
  }

  const activeMatch = path.match(/^categories\/(\d+)\/active$/);
  if (activeMatch && method === 'PUT') {
    const c = live().find((x) => x.id === Number(activeMatch[1]));
    if (!c) return problem(404, 'Category.NotFound', 'Categoria não encontrada.');
    c.isActive = Boolean(body.isActive);
    return ok(c);
  }

  if (path === 'categories/reorder' && method === 'PUT') {
    const ids = body.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) return problem(400, 'Category.DuplicateIds', 'Há categorias repetidas.');
    if (ids.some((id) => !live().some((c) => c.id === id))) return problem(404, 'Category.NotFound', 'Categoria não encontrada.');
    body.items.forEach((i) => { live().find((c) => c.id === i.id).displayOrder = i.displayOrder; });
    return ok(true);
  }

  if (path === 'categories/delete-with-products' && method === 'DELETE') {
    const set = new Set(body.ids);
    if (set.size !== body.ids.length) return problem(400, 'Category.DuplicateIds', 'Há categorias repetidas.');
    const targets = live().filter((c) => set.has(c.id));
    if (targets.length !== set.size) return problem(404, 'Category.NotFound', 'Categoria não encontrada.');
    if (targets.some((c) => childrenOf(c.id).some((x) => !set.has(x.id)))) {
      return problem(409, 'Category.HasChildren', 'A categoria tem subcategorias fora da seleção.');
    }
    const products = d['store/products'].filter((p) => !p.isDeleted && set.has(p.categoryId));
    const destination = live().find((c) => c.id === body.moveProductsToCategoryId);
    if (products.length && !body.moveProductsToCategoryId) return problem(409, 'Category.HasProducts', 'A categoria tem produtos: escolha o destino.');
    if (products.length && (!destination || !destination.isActive || set.has(destination.id))) {
      return problem(400, 'Category.InvalidDestination', 'O destino precisa ser uma categoria ativa fora da seleção.');
    }
    products.forEach((p) => { p.categoryId = destination.id; });
    targets.forEach((c) => { c.isDeleted = true; c.deletedAt = nowIso(); });
    return ok(true);
  }
  return null;
}

// ----------------------------------------------------------- CUPONS (task 36) ---

const CONDITION_TYPES = [
  { id: 1, description: 'Valor do pedido' },
  { id: 2, description: 'Quantidade de itens do pedido' },
  { id: 3, description: 'Compras anteriores do cliente' },
  { id: 4, description: 'Total já gasto pelo cliente' },
];
const CONDITION_OPERATORS = [
  { id: 1, description: 'Igual a' },
  { id: 2, description: 'Maior que' },
  { id: 3, description: 'Maior ou igual a' },
  { id: 4, description: 'Menor que' },
  { id: 5, description: 'Menor ou igual a' },
  { id: 6, description: 'Entre (inclusive)' },
  { id: 7, description: 'Maior que e menor que' },
];
const COMPARE = {
  1: (v, a) => v === a,
  2: (v, a) => v > a,
  3: (v, a) => v >= a,
  4: (v, a) => v < a,
  5: (v, a) => v <= a,
  6: (v, a, b) => v >= a && v <= b,
  7: (v, a, b) => v > a && v < b,
};

// Situação em ordem de precedência: inativo, expirado, esgotado, agendado, ativo.
const couponAvailability = (c) => {
  const now = Date.now();
  if (!c.isActive) return 5;
  if (now > Date.parse(c.expiresAt)) return 3;
  if (c.maxUses && c.usedCount >= c.maxUses) return 4;
  if (now < Date.parse(c.startsAt)) return 1;
  return 2;
};

const couponResponse = (c) => ({
  id: c.id, code: c.code, typeId: c.couponTypeId, type: c.couponTypeId === 1 ? 'Percentual' : 'Valor fixo',
  discountValue: c.discountValue, maxDiscountCap: c.maxDiscountCap, maxUses: c.maxUses, usedCount: c.usedCount,
  isActive: c.isActive, isSingleUse: c.isSingleUse, startsAt: c.startsAt, expiresAt: c.expiresAt,
  availability: couponAvailability(c),
  conditions: (c.conditions ?? []).map((k) => {
    const type = CONDITION_TYPES.find((t) => t.id === k.typeId);
    const operator = CONDITION_OPERATORS.find((o) => o.id === k.operatorId);
    return {
      typeId: k.typeId, type: type.description, operatorId: k.operatorId, operator: operator.description, value: k.value,
      secondValue: k.secondValue ?? null,
      description: `${type.description} ${operator.description.toLowerCase()} ${k.value}${k.secondValue != null ? ` e ${k.secondValue}` : ''}`,
    };
  }),
  createdAt: c.createdAt, updatedAt: c.updatedAt,
});

const couponError = (body, current) => {
  const conditions = body.conditions ?? [];
  if (conditions.length > 4 || new Set(conditions.map((k) => k.typeId)).size !== conditions.length) {
    return problem(400, 'Validation.InvalidInput', 'Até 4 condições, uma por tipo.');
  }
  if (conditions.some((k) => ([6, 7].includes(k.operatorId) ? !(Number(k.secondValue) > Number(k.value)) : k.secondValue != null))) {
    return problem(400, 'Validation.InvalidInput', 'Valores da condição inválidos.');
  }
  if (current?.usedCount > 0) {
    const locked = ['code', 'couponTypeId', 'discountValue', 'maxDiscountCap', 'isSingleUse', 'startsAt'].some((k) => body[k] !== undefined && body[k] !== current[k]);
    if (locked || JSON.stringify(conditions) !== JSON.stringify(current.conditions ?? [])) {
      return problem(400, 'Coupon.InUse', 'O cupom já foi usado: só validade, limite de usos e ativação podem mudar.');
    }
    if (body.maxUses && body.maxUses < current.usedCount) return problem(400, 'Coupon.MaxUsesBelowUsage', 'O limite fica abaixo dos usos já feitos.');
  }
  return null;
};

function couponRoutes(method, path, body, query) {
  const d = data();
  const coupons = d['store/coupons'].filter((c) => !c.isDeleted);

  if (path === 'coupons/condition-types' && method === 'GET') return ok(CONDITION_TYPES);
  if (path === 'coupons/condition-operators' && method === 'GET') return ok(CONDITION_OPERATORS);

  if (path === 'coupons/search' && method === 'GET') {
    const code = (query.get('Code') ?? '').trim().toLowerCase();
    const rows = coupons.filter((c) => {
      if (code && !c.code.toLowerCase().includes(code)) return false;
      if (query.get('TypeId') && c.couponTypeId !== Number(query.get('TypeId'))) return false;
      if (query.get('IsActive') && c.isActive !== (query.get('IsActive') === 'true')) return false;
      return !query.get('Availability') || couponAvailability(c) === Number(query.get('Availability'));
    }).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const page = Number(query.get('Page') ?? 1);
    const pageSize = Number(query.get('PageSize') ?? 20);
    return ok({ items: rows.slice((page - 1) * pageSize, page * pageSize).map(couponResponse), totalCount: rows.length, page, pageSize });
  }

  const fromBody = (b) => ({
    code: String(b.code).replace(/\s/g, '').toUpperCase(), couponTypeId: b.typeId, discountValue: b.discountValue,
    maxDiscountCap: b.maxDiscountCap ?? 0, maxUses: b.maxUses ?? null, isActive: b.isActive, isSingleUse: b.isSingleUse,
    startsAt: b.startsAt, expiresAt: b.expiresAt, conditions: b.conditions ?? [],
  });
  if (path === 'coupons/add' && method === 'POST') {
    const error = couponError(body, null);
    if (error) return error;
    const entity = fromBody(body);
    if (coupons.some((c) => c.code === entity.code)) return problem(409, 'Coupon.DuplicateCode', 'Já existe um cupom com este código.');
    const c = { ...entity, id: nextIdOf(d['store/coupons']), enterpriseId: 1, usedCount: 0, isDeleted: false, deletedAt: null, createdAt: nowIso(), updatedAt: null };
    d['store/coupons'].push(c);
    return ok([couponResponse(c)]);
  }
  if (path === 'coupons/update' && method === 'PUT') {
    const c = coupons.find((x) => x.id === body.id);
    if (!c) return problem(404, 'Coupon.NotFound', 'Cupom não encontrado.');
    const entity = fromBody(body);
    const error = couponError({ ...entity, conditions: entity.conditions }, c);
    if (error) return error;
    if (coupons.some((x) => x.id !== c.id && x.code === entity.code)) return problem(409, 'Coupon.DuplicateCode', 'Já existe um cupom com este código.');
    Object.assign(c, entity, { updatedAt: nowIso() });
    return ok([couponResponse(c)]);
  }

  const activationMatch = path.match(/^coupons\/(\d+)\/activation$/);
  if (activationMatch && method === 'PUT') {
    const c = coupons.find((x) => x.id === Number(activationMatch[1]));
    if (!c) return problem(404, 'Coupon.NotFound', 'Cupom não encontrado.');
    if (typeof body !== 'boolean') return problem(400, 'Validation.InvalidInput', 'O corpo precisa ser true ou false.');
    c.isActive = body;
    return ok(couponResponse(c));
  }

  if (path === 'coupons/validate' && method === 'GET') {
    const code = (query.get('Code') ?? '').toUpperCase();
    const subTotal = Number(query.get('SubTotal') ?? 0);
    const itemQuantity = Number(query.get('ItemQuantity') ?? 0);
    const c = coupons.find((x) => x.code === code);
    const result = (isValid, reasonCode, message, discountAmount = 0, conditions = []) => ok({
      code, isValid, discountAmount, subTotalAfterDiscount: subTotal - discountAmount, reasonCode, message, conditions,
    });
    if (!c) return result(false, 'Coupon.NotFound', 'Cupom não encontrado.');
    const response = couponResponse(c);
    const reasons = { 5: ['Coupon.Inactive', 'O cupom está inativo.'], 3: ['Coupon.Expired', 'O cupom expirou.'], 4: ['Coupon.Exhausted', 'O cupom esgotou.'], 1: ['Coupon.NotStarted', 'O cupom ainda não começou.'] };
    const reason = reasons[response.availability];
    if (reason) return result(false, reason[0], reason[1], 0, response.conditions);
    const values = { 1: subTotal, 2: itemQuantity, 3: 0, 4: 0 };
    const failed = (c.conditions ?? []).find((k) => !COMPARE[k.operatorId](values[k.typeId], k.value, k.secondValue));
    if (failed) return result(false, 'Coupon.ConditionNotMet', 'O pedido não atende às condições do cupom.', 0, response.conditions);
    const raw = c.couponTypeId === 1 ? subTotal * (c.discountValue / 100) : c.discountValue;
    const discount = Math.min(c.maxDiscountCap > 0 ? Math.min(raw, c.maxDiscountCap) : raw, subTotal);
    return result(true, null, null, Math.round(discount * 100) / 100, response.conditions);
  }
  return null;
}

// ------------------------------------------------------ PEDIDOS (task 37) ---

const ORDER_SORTS = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  total_desc: (a, b) => b.totalAmount - a.totalAmount,
  total_asc: (a, b) => a.totalAmount - b.totalAmount,
};
const SHIPMENT_FIELDS = ['shipmentTypeId', 'carrierName', 'trackingCode', 'estimatedDelivery'];

// Número comercial: o seed não tem; usa a sequência dos ids (10401 é o pedido 1).
const orderNumber = (o) => o.orderNumber ?? (o.id > 10400 ? o.id - 10400 : o.id);
const statusName = (id) => ORDER_STATUS[id]?.label ?? `#${id}`;
const paymentName = (id) => PAYMENT_STATUS[id]?.label ?? `#${id}`;

function orderRoutes(method, path, body, query) {
  const d = data();
  const orders = d['store/orders'].filter((o) => !o.isDeleted);
  const customerName = (id) => d['store/customers'].find((c) => c.id === id)?.fullName ?? `Cliente #${id}`;

  // Histórico: o seed só guarda o estado atual; monta a trilha até ele na primeira leitura.
  const historyOf = (o) => {
    if (!o.history) {
      const steps = o.orderStatusId >= 6 ? [1, o.orderStatusId] : Array.from({ length: o.orderStatusId }, (_, i) => i + 1);
      o.history = steps.map((to, i) => ({
        fromStatusId: i ? steps[i - 1] : null, fromStatus: i ? statusName(steps[i - 1]) : null, toStatusId: to, toStatus: statusName(to),
        fromPaymentStatusId: null, toPaymentStatusId: to === 1 ? 1 : o.orderPaymentStatusId, toPaymentStatus: paymentName(to === 1 ? 1 : o.orderPaymentStatusId),
        source: i ? 2 : 1, actorId: i ? 1 : null, reason: i ? '' : 'Pedido criado',
        changedAt: new Date(Date.parse(o.createdAt) + i * 3600e3).toISOString(),
      }));
    }
    return o.history;
  };
  const record = (o, toStatusId, toPaymentStatusId, reason) => {
    const history = historyOf(o);
    history.push({
      fromStatusId: o.orderStatusId, fromStatus: statusName(o.orderStatusId), toStatusId, toStatus: statusName(toStatusId),
      fromPaymentStatusId: o.orderPaymentStatusId, toPaymentStatusId, toPaymentStatus: paymentName(toPaymentStatusId),
      source: 2, actorId: 1, reason, changedAt: nowIso(),
    });
    Object.assign(o, { orderStatusId: toStatusId, orderPaymentStatusId: toPaymentStatusId, updatedAt: nowIso() });
  };

  const paymentOf = (o) => d['store/transactions'].find((t) => t.orderId === o.id && t.transactionTypeId === 1) ?? null;
  const detailOf = (o) => {
    const payment = paymentOf(o);
    return {
      id: o.id, number: orderNumber(o), customerId: o.customerId, statusId: o.orderStatusId, status: statusName(o.orderStatusId),
      paymentStatusId: o.orderPaymentStatusId, paymentStatus: paymentName(o.orderPaymentStatusId), subTotal: o.subTotal,
      discountAmount: o.discountAmount, shippingCost: o.shippingCost, taxAmount: o.taxAmount, totalAmount: o.totalAmount, couponId: o.couponId,
      shippingAddressLine: o.shippingAddressLine, shippingCity: o.shippingCity, shippingStateId: o.shippingStateId, shippingZipCode: o.shippingZipCode,
      notes: o.notes, paymentExpiresAt: o.orderStatusId === 1 ? new Date(Date.parse(o.createdAt) + 3600e3).toISOString() : null,
      canCustomerCancel: o.orderStatusId === 1, createdAt: o.createdAt,
      items: d['store/order-items'].filter((i) => i.orderId === o.id).map((i) => ({
        id: i.id, productId: i.productId, productVariantId: i.productId ? i.productId * 10 : null, serviceId: i.serviceId, itemName: i.itemName,
        variantName: '', sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: i.discountAmount, totalPrice: i.totalPrice,
      })),
      payment: payment && {
        provider: payment.gatewayProvider, methodId: payment.transactionMethodId, method: TRANSACTION_METHOD[payment.transactionMethodId]?.label,
        statusId: payment.transactionStatusId, status: TRANSACTION_STATUS[payment.transactionStatusId]?.label, amount: payment.amount,
        reference: payment.gatewayReference, checkoutUrl: '', instructions: '', expiresAt: null, paidAt: payment.paidAt, refundedAt: payment.refundedAt,
      },
      shipments: d['store/shipments'].filter((s) => s.orderId === o.id).map((s) => ({
        id: s.id, shipmentTypeId: s.shipmentTypeId, shipmentType: SHIPMENT_TYPE[s.shipmentTypeId]?.label, statusId: s.shipmentStatusId,
        status: SHIPMENT_STATUS[s.shipmentStatusId]?.label, carrierName: s.carrierName, trackingCode: s.trackingCode,
        estimatedDelivery: s.estimatedDelivery, shippedAt: s.shippedAt, deliveredAt: s.deliveredAt,
      })),
      history: [...historyOf(o)].sort((a, b) => a.changedAt.localeCompare(b.changedAt)),
      paymentOperations: o.paymentOperations ?? [],
    };
  };

  if (path === 'orders/search' && method === 'GET') {
    const number = Number(query.get('Number')) || null;
    const statusIds = query.getAll('StatusIds').map(Number);
    const paymentIds = query.getAll('PaymentStatusIds').map(Number);
    const customerId = Number(query.get('CustomerId')) || null;
    const from = query.get('CreatedFrom');
    const to = query.get('CreatedTo');
    const min = query.get('MinTotal');
    const max = query.get('MaxTotal');
    const rows = orders.filter((o) => (!number || orderNumber(o) === number)
      && (!statusIds.length || statusIds.includes(o.orderStatusId))
      && (!paymentIds.length || paymentIds.includes(o.orderPaymentStatusId))
      && (!customerId || o.customerId === customerId)
      && (!from || o.createdAt >= from) && (!to || o.createdAt <= to)
      && (min == null || o.totalAmount >= Number(min)) && (max == null || o.totalAmount <= Number(max)))
      .sort(ORDER_SORTS[query.get('Sort')] ?? ORDER_SORTS.newest);
    const page = Number(query.get('Page') ?? 1);
    const pageSize = Number(query.get('PageSize') ?? 20);
    return ok({
      items: rows.slice((page - 1) * pageSize, page * pageSize).map((o) => ({
        id: o.id, number: orderNumber(o), customerId: o.customerId, customerName: customerName(o.customerId), statusId: o.orderStatusId,
        status: statusName(o.orderStatusId), paymentStatusId: o.orderPaymentStatusId, paymentStatus: paymentName(o.orderPaymentStatusId),
        subTotal: o.subTotal, discountAmount: o.discountAmount, totalAmount: o.totalAmount, couponId: o.couponId,
        paymentMethodId: paymentOf(o)?.transactionMethodId ?? null, createdAt: o.createdAt,
      })),
      totalCount: rows.length, page, pageSize,
    });
  }

  // Operações financeiras (CancelamentoEstorno.md): retry reagenda só Failed (5);
  // confirm-manual-refund conclui só estorno manual aguardando confirmação (7).
  const opMatch = path.match(/^orders\/(\d+)\/payment-operations\/(\d+)\/(retry|confirm-manual-refund)$/);
  if (opMatch && method === 'POST') {
    const o = orders.find((x) => x.id === Number(opMatch[1]));
    const op = o?.paymentOperations?.find((x) => x.id === Number(opMatch[2]));
    if (!op) return problem(404, 'PaymentOperation.NotFound', 'Operação não encontrada.');
    if (opMatch[3] === 'retry') {
      if (op.status !== 5) return problem(409, 'PaymentOperation.NotRetryable', 'Só uma operação que falhou pode ser reagendada.');
      op.status = 1;
    } else {
      if (op.status !== 7) return problem(409, 'PaymentOperation.NotAwaitingManualConfirmation', 'O estorno não aguarda confirmação manual.');
      if (!String(body?.reference ?? '').trim()) return problem(400, 'Validation.InvalidInput', 'Informe a referência do comprovante.');
      Object.assign(op, { status: 4, reference: body.reference.trim(), completedAt: nowIso() });
    }
    return ok(detailOf(o));
  }

  const match = path.match(/^orders\/(\d+)\/(detail|confirm-payment|start-processing|ship|deliver|cancel)$/);
  if (!match) return null;
  const o = orders.find((x) => x.id === Number(match[1]));
  if (!o) return problem(404, 'Order.NotFound', 'Pedido não encontrado.');
  const action = match[2];
  if (action === 'detail') return method === 'GET' ? ok(detailOf(o)) : null;
  if (method !== 'POST') return null;
  const invalid = (code, title) => problem(409, code, title);
  const input = body ?? {};

  if (action === 'confirm-payment') {
    if (o.orderStatusId >= 2 && o.orderPaymentStatusId === 2) return ok(detailOf(o));
    if (o.orderStatusId !== 1 || o.orderPaymentStatusId !== 1) return invalid('Order.NotAwaitingPayment', 'O pedido não está aguardando pagamento.');
    let payment = paymentOf(o);
    if (!payment) {
      if (!input.transactionMethodId) return problem(400, 'Payment.MethodRequired', 'Informe o método de pagamento.');
      payment = {
        id: nextIdOf(d['store/transactions']), orderId: o.id, customerId: o.customerId, transactionTypeId: 1, transactionMethodId: input.transactionMethodId,
        transactionStatusId: 1, amount: o.totalAmount, fee: 0, gatewayReference: input.gatewayReference ?? '', gatewayProvider: 'manual',
        gatewayPayload: '{}', paidAt: null, refundedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      };
      d['store/transactions'].push(payment);
    }
    Object.assign(payment, { transactionStatusId: 3, paidAt: nowIso() });
    record(o, 2, 2, input.note || 'Pagamento confirmado manualmente');
    return ok(detailOf(o));
  }

  if (action === 'start-processing') {
    if (o.orderStatusId !== 2) return invalid('Order.InvalidOperation', 'Só pedidos confirmados podem entrar em processamento.');
    record(o, 3, o.orderPaymentStatusId, 'Pedido em processamento');
    return ok(detailOf(o));
  }

  if (action === 'ship') {
    if (o.orderStatusId !== 3) return invalid('Order.InvalidOperation', 'Só pedidos em processamento podem ser enviados.');
    const sent = SHIPMENT_FIELDS.some((k) => input[k]);
    const physical = d['store/order-items'].some((i) => i.orderId === o.id && i.productId);
    if (!sent && physical) return problem(400, 'Order.ShipmentRequired', 'Informe os dados de envio.');
    if (sent) {
      if (!input.shipmentTypeId) return problem(400, 'Validation.InvalidInput', 'Informe a modalidade de envio.');
      if (!input.estimatedDelivery || (input.shipmentTypeId !== 4 && !input.carrierName)) return problem(400, 'Validation.InvalidInput', 'Informe a transportadora e a previsão de entrega.');
      d['store/shipments'].push({
        id: nextIdOf(d['store/shipments']), orderId: o.id, supplierId: null, shipmentTypeId: input.shipmentTypeId, carrierName: input.carrierName ?? '',
        trackingCode: input.trackingCode ?? '', shipmentStatusId: 4, shippingCost: o.shippingCost, estimatedDelivery: input.estimatedDelivery,
        shippedAt: nowIso(), deliveredAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      });
    }
    record(o, 4, o.orderPaymentStatusId, [input.note, input.trackingCode && `Rastreio ${input.trackingCode}`].filter(Boolean).join(' · ') || 'Pedido enviado');
    return ok(detailOf(o));
  }

  if (action === 'deliver') {
    if (o.orderStatusId !== 4) return invalid('Order.InvalidOperation', 'Só pedidos enviados podem ser entregues.');
    d['store/shipments'].filter((s) => s.orderId === o.id).forEach((s) => Object.assign(s, { shipmentStatusId: 5, deliveredAt: nowIso() }));
    record(o, 5, o.orderPaymentStatusId, 'Pedido entregue');
    return ok(detailOf(o));
  }

  if (o.orderStatusId === 6) return ok(detailOf(o));
  if (![1, 2, 3].includes(o.orderStatusId)) return invalid('Order.CancelNotAllowed', 'O pedido não pode mais ser cancelado.');
  if (!String(input.reason ?? '').trim()) return problem(400, 'Validation.InvalidInput', 'Informe o motivo do cancelamento.');
  const paid = o.orderPaymentStatusId === 2;
  record(o, 6, paid ? 4 : o.orderPaymentStatusId, paid ? `${input.reason.trim()} · Pagamento estornado` : input.reason.trim());
  // Gateway manual: o estorno fica aguardando a equipe confirmar a devolução feita fora do sistema.
  if (paid) {
    o.paymentOperations = [...(o.paymentOperations ?? []), {
      id: (o.paymentOperations?.length ?? 0) + 1, kind: 2, status: 7, amount: o.totalAmount, currencyCode: 'BRL',
      reference: null, resolutionCode: null, completedAt: null,
    }];
  }
  return ok(detailOf(o));
}

// ---------------------------------------------------- CLIENTES (task 38) ---

const CUSTOMER_SORTS = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  name: (a, b) => a.fullName.localeCompare(b.fullName),
  total_spent_desc: (a, b) => b.totalSpent - a.totalSpent,
  last_order_desc: (a, b) => (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? ''),
};
// Compra concluída: pedido confirmado, em processamento, enviado ou entregue.
const COMPLETED_STATUSES = [2, 3, 4, 5];

function customerRoutes(method, path, body, query) {
  const d = data();
  const customers = d['store/customers'].filter((c) => !c.isDeleted);

  if (path === 'customers/search' && method === 'GET') {
    const completed = d['store/orders'].filter((o) => !o.isDeleted && COMPLETED_STATUSES.includes(o.orderStatusId));
    const term = (query.get('Term') ?? '').trim().toLowerCase();
    const flag = (name) => (query.get(name) == null ? null : query.get(name) === 'true');
    const rows = customers.map((c) => {
      const mine = completed.filter((o) => o.customerId === c.id);
      return {
        id: c.id, fullName: c.fullName, email: c.email, phone: c.phone, city: c.city, stateId: c.stateId, isActive: c.isActive,
        isVerified: c.isVerified, emailConfirmed: c.emailConfirmed, completedOrders: mine.length,
        totalSpent: Math.round(mine.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100,
        lastOrderAt: mine.map((o) => o.createdAt).sort().at(-1) ?? null, createdAt: c.createdAt,
      };
    }).filter((c) => {
      if (term && !`${c.fullName} ${c.email} ${c.phone}`.toLowerCase().includes(term)) return false;
      if (query.get('StateId') && c.stateId !== Number(query.get('StateId'))) return false;
      if (query.get('CreatedFrom') && c.createdAt < query.get('CreatedFrom')) return false;
      if (query.get('CreatedTo') && c.createdAt > query.get('CreatedTo')) return false;
      return [['IsActive', c.isActive], ['IsVerified', c.isVerified], ['EmailConfirmed', c.emailConfirmed], ['HasOrders', c.completedOrders > 0]]
        .every(([name, value]) => flag(name) === null || flag(name) === value);
    }).sort(CUSTOMER_SORTS[query.get('Sort')] ?? CUSTOMER_SORTS.newest);
    const page = Number(query.get('Page') ?? 1);
    const pageSize = Number(query.get('PageSize') ?? 20);
    return ok({ items: rows.slice((page - 1) * pageSize, page * pageSize), totalCount: rows.length, page, pageSize });
  }

  const addressesMatch = path.match(/^customers\/(\d+)\/addresses$/);
  if (addressesMatch && method === 'GET') {
    const c = customers.find((x) => x.id === Number(addressesMatch[1]));
    if (!c) return problem(404, 'Customer.NotFound', 'Cliente não encontrado.');
    const stateName = (id) => STATES.find((s) => s.id === id)?.name ?? '';
    return ok([
      { id: c.id * 10, label: 'Casa', recipientName: c.fullName, addressLine: c.addressLine, city: c.city, stateId: c.stateId, state: stateName(c.stateId), zipCode: c.zipCode, country: c.country ?? 'Brasil', isDefault: true },
      ...(c.id % 3 === 0 ? [{ id: c.id * 10 + 1, label: 'Trabalho', recipientName: c.fullName, addressLine: 'Av. Paulista, 1000', city: 'São Paulo', stateId: 25, state: stateName(25), zipCode: '01310100', country: 'Brasil', isDefault: false }] : []),
    ]);
  }
  return null;
}

// ------------------------------------------------- CONFIGURAÇÕES (task 39) ---

function settingsRoutes(method, path, body) {
  const d = data();
  d['store/settings'] ??= { id: 0, enterpriseId: 1, currencyCode: 'BRL', minOrderValue: 0, maxItemsPerOrder: null, allowBackorder: false, pendingOrderExpirationMinutes: 60 };
  if (path !== 'store-settings') return null;
  if (method === 'GET') return ok(d['store/settings']);
  if (method !== 'PUT') return null;
  const invalid = (title) => problem(400, 'Validation.InvalidInput', title);
  if (!/^[A-Za-z]{3}$/.test(body.currencyCode ?? '')) return invalid('A moeda precisa ter 3 letras.');
  if (!(Number(body.minOrderValue) >= 0)) return invalid('O pedido mínimo não pode ser negativo.');
  if (body.maxItemsPerOrder != null && !(body.maxItemsPerOrder >= 1 && body.maxItemsPerOrder <= 10000)) return invalid('O limite de itens vai de 1 a 10.000.');
  if (!(body.pendingOrderExpirationMinutes >= 5 && body.pendingOrderExpirationMinutes <= 10080)) return invalid('O prazo vai de 5 a 10.080 minutos.');
  Object.assign(d['store/settings'], { ...body, currencyCode: body.currencyCode.toUpperCase(), id: d['store/settings'].id || 1 });
  return ok(d['store/settings']);
}

// ---------------------------------------------------- DOMÍNIOS (task 41) ---

const PLATFORM_DOMAIN = 'stores.localhost';

// Mesmas regras do back: sem / : @, até 253 caracteres, rótulos de 1 a 63 sem hífen nas pontas.
const validHost = (host) => host.length <= 253 && !/[/:@\s]/.test(host)
  && host.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

function domainRoutes(method, path, body) {
  const d = data();
  d['store/enterprise-domains'] ??= [
    { id: 1, enterpriseId: 1, host: 'teste.stores.localhost', normalizedHost: 'teste.stores.localhost', isPrimary: true, isVerified: true, isActive: true },
  ];
  const domains = d['store/enterprise-domains'];
  const publicView = (x) => ({ id: x.id, enterpriseId: x.enterpriseId, host: x.host, normalizedHost: x.normalizedHost, isPrimary: x.isPrimary, isVerified: x.isVerified, isActive: x.isActive });

  if (path === 'enterprise-domains/get-all' && method === 'GET') return raw(domains.map(publicView));

  if (path === 'enterprise-domains/add' && method === 'POST') {
    const host = String(body?.host ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!host || !validHost(host)) return problem(400, 'Validation.InvalidInput', 'O host informado é inválido.');
    if (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`)) return problem(400, 'Domain.PlatformDomainReserved', 'Este domínio pertence à plataforma.');
    if (domains.some((x) => x.normalizedHost === host)) return problem(409, 'Domain.InUse', 'Este domínio já está cadastrado.');
    const token = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    const domain = { id: nextIdOf(domains), enterpriseId: 1, host, normalizedHost: host, isPrimary: false, isVerified: false, isActive: false, token, attempts: 0 };
    domains.push(domain);
    return raw({ id: domain.id, host, recordName: `_drpcommerce.${host}`, recordValue: `drpcommerce-verification=${token}` });
  }

  const match = path.match(/^enterprise-domains\/(\d+)(?:\/(verify|publication))?$/);
  if (!match) return null;
  const domain = domains.find((x) => x.id === Number(match[1]));
  if (!domain) return problem(404, 'Domain.NotFound', 'Domínio não encontrado.');

  if (match[2] === 'verify' && method === 'POST') {
    if (domain.isVerified) return noContent();
    if (domain.host.startsWith('dns.')) return problem(503, 'Domain.DnsUnavailable', 'Não foi possível consultar o DNS agora.');
    // A primeira consulta ainda não enxerga o registro (propagação); a segunda enxerga.
    domain.attempts += 1;
    if (domain.attempts < 2) return problem(400, 'Domain.OwnershipUnverified', 'O registro TXT não foi encontrado.');
    domain.isVerified = true;
    return noContent();
  }

  if (match[2] === 'publication' && method === 'PUT') {
    const { isPrimary, isActive } = body;
    if (isPrimary && !isActive) return problem(400, 'Domain.PrimaryMustBeActive', 'O domínio principal precisa estar ativo.');
    if (isActive && !domain.isVerified) return problem(400, 'Validation.InvalidInput', 'Verifique o domínio antes de publicar.');
    if (domain.isPrimary && (!isPrimary || !isActive)) return problem(409, 'Domain.PrimaryProtected', 'O domínio principal não pode ser despublicado.');
    if (isPrimary) domains.forEach((x) => { x.isPrimary = false; });
    Object.assign(domain, { isPrimary: Boolean(isPrimary), isActive: Boolean(isActive) });
    return noContent();
  }

  if (!match[2] && method === 'DELETE') {
    if (domain.isPrimary) return problem(409, 'Domain.PrimaryProtected', 'O domínio principal não pode ser excluído.');
    d['store/enterprise-domains'] = domains.filter((x) => x !== domain);
    return noContent();
  }
  return null;
}

function storeBackoffice(method, path, body, who, query) {
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
  const team = teamRoutes(method, path, body);
  if (team) return team;
  const catalog = catalogRoutes(method, path, body, query);
  if (catalog) return catalog;
  const inventory = inventoryRoutes(method, path, body, query);
  if (inventory) return inventory;
  const categories = categoryRoutes(method, path, body);
  if (categories) return categories;
  const couponsResult = couponRoutes(method, path, body, query);
  if (couponsResult) return couponsResult;
  const ordersResult = orderRoutes(method, path, body, query);
  if (ordersResult) return ordersResult;
  const customersResult = customerRoutes(method, path, body, query);
  if (customersResult) return customersResult;
  const settingsResult = settingsRoutes(method, path, body);
  if (settingsResult) return settingsResult;
  const domainsResult = domainRoutes(method, path, body);
  if (domainsResult) return domainsResult;

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
  const [path, search = ''] = url.split('?');
  const query = new URLSearchParams(search);
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
    const special = storeBackoffice(method, rest, body, who, query);
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
