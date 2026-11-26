import { cpfDigits, isValidCpf } from '../cpf';

// Fila e compra do drop no mock (tasks 17 e 18), com as regras do back
// (JoinDropQueueCommandHandler, ReserveDropPurchaseCommandHandler,
// CheckoutDropPurchaseCommandHandler, FluxoComercial.md "Fila e compra" e "Pagamento"):
//   POST events/{id}/queue { cpf }           -> DropQueueStatusResponse
//   GET  events/{id}/queue                   -> DropQueueStatusResponse; 404 Drop.QueueNotFound sem entrada
//   GET  queue                               -> DropQueueEntryResponse[]
//   POST events/{id}/reservations            { participationId, sessionId, idempotencyKey, lines[{ variantId, quantity }] }
//                                            -> DropReservationResponse (mesma chave = mesma reserva)
//   GET  reservations · reservations/{id}    -> DropReservationSummary[] · DropReservationResponse
//   POST reservations/{id}/checkout          -> DropPurchaseResponse (idempotente pela reserva)
//   GET  purchases/{id}                      -> DropPurchaseResponse
// Fila: entra só entre queueOpensAt e dropEndsAt (e com inscrição aprovada quando exigida);
// o CPF fica preso à entrada do evento. A sessão de compra nasce na admissão, com 15 minutos
// fixos; ao expirar, a entrada vira 5 e as reservas ativas são liberadas.
// Para a tela andar sozinha, a posição cai uma vaga a cada ADVANCE_MS do relógio do mock, e
// a admissão só acontece com o drop em andamento. O pagamento não passa por Mercado Pago no
// mock: o painel de simulação aprova ou recusa (o back confirma pelo webhook).
const SESSION_MINUTES = 15;
const ADVANCE_MS = 2000;
const STATUS = { waiting: 1, called: 2, checkingOut: 3, completed: 4, expired: 5, removed: 6 };
const RESERVATION = { active: 1, confirmed: 2, expired: 3, cancelled: 4 };

