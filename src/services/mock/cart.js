// Carrinho do cliente no mock (task 30), com as regras do back (Cart, CartItem e
// CartResponseBuilder):
//   - um carrinho por cliente; o item é um SKU; adicionar soma no mesmo SKU e seleciona;
//   - só entra SKU disponível para a quantidade total (sem reserva de estoque);
//   - aumentar a quantidade exige estoque; diminuir é sempre aceito;
//   - availability: 1 disponível, 2 estoque insuficiente, 3 esgotado, 4 indisponível;
//   - requiresDecision = não disponível e não aguardando; backInStock = disponível e aguardando;
//   - totais só dos itens selecionados e disponíveis; prévia do cupom só no GET.
const MAX_DISTINCT_ITEMS = 500;
const MAX_QUANTITY_PER_ITEM = 10_000;
const AVAILABLE = 1;
const INSUFFICIENT = 2;
const OUT_OF_STOCK = 3;
const UNAVAILABLE = 4;

// Configurações comerciais da loja de exemplo (StoreSettings).
const SETTINGS = { currencyCode: 'BRL', allowBackorder: false, minOrderValue: 0, maxItemsPerOrder: 30 };

const round = (value) => Math.round(value * 100) / 100;

export function createCartMock({ data, ok, problem, catalog }) {
  const carts = () => {
    const d = data();
    if (!d['store/cart-items']) {
      d['store/cart-items'] = [];
      // Cliente de exemplo (id 1) começa com um item normal e dois que pedem decisão,
      // para a tela mostrar os três casos.
      const seed = (productId, attributes, quantity) => {
        const product = catalog.productOf(productId);
        const variant = data()['store/product-variants']?.find((v) => v.productId === productId
          && Object.entries(attributes).every(([k, value]) => v.attributes[k] === value));
        if (product && variant) {
          d['store/cart-items'].push({
            id: d['store/cart-items'].length + 1, customerId: 1, productId, productVariantId: variant.id,
            quantity, isSelected: true, isAwaitingStock: false,
          });
        }
      };
      catalog.sku(0); // garante a tabela de SKUs criada
      seed(104, { Tamanho: 'M' }, 2);
      seed(101, { Tamanho: '40', Cor: 'Off-white' }, 1);
      seed(102, { Tamanho: '39' }, 2);
    }
    return d['store/cart-items'];
  };

  const mine = (customerId) => carts().filter((i) => i.customerId === customerId);
  const nextId = () => carts().reduce((max, i) => Math.max(max, i.id), 0) + 1;

  const evaluate = (product, variant, quantity) => {
    if (!product || !variant || product.isDeleted || !product.isActive || !catalog.isVisible(product)
      || variant.isDeleted || !variant.isActive || (catalog.hasVariants(product) && variant.isDefault)) return UNAVAILABLE;
    const free = catalog.available(variant);
    if (product.isDigital || SETTINGS.allowBackorder || free >= quantity) return AVAILABLE;
    return free === 0 ? OUT_OF_STOCK : INSUFFICIENT;
  };

  const availabilityOf = (item) => evaluate(catalog.productOf(item.productId), catalog.sku(item.productVariantId), item.quantity);

  // Mesmas regras de Coupon.Evaluate que a tela precisa ver.
  const previewCoupon = (rawCode, subTotal) => {
    const code = String(rawCode).trim().toUpperCase();
    const coupon = data()['store/coupons'].find((c) => !c.isDeleted && c.code.toUpperCase() === code);
    const fail = (reasonCode, message) => ({ code, isValid: false, discountAmount: 0, reasonCode, message });
    if (!coupon) return fail('Coupon.NotFound', 'Cupom não encontrado.');
    const now = Date.now();
    if (!coupon.isActive) return fail('Coupon.Inactive', 'Cupom inativo.');
    if (now < Date.parse(coupon.startsAt) || now > Date.parse(coupon.expiresAt)) return fail('Coupon.Expired', 'Cupom fora da validade.');
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return fail('Coupon.UsageLimitReached', 'Cupom esgotado.');
    if (subTotal <= 0) return fail('Coupon.EmptyCart', 'Selecione itens para usar o cupom.');
    if (subTotal < coupon.minOrderValue) {
      return fail('Coupon.MinOrderValue', `Cupom válido a partir de R$ ${coupon.minOrderValue.toFixed(2).replace('.', ',')}.`);
    }
    const raw = coupon.couponTypeId === 1 ? (subTotal * coupon.discountValue) / 100 : coupon.discountValue;
    const capped = coupon.maxDiscountCap > 0 ? Math.min(raw, coupon.maxDiscountCap) : raw;
    return { code: coupon.code, isValid: true, discountAmount: round(Math.min(capped, subTotal)), reasonCode: null, message: null };
  };

  const content = (customerId, couponCode) => {
    const items = mine(customerId).sort((a, b) => b.id - a.id).map((item) => {
      const product = catalog.productOf(item.productId);
      const variant = catalog.sku(item.productVariantId);
      const availability = availabilityOf(item);
      const unitPrice = variant?.price ?? product?.price ?? 0;
      return {
        id: item.id, productId: item.productId, productVariantId: item.productVariantId,
        productName: product?.name ?? 'Produto indisponível', productSlug: product?.slug ?? '',
        variantName: variant?.name ?? '', variantAttributesJson: JSON.stringify(variant?.attributes ?? {}),
        sku: variant?.sku ?? '', imageUrls: product?.imageUrls ?? '', unitPrice, quantity: item.quantity,
        lineTotal: round(unitPrice * item.quantity), availableQuantity: variant ? catalog.available(variant) : 0,
        tracksStock: !product?.isDigital, availability, isSelected: item.isSelected, isAwaitingStock: item.isAwaitingStock,
        requiresDecision: availability !== AVAILABLE && !item.isAwaitingStock,
        backInStock: availability === AVAILABLE && item.isAwaitingStock,
      };
    });
    const purchasable = items.filter((i) => i.isSelected && i.availability === AVAILABLE);
    const subTotal = round(purchasable.reduce((sum, i) => sum + i.lineTotal, 0));
    const quantity = purchasable.reduce((sum, i) => sum + i.quantity, 0);
    const hasBlocked = items.some((i) => i.isSelected && i.availability !== AVAILABLE);
    const coupon = couponCode ? previewCoupon(couponCode, subTotal) : null;
    const discount = coupon?.isValid ? coupon.discountAmount : 0;
    const meetsMin = subTotal >= SETTINGS.minOrderValue;
    const withinLimit = SETTINGS.maxItemsPerOrder == null || quantity <= SETTINGS.maxItemsPerOrder;
    return {
      id: items.length ? customerId : null,
      currencyCode: SETTINGS.currencyCode,
      items,
      totalItems: items.length,
      itemsRequiringDecision: items.filter((i) => i.requiresDecision).length,
      summary: {
        selectedItems: purchasable.length, selectedQuantity: quantity, subTotal, discountAmount: discount,
        total: round(subTotal - discount), minOrderValue: SETTINGS.minOrderValue, meetsMinOrderValue: meetsMin,
        maxItemsPerOrder: SETTINGS.maxItemsPerOrder, withinItemLimit: withinLimit, hasUnavailableSelectedItems: hasBlocked,
        canCheckout: purchasable.length > 0 && !hasBlocked && meetsMin && withinLimit, coupon,
      },
    };
  };

  const build = (customerId, couponCode) => ok(content(customerId, couponCode));

  const badRequest = (message) => problem(400, 'Validation', message);
  const notInCart = () => problem(404, 'CartItem.NotFound', 'Item não encontrado no carrinho.');
  const stockMessage = (variant) => `Estoque insuficiente: há ${catalog.available(variant)} unidade(s) disponível(is) deste SKU.`;

  function add(customerId, body) {
    const quantity = Number(body?.quantity);
    if (!(Number(body?.productId) > 0)) return badRequest('ProductId deve ser maior que zero.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      return badRequest(`Quantity deve estar entre 1 e ${MAX_QUANTITY_PER_ITEM}.`);
    }
    const product = catalog.productOf(Number(body.productId));
    if (!product || !product.isActive || product.isDeleted || !catalog.isVisible(product)) {
      return problem(404, 'Product.NotFound', 'Produto não encontrado.');
    }
    const variantId = body.productVariantId == null ? null : Number(body.productVariantId);
    const variant = variantId
      ? (catalog.sku(variantId)?.productId === product.id ? catalog.sku(variantId) : null)
      : data()['store/product-variants'].find((v) => v.productId === product.id && v.isDefault && !catalog.hasVariants(product));
    if (!variant) {
      return problem(400, 'ProductVariant.Required', catalog.hasVariants(product) ? 'Selecione uma variante do produto.' : 'SKU não pertence ao produto.');
    }
    const existing = mine(customerId).find((i) => i.productVariantId === variant.id);
    const total = quantity + (existing?.quantity ?? 0);
    if (total > MAX_QUANTITY_PER_ITEM) return badRequest(`A quantidade de um item no carrinho não pode passar de ${MAX_QUANTITY_PER_ITEM}.`);
    if (!existing && mine(customerId).length >= MAX_DISTINCT_ITEMS) {
      return badRequest(`O carrinho aceita no máximo ${MAX_DISTINCT_ITEMS} produtos diferentes.`);
    }
    const availability = evaluate(product, variant, total);
    if (availability === UNAVAILABLE) return badRequest('Produto ou SKU indisponível para venda.');
    if (availability === OUT_OF_STOCK) return badRequest('Produto esgotado.');
    if (availability === INSUFFICIENT) return badRequest(stockMessage(variant));
    if (existing) Object.assign(existing, { quantity: total, isSelected: true, isAwaitingStock: false });
    else {
      carts().push({
        id: nextId(), customerId, productId: product.id, productVariantId: variant.id, quantity, isSelected: true, isAwaitingStock: false,
      });
    }
    return build(customerId);
  }

  /** @returns resposta ou null se a rota não é do carrinho */
  function route(method, path, body, who, query) {
    if (path !== 'cart' && !path.startsWith('cart/')) return null;
    if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const customerId = who.id;
    const find = (id) => mine(customerId).find((i) => i.id === Number(id));

    if (path === 'cart' && method === 'GET') {
      let code = null;
      for (const [key, value] of query) if (key.toLowerCase() === 'couponcode') code = value;
      return build(customerId, code?.trim() || null);
    }
    if (path === 'cart' && method === 'DELETE') {
      mine(customerId).forEach((i) => carts().splice(carts().indexOf(i), 1));
      return build(customerId);
    }
    if (path === 'cart/items' && method === 'POST') return add(customerId, body);
    if (path === 'cart/items' && method === 'DELETE') {
      const ids = (Array.isArray(body) ? body : []).map(Number);
      if (!ids.length) return badRequest('Informe ao menos um item.');
      if (ids.some((id) => !find(id))) return notInCart();
      ids.forEach((id) => carts().splice(carts().indexOf(find(id)), 1));
      return build(customerId);
    }
    if (path === 'cart/selection' && method === 'PUT') {
      const ids = (body?.itemIds ?? []).map(Number);
      const selected = Boolean(body?.selected);
      if (!ids.length) {
        mine(customerId).forEach((i) => {
          if (!selected) i.isSelected = false;
          else if (availabilityOf(i) === AVAILABLE) Object.assign(i, { isSelected: true, isAwaitingStock: false });
        });
        return build(customerId);
      }
      if (ids.some((id) => !find(id))) return notInCart();
      if (selected) {
        const blocked = ids.map(find).find((i) => availabilityOf(i) !== AVAILABLE);
        if (blocked) return badRequest(`O item ${blocked.id} não está disponível para compra. Remova, ajuste a quantidade ou aguarde o estoque.`);
      }
      ids.map(find).forEach((i) => Object.assign(i, selected ? { isSelected: true, isAwaitingStock: false } : { isSelected: false }));
      return build(customerId);
    }

    const match = path.match(/^cart\/items\/(\d+)(\/await-stock)?$/);
    if (!match) return null;
    const item = find(match[1]);
    if (!item) return notInCart();

    if (match[2] && method === 'PUT') {
      if (availabilityOf(item) === AVAILABLE) return badRequest('O item está disponível; não é preciso aguardar estoque.');
      Object.assign(item, { isAwaitingStock: true, isSelected: false });
      return build(customerId);
    }
    if (!match[2] && method === 'PUT') {
      const quantity = Number(body?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
        return badRequest(`Quantity deve estar entre 1 e ${MAX_QUANTITY_PER_ITEM}.`);
      }
      const variant = catalog.sku(item.productVariantId);
      if (quantity > item.quantity && evaluate(catalog.productOf(item.productId), variant, quantity) !== AVAILABLE) {
        return badRequest(stockMessage(variant));
      }
      item.quantity = quantity;
      return build(customerId);
    }
    if (!match[2] && method === 'DELETE') {
      carts().splice(carts().indexOf(item), 1);
      return build(customerId);
    }
    return null;
  }

  // Usado pelo checkout do mock (task 32): o pedido compra os itens marcados.
  const removeItems = (ids) => ids.forEach((id) => {
    const index = carts().findIndex((i) => i.id === id);
    if (index >= 0) carts().splice(index, 1);
  });

  return { route, content, previewCoupon, removeItems, settings: SETTINGS };
}
