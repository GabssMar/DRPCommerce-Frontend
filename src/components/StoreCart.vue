<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { AlertCircle, BellRing, Minus, Package, Plus, ShoppingBag, Trash2 } from '@lucide/vue';
import { MAX_PER_ORDER, useBag } from '../composables/useBag';
import { useAction } from '../composables/useAsync';
import { href } from '../router';
import { brl } from '../services/format';
import LoadState from './ui/LoadState.vue';

// Sacola da vitrine (task 30): carrinho do servidor (storefront/{slug}/cart).
// Preço, disponibilidade, seleção e totais vêm do back; a tela não soma nada.
// Itens que ficaram sem estoque vão para "Precisa da sua decisão" (remover ou
// aguardar reposição) e saem da compra.
const emit = defineEmits(['checkout', 'continue-shopping']);

const {
  cart, couponCode, isLoading, error, migrationNotice,
  loadCart, updateQuantity, removeItems, setSelection, awaitStock, applyCoupon, removeCoupon,
} = useBag();

onMounted(loadCart);

const items = computed(() => cart.value?.items ?? []);
const summary = computed(() => cart.value?.summary ?? null);
const ready = computed(() => items.value.filter((i) => i.availability === 'available'));
const decisions = computed(() => items.value.filter((i) => i.requiresDecision));
const waiting = computed(() => items.value.filter((i) => i.isAwaitingStock && i.availability !== 'available'));

const allSelected = computed(() => ready.value.length > 0 && ready.value.every((i) => i.isSelected));
const someSelected = computed(() => ready.value.some((i) => i.isSelected) && !allSelected.value);

// Erro de uma operação aparece no próprio item (400/409 do back), sem derrubar a tela.
const itemErrors = reactive({});
const busy = ref(null);
const run = async (itemId, operation) => {
  delete itemErrors[itemId];
  busy.value = itemId;
  try {
    await operation();
  } catch (err) {
    itemErrors[itemId] = err?.message ?? 'Não foi possível atualizar o item.';
  } finally {
    busy.value = null;
  }
};

const setQuantity = (item, quantity) => {
  if (quantity < 1 || quantity > Math.max(MAX_PER_ORDER, item.quantity)) return;
  run(item.id, () => updateQuantity(item.id, quantity));
};
const remove = (item) => run(item.id, () => removeItems([item.id]));
const toggle = (item) => run(item.id, () => setSelection([item.id], !item.isSelected));
const wait = (item) => run(item.id, () => awaitStock(item.id));
const adjust = (item) => run(item.id, () => updateQuantity(item.id, item.availableQuantity));

const selectAll = useAction(() => setSelection(null, !allSelected.value));

const reasonOf = (item) => {
  if (item.availability === 'insufficient') {
    return `Só ${item.availableQuantity === 1 ? 'resta 1 unidade' : `restam ${item.availableQuantity} unidades`}; você tem ${item.quantity} na sacola.`;
  }
  if (item.availability === 'out-of-stock') return 'Esgotado no momento.';
  return 'Este produto não está mais à venda.';
};

