// Dados de exemplo do modo mock, no formato EXATO das entidades do back-end
// (nomes de campo do domínio, ids de status do seed, datas ISO em UTC).
//
// Determinístico: gerador com semente fixa, então dois F5 seguidos mostram os
// mesmos números. As datas são relativas ao momento em que a página abriu, para
// as fases dos drops (inscrição aberta, ao vivo, esgotado) sempre fazerem sentido.
//
// Campos que o back-end AINDA NÃO TEM e que o mock antecipa, conforme a task 19:
//   Product.stockQuantity / Product.stockReserved

const ENTERPRISE_ID = 1;
export const SIGNED_IN_CUSTOMER_ID = 1;
export const SIGNED_IN_EMPLOYEE_ID = 1;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// mulberry32: rápido, determinístico, suficiente para dados de exemplo.
const createRandom = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const round2 = (n) => Math.round(n * 100) / 100;

export function createSeed(now = Date.now()) {
  const random = createRandom(20261028);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const iso = (ms) => new Date(ms).toISOString();
  const digits = (n) => Array.from({ length: n }, () => between(0, 9)).join('');

  const db = {};
  const counters = {};
  const nextId = (key, start = 1) => {
    counters[key] = (counters[key] ?? start - 1) + 1;
    return counters[key];
  };
  const base = (createdAt) => ({ createdAt: iso(createdAt), updatedAt: null });

  // ------------------------------------------------------------ CLIENTES ---
  const FIRST = ['Camila', 'Ana', 'Marcos', 'Júlia', 'Lucas', 'Pedro', 'Carla', 'Rafael', 'Bruno', 'Beatriz',
    'Diego', 'Larissa', 'Tiago', 'Renata', 'Felipe', 'Mariana', 'Gustavo', 'Paula', 'André', 'Lívia'];
  const LAST = ['Duarte', 'Ribeiro', 'Costa', 'Prado', 'Souza', 'Alves', 'Mendes', 'Teixeira', 'Lima', 'Nogueira',
    'Fernandes', 'Gomes', 'Martins', 'Barros', 'Araújo', 'Rocha'];
  const CITIES = [
    ['São Paulo', 25, '01'], ['Campinas', 25, '13'], ['Rio de Janeiro', 19, '20'], ['Belo Horizonte', 13, '30'],
    ['Curitiba', 16, '80'], ['Porto Alegre', 21, '90'], ['Recife', 17, '50'], ['Salvador', 5, '40'],
    ['Florianópolis', 24, '88'], ['Brasília', 7, '70'],
  ];
  const STREETS = ['Rua das Flores', 'Av. Central', 'Rua do Comércio', 'Rua Sete de Setembro', 'Av. das Nações', 'Rua da Paz'];

  const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  db['store/customers'] = Array.from({ length: 60 }, (_, i) => {
    const id = i + 1;
    const fullName = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const [city, stateId, zipPrefix] = CITIES[(i * 3) % CITIES.length];
    const email = `${slugify(fullName).replace('-', '.')}${id > 20 ? id : ''}@exemplo.com`;
    return {
      id,
      enterpriseId: ENTERPRISE_ID,
      fullName,
      email,
      phone: `(${between(11, 99)}) 9${digits(4)}-${digits(4)}`,
      normalizedEmail: email.toUpperCase(),
      emailConfirmed: true,
      addressLine: `${pick(STREETS)}, ${between(10, 1900)}${random() < 0.4 ? `, apto ${between(1, 120)}` : ''}`,
      city,
      stateId,
      zipCode: `${zipPrefix}${digits(3)}-${digits(3)}`,
      country: 'Brasil',
      gender: pick(['Feminino', 'Masculino', 'Outro', 'Prefiro não informar']),
      dateOfBirth: iso(Date.UTC(between(1975, 2006), between(0, 11), between(1, 28))),
      isVerified: random() < 0.75,
      isActive: !(id === 47),
      isDeleted: false,
      deletedAt: null,
      ...base(now - (200 - i * 3) * DAY),
    };
  });
  const customer = (id) => db['store/customers'].find((c) => c.id === id);

  db['store/documents'] = db['store/customers']
    .filter((c) => c.id % 9 !== 4) // alguns clientes sem documento
    .map((c) => {
      const roll = random();
      const statusId = c.id === SIGNED_IN_CUSTOMER_ID ? 2 : c.id === 47 ? 4 : roll < 0.12 ? 2 : roll < 0.16 ? 4 : 3;
      return {
        id: nextId('documents'),
        enterpriseId: ENTERPRISE_ID,
        referenceId: c.id,
        referenceType: 'Customer',
        documentTypeId: 1,
        number: `${digits(3)}.${digits(3)}.${digits(3)}-${digits(2)}`,
        fileUrl: '/documentos/cpf.pdf',
        documentStatusId: statusId,
        issuedAt: iso(now - between(2, 60) * DAY),
        expiresAt: null,
        ...base(now - between(2, 60) * DAY),
      };
    });

  // ------------------------------------------------------------ CATÁLOGO ---
  db['store/categories'] = [
    [1, 'Tênis'], [2, 'Vestuário'], [3, 'Acessórios'], [4, 'Periféricos'],
  ].map(([id, name], i) => ({
    id, enterpriseId: ENTERPRISE_ID, parentCategoryId: null, name, slug: slugify(name),
    description: '', imageUrl: '', displayOrder: i + 1, isActive: true, isDeleted: false, deletedAt: null,
    ...base(now - 300 * DAY),
  }));

  const supplier = (id, companyName, contactName, email, phone, city, stateId, isActive) => ({
    id, enterpriseId: ENTERPRISE_ID, companyName, contactName,
    email: { value: email }, phone: { value: phone },
    addressLine: `${pick(STREETS)}, ${between(10, 900)}`, city, stateId, zipCode: `${digits(5)}-${digits(3)}`,
    country: 'Brasil', isActive, ...base(now - 280 * DAY),
  });
  db['store/suppliers'] = [
    supplier(1, 'Calçados Ribeira Ltda.', 'Paulo Tavares', 'compras@ribeira.com.br', '(16) 3300-1200', 'Franca', 25, true),
    supplier(2, 'Malharia Serra Azul', 'Rita Oliveira', 'rita@serraazul.com.br', '(47) 3200-4455', 'Blumenau', 24, true),
    supplier(3, 'Acessórios Norte', 'Diego Freitas', 'diego@acessoriosnorte.com.br', '(92) 3100-8080', 'Manaus', 4, false),
  ];

  const product = (id, categoryId, supplierId, name, sku, price, stockQuantity, imageUrl, description) => ({
    id, enterpriseId: ENTERPRISE_ID, categoryId, supplierId, name, slug: slugify(name), description,
    sku, barCode: `789${digits(10)}`, price, costPrice: round2(price * 0.45),
    weight: 0.8, height: 12, width: 30, length: 20, brand: 'Veloce', imageUrls: imageUrl,
    isActive: true, isDigital: false, isDeleted: false, deletedAt: null,
    stockQuantity, stockReserved: 0, // task 19 (ainda não existe no back-end)
    ...base(now - 250 * DAY),
  });
  db['store/products'] = [
    product(101, 1, 1, 'Tênis Canvas Hi', 'VLC-TEN-101', 349.90, 42, '/vitrine_cano_alto.jpg', 'Cano alto em lona, biqueira de borracha e solado vulcanizado.'),
    product(102, 1, 1, 'Tênis Court Low', 'VLC-TEN-102', 279.90, 4, '/vitrine_cano_baixo.jpg', 'Cano baixo em camurça e couro, palmilha acolchoada.'),
    product(103, 2, 2, 'Moletom Zip Hoodie', 'VLC-MOL-103', 219.90, 18, '/vitrine_moletom.jpg', 'Moletom flanelado com zíper frontal e capuz com cordão.'),
    product(104, 2, 2, 'Camiseta Oversized Stonewashed', 'VLC-CAM-104', 99.90, 60, '/vitrine_oversized.jpg', 'Algodão de gramatura alta com lavagem estonada.'),
    product(105, 2, 2, 'Calça Cargo Jeans Wide', 'VLC-CAL-105', 259.90, 0, '/vitrine_cargo.jpg', 'Jeans estonado, perna ampla e bolsos cargo.'),
    product(106, 3, 3, 'Boné Destroyed Star', 'VLC-BON-106', 89.90, 25, '/vitrine_bone.jpg', 'Sarja estonada com estrelas aplicadas.'),
    product(107, 3, 3, 'Mochila Classic', 'VLC-MOC-107', 229.90, 9, '/vitrine_mochila.jpg', 'Poliéster resistente e bolso frontal com zíper.'),
    product(108, 4, null, 'Mousepad XL Art', 'VLC-MPD-108', 129.90, 33, '/vitrine_mousepad.jpg', 'Tecido de deslize suave e base antiderrapante.'),
    product(109, 4, null, 'Teclado CyberBoard 75%', 'VLC-TEC-109', 599.90, 0, '/drop_keyboard.jpg', 'Base do drop CyberBoard. Vendido só em drop.'),
  ];

  db['store/services'] = [
    [1, 2, 'Personalização de nome', 29.90, 1440, true],
    [2, 1, 'Higienização de tênis', 59.90, 4320, true],
    [3, 3, 'Embalagem para presente', 12.00, 0, false],
  ].map(([id, categoryId, name, price, durationMinutes, isActive]) => ({
    id, enterpriseId: ENTERPRISE_ID, categoryId, name, description: '', price, durationMinutes, isActive,
    isDeleted: false, deletedAt: null, ...base(now - 200 * DAY),
  }));

  const storeCoupon = (id, code, couponTypeId, discountValue, maxDiscountCap, minOrderValue, maxUses, usedCount, startsAt, expiresAt, isActive) => ({
    id, enterpriseId: ENTERPRISE_ID, code, couponTypeId, discountValue, minOrderValue, maxDiscountCap,
    maxUses, usedCount, isActive, isSingleUse: false, startsAt: iso(startsAt), expiresAt: iso(expiresAt),
    isDeleted: false, deletedAt: null, ...base(startsAt),
  });
  db['store/coupons'] = [
    storeCoupon(1, 'VITRINE15', 1, 15, 60, 0, 500, 142, now - 20 * DAY, now + 25 * DAY, true),
    storeCoupon(2, 'FRETE20', 2, 20, 0, 150, null, 88, now - 10 * DAY, now + 40 * DAY, true),
    storeCoupon(3, 'INVERNO', 1, 20, 0, 0, 300, 300, now - 120 * DAY, now - 90 * DAY, false),
  ];

  // ---------------------------------------------------------------- DROPS ---
  const dropEvent = (id, productId, name, coverImageUrl, price, statusId, requiresRegistration, times, description) => ({
    id, enterpriseId: ENTERPRISE_ID, productId, isDeleted: false, deletedAt: null, name, slug: slugify(name),
    description, coverImageUrl, bannerImageUrl: '', dropEventStatusId: statusId,
    totalUnitsAvailable: 0, unitsReserved: 0, unitsSold: 0, price, requiresRegistration, isPublic: true,
    registrationStartsAt: iso(times.registrationStartsAt), registrationEndsAt: iso(times.registrationEndsAt),
    queueOpensAt: iso(times.queueOpensAt), dropStartsAt: iso(times.dropStartsAt), dropEndsAt: iso(times.dropEndsAt),
    effectiveAppearanceRevisionId: null, ...base(times.registrationStartsAt - 5 * DAY),
  });

  const day4 = now + 4 * DAY;
  db['drop/drop-events'] = [
    dropEvent(1, 101, 'Veloce Cyber Edition S-X1', '/drop_sneaker.jpg', 1299, 2, true, {
      registrationStartsAt: now - 2 * DAY, registrationEndsAt: now + 3 * DAY,
      queueOpensAt: day4 - 15 * MINUTE, dropStartsAt: day4, dropEndsAt: day4 + 2 * HOUR,
    }, 'Edição limitada de 300 pares em quatro numerações.'),
    dropEvent(2, 103, 'Veloce Hype Hoodie V2', '/drop_hoodie.jpg', 499, 6, false, {
      registrationStartsAt: now - 6 * DAY, registrationEndsAt: now - 2 * HOUR,
      queueOpensAt: now - 75 * MINUTE, dropStartsAt: now - 60 * MINUTE, dropEndsAt: now + 60 * MINUTE,
    }, 'Moletom oversized com estamparia termocrômica. Todas as unidades vendidas ou em checkout.'),
    dropEvent(3, 109, 'CyberBoard RGB Keyboard', '/drop_keyboard.jpg', 449.90, 5, false, {
      registrationStartsAt: now - 5 * DAY, registrationEndsAt: now - DAY,
      queueOpensAt: now - 50 * MINUTE, dropStartsAt: now - 35 * MINUTE, dropEndsAt: now + 85 * MINUTE,
    }, 'Teclado mecânico hot-swappable em alumínio anodizado.'),
    dropEvent(4, 102, 'Veloce Court Drop 00', '/vitrine_cano_baixo.jpg', 399, 7, false, {
      registrationStartsAt: now - 20 * DAY, registrationEndsAt: now - 15 * DAY,
      queueOpensAt: now - 14 * DAY - 15 * MINUTE, dropStartsAt: now - 14 * DAY, dropEndsAt: now - 14 * DAY + 2 * HOUR,
    }, 'Primeiro drop da coleção Court.'),
  ];
  const eventById = (id) => db['drop/drop-events'].find((e) => e.id === id);

  const dropProduct = (eventId, productId, sku, unitsAllocated, price) => ({
    id: nextId('drop-products', 30), dropEventId: eventId, productId, sku, unitsAllocated, unitsSold: 0,
    maxPerCustomer: 1, price, isActive: true, isDeleted: false, deletedAt: null, ...base(now - 10 * DAY),
  });
  db['drop/drop-products'] = [
    dropProduct(1, 101, 'VCX-39', 60, 1299), dropProduct(1, 101, 'VCX-40', 80, 1299),
    dropProduct(1, 101, 'VCX-41', 90, 1299), dropProduct(1, 101, 'VCX-42', 70, 1299),
    dropProduct(2, 103, 'HHV2-M', 20, 499), dropProduct(2, 103, 'HHV2-G', 25, 499), dropProduct(2, 103, 'HHV2-GG', 14, 499),
    dropProduct(3, 109, 'CBK-75', 150, 449.90),
    dropProduct(4, 102, 'VCD-UN', 40, 399),
  ];

  const dropCoupon = (eventId, code, typeId, discountValue, maxDiscountCap, maxUses, usedCount, exclusive) => {
    const ev = eventById(eventId);
    return {
      id: nextId('drop-coupons', 40), dropEventId: eventId, code, dropCouponTypeId: typeId, discountValue,
      minOrderValue: 0, maxDiscountCap, maxUses, usedCount, isActive: true, isSingleUse: true,
      isExclusiveToRegistered: exclusive, startsAt: ev.dropStartsAt, expiresAt: ev.dropEndsAt,
      isDeleted: false, deletedAt: null, ...base(now - 7 * DAY),
    };
  };
  db['drop/drop-coupons'] = [
    dropCoupon(1, 'INSCRITO10', 1, 10, 150, 300, 0, true),
    dropCoupon(1, 'VIP50', 2, 50, 0, 20, 0, false),
    dropCoupon(2, 'DROP10', 1, 10, 0, 60, 0, false),
    dropCoupon(3, 'KEYS20', 2, 20, 0, 100, 0, false),
  ];

  // Fila, reserva, pedido, item e transação de cada compra de drop.
  db['drop/queue-entries'] = [];
  db['drop/queue-sessions'] = [];
  db['drop/drop-reservations'] = [];
  db['drop/drop-orders'] = [];
  db['drop/drop-order-items'] = [];
  db['drop/drop-transactions'] = [];

  const queueEntry = (eventId, customerId, position, statusId, enteredAt, extra = {}) => {
    const entry = {
      id: nextId('queue-entries', 20300), dropEventId: eventId, customerId,
      sessionToken: `qs_${digits(12)}`, position, queueEntryStatusId: statusId,
      deviceFingerprint: `fp_${digits(4)}${pick(['a', 'b', 'c', 'e'])}${digits(4)}`,
      ipAddress: `189.${between(10, 220)}.${between(0, 255)}.${between(1, 254)}`,
      userAgent: pick(['Chrome 141 · Windows', 'Safari 19 · iOS', 'Chrome 141 · Android', 'Firefox 140 · macOS']),
      enteredAt: iso(enteredAt), calledAt: null, expiredAt: null, checkedOutAt: null, ...base(enteredAt), ...extra,
    };
    db['drop/queue-entries'].push(entry);
    db['drop/queue-sessions'].push({
      id: nextId('queue-sessions', 900), queueEntryId: entry.id, customerId, token: `tk_${digits(10)}`,
      queueSessionStatusId: statusId <= 3 ? 1 : 2, issuedAt: iso(enteredAt), expiresAt: eventById(eventId).dropEndsAt,
      lastHeartbeatAt: iso(Math.min(now, enteredAt + 20 * MINUTE)), ...base(enteredAt),
    });
    return entry;
  };

  const shippingFor = (c) => ({
    shippingAddressLine: c.addressLine, shippingCity: c.city, shippingZipCode: c.zipCode,
  });

  const purchase = (eventId, customerId, position, dp, at, { orderStatusId, paymentStatusId, coupon }) => {
    const ev = eventById(eventId);
    const c = customer(customerId);
    const entry = queueEntry(eventId, customerId, position, 4, at - 6 * MINUTE, {
      calledAt: iso(at - 3 * MINUTE), checkedOutAt: iso(at),
    });
    const reservation = {
      id: nextId('reservations', 9000), dropEventId: eventId, dropProductId: dp.id, customerId, queueEntryId: entry.id,
      dropReservationStatusId: 2, quantity: 1, unitPrice: dp.price, totalAmount: dp.price, lockToken: `lk_${digits(10)}`,
      reservedAt: iso(at - 3 * MINUTE), expiresAt: iso(at + 2 * MINUTE), confirmedAt: iso(at), cancelledAt: null,
      isDeleted: false, deletedAt: null, ...base(at - 3 * MINUTE),
    };
    db['drop/drop-reservations'].push(reservation);
    const discountAmount = coupon ? round2(coupon.dropCouponTypeId === 1 ? dp.price * coupon.discountValue / 100 : coupon.discountValue) : 0;
    if (coupon) coupon.usedCount += 1;
    const shippingCost = 24.90;
    const order = {
      id: nextId('drop-orders', 48000), dropEventId: eventId, customerId, dropReservationId: reservation.id,
      dropCouponId: coupon?.id ?? null, dropOrderStatusId: orderStatusId, dropOrderPaymentStatusId: paymentStatusId,
      subTotal: dp.price, discountAmount, shippingCost, taxAmount: 0,
      totalAmount: round2(dp.price - discountAmount + shippingCost),
      ...shippingFor(c), shippingState: `${c.stateId}`, notes: '', isDeleted: false, deletedAt: null, ...base(at),
    };
    db['drop/drop-orders'].push(order);
    db['drop/drop-order-items'].push({
      id: nextId('drop-order-items', 70000), dropOrderId: order.id, dropProductId: dp.id,
      itemName: `${ev.name} · ${dp.sku.split('-').pop()}`, sku: dp.sku, quantity: 1, unitPrice: dp.price,
      totalPrice: dp.price, ...base(at),
    });
    const methodId = pick([1, 1, 1, 2, 2, 3]);
    const failed = paymentStatusId === 5;
    db['drop/drop-transactions'].push({
      id: nextId('drop-transactions', 5000), dropOrderId: order.id, customerId, dropTransactionTypeId: 1,
      dropTransactionMethodId: methodId,
      dropTransactionStatusId: failed ? 4 : paymentStatusId === 2 || paymentStatusId === 4 ? 3 : paymentStatusId === 1 ? (methodId === 1 ? 2 : 1) : 3,
      amount: order.totalAmount, fee: methodId === 1 ? round2(order.totalAmount * 0.04) : 0,
      gatewayReference: `${methodId === 1 ? 'ch' : methodId === 2 ? 'pix' : 'bol'}_${digits(6)}`,
      gatewayProvider: methodId === 1 ? 'stripe' : 'pagar.me', gatewayPayload: '{}',
      paidAt: paymentStatusId === 2 || paymentStatusId === 4 ? iso(at + MINUTE) : null, refundedAt: null, ...base(at),
    });
    if (paymentStatusId === 4) {
      db['drop/drop-transactions'].push({
        id: nextId('drop-transactions', 5000), dropOrderId: order.id, customerId, dropTransactionTypeId: 2,
        dropTransactionMethodId: methodId, dropTransactionStatusId: 6, amount: order.totalAmount, fee: 0,
        gatewayReference: `re_${digits(6)}`, gatewayProvider: 'stripe', gatewayPayload: '{}',
        paidAt: null, refundedAt: iso(at + 3 * DAY), ...base(at + 3 * DAY),
      });
    }
    dp.unitsSold += 1;
    return order;
  };

  const productsOf = (eventId) => db['drop/drop-products'].filter((p) => p.dropEventId === eventId);
  const couponOf = (code) => db['drop/drop-coupons'].find((c) => c.code === code);

  // Drop 4 (encerrado há 14 dias): 40 vendidos, alguns já entregues, 1 reembolsado.
  const event4 = eventById(4);
  for (let i = 0; i < 40; i += 1) {
    const at = Date.parse(event4.dropStartsAt) + between(1, 110) * MINUTE;
    const refunded = i === 7;
    purchase(4, i + 1, i + 1, productsOf(4)[0], at, {
      orderStatusId: refunded ? 7 : i % 6 === 0 ? 4 : 5,
      paymentStatusId: refunded ? 4 : 2,
      coupon: null,
    });
  }

  // Drop 2 (esgotado agora): 55 vendidos + 4 reservas ativas = 59 alocados.
  const event2 = eventById(2);
  const hoodieSizes = productsOf(2);
  let position = 1;
  for (let i = 0; i < 55; i += 1) {
    const dp = hoodieSizes.find((p) => p.unitsSold < p.unitsAllocated - (p.sku.endsWith('-M') ? 2 : 1)) ?? hoodieSizes[0];
    const at = Date.parse(event2.dropStartsAt) + between(1, 55) * MINUTE;
    purchase(2, i + 2, position++, dp, at, {
      orderStatusId: i % 9 === 0 ? 3 : 2,
      paymentStatusId: i === 13 ? 5 : i % 11 === 0 ? 1 : 2,
      coupon: i % 3 === 0 ? couponOf('DROP10') : null,
    });
  }
  // Pedido cancelado por falha de pagamento.
  db['drop/drop-orders'].filter((o) => o.dropEventId === 2 && o.dropOrderPaymentStatusId === 5).forEach((o) => { o.dropOrderStatusId = 6; });

  const activeReservation = (eventId, dp, customerId, expiresInMs) => {
    const entry = queueEntry(eventId, customerId, position++, 3, now - 8 * MINUTE, { calledAt: iso(now - 5 * MINUTE + expiresInMs - 5 * MINUTE) });
    db['drop/drop-reservations'].push({
      id: nextId('reservations', 9000), dropEventId: eventId, dropProductId: dp.id, customerId, queueEntryId: entry.id,
      dropReservationStatusId: 1, quantity: 1, unitPrice: dp.price, totalAmount: dp.price, lockToken: `lk_${digits(10)}`,
      reservedAt: iso(now + expiresInMs - 5 * MINUTE), expiresAt: iso(now + expiresInMs), confirmedAt: null, cancelledAt: null,
      isDeleted: false, deletedAt: null, ...base(now + expiresInMs - 5 * MINUTE),
    });
  };
  [[57, 41 * 1000], [58, 135 * 1000], [59, 238 * 1000], [60, 287 * 1000]].forEach(([customerId, ms], i) => {
    activeReservation(2, hoodieSizes[i % hoodieSizes.length], customerId, ms);
  });

  // Drop 3 (ao vivo): 24 vendidos, 3 reservas ativas, fila aguardando, expirados e removidos.
  const event3 = eventById(3);
  const keyboard = productsOf(3)[0];
  position = 1;
  for (let i = 0; i < 24; i += 1) {
    purchase(3, i + 30 > 60 ? i + 1 : i + 30, position++, keyboard, Date.parse(event3.dropStartsAt) + between(1, 30) * MINUTE, {
      orderStatusId: 2, paymentStatusId: i % 8 === 0 ? 1 : 2, coupon: i % 4 === 0 ? couponOf('KEYS20') : null,
    });
  }
  [[20, 52 * 1000], [21, 170 * 1000], [22, 251 * 1000]].forEach(([customerId, ms]) => activeReservation(3, keyboard, customerId, ms));
  [[23, 5], [24, 5], [25, 6], [26, 5], [27, 6]].forEach(([customerId, statusId]) => {
    queueEntry(3, customerId, position++, statusId, now - 30 * MINUTE, {
      calledAt: statusId === 5 ? iso(now - 18 * MINUTE) : null,
      expiredAt: statusId === 5 ? iso(now - 13 * MINUTE) : null,
    });
  });
  for (let customerId = 2; customerId <= 19; customerId += 1) {
    queueEntry(3, customerId, position++, 1, now - between(5, 40) * MINUTE);
  }

  // Estoque do evento = soma das variantes (o back guarda os dois; o painel mostra a das variantes).
  db['drop/drop-events'].forEach((ev) => {
    const dps = productsOf(ev.id);
    ev.totalUnitsAvailable = dps.reduce((s, p) => s + p.unitsAllocated, 0);
    ev.unitsSold = dps.reduce((s, p) => s + p.unitsSold, 0);
    ev.unitsReserved = db['drop/drop-reservations'].filter((r) => r.dropEventId === ev.id && r.dropReservationStatusId === 1).length;
  });

  // Inscrições do drop 1 (exige inscrição). O cliente logado ainda não está inscrito.
  db['drop/drop-registrations'] = Array.from({ length: 34 }, (_, i) => {
    const customerId = i + 2;
    const roll = random();
    const statusId = roll < 0.45 ? 1 : roll < 0.85 ? 2 : roll < 0.93 ? 3 : 4;
    const registeredAt = now - between(10, 2800) * MINUTE;
    return {
      id: nextId('registrations', 600), dropEventId: 1, customerId, dropRegistrationStatusId: statusId,
      isEligible: statusId === 2,
      eligibilityReason: statusId === 3 ? pick(['CPF não validado', 'Conta com sinal de fraude', 'Cadastro incompleto']) : statusId === 1 ? 'Aguardando avaliação de elegibilidade' : '',
      registeredAt: iso(registeredAt), eligibilityCheckedAt: statusId === 1 ? null : iso(registeredAt + 4 * HOUR),
      isDeleted: false, deletedAt: null, ...base(registeredAt),
    };
  });

  // Lista de espera do drop 2 (esgotado).
  db['drop/waitlist-entries'] = Array.from({ length: 14 }, (_, i) => {
    const customerId = i + 3;
    const statusId = i === 0 ? 2 : i === 1 ? 3 : 1;
    const joinedAt = now - (50 - i * 3) * MINUTE;
    return {
      id: nextId('waitlist', 300), dropEventId: 2, dropProductId: hoodieSizes[i % 3].id, customerId, position: i + 1,
      waitlistEntryStatusId: statusId, notificationSent: statusId !== 1, joinedAt: iso(joinedAt),
      notifiedAt: statusId === 2 ? iso(now - 50 * 1000) : statusId === 3 ? iso(now - 25 * MINUTE) : null,
      expiresAt: iso(statusId === 1 ? Date.parse(event2.dropEndsAt) : statusId === 2 ? now + 9 * MINUTE + 12 * 1000 : now - 15 * MINUTE),
      ...base(joinedAt),
    };
  });

  // Sinais de fraude no drop ao vivo.
  const entriesOf3 = db['drop/queue-entries'].filter((e) => e.dropEventId === 3);
  const fraud = (entry, typeId, severityId, description, minutesAgo, review) => ({
    id: nextId('fraud', 880), customerId: entry.customerId, dropEventId: 3, queueEntryId: entry.id,
    fraudSignalTypeId: typeId, fraudSeverityId: severityId, description,
    ipAddress: entry.ipAddress, deviceFingerprint: entry.deviceFingerprint,
    isConfirmed: review === 'blocked' || review === 'confirmed', wasBlocked: review === 'blocked',
    detectedAt: iso(now - minutesAgo * MINUTE), reviewedAt: review ? iso(now - (minutesAgo - 2) * MINUTE) : null,
    ...base(now - minutesAgo * MINUTE),
  });
  const removed = entriesOf3.filter((e) => e.queueEntryStatusId === 6);
  const waiting = entriesOf3.filter((e) => e.queueEntryStatusId === 1);
  // Três entradas com o mesmo dispositivo.
  [waiting[3], waiting[4], waiting[5]].forEach((e) => { e.deviceFingerprint = waiting[3].deviceFingerprint; });
  db['drop/fraud-signals'] = [
    fraud(waiting[3], 2, 3, '3 contas com o mesmo fingerprint em menos de 2 minutos.', 4, null),
    fraud(removed[0], 3, 4, '41 req/s no status da fila.', 2, 'blocked'),
    fraud(waiting[6], 6, 4, 'Checkout iniciado em 1,4 s após a chamada.', 7, null),
    fraud(waiting[7], 1, 3, '5 entradas na fila a partir do mesmo IP.', 9, null),
    fraud(waiting[8], 5, 2, 'Saída de rede em outro país.', 11, 'released'),
    fraud(waiting[9], 4, 3, 'Mesmo CPF em 2 cadastros.', 17, null),
    fraud(removed[1], 1, 1, 'IP compartilhado de rede corporativa.', 24, 'released'),
    fraud(waiting[10], 6, 2, 'Navegação mais rápida que o normal.', 26, null),
  ];

  // ------------------------------------------------------ PEDIDOS VITRINE ---
  db['store/orders'] = [];
  db['store/order-items'] = [];
  db['store/transactions'] = [];
  db['store/shipments'] = [];
  db['store/invoices'] = [];
  const sellable = db['store/products'].filter((p) => p.id !== 109);

  for (let i = 0; i < 150; i += 1) {
    const ageDays = i === 0 ? 0.1 : random() ** 1.4 * 30;
    const at = now - ageDays * DAY - between(0, 600) * MINUTE;
    const customerId = i < 6 ? (i % 2 === 0 ? 1 : between(2, 60)) : between(1, 60);
    const c = customer(customerId);
    const lines = Array.from({ length: between(1, 3) }, () => ({ p: pick(sellable), q: between(1, 2) }));
    const subTotal = round2(lines.reduce((s, l) => s + l.p.price * l.q, 0));
    const coupon = random() < 0.15 ? db['store/coupons'][0] : null;
    const discountAmount = coupon ? Math.min(round2(subTotal * 0.15), coupon.maxDiscountCap) : 0;
    const shippingCost = subTotal >= 400 ? 0 : 20;
    const roll = random();
    let orderStatusId;
    let paymentStatusId;
    if (roll < 0.04) { orderStatusId = 6; paymentStatusId = 5; }
    else if (roll < 0.06) { orderStatusId = 7; paymentStatusId = 4; }
    else if (ageDays < 1) { orderStatusId = pick([1, 2, 3]); paymentStatusId = orderStatusId === 1 ? 1 : 2; }
    else if (ageDays < 6) { orderStatusId = pick([3, 4, 4]); paymentStatusId = 2; }
    else { orderStatusId = 5; paymentStatusId = 2; }
    const order = {
      id: nextId('orders', 10400), enterpriseId: ENTERPRISE_ID, customerId, couponId: coupon?.id ?? null,
      orderStatusId, orderPaymentStatusId: paymentStatusId, subTotal, discountAmount, shippingCost, taxAmount: 0,
      totalAmount: round2(subTotal - discountAmount + shippingCost),
      shippingAddressLine: c.addressLine, shippingCity: c.city, shippingStateId: c.stateId, shippingZipCode: c.zipCode,
      notes: '', isDeleted: false, deletedAt: null, ...base(at),
    };
    db['store/orders'].push(order);
    lines.forEach(({ p, q }) => db['store/order-items'].push({
      id: nextId('order-items', 30000), orderId: order.id, productId: p.id, serviceId: null, itemName: p.name, sku: p.sku,
      quantity: q, unitPrice: p.price, discountAmount: 0, totalPrice: round2(p.price * q), ...base(at),
    }));
    if (random() < 0.12) {
      const service = db['store/services'][0];
      db['store/order-items'].push({
        id: nextId('order-items', 30000), orderId: order.id, productId: null, serviceId: service.id, itemName: service.name,
        sku: `SRV-${service.id}`, quantity: 1, unitPrice: service.price, discountAmount: 0, totalPrice: service.price, ...base(at),
      });
    }
    const methodId = pick([1, 1, 2, 2, 3]);
    db['store/transactions'].push({
      id: nextId('transactions', 7000), orderId: order.id, customerId, transactionTypeId: 1, transactionMethodId: methodId,
      transactionStatusId: paymentStatusId === 5 ? 4 : paymentStatusId === 1 ? (methodId === 1 ? 2 : 1) : 3,
      amount: order.totalAmount, fee: methodId === 1 ? round2(order.totalAmount * 0.04) : 0,
      gatewayReference: `${methodId === 1 ? 'ch' : methodId === 2 ? 'pix' : 'bol'}_${digits(6)}`,
      gatewayProvider: 'pagar.me', gatewayPayload: '{}',
      paidAt: paymentStatusId === 2 || paymentStatusId === 4 ? iso(at + 2 * MINUTE) : null, refundedAt: null, ...base(at),
    });
    if (paymentStatusId === 4) {
      db['store/transactions'].push({
        id: nextId('transactions', 7000), orderId: order.id, customerId, transactionTypeId: 2, transactionMethodId: methodId,
        transactionStatusId: 6, amount: order.totalAmount, fee: 0, gatewayReference: `re_${digits(6)}`,
        gatewayProvider: 'pagar.me', gatewayPayload: '{}', paidAt: null, refundedAt: iso(at + 4 * DAY), ...base(at + 4 * DAY),
      });
    }
    if (orderStatusId >= 4 && orderStatusId <= 5) {
      const express = random() < 0.3;
      db['store/shipments'].push({
        id: nextId('shipments', 4000), orderId: order.id, supplierId: null, shipmentTypeId: express ? 2 : 1,
        carrierName: 'Correios', trackingCode: `Q${pick(['B', 'C', 'D'])}${digits(9)}BR`,
        shipmentStatusId: orderStatusId === 5 ? 5 : 4, shippingCost, addressLine: c.addressLine, city: c.city,
        stateId: c.stateId, zipCode: c.zipCode, country: 'Brasil',
        estimatedDelivery: iso(at + (express ? 3 : 7) * DAY), shippedAt: iso(at + DAY),
        deliveredAt: orderStatusId === 5 ? iso(at + (express ? 2 : 5) * DAY) : null, ...base(at + DAY),
      });
      db['store/invoices'].push({
        id: nextId('invoices', 180), orderId: order.id, customerId, enterpriseId: ENTERPRISE_ID,
        number: String(counters.invoices).padStart(6, '0'), series: '1', accessKey: digits(44), invoiceTypeId: 1,
        invoiceStatusId: 3, totalAmount: order.totalAmount, taxAmount: 0, fileUrl: '/notas/nfe.pdf', issuedAt: iso(at + DAY),
        ...base(at + DAY),
      });
    }
  }
  db['store/coupons'][0].usedCount = 142;

  // --------------------------------------------------------- NOTIFICAÇÕES ---
  const notification = (customerId, eventId, typeId, channelId, statusId, subject, body, at) => ({
    id: nextId('notifications', 1200), dropEventId: eventId, customerId, dropNotificationChannelId: channelId,
    dropNotificationTypeId: typeId, subject, body, dropNotificationStatusId: statusId,
    scheduledAt: iso(at), sentAt: statusId >= 2 ? iso(at) : null, isDeleted: false, deletedAt: null, ...base(at),
  });
  const myDropOrder = db['drop/drop-orders'].find((o) => o.customerId === SIGNED_IN_CUSTOMER_ID);
  db['drop/drop-notifications'] = [
    notification(1, 3, 3, 3, 3, 'É a sua vez no CyberBoard RGB Keyboard', 'Você tem 5 minutos para finalizar. Depois a vaga passa para o próximo.', now - 2 * MINUTE),
    notification(1, 1, 2, 1, 1, 'A fila do Veloce Cyber Edition S-X1 abre em 15 min', 'Deixe a página aberta. Só inscrições elegíveis entram na fila.', day4 - 30 * MINUTE),
    notification(1, 4, 5, 1, 3, `Pedido DRP-${myDropOrder.id} confirmado`, 'Pagamento aprovado. Acompanhe a entrega em Meus pedidos.', Date.parse(myDropOrder.createdAt) + MINUTE),
    notification(1, 4, 4, 3, 3, 'Sua reserva expira em 1 minuto', 'Finalize o checkout para não perder a unidade.', Date.parse(myDropOrder.createdAt) - 2 * MINUTE),
    notification(1, 1, 1, 1, 3, 'Inscrição recebida', 'O resultado da elegibilidade sai antes da abertura da fila.', now - 26 * HOUR),
    notification(1, 2, 6, 1, 3, 'Unidade disponível na lista de espera', 'Veloce Hype Hoodie V2: prazo encerrado.', now - 3 * DAY),
    ...db['drop/drop-registrations'].filter((r) => r.dropRegistrationStatusId === 2).slice(0, 10)
      .map((r) => notification(r.customerId, 1, 2, 1, 1, 'A fila do Veloce Cyber Edition S-X1 abre em 15 min', 'Deixe a página aberta.', day4 - 30 * MINUTE)),
  ];

  // ------------------------------------------------------ EQUIPE E EMPRESA ---
  db['store/departments'] = [[1, 'Operações'], [2, 'Marketing'], [3, 'Suporte']].map(([id, name]) => ({
    id, enterpriseId: ENTERPRISE_ID, name, normalizedName: name.toUpperCase(), description: '', isActive: true, ...base(now - 300 * DAY),
  }));
  db['store/employee-positions'] = [[1, 'Administrador'], [2, 'Gerente de drops'], [3, 'Atendimento'], [4, 'Analista de risco']].map(([id, name]) => ({
    id, enterpriseId: ENTERPRISE_ID, name, normalizedName: name.toUpperCase(), description: '', isActive: true, ...base(now - 300 * DAY),
  }));
  db['store/employees'] = [
    [1, 'Henrique Alves', 1, 1, true, 290], [2, 'Sofia Martins', 2, 2, true, 230],
    [3, 'Renata Barros', 3, 3, true, 110], [4, 'Felipe Araújo', 4, 1, false, 80],
  ].map(([id, fullName, positionId, departmentId, isActive, daysAgo]) => ({
    id, enterpriseId: ENTERPRISE_ID, enterpriseMembershipId: id, fullName, positionId, departmentId, isActive,
    hiredAt: iso(now - daysAgo * DAY), ...base(now - daysAgo * DAY),
  }));
  db['store/enterprise-memberships'] = db['store/employees'].map((e) => ({
    id: e.enterpriseMembershipId, enterpriseId: ENTERPRISE_ID, userId: e.id, kindId: e.id === 1 ? 1 : 3,
    isActive: e.isActive, joinedAt: e.hiredAt,
  }));
  db['store/access-roles'] = [[1, 'Administração'], [2, 'Operação de drops'], [3, 'Atendimento']].map(([id, name]) => ({
    id, enterpriseId: ENTERPRISE_ID, name, normalizedName: name.toUpperCase(), description: '', isActive: true,
  }));
  db['store/invitations'] = [
    { id: 1, email: 'novo.atendente@exemplo.com', kindId: 3, expiresAt: iso(now + 5 * DAY), acceptedAt: null, revokedAt: null },
  ];
  db.enterprise = {
    id: ENTERPRISE_ID, tradeName: 'Veloce Labs', legalName: 'Veloce Comércio de Artigos Esportivos Ltda.',
    email: 'contato@velocelabs.com.br', phone: '(11) 3000-4000', addressLine: 'Av. Paulista, 1000', city: 'São Paulo',
    stateId: 25, zipCode: '01310-100', country: 'Brasil', isActive: true,
  };

  // ------------------------------------------------------------ AUDITORIA ---
  const audit = (eventId, employeeId, customerId, action, entityName, entityId, oldValues, newValues, minutesAgo) => ({
    id: nextId('audit', 3100), dropEventId: eventId, customerId, employeeId, action, entityName, entityId,
    oldValues: oldValues ? JSON.stringify(oldValues) : null, newValues: newValues ? JSON.stringify(newValues) : null,
    ipAddress: employeeId ? '189.40.112.12' : '10.0.0.4', userAgent: employeeId ? 'Chrome 141 · Windows' : 'DropProgressionWorker',
    occurredAt: iso(now - minutesAgo * MINUTE), ...base(now - minutesAgo * MINUTE),
  });
  const removedEntry = removed[0];
  db['drop/drop-audit-logs'] = [
    audit(3, 1, removedEntry.customerId, 'Removeu da fila', 'QueueEntry', removedEntry.id, { queueEntryStatusId: 1, position: removedEntry.position }, { queueEntryStatusId: 6, position: removedEntry.position }, 2),
    audit(3, null, removedEntry.customerId, 'Sinal de fraude detectado', 'FraudSignal', 881, null, { fraudSignalTypeId: 3, fraudSeverityId: 4 }, 2.2),
    audit(3, null, null, 'Mudou a fase para Ativo', 'DropEvent', 3, { dropEventStatusId: 4 }, { dropEventStatusId: 5 }, 35),
    audit(3, 2, null, 'Editou cupom', 'DropCoupon', couponOf('KEYS20').id, { discountValue: 15 }, { discountValue: 20 }, 43),
    audit(3, null, null, 'Abriu a fila', 'DropEvent', 3, { dropEventStatusId: 3 }, { dropEventStatusId: 4 }, 50),
    audit(3, 2, null, 'Alterou estoque alocado', 'DropProduct', keyboard.id, { unitsAllocated: 120 }, { unitsAllocated: 150 }, 95),
    audit(2, null, null, 'Mudou a fase para Esgotado', 'DropEvent', 2, { dropEventStatusId: 5 }, { dropEventStatusId: 6 }, 6),
    audit(2, null, null, 'Mudou a fase para Ativo', 'DropEvent', 2, { dropEventStatusId: 4 }, { dropEventStatusId: 5 }, 60),
    audit(2, 1, null, 'Editou o drop', 'DropEvent', 2, { price: 449 }, { price: 499 }, 3 * 24 * 60),
    audit(1, 2, null, 'Abriu as inscrições', 'DropEvent', 1, { dropEventStatusId: 1 }, { dropEventStatusId: 2 }, 2 * 24 * 60),
    audit(1, 2, null, 'Criou cupom', 'DropCoupon', couponOf('INSCRITO10').id, null, { code: 'INSCRITO10', discountValue: 10 }, 2 * 24 * 60 + 20),
    audit(4, null, null, 'Mudou a fase para Encerrado', 'DropEvent', 4, { dropEventStatusId: 6 }, { dropEventStatusId: 7 }, 14 * 24 * 60 - 120),
  ];

  return db;
}
