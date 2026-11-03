import { createSeed, SIGNED_IN_CUSTOMER_ID, SIGNED_IN_EMPLOYEE_ID } from './seed';
import { toEntity } from '../resources';

// Servidor falso que responde nas MESMAS rotas do Gateway, com os mesmos formatos:
//   - CRUD (BaseController): envelope Result<T>; add/update devolvem lista.
//   - storefront/*, auth/*, enterprises/*: objeto cru (como o back faz).
//   - erros em application/problem+json, com `code`.
// Os dados vivem só na memória da aba: um F5 volta ao seed.

let db = null;
const data = () => {
  if (!db) db = createSeed();
  return db;
};

export const resetMockData = () => {
  db = null;
};

const ok = (content) => ({ status: 200, data: { isSuccess: true, isFailure: false, content, errors: [], listMessageErrors: [] } });
const raw = (body, status = 200) => ({ status, data: body });
const noContent = () => ({ status: 204, data: null });
const problem = (status, code, title) => ({
  status,
  data: { type: `https://httpstatuses.com/${status}`, title, status, code, traceId: `mock-${Date.now()}` },
});

const nowIso = () => new Date().toISOString();

// Identidade a partir do token "mock-storefront-customer-12" / "mock-backoffice-employee-1".
const identity = (headers) => {
  const token = (headers?.Authorization ?? '').replace(/^Bearer\s+/i, '');
  const match = token.match(/^mock-(storefront|backoffice)-(customer|employee)-(\d+)$/);
  return match ? { realm: match[1], id: Number(match[3]) } : null;
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

const session = (realm, id) => ({
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
    const c = customers.find((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase() && x.isActive);
    return c ? raw(session('storefront', c.id)) : problem(401, 'Identity.InvalidCredentials', 'E-mail ou senha inválidos.');
  }
  if (path === 'auth/register' && method === 'POST') {
    if (customers.some((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase())) {
      return problem(409, 'Identity.EmailTaken', 'Já existe uma conta com este e-mail.');
    }
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
  if (path === 'auth/logout' || path === 'auth/logout-all') return noContent();
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

  if (path === 'auth/change-password' && method === 'POST') {
    return body?.newPassword?.length >= 8 ? noContent() : problem(400, 'Identity.WeakPassword', 'A nova senha precisa de ao menos 8 caracteres.');
  }
  if (path === 'me' && method === 'GET') return raw(customerResponse(me));
  if (path === 'me' && method === 'PUT') {
    Object.assign(me, {
      fullName: body.fullName, phone: body.phone, addressLine: body.addressLine, city: body.city, stateId: body.stateId,
      zipCode: body.zipCode, country: body.country, gender: body.gender, dateOfBirth: body.dateOfBirth, updatedAt: nowIso(),
    });
    return raw(customerResponse(me));
  }
  if (path === 'me' && method === 'DELETE') {
    me.isActive = false;
    return noContent();
  }
  if (path === 'orders' && method === 'GET') {
    return raw(d['store/orders'].filter((o) => o.customerId === me.id).sort((a, b) => b.id - a.id).map((o) => ({
      id: o.id, orderStatusId: o.orderStatusId, orderPaymentStatusId: o.orderPaymentStatusId, totalAmount: o.totalAmount, createdAt: o.createdAt,
    })));
  }
  const orderMatch = path.match(/^orders\/(\d+)$/);
  if (orderMatch && method === 'GET') {
    const o = d['store/orders'].find((x) => x.id === Number(orderMatch[1]) && x.customerId === me.id);
    if (!o) return problem(404, 'Order.NotFound', 'Pedido não encontrado.');
    return raw({
      id: o.id, orderStatusId: o.orderStatusId, orderPaymentStatusId: o.orderPaymentStatusId, totalAmount: o.totalAmount, createdAt: o.createdAt,
      items: d['store/order-items'].filter((i) => i.orderId === o.id).map((i) => ({ itemName: i.itemName, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })),
    });
  }
  return null;
}

function dropStorefront(method, path, who) {
  const d = data();
  if (path === 'events' && method === 'GET') {
    return raw(d['drop/drop-events'].filter((e) => e.isPublic && !e.isDeleted)
      .sort((a, b) => Date.parse(a.dropStartsAt) - Date.parse(b.dropStartsAt))
      .map((e) => ({
        id: e.id, name: e.name, slug: e.slug, description: e.description, price: e.price, coverImageUrl: e.coverImageUrl,
        dropStartsAt: e.dropStartsAt, dropEndsAt: e.dropEndsAt, requiresRegistration: e.requiresRegistration,
      })));
  }
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
  if (path === 'queue') {
    return raw(mine(d['drop/queue-entries']).map((q) => ({
      id: q.id, dropEventId: q.dropEventId, position: q.position, queueEntryStatusId: q.queueEntryStatusId, enteredAt: q.enteredAt,
    })));
  }
  if (path === 'notifications') {
    return raw(mine(d['drop/drop-notifications']).map((n) => ({ id: n.id, subject: n.subject, body: n.body, scheduledAt: n.scheduledAt })));
  }
  if (path === 'reservations') {
    return raw(mine(d['drop/drop-reservations']).map((r) => ({
      id: r.id, dropEventId: r.dropEventId, dropProductId: r.dropProductId, quantity: r.quantity, totalAmount: r.totalAmount,
      dropReservationStatusId: r.dropReservationStatusId, expiresAt: r.expiresAt,
    })));
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
    return body?.password ? raw({ ...session('backoffice', SIGNED_IN_EMPLOYEE_ID), requiresEnterpriseSelection: false })
      : problem(401, 'Identity.InvalidCredentials', 'E-mail ou senha inválidos.');
  }
  if (path === 'auth/refresh') return problem(401, 'Identity.RefreshRequired', 'Sessão de renovação ausente.');
  if (path === 'auth/logout') return noContent();

  if (!who || who.realm !== 'backoffice') return null;

  if (path === 'enterprises/mine' && method === 'GET') {
    return raw([{ membershipId: 1, enterpriseId: d.enterprise.id, tradeName: d.enterprise.tradeName, kindId: 1 }]);
  }
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

// ------------------------------------------------------------------ ROTEADOR ---

/**
 * Responde como o Gateway responderia.
 * @returns {{ status: number, data: unknown }}
 */
export function mockFetch(method, url, body, headers) {
  const path = url.split('?')[0];
  const who = identity(headers);
  const match = path.match(/^\/api\/(drop|store)\/(.+)$/);
  if (!match) return problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
  const [, service, rest] = match;

  if (service === 'store' && rest.startsWith('storefront/')) {
    return storeStorefront(method, rest.slice('storefront/'.length), body, who)
      ?? problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
  }
  if (service === 'drop' && rest.startsWith('storefront/drop/')) {
    return dropStorefront(method, rest.slice('storefront/drop/'.length), who)
      ?? problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
  }

  if (service === 'store') {
    const special = storeBackoffice(method, rest, body, who);
    if (special) return special;
  }

  // CRUD: /api/<svc>/<resource>/<action>[/<id>]
  const crudMatch = rest.match(/^([a-z-]+)\/([a-z-]+)(?:\/(\d+))?$/);
  if (crudMatch) {
    if (!who) return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const [, resource, action, param] = crudMatch;
    const result = crud(`${service}/${resource}`, action, param, body);
    if (result) return result;
  }

  return problem(404, 'Route.NotFound', `Rota inexistente: ${path}`);
}

export { SIGNED_IN_CUSTOMER_ID };