const detailsOf = (item) => [item.variantLabel, item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ');
const productLink = (item) => (item.productSlug ? href(`/vitrine/p/${item.productSlug}`) : null);

// Cupom: prévia pelo GET cart?couponCode. Não ocupa uso; o desconto é confirmado no pagamento.
const couponInput = ref(couponCode.value);
watch(couponCode, (code) => {
  if (code) couponInput.value = code;
});
const couponMessage = ref('');
const coupon = useAction(async () => {
  couponMessage.value = '';
  const preview = await applyCoupon(couponInput.value);
  if (!preview?.isValid) couponMessage.value = preview?.message ?? 'Cupom inválido.';
});
const clearCoupon = useAction(async () => {
  couponMessage.value = '';
  couponInput.value = '';
  await removeCoupon();
});
const appliedCoupon = computed(() => (summary.value?.coupon?.isValid ? summary.value.coupon : null));
// Cupom aplicado que deixou de valer (mudou a seleção): o back manda o motivo.
const couponWarning = computed(() => (couponCode.value && summary.value?.coupon && !summary.value.coupon.isValid
  ? summary.value.coupon.message : ''));

const blockers = computed(() => {
  const s = summary.value;
  if (!s) return [];
  const list = [];
  if (!s.selectedItems && items.value.length) list.push('Marque ao menos um item para comprar.');
  if (!s.meetsMinOrderValue) list.push(`O pedido mínimo da loja é ${brl(s.minOrderValue)}.`);
  if (!s.withinItemLimit) list.push(`A loja aceita até ${s.maxItemsPerOrder} unidades por pedido.`);
  if (s.hasUnavailableSelectedItems) list.push('Há item marcado que ficou indisponível.');
  return list;
});
</script>

<template>
  <div class="ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <p class="ds-label-caps">
          Loja
        </p>
        <h1 class="ds-title">
          Sacola
        </h1>
      </div>
      <span
        v-if="items.length"
        class="ds-badge"
      >{{ items.length }} {{ items.length === 1 ? 'produto' : 'produtos' }}</span>
    </div>

    <p
      v-if="migrationNotice"
      class="ds-hint"
      role="status"
    >
      <AlertCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      {{ migrationNotice }}
    </p>

    <LoadState
      v-if="!cart && (isLoading || error)"
      class="ds-card"
      :is-loading="isLoading"
      :error="error"
      :lines="5"
      @retry="loadCart"
    />

    <!-- Vazia -->
    <article
      v-else-if="!items.length"
      class="ds-card ds-empty"
    >
      <ShoppingBag
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Sua sacola está vazia.</p>
      <button
        type="button"
        class="ds-btn ds-btn--secondary ds-btn--sm"
        @click="emit('continue-shopping')"
      >
        Ver vitrine
      </button>
    </article>

    <!-- Itens + resumo -->
    <section
      v-else
      class="ds-grid ds-grid--sidebar"
    >
      <div class="ds-stack--6">
        <!-- Precisa da sua decisão -->
        <article
          v-if="decisions.length"
          class="ds-card ds-stack--5"
          aria-labelledby="cart-decisions"
        >
          <header class="ds-stack--1">
            <h2
              id="cart-decisions"
              class="ds-card__title"
            >
              Precisa da sua decisão
            </h2>
            <p class="ds-card__subtitle">
              Estes itens ficaram sem estoque e não entram na compra.
            </p>
          </header>
          <ul
            class="ds-stack--5"
            role="list"
          >
            <li
              v-for="(item, index) in decisions"
              :key="item.id"
              class="ds-stack--3"
            >
              <hr
                v-if="index > 0"
                class="ds-divider"
              >
              <div class="ds-cluster">
                <img
                  v-if="item.imageUrl"
                  class="ds-card__media ds-card__media--product ds-card__media--thumb"
                  :src="item.imageUrl"
                  alt=""
                >
                <div
                  v-else
                  class="ds-card__media ds-card__media--product ds-card__media--thumb ds-card__media--placeholder"
                  aria-hidden="true"
                >
                  <Package
                    :size="16"
                    :stroke-width="1.5"
                  />
                </div>
                <div class="ds-stack--1">
                  <a
                    v-if="productLink(item)"
                    :href="productLink(item)"
                  >{{ item.productName }}</a>
                  <span v-else>{{ item.productName }}</span>
                  <span
                    v-if="detailsOf(item)"
                    class="ds-text-xs ds-text-secondary"
                  >{{ detailsOf(item) }}</span>
                  <span class="ds-text-sm ds-text-warning">{{ reasonOf(item) }}</span>
                </div>
              </div>
              <div class="ds-cluster ds-cluster--2">
                <button
                  v-if="item.availability === 'insufficient' && item.availableQuantity > 0"
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="busy === item.id"
                  @click="adjust(item)"
                >
                  Ajustar para {{ item.availableQuantity }}
                </button>
                <button
                  v-if="item.availability !== 'unavailable'"
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="busy === item.id"
                  @click="wait(item)"
                >
                  <BellRing
                    class="ds-btn__icon"
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  Avisar quando voltar
                </button>
                <button
                  type="button"
                  class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                  :disabled="busy === item.id"
                  @click="remove(item)"
                >
                  Remover
                </button>
              </div>
              <span
                v-if="itemErrors[item.id]"
                class="ds-error"
                role="alert"
              >{{ itemErrors[item.id] }}</span>
            </li>
          </ul>
        </article>

        <!-- Itens disponíveis -->
        <article
          v-if="ready.length"
          class="ds-card ds-stack--5"
          aria-labelledby="cart-items"
        >
          <header class="ds-cluster ds-cluster--between">
            <h2
              id="cart-items"
              class="ds-card__title"
            >
              Itens
            </h2>
            <label class="ds-check">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                :disabled="selectAll.isPending.value"
                @change="selectAll.run()"
              >
              <span>Selecionar todos</span>
            </label>
          </header>
          <span
            v-if="selectAll.error.value"
            class="ds-error"
            role="alert"
          >{{ selectAll.error.value.message }}</span>
          <ul
            class="ds-stack--5"
            role="list"
          >
            <li
              v-for="(item, index) in ready"
              :key="item.id"
              class="ds-stack--3"
            >
              <hr
                v-if="index > 0"
                class="ds-divider"
              >
              <div class="ds-cluster ds-cluster--between">
                <div class="ds-cluster">
                  <input
                    class="ds-checkbox"
                    type="checkbox"
                    :checked="item.isSelected"
                    :disabled="busy === item.id"
                    :aria-label="`Comprar ${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ''}`"
                    @change="toggle(item)"
                  >
                  <img
                    v-if="item.imageUrl"
                    class="ds-card__media ds-card__media--product ds-card__media--thumb"
                    :src="item.imageUrl"
                    alt=""
                  >
                  <div
                    v-else
                    class="ds-card__media ds-card__media--product ds-card__media--thumb ds-card__media--placeholder"
                    aria-hidden="true"
                  >
                    <Package
                      :size="16"
                      :stroke-width="1.5"
                    />
                  </div>
                  <div class="ds-stack--1">
                    <a :href="productLink(item)">{{ item.productName }}</a>
                    <span
                      v-if="detailsOf(item)"
                      class="ds-text-xs ds-text-secondary"
                    >{{ detailsOf(item) }}</span>
                    <span class="ds-text-sm ds-text-secondary ds-numeric">{{ brl(item.unitPrice) }} cada</span>
                    <span
                      v-if="item.backInStock"
                      class="ds-badge ds-badge--success"
                    >Voltou ao estoque</span>
                  </div>
                </div>

                <div class="ds-cluster">
                  <div
                    class="ds-cluster ds-cluster--2"
                    role="group"
                    :aria-label="`Quantidade de ${item.productName}`"
                  >
                    <button
                      type="button"
                      class="ds-icon-btn ds-tap"
                      :aria-label="`Diminuir quantidade de ${item.productName}`"
                      :disabled="item.quantity <= 1 || busy === item.id"
                      @click="setQuantity(item, item.quantity - 1)"
                    >
                      <Minus
                        :size="16"
                        :stroke-width="1.5"
                        aria-hidden="true"
                      />
                    </button>
                    <output class="ds-numeric">{{ item.quantity }}</output>
                    <button
                      type="button"
                      class="ds-icon-btn ds-tap"
                      :aria-label="`Aumentar quantidade de ${item.productName}`"
                      :disabled="item.quantity >= MAX_PER_ORDER || (item.tracksStock && item.quantity >= item.availableQuantity) || busy === item.id"
                      @click="setQuantity(item, item.quantity + 1)"
                    >
                      <Plus
                        :size="16"
                        :stroke-width="1.5"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <span class="ds-numeric">{{ brl(item.lineTotal) }}</span>
                  <button
                    type="button"
                    class="ds-icon-btn ds-icon-btn--ghost ds-tap"
                    :aria-label="`Remover ${item.productName} da sacola`"
                    :disabled="busy === item.id"
                    @click="remove(item)"
                  >
                    <Trash2
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
              <span
                v-if="itemErrors[item.id]"
                class="ds-error"
                role="alert"
              >{{ itemErrors[item.id] }}</span>
            </li>
          </ul>
        </article>

        <!-- Aguardando reposição -->
        <article
          v-if="waiting.length"
          class="ds-card ds-stack--4"
          aria-labelledby="cart-waiting"
        >
          <header class="ds-stack--1">
            <h2
              id="cart-waiting"
              class="ds-card__title"
            >
              Aguardando reposição
            </h2>
            <p class="ds-card__subtitle">
              Ficam guardados aqui, fora da compra. Quando voltarem, aparecem em Itens.
            </p>
          </header>
          <ul
            class="ds-stack--3"
            role="list"
          >
            <li
              v-for="item in waiting"
              :key="item.id"
              class="ds-stack--1"
            >
              <div class="ds-cluster ds-cluster--between">
                <div class="ds-stack--1">
                  <a
                    v-if="productLink(item)"
                    :href="productLink(item)"
                  >{{ item.productName }}</a>
                  <span v-else>{{ item.productName }}</span>
                  <span
                    v-if="detailsOf(item)"
                    class="ds-text-xs ds-text-secondary"
                  >{{ detailsOf(item) }}</span>
                </div>
                <button
                  type="button"
                  class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                  :disabled="busy === item.id"
                  @click="remove(item)"
                >
                  Remover
                </button>
              </div>
              <span
                v-if="itemErrors[item.id]"
                class="ds-error"
                role="alert"
              >{{ itemErrors[item.id] }}</span>
            </li>
          </ul>
        </article>
      </div>

      <aside class="ds-card ds-stack--5">
        <h2 class="ds-card__title">
          Resumo
        </h2>

        <form
          class="ds-field"
          @submit.prevent="coupon.run()"
        >
          <label
            class="ds-label"
            for="cart-coupon"
          >Cupom de desconto</label>
          <div class="ds-input-group">
            <input
              id="cart-coupon"
              v-model="couponInput"
              class="ds-input ds-uppercase"
              autocomplete="off"
              :readonly="Boolean(appliedCoupon)"
              :aria-invalid="couponMessage ? 'true' : undefined"
              aria-describedby="cart-coupon-status"
            >
            <button
              v-if="appliedCoupon"
              type="button"
              class="ds-btn ds-btn--secondary"
              :disabled="clearCoupon.isPending.value"
              @click="clearCoupon.run()"
            >
              Remover
            </button>
            <button
              v-else
              type="submit"
              class="ds-btn ds-btn--secondary"
              :disabled="!couponInput.trim() || coupon.isPending.value"
            >
              Aplicar
            </button>
          </div>
          <span
            id="cart-coupon-status"
            :class="couponMessage || couponWarning || coupon.error.value ? 'ds-error' : 'ds-hint'"
            aria-live="polite"
          >{{ couponMessage || couponWarning || coupon.error.value?.message
            || (appliedCoupon ? 'Prévia do desconto: ele é confirmado no pagamento.' : '') }}</span>
        </form>

        <dl
          v-if="summary"
          class="ds-stack--3"
        >
          <div class="ds-cluster ds-cluster--between">
            <dt class="ds-text-secondary">
              Subtotal ({{ summary.selectedQuantity }} {{ summary.selectedQuantity === 1 ? 'item' : 'itens' }})
            </dt>
            <dd class="ds-numeric">
              {{ brl(summary.subTotal) }}
            </dd>
          </div>
          <div
            v-if="summary.discountAmount"
            class="ds-cluster ds-cluster--between"
          >
            <dt class="ds-text-secondary">
              Cupom {{ appliedCoupon?.code }}
            </dt>
            <dd class="ds-numeric ds-text-success">
              − {{ brl(summary.discountAmount) }}
            </dd>
          </div>
          <div class="ds-cluster ds-cluster--between">
            <dt class="ds-text-secondary">
              Frete
            </dt>
            <dd class="ds-text-secondary">
              no checkout
            </dd>
          </div>
          <hr class="ds-divider">
          <div class="ds-cluster ds-cluster--between">
            <dt>Total</dt>
            <dd class="ds-stat__value ds-numeric">
              {{ brl(summary.total) }}
            </dd>
          </div>
        </dl>

        <p
          v-for="blocker in blockers"
          :key="blocker"
          class="ds-hint"
          role="status"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ blocker }}
        </p>

        <button
          type="button"
          class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
          :disabled="!summary?.canCheckout || isLoading"
          @click="emit('checkout')"
        >
          Finalizar compra
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--block"
          @click="emit('continue-shopping')"
        >
          Continuar comprando
        </button>
      </aside>
    </section>
  </div>
</template>
