import { computed, ref, shallowRef, watch } from 'vue';
import { isSignedIn, REALMS } from '../services/session';
import {
  addCartItem, awaitCartItemStock, clearCart, getCart, removeCartItems, setCartSelection, updateCartItem,
} from '../services/storefront-api';

// Sacola da vitrine (task 30): fachada sobre o carrinho do servidor.
//   - Cliente logado: toda operação chama storefront/{slug}/cart e o estado é o
//     ÚLTIMO carrinho devolvido pelo back. A tela não soma preço nem desconto.
//   - Sem login: lista local [{ productId, variantId, slug, quantity }] no
//     localStorage. No login, cada SKU vai para o servidor (POST cart/items) e a
//     lista local é apagada.
// Os ids das operações do carrinho são do ITEM do carrinho, não do produto.
const LOCAL_KEY = 'veloce_store_bag_v2';

// Limite de unidades por vez na tela. O back aceita até 10.000 por item e confere
// o limite de itens do pedido (configuração da loja) no resumo.
export const MAX_PER_ORDER = 10;

const isValidLocal = (i) => i && Number(i.productId) > 0 && Number(i.variantId) > 0 && i.slug && Number(i.quantity) > 0;

const readLocal = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return Array.isArray(saved) ? saved.filter(isValidLocal) : [];
  } catch {
    return [];
  }
};

const writeLocal = (items) => {
  try {
    if (items.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* storage bloqueado: a sacola local vale só nesta sessão */
  }
};

const local = ref(readLocal());
watch(local, writeLocal, { deep: true });

const cart = shallowRef(null);
const couponCode = ref('');
const isLoading = ref(false);
const error = shallowRef(null);
const migrationNotice = ref('');

const signedIn = computed(() => isSignedIn(REALMS.storefront));

// Operações em fila: a resposta de uma nunca sobrescreve a de outra mais nova.
let queue = Promise.resolve();
const enqueue = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

// As escritas devolvem o carrinho sem a prévia do cupom; com cupom aplicado,
// relê para o desconto e o total virem certos.
const commit = async (next) => {
  cart.value = couponCode.value ? await getCart(couponCode.value) : next;
  error.value = null;
  return cart.value;
};

const loadCart = () => {
  if (!signedIn.value) return Promise.resolve(null);
  if (!cart.value) isLoading.value = true;
  return enqueue(async () => {
    try {
      const loaded = await commit(await getCart(couponCode.value || undefined));
      // Item que pede decisão (esgotou depois de entrar) sai da compra: o back o
      // mantém marcado e bloqueia o checkout até o cliente decidir.
      const blocked = loaded.items.filter((i) => i.requiresDecision && i.isSelected).map((i) => i.id);
      return blocked.length ? await commit(await setCartSelection({ itemIds: blocked, selected: false })) : loaded;
    } catch (err) {
      error.value = err;
      return null;
    } finally {
      isLoading.value = false;
    }
  });
};

// Leva a sacola local para o servidor. SKU que esgotou ou saiu da vitrine não
// entra; o aviso diz quantos ficaram de fora.
const migrateLocal = async () => {
  const pending = [...local.value];
  if (!pending.length) return;
  let failed = 0;
  for (const item of pending) {
    try {
      await addCartItem(item);
    } catch {
      failed += 1;
    }
  }
  local.value = [];
  migrationNotice.value = failed
    ? (failed === 1
      ? '1 item da sacola esgotou ou saiu da vitrine e não foi para o seu carrinho.'
      : `${failed} itens da sacola esgotaram ou saíram da vitrine e não foram para o seu carrinho.`)
    : '';
};

watch(signedIn, (yes) => {
  if (!yes) {
    cart.value = null;
    couponCode.value = '';
    error.value = null;
    return;
  }
  isLoading.value = true;
  enqueue(migrateLocal).finally(loadCart);
}, { immediate: true });

const items = computed(() => (signedIn.value ? cart.value?.items ?? [] : []));

const bagCount = computed(() => (signedIn.value
  ? items.value.reduce((sum, i) => sum + i.quantity, 0)
  : local.value.reduce((sum, i) => sum + i.quantity, 0)));

const quantityOf = (variantId) => (signedIn.value
  ? items.value.find((i) => i.productVariantId === variantId)?.quantity
  : local.value.find((i) => i.variantId === variantId)?.quantity) ?? 0;

const hasProduct = (productId) => (signedIn.value
  ? items.value.some((i) => i.productId === productId)
  : local.value.some((i) => i.productId === productId));

/**
 * Soma ao SKU que já está na sacola. Logado, o back confere estoque e devolve
 * 400 com a mensagem; a promessa rejeita com esse erro.
 * @param {{ productId: number, variantId: number, slug: string, quantity?: number }} item
 */
const addToBag = ({ productId, variantId, slug, quantity = 1 }) => {
  if (!signedIn.value) {
    const existing = local.value.find((i) => i.variantId === variantId);
    if (existing) existing.quantity = Math.min(MAX_PER_ORDER, existing.quantity + quantity);
    else local.value = [...local.value, { productId, variantId, slug, quantity: Math.min(MAX_PER_ORDER, quantity) }];
    return Promise.resolve();
  }
  return enqueue(async () => commit(await addCartItem({ productId, variantId, quantity })));
};

const updateQuantity = (itemId, quantity) => enqueue(async () => commit(await updateCartItem(itemId, quantity)));
const removeItems = (itemIds) => enqueue(async () => commit(await removeCartItems(itemIds)));
const setSelection = (itemIds, selected) => enqueue(async () => commit(await setCartSelection({ itemIds, selected })));
const awaitStock = (itemId) => enqueue(async () => commit(await awaitCartItemStock(itemId)));

const clearBag = () => {
  if (!signedIn.value) {
    local.value = [];
    return Promise.resolve();
  }
  return enqueue(async () => commit(await clearCart()));
};

// Prévia do cupom: GET cart?couponCode (não ocupa uso). Cupom inválido fica
// aplicado só se o back o reconhecer como válido; senão volta a mensagem.
const applyCoupon = (code) => enqueue(async () => {
  const normalized = code.trim().toUpperCase();
  const next = await getCart(normalized);
  const preview = next.summary?.coupon;
  couponCode.value = preview?.isValid ? normalized : '';
  cart.value = preview?.isValid ? next : await getCart();
  return preview;
});

const removeCoupon = () => enqueue(async () => {
  couponCode.value = '';
  cart.value = await getCart();
});

export function useBag() {
  return {
    cart, items, couponCode, isLoading, error, migrationNotice, signedIn,
    bagCount, quantityOf, hasProduct,
    loadCart, addToBag, updateQuantity, removeItems, setSelection, awaitStock, clearBag, applyCoupon, removeCoupon,
  };
}
