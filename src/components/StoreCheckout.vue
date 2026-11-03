<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle, Info, Package, ShoppingBag } from '@lucide/vue';
import { useAsync, useAction } from '../composables/useAsync';
import { useBag } from '../composables/useBag';
import { href } from '../router';
import { isSignedIn, REALMS } from '../services/session';
import { couponDiscount, findStoreCoupon, getMe, listStoreProducts, placeStoreOrder } from '../services/client-api';
import { STATES } from '../services/status';
import { brl, initials, storeOrderCode } from '../services/format';
import LoadState from './ui/LoadState.vue';
import StepsBar from './ui/StepsBar.vue';

// C10 · Checkout da vitrine. Rotas: GET storefront/me, GET storefront/products,
// GET coupons/get-all (cupom), POST orders/add -> order-items/add-range ->
// transactions/add -> PUT coupons/update (usedCount + 1).
const { bag, clearBag } = useBag();
const signedIn = computed(() => isSignedIn(REALMS.storefront));

const page = useAsync(async () => {
  const [products, me] = await Promise.all([listStoreProducts(), signedIn.value ? getMe() : null]);
  return { products, me };
});

const me = computed(() => page.data.value?.me ?? null);

// Linhas da sacola com o preço ATUAL do catálogo. Produto que sumiu do catálogo
// (desativado) aparece com aviso e fica fora do pedido.
const lines = computed(() => bag.value.map((item) => {
  const product = page.data.value?.products.find((p) => p.id === item.productId);
  return {
    productId: item.productId,
    quantity: item.quantity,
    product,
    name: product?.name ?? `Produto #${item.productId}`,
    sku: product?.slug ?? '',
    unitPrice: product?.price ?? 0,
    imageUrl: product?.imageUrls?.split(',')[0] ?? '',
    unavailable: !product,
  };
}));
const payableLines = computed(() => lines.value.filter((l) => !l.unavailable));
const unavailableLines = computed(() => lines.value.filter((l) => l.unavailable));
const itemCount = computed(() => payableLines.value.reduce((s, l) => s + l.quantity, 0));
const subTotal = computed(() => payableLines.value.reduce((s, l) => s + l.unitPrice * l.quantity, 0));

// Entrega
const SHIPPING = [
  { id: 'normal', label: 'Normal · 5 a 7 dias', cost: 20 },
  { id: 'express', label: 'Expresso · 2 dias', cost: 34.9 },
];
const shippingId = ref('normal');
const shipping = computed(() => SHIPPING.find((s) => s.id === shippingId.value));

const address = reactive({ addressLine: '', zipCode: '', city: '', stateId: 25 });
const editingAddress = ref(false);
watch(me, (customer) => {
  if (!customer) return;
  Object.assign(address, {
    addressLine: customer.addressLine, zipCode: customer.zipCode, city: customer.city, stateId: customer.stateId,
  });
}, { immediate: true });
const addressComplete = computed(() => Boolean(address.addressLine && address.zipCode && address.city && address.stateId));

// Pagamento
const METHODS = [
  { id: 2, label: 'Pix', cta: 'Pagar com Pix', info: 'O QR Code aparece depois de confirmar. O pedido fica como "Pagamento pendente" até o Pix ser compensado.' },
  { id: 1, label: 'Cartão de crédito', cta: 'Pagar com cartão', info: 'Os dados do cartão são pedidos pelo provedor de pagamento depois de confirmar. Não guardamos o número do cartão.' },
  { id: 3, label: 'Boleto', cta: 'Gerar boleto', info: 'O boleto vence em 2 dias úteis. O pedido só é separado depois da compensação.' },
];
const methodId = ref(2);
const method = computed(() => METHODS.find((m) => m.id === methodId.value));

