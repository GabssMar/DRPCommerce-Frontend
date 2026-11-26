import { ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_TYPE, STATES } from '../status';

// Checkout e pedidos do cliente no mock (task 32), com as regras do back
// (StorefrontOrderController, PlaceOrderCommandHandler, CancelMyOrderCommand):
//   POST checkout/shipping-quotes   CheckoutShippingQuotesResponse (token por opção, vale 15 min)
//   POST checkout                   OrderDetailResponse; mesma idempotencyKey = mesmo pedido
//   GET  orders?page&pageSize       PagedResponse<OrderSummaryResponse>
//   GET  orders/{id}                OrderDetailResponse
//   POST orders/{id}/cancel         OrderDetailResponse; só pedido aguardando pagamento
// O pedido compra os itens MARCADOS do carrinho e os tira dele. Preço, desconto,
// frete e prazo são do servidor. O pagamento é manual (sem Mercado Pago no mock).
const QUOTE_MINUTES = 15;
const PAYMENT_METHODS = { 1: 'Cartão de crédito', 2: 'Pix', 3: 'Boleto', 4: 'Saldo Mercado Pago' };
const SERVICES = [
  { serviceId: 1, serviceName: 'PAC', carrierName: 'Correios', base: 18.9, perItem: 1.5, deliveryDays: 7 },
  { serviceId: 2, serviceName: 'SEDEX', carrierName: 'Correios', base: 32.9, perItem: 2.5, deliveryDays: 2 },
];

const round = (value) => Math.round(value * 100) / 100;
const nowIso = () => new Date().toISOString();
const label = (table, id) => table[id]?.label ?? '';

