import { computed, ref, watch } from 'vue';

// Sacola da vitrine: [{ productId, quantity }]. Estado único da aplicação,
// guardado no navegador por conveniência (sobrevive ao F5). Não vai ao back.
const BAG_KEY = 'veloce_store_bag';

const readBag = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(BAG_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const bag = ref(readBag());

watch(bag, (items) => {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(items));
  } catch {
    /* storage bloqueado: a sacola vale só nesta sessão */
  }
}, { deep: true });

const bagCount = computed(() => bag.value.reduce((sum, i) => sum + i.quantity, 0));

// A vitrine envia só o id (1 unidade); o detalhe envia { productId, quantity }.
const addToBag = (payload) => {
  const { productId, quantity } = typeof payload === 'number' ? { productId: payload, quantity: 1 } : payload;
  const existing = bag.value.find((i) => i.productId === productId);
  if (existing) existing.quantity += quantity;
  else bag.value = [...bag.value, { productId, quantity }];
};

const updateBagQuantity = ({ productId, quantity }) => {
  const item = bag.value.find((i) => i.productId === productId);
  if (item) item.quantity = quantity;
};

const removeFromBag = (productId) => {
  bag.value = bag.value.filter((i) => i.productId !== productId);
};

const clearBag = () => {
  bag.value = [];
};

export function useBag() {
  return { bag, bagCount, addToBag, updateBagQuantity, removeFromBag, clearBag };
}