// Cupom
const couponCode = ref('');
const coupon = ref(null);
const couponError = ref('');
const applyCoupon = useAction(async () => {
  couponError.value = '';
  const result = await findStoreCoupon(couponCode.value, subTotal.value);
  coupon.value = result.coupon;
  couponError.value = result.error;
});
const discount = computed(() => couponDiscount(coupon.value, subTotal.value));
const couponHint = computed(() => {
  if (!coupon.value) return '';
  const what = coupon.value.couponTypeId === 1 ? `${coupon.value.discountValue}% de desconto` : `${brl(coupon.value.discountValue)} de desconto`;
  return coupon.value.maxDiscountCap > 0 ? `${what} aplicado (até ${brl(coupon.value.maxDiscountCap)}).` : `${what} aplicado.`;
});
const total = computed(() => Math.max(0, subTotal.value - discount.value) + shipping.value.cost);

// Confirmação
const confirmed = ref(null);
const currentStep = computed(() => (confirmed.value ? 2 : addressComplete.value && !editingAddress.value ? 1 : 0));

const pay = useAction(async () => {
  const order = await placeStoreOrder({
    customer: me.value,
    lines: payableLines.value,
    coupon: coupon.value,
    shipping: shipping.value,
    address: { ...address, stateId: Number(address.stateId) },
    methodId: methodId.value,
  });
  confirmed.value = { order, method: method.value };
  clearBag();
});
</script>