export function createCheckoutMock({ data, ok, problem, cart, catalog, addressesOf }) {
  const table = (key) => {
    const d = data();
    if (!d[key]) d[key] = key.endsWith('keys') || key.endsWith('quotes') ? {} : [];
    return d[key];
  };
  const orders = () => data()['store/orders'];
  const nextId = (rows) => rows.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;
  const numberOf = (o) => o.orderNumber ?? o.id;
  const awaitingPayment = (o) => o.orderStatusId === 1 && o.orderPaymentStatusId === 1;

  const validation = (errors) => {
    const result = problem(400, 'Validation', 'Um ou mais campos são inválidos.');
    result.data.errors = errors;
    return result;
  };

  // ------------------------------------------------------------ respostas ---

  const itemsOf = (orderId) => data()['store/order-items'].filter((i) => i.orderId === orderId).sort((a, b) => a.id - b.id);

  const detail = (o) => {
    const shipments = data()['store/shipments'].filter((s) => s.orderId === o.id).sort((a, b) => a.id - b.id);
    const stateId = o.shippingStateId ?? (Number(o.shippingState) || 0);
    return {
      id: o.id, number: numberOf(o), customerId: o.customerId,
      statusId: o.orderStatusId, status: label(ORDER_STATUS, o.orderStatusId),
      paymentStatusId: o.orderPaymentStatusId, paymentStatus: label(PAYMENT_STATUS, o.orderPaymentStatusId),
      subTotal: o.subTotal, discountAmount: o.discountAmount, shippingCost: o.shippingCost, taxAmount: o.taxAmount,
      totalAmount: o.totalAmount, couponId: o.couponId,
      shippingAddressLine: o.shippingAddressLine, shippingCity: o.shippingCity, shippingStateId: stateId,
      shippingZipCode: o.shippingZipCode, notes: o.notes ?? '',
      paymentExpiresAt: o.paymentExpiresAt ?? null, canCustomerCancel: awaitingPayment(o), createdAt: o.createdAt,
      items: itemsOf(o.id).map((i) => ({
        id: i.id, productId: i.productId, productVariantId: i.productVariantId ?? null, serviceId: i.serviceId,
        itemName: i.itemName, variantName: i.variantName ?? '', sku: i.sku, quantity: i.quantity,
        unitPrice: i.unitPrice, discountAmount: i.discountAmount, totalPrice: i.totalPrice,
      })),
      payment: o.payment ?? null,
      shipments: shipments.map((s) => ({
        id: s.id, shipmentTypeId: s.shipmentTypeId, shipmentType: label(SHIPMENT_TYPE, s.shipmentTypeId),
        statusId: s.shipmentStatusId, status: '', carrierName: s.carrierName, trackingCode: s.trackingCode,
        estimatedDelivery: s.estimatedDelivery, shippedAt: s.shippedAt, deliveredAt: s.deliveredAt,
      })),
      history: o.history ?? [],
      pickupAtStore: Boolean(o.pickupAtStore),
      shippingQuote: o.shippingQuote ?? null,
    };
  };

  const summary = (o) => ({
    id: o.id, number: numberOf(o), statusId: o.orderStatusId, status: label(ORDER_STATUS, o.orderStatusId),
    paymentStatusId: o.orderPaymentStatusId, paymentStatus: label(PAYMENT_STATUS, o.orderPaymentStatusId),
    totalAmount: o.totalAmount, paymentExpiresAt: o.paymentExpiresAt ?? null, canCustomerCancel: awaitingPayment(o),
    createdAt: o.createdAt,
  });

  // ------------------------------------------------------------- endereço ---

  // Mesma ordem do back: addressId; useProfileAddress (padrão salvo ou cadastro); campos digitados.
  const resolveAddress = (customerId, body) => {
    if (body?.addressId != null && body?.useProfileAddress) {
      return { error: validation({ UseProfileAddress: ['Informe addressId ou useProfileAddress, não os dois.'] }) };
    }
    const saved = addressesOf(customerId);
    if (body?.addressId != null) {
      const address = saved.find((a) => a.id === Number(body.addressId));
      return address ? { address } : { error: problem(404, 'CustomerAddress.NotFound', 'Endereço não encontrado.') };
    }
    if (body?.useProfileAddress) {
      const fallback = data()['store/customers'].find((c) => c.id === customerId);
      const address = saved.find((a) => a.isDefault) ?? fallback;
      if (!address?.addressLine || !address?.city || !address?.zipCode) {
        return { error: problem(400, 'Checkout.AddressRequired', 'Complete o endereço do cadastro ou informe outro.') };
      }
      return { address };
    }
    const errors = {};
    if (!String(body?.shippingAddressLine ?? '').trim()) errors.ShippingAddressLine = ['ShippingAddressLine não pode ser vazio.'];
    if (!String(body?.shippingCity ?? '').trim()) errors.ShippingCity = ['ShippingCity não pode ser vazio.'];
    if (!STATES.some((s) => s.id === Number(body?.shippingStateId))) errors.ShippingStateId = ['ShippingStateId não pode ser vazio.'];
    if (!String(body?.shippingZipCode ?? '').trim()) errors.ShippingZipCode = ['ShippingZipCode não pode ser vazio.'];
    if (Object.keys(errors).length) return { error: validation(errors) };
    return {
      address: {
        addressLine: body.shippingAddressLine.trim(), city: body.shippingCity.trim(),
        stateId: Number(body.shippingStateId), zipCode: body.shippingZipCode.trim(),
      },
    };
  };

  const storeAddress = () => {
    const e = data().enterprise;
    return { addressLine: e.addressLine, city: e.city, stateId: e.stateId, zipCode: e.zipCode };
  };

  // ------------------------------------------------------------------ frete ---

  const purchasable = (customerId) => cart.content(customerId).items
    .filter((i) => i.isSelected && i.availability === 1);

  const addressKey = (a) => `${a.zipCode}|${a.stateId}`;
  const cartKey = (lines) => lines.map((l) => `${l.productVariantId}x${l.quantity}`).join(',');

  function quotes(customerId, body) {
    const { address, error } = resolveAddress(customerId, body);
    if (error) return error;
    const lines = purchasable(customerId);
    if (!lines.length) return problem(400, 'Checkout.NoItemsSelected', 'Selecione ao menos um item do carrinho para finalizar a compra.');
    const units = lines.reduce((sum, l) => sum + l.quantity, 0);
    const expiresAt = new Date(Date.now() + QUOTE_MINUTES * 60_000).toISOString();
    const options = SERVICES.map((s) => {
      const token = `mock-quote-${customerId}-${s.serviceId}-${Date.now().toString(36)}`;
      const price = round(s.base + s.perItem * Math.max(0, units - 1));
      table('store/shipping-quotes')[token] = {
        customerId, serviceId: s.serviceId, serviceName: s.serviceName, carrierName: s.carrierName, price,
        deliveryDays: s.deliveryDays, expiresAt, address: addressKey(address), cart: cartKey(lines),
      };
      return { serviceId: s.serviceId, serviceName: s.serviceName, carrierName: s.carrierName, price, deliveryDays: s.deliveryDays, quoteToken: token };
    });
    return ok({ requiresQuote: true, allowsPickup: Boolean(data().enterprise.allowPickup ?? true), currencyCode: 'BRL', expiresAt, options });
  }

  // --------------------------------------------------------------- checkout ---

  function checkout(customerId, body) {
    const key = String(body?.idempotencyKey ?? '').trim();
    if (!key || key.length > 100 || !/^[A-Za-z0-9_-]+$/.test(key)) {
      return validation({ IdempotencyKey: ['IdempotencyKey aceita apenas letras, números, hífen e sublinhado.'] });
    }
    if (!PAYMENT_METHODS[Number(body?.paymentMethodId)]) return validation({ PaymentMethodId: ['PaymentMethodId inválido.'] });
    if (body?.pickupAtStore && body?.shippingQuoteToken) {
      return validation({ ShippingQuoteToken: ['Retirada e cotação de frete são opções distintas.'] });
    }

    const keys = table('store/checkout-keys');
    const previous = keys[`${customerId}:${key}`];
    if (previous) return ok(detail(orders().find((o) => o.id === previous)));

    const lines = cart.content(customerId).items.filter((i) => i.isSelected);
    if (!lines.length) return problem(400, 'Checkout.NoItemsSelected', 'Selecione ao menos um item do carrinho para finalizar a compra.');
    const blocked = lines.filter((i) => i.availability !== 1);
    if (blocked.length) {
      return problem(409, 'Checkout.ItemsUnavailable', `Itens indisponíveis: ${blocked.map((i) => i.productName).join(', ')}. Atualize o carrinho.`);
    }
    const settings = cart.settings;
    const units = lines.reduce((sum, l) => sum + l.quantity, 0);
    if (settings.maxItemsPerOrder != null && units > settings.maxItemsPerOrder) {
      return problem(400, 'Checkout.MaxItemsExceeded', `O pedido excede o limite de ${settings.maxItemsPerOrder} itens da loja.`);
    }

    let address;
    let freight = null;
    if (body.pickupAtStore) address = storeAddress();
    else {
      const resolved = resolveAddress(customerId, body);
      if (resolved.error) return resolved.error;
      address = resolved.address;
      const token = body.shippingQuoteToken;
      if (!token) return problem(409, 'Checkout.ShippingQuoteRequired', 'Escolha uma cotação de frete para finalizar a compra.');
      freight = table('store/shipping-quotes')[token];
      if (!freight || freight.customerId !== customerId) return problem(409, 'Checkout.ShippingUnavailable', 'A cotação deixou de estar disponível para este pedido.');
      if (Date.parse(freight.expiresAt) <= Date.now()) return problem(409, 'Checkout.ShippingQuoteExpired', 'A cotação expirou. Consulte o frete novamente.');
      if (freight.address !== addressKey(address) || freight.cart !== cartKey(lines)) {
        return problem(409, 'Checkout.ShippingQuoteChanged', 'O carrinho ou o endereço mudou. Consulte o frete novamente.');
      }
    }

    const subTotal = round(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    let discountAmount = 0;
    let coupon = null;
    if (body.couponCode) {
      const preview = cart.previewCoupon(body.couponCode, subTotal);
      if (!preview.isValid) {
        return preview.reasonCode === 'Coupon.NotFound'
          ? problem(404, 'Coupon.NotFound', 'Cupom não encontrado.')
          : problem(400, preview.reasonCode, preview.message);
      }
      discountAmount = preview.discountAmount;
      coupon = data()['store/coupons'].find((c) => c.code.toUpperCase() === preview.code.toUpperCase());
    }
    if (subTotal < settings.minOrderValue) {
      return problem(400, 'Checkout.MinOrderValue', `O valor mínimo para comprar nesta loja é ${settings.minOrderValue.toFixed(2)}.`);
    }

    const now = Date.now();
    const shippingCost = freight?.price ?? 0;
    const totalAmount = round(subTotal - discountAmount + shippingCost);
    const methodId = Number(body.paymentMethodId);
    const expiresAt = new Date(now + 60 * 60_000).toISOString();
    const rows = orders();
    const order = {
      id: nextId(rows), orderNumber: rows.reduce((max, o) => Math.max(max, numberOf(o)), 0) + 1,
      enterpriseId: 1, customerId, couponId: coupon?.id ?? null, orderStatusId: 1, orderPaymentStatusId: 1,
      subTotal, discountAmount, shippingCost, taxAmount: 0, totalAmount,
      shippingAddressLine: address.addressLine, shippingCity: address.city, shippingStateId: address.stateId,
      shippingZipCode: address.zipCode, notes: String(body.notes ?? '').trim(), paymentExpiresAt: expiresAt,
      pickupAtStore: Boolean(body.pickupAtStore), idempotencyKey: key,
      shippingQuote: freight ? {
        provider: 'MelhorEnvio', serviceId: freight.serviceId, serviceName: freight.serviceName,
        carrierName: freight.carrierName, deliveryDays: freight.deliveryDays, volumeCount: 1,
      } : null,
      payment: {
        provider: 'Manual', methodId, method: PAYMENT_METHODS[methodId], statusId: 1, status: 'Pendente',
        amount: totalAmount, reference: '', checkoutUrl: null, instructions: null, expiresAt,
        paidAt: null, refundedAt: null, attempt: null,
      },
      history: [{
        fromStatusId: null, fromStatus: null, toStatusId: 1, toStatus: 'Pendente', fromPaymentStatusId: null,
        toPaymentStatusId: 1, toPaymentStatus: 'Pendente', source: 'Customer', actorId: null, reason: 'Pedido criado', changedAt: nowIso(),
      }],
      isDeleted: false, deletedAt: null, createdAt: nowIso(), updatedAt: null,
    };
    rows.push(order);

    const items = data()['store/order-items'];
    lines.forEach((l) => {
      items.push({
        id: nextId(items), orderId: order.id, productId: l.productId, productVariantId: l.productVariantId, serviceId: null,
        itemName: l.productName, variantName: l.variantName, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice,
        discountAmount: 0, totalPrice: l.lineTotal, createdAt: nowIso(), updatedAt: null,
      });
      // Reserva o saldo até o pagamento ou o cancelamento.
      const variant = catalog.sku(l.productVariantId);
      if (variant) variant.reservedQuantity += l.quantity;
    });
    const transactions = data()['store/transactions'];
    transactions.push({
      id: nextId(transactions), orderId: order.id, customerId, transactionTypeId: 1, transactionMethodId: methodId,
      transactionStatusId: 1, amount: totalAmount, fee: 0, gatewayReference: '', gatewayProvider: 'Manual',
      gatewayPayload: '{}', paidAt: null, refundedAt: null, createdAt: nowIso(), updatedAt: null,
    });
    if (coupon && discountAmount > 0) coupon.usedCount += 1;

    cart.removeItems(lines.map((l) => l.id));
    keys[`${customerId}:${key}`] = order.id;
    return ok(detail(order));
  }

  function cancel(customerId, id, body) {
    const order = orders().find((o) => o.id === id && o.customerId === customerId && !o.isDeleted);
    if (!order) return problem(404, 'Order.NotFound', 'Pedido não encontrado.');
    if (!awaitingPayment(order)) return problem(409, 'Order.NotAwaitingPayment', 'O pedido não está aguardando pagamento.');
    Object.assign(order, { orderStatusId: 6, orderPaymentStatusId: 5, updatedAt: nowIso() });
    if (order.payment) Object.assign(order.payment, { statusId: 5, status: 'Cancelado' });
    order.history = [...(order.history ?? []), {
      fromStatusId: 1, fromStatus: 'Pendente', toStatusId: 6, toStatus: 'Cancelado', fromPaymentStatusId: 1,
      toPaymentStatusId: 5, toPaymentStatus: 'Falhou', source: 'Customer', actorId: null,
      reason: String(body?.reason ?? '').trim() || 'Cancelado pelo cliente', changedAt: nowIso(),
    }];
    // Libera o saldo reservado no checkout.
    itemsOf(order.id).forEach((i) => {
      const variant = i.productVariantId ? catalog.sku(i.productVariantId) : null;
      if (variant) variant.reservedQuantity = Math.max(0, variant.reservedQuantity - i.quantity);
    });
    return ok(detail(order));
  }

  /** @returns resposta ou null se a rota não é de checkout/pedidos */
  function route(method, path, body, who, query) {
    if (!/^(checkout|orders)(\/|$)/.test(path)) return null;
    if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const customerId = who.id;

    if (path === 'checkout/shipping-quotes' && method === 'POST') return quotes(customerId, body);
    if (path === 'checkout' && method === 'POST') return checkout(customerId, body);
    if (path === 'orders' && method === 'GET') {
      const page = Math.max(1, Number(query.get('page') ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize') ?? 20)));
      const mine = orders().filter((o) => o.customerId === customerId && !o.isDeleted)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return ok({ items: mine.slice((page - 1) * pageSize, page * pageSize).map(summary), totalCount: mine.length, page, pageSize });
    }
    const match = path.match(/^orders\/(\d+)(\/cancel)?$/);
    if (!match) return null;
    const id = Number(match[1]);
    if (match[2] && method === 'POST') return cancel(customerId, id, body);
    if (!match[2] && method === 'GET') {
      const order = orders().find((o) => o.id === id && o.customerId === customerId && !o.isDeleted);
      return order ? ok(detail(order)) : problem(404, 'Order.NotFound', 'Pedido não encontrado.');
    }
    return null;
  }

  return { route };
}