export function createDropQueueMock({ data, raw, problem, now }) {
  const entries = () => data()['drop/queue-entries'];
  const events = () => data()['drop/drop-events'];
  const rows = () => data()['drop/drop-products'];
  const reservationRows = () => data()['drop/drop-reservations'];
  const purchases = () => {
    const d = data();
    if (!d['drop/mock-purchases']) d['drop/mock-purchases'] = { reservations: [], keys: {} };
    return d['drop/mock-purchases'];
  };
  const iso = (ms) => new Date(ms).toISOString();
  const round = (value) => Math.round(value * 100) / 100;
  const nextId = (list, start) => list.reduce((max, r) => Math.max(max, r.id ?? 0), start) + 1;

  const find = (eventId, customerId) => entries().find((e) => e.dropEventId === eventId && e.customerId === customerId && !e.isDeleted);
  const tail = (eventId) => entries()
    .filter((e) => e.dropEventId === eventId && [STATUS.waiting, STATUS.called, STATUS.checkingOut].includes(e.queueEntryStatusId))
    .reduce((max, e) => Math.max(max, e.position), 0);

  // --------------------------------------------------------------- reservas ---

  // Libera o saldo de uma reserva (expirada ou cancelada).
  const release = (reservation, statusId) => {
    if (reservation.statusId !== RESERVATION.active) return;
    reservation.statusId = statusId;
    reservationRows().filter((r) => r.mockReservationId === reservation.id)
      .forEach((r) => { r.dropReservationStatusId = statusId; });
  };

  const openSession = (entry, t) => {
    entry.mock.session = { id: entry.id * 10 + (entry.mock.round ?? 0), issuedAt: iso(t), expiresAt: iso(t + SESSION_MINUTES * 60_000) };
  };

  // Avança a posição, admite e expira conforme o relógio. Só mexe nas entradas criadas pela tela.
  const tick = (entry) => {
    if (!entry?.mock) return;
    const t = now();
    const ev = events().find((e) => e.id === entry.dropEventId);
    if (entry.queueEntryStatusId === STATUS.waiting) {
      const walked = Math.floor((t - entry.mock.since) / ADVANCE_MS);
      entry.position = Math.max(1, entry.mock.from - walked);
      if (entry.position <= 1 && ev && t >= Date.parse(ev.dropStartsAt) && t < Date.parse(ev.dropEndsAt)) {
        Object.assign(entry, { queueEntryStatusId: STATUS.called, position: 0, calledAt: iso(t) });
        openSession(entry, t);
      }
    }
    if ([STATUS.called, STATUS.checkingOut].includes(entry.queueEntryStatusId) && entry.mock.session
      && t >= Date.parse(entry.mock.session.expiresAt)) {
      Object.assign(entry, { queueEntryStatusId: STATUS.expired, expiredAt: iso(t) });
      purchases().reservations
        .filter((r) => r.sessionId === entry.mock.session.id && !r.orderId)
        .forEach((r) => release(r, RESERVATION.expired));
      entry.mock.session = null;
    }
  };

  const status = (entry) => ({
    id: entry.id, position: entry.position, queueEntryStatusId: entry.queueEntryStatusId, session: entry.mock?.session ?? null,
  });

  // Variações de uma participação (participationId = primeira linha do produto no evento).
  const participation = (eventId, participationId) => {
    const head = rows().find((r) => r.id === participationId && r.dropEventId === eventId && !r.isDeleted);
    if (!head) return null;
    const skus = rows().filter((r) => r.dropEventId === eventId && r.productId === head.productId && r.isActive && !r.isDeleted);
    return { head, skus, multi: skus.length > 1 };
  };
  const reservedOf = (rowId) => reservationRows()
    .filter((r) => r.dropProductId === rowId && r.dropReservationStatusId === RESERVATION.active && !r.isDeleted)
    .reduce((sum, r) => sum + r.quantity, 0);
  const availableOf = (row) => Math.max(0, row.unitsAllocated - row.unitsSold - reservedOf(row.id));

  const reservationResponse = (r) => ({
    id: r.id, dropEventId: r.dropEventId, dropProductId: r.participationId, quantity: r.quantity,
    totalAmount: r.totalAmount, expiresAt: r.expiresAt, lines: r.lines,
  });
  const reservationSummary = (r) => ({
    id: r.id, dropEventId: r.dropEventId, dropProductId: r.participationId, quantity: r.quantity,
    totalAmount: r.totalAmount, dropReservationStatusId: r.statusId, expiresAt: r.expiresAt,
  });

  function reserve(eventId, customerId, body) {
    const entry = find(eventId, customerId);
    tick(entry);
    const session = entry?.mock?.session;
    if (!session || session.id !== Number(body?.sessionId)) {
      return problem(entry && entry.queueEntryStatusId === STATUS.expired ? 409 : 404,
        entry && entry.queueEntryStatusId === STATUS.expired ? 'DropPurchase.SessionExpired' : 'DropPurchase.SessionNotFound',
        entry && entry.queueEntryStatusId === STATUS.expired ? 'O prazo de compra terminou.' : 'Sessão de compra não encontrada.');
    }
    const key = String(body?.idempotencyKey ?? '').trim();
    const lines = (body?.lines ?? []).map((l) => ({ variantId: Number(l.variantId), quantity: Number(l.quantity) }));
    if (!key || !lines.length || lines.some((l) => !(l.quantity > 0))) {
      return problem(400, 'DropPurchase.InvalidReservation', 'Contrato ou reserva inválida.');
    }
    const signature = JSON.stringify({ p: Number(body.participationId), l: [...lines].sort((a, b) => a.variantId - b.variantId) });
    const previous = purchases().keys[`${customerId}:${key}`];
    if (previous) {
      return previous.signature === signature
        ? raw(reservationResponse(purchases().reservations.find((r) => r.id === previous.id)))
        : problem(409, 'DropPurchase.IdempotencyConflict', 'A chave já identifica outra reserva.');
    }
    const part = participation(eventId, Number(body.participationId));
    if (!part) return problem(409, 'DropPurchase.ProductUnavailable', 'Produto indisponível.');
    const picked = lines.map((l) => ({ ...l, row: part.skus.find((s) => s.id === l.variantId) }));
    if (picked.some((l) => !l.row)) return problem(409, 'DropPurchase.ProductUnavailable', 'O produto não está disponível para reservas.');

    // Limite do CPF: reservas vigentes + compras confirmadas deste produto no evento.
    const max = Math.max(...part.skus.map((s) => s.maxPerCustomer ?? 1));
    const already = purchases().reservations
      .filter((r) => r.customerId === customerId && r.dropEventId === eventId && r.participationId === part.head.id
        && [RESERVATION.active, RESERVATION.confirmed].includes(r.statusId))
      .reduce((sum, r) => sum + r.quantity, 0);
    const quantity = picked.reduce((sum, l) => sum + l.quantity, 0);
    if (already + quantity > max) {
      return problem(409, 'DropPurchase.PurchaseLimit', 'A soma das variações e das reservas deste CPF atingiu o limite do produto no evento.');
    }
    if (picked.some((l) => availableOf(l.row) < l.quantity)) {
      return problem(409, 'DropPurchase.InsufficientStock', 'Há variações indisponíveis ou sem saldo suficiente.');
    }

    const store = data()['store/products'].find((p) => p.id === part.head.productId);
    const list = purchases().reservations;
    const reservation = {
      id: nextId(list, 9500), dropEventId: eventId, customerId, participationId: part.head.id, sessionId: session.id,
      quantity, statusId: RESERVATION.active, expiresAt: session.expiresAt, orderId: null,
      totalAmount: round(picked.reduce((sum, l) => sum + l.row.price * l.quantity, 0)),
      lines: picked.map((l) => ({
        variantId: l.row.id, sku: l.row.sku, itemName: store?.name ?? 'Produto do drop', quantity: l.quantity, unitPrice: l.row.price,
        optionsJson: JSON.stringify(part.multi ? { Tamanho: l.row.sku.split('-').pop() } : {}),
      })),
    };
    list.push(reservation);
    purchases().keys[`${customerId}:${key}`] = { id: reservation.id, signature };
    // Linhas de reserva no formato da tabela: seguram o saldo até pagar ou expirar.
    picked.forEach((l) => reservationRows().push({
      id: nextId(reservationRows(), 9000), dropEventId: eventId, dropProductId: l.row.id, customerId, queueEntryId: entry.id,
      dropReservationStatusId: RESERVATION.active, quantity: l.quantity, unitPrice: l.row.price,
      totalAmount: round(l.row.price * l.quantity), reservedAt: iso(now()), expiresAt: session.expiresAt,
      confirmedAt: null, cancelledAt: null, isDeleted: false, deletedAt: null, createdAt: iso(now()), updatedAt: null,
      mockReservationId: reservation.id,
    }));
    entry.queueEntryStatusId = STATUS.checkingOut;
    return raw(reservationResponse(reservation));
  }

  // ---------------------------------------------------------------- compra ---

  const purchaseResponse = (order) => {
    const reservation = purchases().reservations.find((r) => r.orderId === order.id);
    return {
      id: order.id, dropEventId: order.dropEventId, dropReservationId: order.dropReservationId,
      dropOrderStatusId: order.dropOrderStatusId, dropOrderPaymentStatusId: order.dropOrderPaymentStatusId,
      totalAmount: order.totalAmount, buyerNameSnapshot: order.buyerName, buyerEmailSnapshot: order.buyerEmail,
      paymentCheckoutUrl: null, financialReviewCode: order.financialReviewCode ?? null,
      shippingAddressLine: order.shippingAddressLine, shippingCity: order.shippingCity, shippingState: order.shippingState,
      shippingZipCode: order.shippingZipCode,
      items: (reservation?.lines ?? []).map((l) => ({
        itemName: l.itemName, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice,
        totalPrice: round(l.unitPrice * l.quantity), optionsSnapshotJson: l.optionsJson,
      })),
    };
  };

  function checkout(customerId, reservationId) {
    const reservation = purchases().reservations.find((r) => r.id === reservationId && r.customerId === customerId);
    if (!reservation) return problem(404, 'DropPurchase.ReservationNotFound', 'Reserva não encontrada.');
    tick(find(reservation.dropEventId, customerId));
    const orders = data()['drop/drop-orders'];
    if (reservation.orderId) return raw(purchaseResponse(orders.find((o) => o.id === reservation.orderId)));
    if (reservation.statusId !== RESERVATION.active) {
      return problem(409, 'DropPurchase.ReservationExpired', 'A reserva não está disponível para iniciar cobrança.');
    }
    const customer = data()['store/customers'].find((c) => c.id === customerId);
    if (![customer?.addressLine, customer?.city, customer?.stateId, customer?.zipCode].every(Boolean)) {
      return problem(409, 'DropPurchase.AddressRequired', 'Complete o endereço antes de iniciar a cobrança.');
    }
    const t = iso(now());
    const order = {
      id: nextId(orders, 48000), dropEventId: reservation.dropEventId, customerId, dropReservationId: reservation.id,
      dropCouponId: null, dropOrderStatusId: 1, dropOrderPaymentStatusId: 1,
      subTotal: reservation.totalAmount, discountAmount: 0, shippingCost: 0, taxAmount: 0, totalAmount: reservation.totalAmount,
      shippingAddressLine: customer.addressLine, shippingCity: customer.city, shippingState: String(customer.stateId),
      shippingZipCode: customer.zipCode, notes: '', buyerName: customer.fullName, buyerEmail: customer.email,
      isDeleted: false, deletedAt: null, createdAt: t, updatedAt: null,
    };
    orders.push(order);
    const items = data()['drop/drop-order-items'];
    reservation.lines.forEach((l) => items.push({
      id: nextId(items, 70000), dropOrderId: order.id, dropProductId: l.variantId,
      itemName: `${l.itemName}${JSON.parse(l.optionsJson).Tamanho ? ` · ${JSON.parse(l.optionsJson).Tamanho}` : ''}`,
      sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, totalPrice: round(l.unitPrice * l.quantity), createdAt: t, updatedAt: null,
    }));
    reservation.orderId = order.id;
    return raw(purchaseResponse(order));
  }

  // ---------------------------------------------------------------- fila ---

  function join(eventId, customerId, body) {
    if (!isValidCpf(body?.cpf)) {
      const result = problem(400, 'Validation', 'CPF inválido.');
      result.data.errors = { 'Input.CPF': ['CPF inválido.'] };
      return result;
    }
    const ev = events().find((e) => e.id === eventId && !e.isDeleted);
    if (!ev) return problem(404, 'Drop.NotFound', 'Evento não encontrado.');
    const t = now();
    const registered = data()['drop/drop-registrations']
      .some((r) => r.dropEventId === eventId && r.customerId === customerId && r.dropRegistrationStatusId === 2 && !r.isDeleted);
    if (t < Date.parse(ev.queueOpensAt) || t >= Date.parse(ev.dropEndsAt) || ((!ev.isPublic || ev.requiresRegistration) && !registered)) {
      return problem(409, 'Drop.QueueClosed', 'O evento não admite novas entradas.');
    }
    const cpf = cpfDigits(body.cpf);
    let entry = find(eventId, customerId);
    if (entry?.purchaseIdentity && entry.purchaseIdentity !== cpf) {
      return problem(409, 'DropPurchase.IdentityConflict', 'A identidade de compra não pode mudar dentro do evento.');
    }
    const position = tail(eventId) + 1;
    if (!entry) {
      const list = entries();
      entry = {
        id: nextId(list, 0), dropEventId: eventId, customerId, position,
        queueEntryStatusId: STATUS.waiting, enteredAt: iso(t), calledAt: null, expiredAt: null, checkedOutAt: null,
        isDeleted: false, deletedAt: null, createdAt: iso(t), updatedAt: null,
        mock: { from: position, since: t, session: null, round: 0 },
      };
      list.push(entry);
    } else if ([STATUS.expired, STATUS.removed].includes(entry.queueEntryStatusId)) {
      Object.assign(entry, { position, queueEntryStatusId: STATUS.waiting, enteredAt: iso(t), expiredAt: null });
      entry.mock = { from: position, since: t, session: null, round: (entry.mock?.round ?? 0) + 1 };
    }
    entry.purchaseIdentity = cpf;
    tick(entry);
    return raw(status(entry));
  }

  /** @returns resposta ou null se a rota não é da fila nem da compra */
  function route(method, path, body, who) {
    const queueMatch = path.match(/^events\/(\d+)\/queue$/);
    const reserveMatch = path.match(/^events\/(\d+)\/reservations$/);
    const reservationMatch = path.match(/^reservations(?:\/(\d+))?(\/checkout)?$/);
    const purchaseMatch = path.match(/^purchases\/(\d+)$/);
    if (!queueMatch && !reserveMatch && !reservationMatch && !purchaseMatch && path !== 'queue') return null;
    if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const customerId = who.id;

    if (path === 'queue' && method === 'GET') {
      return raw(entries().filter((e) => e.customerId === customerId && !e.isDeleted).map((e) => {
        tick(e);
        return { id: e.id, dropEventId: e.dropEventId, position: e.position, queueEntryStatusId: e.queueEntryStatusId, enteredAt: e.enteredAt };
      }));
    }
    if (queueMatch) {
      const eventId = Number(queueMatch[1]);
      if (method === 'POST') return join(eventId, customerId, body);
      if (method === 'GET') {
        const entry = find(eventId, customerId);
        if (!entry) return problem(404, 'Drop.QueueNotFound', 'Entrada não encontrada.');
        tick(entry);
        return raw(status(entry));
      }
      return null;
    }
    if (reserveMatch && method === 'POST') return reserve(Number(reserveMatch[1]), customerId, body);
    if (reservationMatch) {
      const [, id, isCheckout] = reservationMatch;
      if (!id && method === 'GET') {
        entries().filter((e) => e.customerId === customerId).forEach(tick);
        return raw(purchases().reservations.filter((r) => r.customerId === customerId).map(reservationSummary));
      }
      if (id && isCheckout && method === 'POST') return checkout(customerId, Number(id));
      if (id && !isCheckout && method === 'GET') {
        const reservation = purchases().reservations.find((r) => r.id === Number(id) && r.customerId === customerId);
        return reservation ? raw(reservationResponse(reservation)) : problem(404, 'DropPurchase.ReservationNotFound', 'Reserva não encontrada.');
      }
      return null;
    }
    if (purchaseMatch && method === 'GET') {
      const order = data()['drop/drop-orders'].find((o) => o.id === Number(purchaseMatch[1]) && o.customerId === customerId);
      return order ? raw(purchaseResponse(order)) : problem(404, 'DropPurchase.OrderNotFound', 'Pedido não encontrado.');
    }
    return null;
  }

  // ------------------------------------------------- atalhos do painel (dev) ---
  const latestOrder = (eventId, customerId) => data()['drop/drop-orders']
    .filter((o) => o.dropEventId === eventId && o.customerId === customerId && o.dropOrderPaymentStatusId === 1)
    .sort((a, b) => b.id - a.id)[0];

  const control = {
    setPosition(eventId, customerId, position) {
      const entry = find(eventId, customerId);
      if (entry?.mock && entry.queueEntryStatusId === STATUS.waiting) entry.mock = { ...entry.mock, from: Math.max(1, position), since: now() };
    },
    admit(eventId, customerId) {
      const entry = find(eventId, customerId);
      if (!entry?.mock || entry.queueEntryStatusId !== STATUS.waiting) return;
      const t = now();
      Object.assign(entry, { queueEntryStatusId: STATUS.called, position: 0, calledAt: iso(t) });
      openSession(entry, t);
    },
    expire(eventId, customerId) {
      const entry = find(eventId, customerId);
      if (!entry?.mock?.session) return;
      entry.mock.session.expiresAt = iso(now() - 1);
      tick(entry);
    },
    // Webhook aprovado: confirma a reserva, baixa o estoque e conclui a entrada na fila.
    approvePayment(eventId, customerId) {
      const order = latestOrder(eventId, customerId);
      if (!order) return;
      const reservation = purchases().reservations.find((r) => r.orderId === order.id);
      if (reservation?.statusId === RESERVATION.active) {
        reservation.statusId = RESERVATION.confirmed;
        reservationRows().filter((r) => r.mockReservationId === reservation.id).forEach((r) => {
          r.dropReservationStatusId = RESERVATION.confirmed;
          const row = rows().find((p) => p.id === r.dropProductId);
          if (row) row.unitsSold += r.quantity;
        });
      }
      Object.assign(order, { dropOrderPaymentStatusId: 2, dropOrderStatusId: 2, updatedAt: iso(now()) });
      const entry = find(eventId, customerId);
      if (entry?.mock) {
        Object.assign(entry, { queueEntryStatusId: STATUS.completed, checkedOutAt: iso(now()) });
        entry.mock.session = null;
      }
    },
    failPayment(eventId, customerId) {
      const order = latestOrder(eventId, customerId);
      if (order) Object.assign(order, { dropOrderPaymentStatusId: 5, updatedAt: iso(now()) });
    },
    // Estoque do drop: 'clear' zera as vendas, 'last' deixa 5 unidades livres, 'soldout' esgota.
    setStock(eventId, mode) {
      const list = rows().filter((r) => r.dropEventId === eventId && !r.isDeleted);
      const total = list.reduce((sum, r) => sum + r.unitsAllocated, 0);
      let keep = mode === 'last' ? Math.min(5, total) : mode === 'soldout' ? 0 : total;
      list.forEach((r) => {
        const free = Math.min(r.unitsAllocated, keep);
        r.unitsSold = r.unitsAllocated - free;
        keep -= free;
      });
    },
  };

  return { route, control };
}