<template>
  <div class="ds-stack--6">
    <div class="ds-stack--2">
      <a
        class="ds-back-link"
        :href="href('/sacola')"
      >
        <ArrowLeft
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Voltar para a sacola
      </a>
      <h1 class="ds-title ds-title--lg">
        Finalizar compra
      </h1>
    </div>

    <StepsBar
      label="Etapas da compra"
      :steps="[{ label: '1 · Entrega' }, { label: '2 · Pagamento' }, { label: '3 · Confirmação' }]"
      :current="currentStep"
      :complete="Boolean(confirmed)"
    />

    <!-- Pedido criado -->
    <article
      v-if="confirmed"
      class="ds-card ds-animate-in ds-stack--5"
      aria-live="polite"
    >
      <header class="ds-card__header">
        <div class="ds-stack--1">
          <h2 class="ds-card__title">
            Pedido recebido
          </h2>
          <p class="ds-card__subtitle">
            Número <span class="ds-mono">{{ storeOrderCode(confirmed.order.id) }}</span>
          </p>
        </div>
        <span class="ds-badge ds-badge--scheduled">
          <span
            class="ds-badge__dot"
            aria-hidden="true"
          />
          Pagamento pendente
        </span>
      </header>
      <p class="ds-text-sm ds-prose">
        {{ confirmed.method.info }}
      </p>
      <dl class="ds-dl">
        <dt>Total</dt>
        <dd>{{ brl(confirmed.order.totalAmount) }}</dd>
      </dl>
      <div class="ds-cluster ds-cluster--2">
        <a
          class="ds-btn ds-btn--primary"
          :href="href(`/conta/pedidos/store/${confirmed.order.id}`)"
        >Acompanhar pedido</a>
        <a
          class="ds-btn ds-btn--secondary"
          :href="href('/vitrine')"
        >Continuar comprando</a>
      </div>
    </article>

    <LoadState
      v-else
      :is-loading="page.isLoading.value"
      :error="page.error.value"
      :lines="6"
      @retry="page.reload"
    >
      <!-- Sem login -->
      <article
        v-if="!signedIn"
        class="ds-card ds-empty"
      >
        <ShoppingBag
          :size="24"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <p>Entre na sua conta para finalizar a compra. Sua sacola fica guardada.</p>
        <a
          class="ds-btn ds-btn--primary ds-btn--sm"
          :href="href('/conta')"
        >Entrar ou criar conta</a>
      </article>

      <!-- Sacola vazia -->
      <article
        v-else-if="!lines.length"
        class="ds-card ds-empty"
      >
        <ShoppingBag
          :size="24"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <p>Sua sacola está vazia.</p>
        <a
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :href="href('/vitrine')"
        >Ver vitrine</a>
      </article>

      <form
        v-else
        class="ds-grid ds-grid--sidebar"
        @submit.prevent="pay.run()"
      >
        <div class="ds-stack--6">
          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Entrega
              </h2>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                :aria-expanded="editingAddress"
                aria-controls="checkout-address"
                @click="editingAddress = !editingAddress"
              >
                {{ editingAddress ? 'Concluir' : 'Alterar' }}
              </button>
            </header>
            <div class="ds-cluster ds-cluster--2">
              <span
                class="ds-avatar"
                aria-hidden="true"
              >{{ initials(me?.fullName) }}</span>
              <span class="ds-stack--1 ds-min-0">
                <span>{{ me?.fullName }}</span>
                <span class="ds-text-xs ds-text-secondary">{{ me?.email }} · {{ me?.phone }}</span>
              </span>
            </div>

            <div
              v-if="editingAddress || !addressComplete"
              id="checkout-address"
              class="ds-grid ds-grid--2"
            >
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="sc-addr"
                >Endereço</label>
                <input
                  id="sc-addr"
                  v-model="address.addressLine"
                  class="ds-input"
                  autocomplete="street-address"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="sc-zip"
                >CEP</label>
                <input
                  id="sc-zip"
                  v-model="address.zipCode"
                  class="ds-input"
                  inputmode="numeric"
                  autocomplete="postal-code"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="sc-city"
                >Cidade</label>
                <input
                  id="sc-city"
                  v-model="address.city"
                  class="ds-input"
                  autocomplete="address-level2"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="sc-uf"
                >UF</label>
                <select
                  id="sc-uf"
                  v-model.number="address.stateId"
                  class="ds-input"
                  required
                >
                  <option
                    v-for="state in STATES"
                    :key="state.id"
                    :value="state.id"
                  >
                    {{ state.uf }} · {{ state.name }}
                  </option>
                </select>
              </div>
            </div>
            <p
              v-else
              class="ds-text-sm ds-text-secondary"
            >
              {{ address.addressLine }} · {{ address.city }}, {{ STATES.find((s) => s.id === address.stateId)?.uf }} · {{ address.zipCode }}
            </p>

            <fieldset class="ds-stack--2">
              <legend class="ds-label">
                Modalidade
              </legend>
              <div class="ds-grid ds-grid--2">
                <label
                  v-for="option in SHIPPING"
                  :key="option.id"
                  class="ds-check ds-check--card"
                >
                  <span class="ds-cluster ds-cluster--2">
                    <input
                      v-model="shippingId"
                      type="radio"
                      name="sc-ship"
                      :value="option.id"
                    >
                    {{ option.label }}
                  </span>
                  <span class="ds-numeric">{{ brl(option.cost) }}</span>
                </label>
              </div>
            </fieldset>
          </article>

          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Pagamento
              </h2>
            </header>
            <div
              class="ds-nav"
              role="radiogroup"
              aria-label="Forma de pagamento"
            >
              <button
                v-for="option in METHODS"
                :key="option.id"
                type="button"
                :class="['ds-nav__item', { 'ds-nav__item--active': methodId === option.id }]"
                role="radio"
                :aria-checked="methodId === option.id"
                @click="methodId = option.id"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="ds-card ds-card--sunken ds-card--tight ds-cluster ds-cluster--2 ds-align-start">
              <Info
                :size="20"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              <p class="ds-text-sm ds-grow">
                {{ method.info }}
              </p>
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="sc-coupon"
              >Cupom</label>
              <div class="ds-input-group">
                <input
                  id="sc-coupon"
                  v-model="couponCode"
                  class="ds-input ds-uppercase"
                  autocomplete="off"
                  :aria-invalid="couponError ? 'true' : undefined"
                  aria-describedby="sc-coupon-status"
                >
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary"
                  :disabled="!couponCode.trim() || applyCoupon.isPending.value"
                  @click="applyCoupon.run()"
                >
                  Aplicar
                </button>
              </div>
              <span
                id="sc-coupon-status"
                :class="couponError ? 'ds-error' : 'ds-hint ds-text-success'"
                aria-live="polite"
              >{{ couponError || couponHint || applyCoupon.error.value?.message }}</span>
            </div>
          </article>
        </div>

        <aside class="ds-stack--6">
          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Resumo
              </h2>
              <span class="ds-text-xs ds-text-secondary">{{ itemCount }} {{ itemCount === 1 ? 'item' : 'itens' }}</span>
            </header>
            <ul class="ds-stack--3 ds-list-reset">
              <li
                v-for="line in lines"
                :key="line.productId"
                class="ds-cluster ds-cluster--between"
              >
                <span class="ds-cluster ds-cluster--2 ds-min-0">
                  <img
                    v-if="line.imageUrl"
                    class="ds-card__media ds-card__media--thumb ds-card__media--product ds-card__media--sm"
                    :src="line.imageUrl"
                    alt=""
                  >
                  <span
                    v-else
                    class="ds-icon-tile ds-icon-tile--lg ds-icon-tile--square"
                    aria-hidden="true"
                  >
                    <Package
                      :size="20"
                      :stroke-width="1.5"
                    />
                  </span>
                  <span class="ds-stack--1">
                    <span class="ds-text-sm">{{ line.name }}</span>
                    <span
                      v-if="line.unavailable"
                      class="ds-text-xs ds-text-danger"
                    >Indisponível: fica fora do pedido</span>
                    <span
                      v-else
                      class="ds-text-xs ds-text-secondary"
                    >{{ line.quantity }} × {{ brl(line.unitPrice) }}</span>
                  </span>
                </span>
                <span :class="['ds-numeric', 'ds-text-sm', { 'ds-text-strike ds-text-secondary': line.unavailable }]">
                  {{ brl(line.unitPrice * line.quantity) }}
                </span>
              </li>
            </ul>
            <hr class="ds-divider">
            <dl class="ds-dl ds-text-sm">
              <dt>Subtotal</dt>
              <dd>{{ brl(subTotal) }}</dd>
              <template v-if="discount">
                <dt>Cupom {{ coupon.code }}</dt>
                <dd class="ds-text-success">
                  − {{ brl(discount) }}
                </dd>
              </template>
              <dt>Frete {{ shipping.id === 'express' ? 'expresso' : 'normal' }}</dt>
              <dd>{{ brl(shipping.cost) }}</dd>
              <dt class="ds-dl__total">
                Total
              </dt>
              <dd class="ds-dl__total">
                {{ brl(total) }}
              </dd>
            </dl>
            <p
              v-if="pay.error.value"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ pay.error.value.message }}
            </p>
            <button
              type="submit"
              class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
              :disabled="pay.isPending.value || !payableLines.length || !addressComplete"
              :aria-busy="pay.isPending.value"
            >
              <span
                v-if="pay.isPending.value"
                class="ds-spinner"
                aria-hidden="true"
              />
              <CheckCircle
                v-else
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ method.cta }}
            </button>
            <span class="ds-hint">O total final é calculado de novo pelo servidor.</span>
          </article>

          <article class="ds-card ds-card--sunken ds-stack--2">
            <span class="ds-label-caps">Se o preço mudar</span>
            <p class="ds-text-sm">
              Os preços da sacola são conferidos de novo ao abrir esta tela.
              <template v-if="unavailableLines.length">
                {{ unavailableLines.length === 1 ? '1 item ficou indisponível e' : `${unavailableLines.length} itens ficaram indisponíveis e` }}
                não entra{{ unavailableLines.length === 1 ? '' : 'm' }} no pedido.
              </template>
              <template v-else>
                Item alterado ou desativado aparece com aviso antes de pagar.
              </template>
            </p>
          </article>
        </aside>
      </form>
    </LoadState>
  </div>
</template>
