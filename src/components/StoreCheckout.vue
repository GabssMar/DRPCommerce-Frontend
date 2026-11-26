<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle, ExternalLink, Info, Package, ShoppingBag, Store, Truck } from '@lucide/vue';
import { useAsync, useAction } from '../composables/useAsync';
import { useBag } from '../composables/useBag';
import { href } from '../router';
import { isSignedIn, REALMS } from '../services/session';
import { getMe, getOrderDetail, getShippingQuotes, listAddresses, PAYMENT_METHODS, placeOrder } from '../services/client-api';
import { STATES, ufOf } from '../services/status';
import { brl, formatDateTime } from '../services/format';
import LoadState from './ui/LoadState.vue';
import StepsBar from './ui/StepsBar.vue';

// C10 · Checkout da vitrine (task 32). Uma chamada só: POST storefront/checkout compra
// os itens MARCADOS do carrinho (task 30). O front escolhe endereço, frete, forma de
// pagamento e cupom; itens, preço, desconto, frete e prazo vêm do servidor.
// A chave idempotente fica na sessionStorage até o pedido sair: clique duplo, F5 ou
// timeout reenviam a MESMA chave e o back devolve o mesmo pedido.
const KEY_STORAGE = 'veloce_checkout_key';

const bag = useBag();
const signedIn = computed(() => isSignedIn(REALMS.storefront));

const page = useAsync(async () => {
  if (!signedIn.value) return { me: null, addresses: [] };
  const [me, addresses] = await Promise.all([getMe(), listAddresses(), bag.loadCart()]);
  return { me, addresses };
});
const me = computed(() => page.data.value?.me ?? null);
const addresses = computed(() => page.data.value?.addresses ?? []);
const loadError = computed(() => page.error.value ?? (bag.cart.value ? null : bag.error.value));

const summary = computed(() => bag.cart.value?.summary ?? null);
const lines = computed(() => bag.items.value.filter((i) => i.isSelected && i.availability === 'available'));
const appliedCoupon = computed(() => (summary.value?.coupon?.isValid ? summary.value.coupon : null));

// Etapas: 0 Sacola (feita) · 1 Entrega · 2 Pagamento · 3 Revisão.
const STEPS = [{ label: 'Sacola' }, { label: 'Entrega' }, { label: 'Pagamento' }, { label: 'Revisão' }];
const step = ref(1);
const confirmed = ref(null);

// ----------------------------------------------------------------- Entrega ---
const deliveryMode = ref('ship'); // 'ship' | 'pickup'
const destination = reactive({ kind: 'profile', addressId: null, addressLine: '', city: '', stateId: 25, zipCode: '' });

// Padrão: o endereço salvo padrão; sem endereço salvo, o do cadastro.
watch(addresses, (list) => {
  const preferred = list.find((a) => a.isDefault) ?? list[0];
  if (preferred) Object.assign(destination, { kind: 'saved', addressId: preferred.id });
}, { immediate: true });

const profileComplete = computed(() => Boolean(me.value?.addressLine && me.value?.city && me.value?.zipCode));
const destinationReady = computed(() => {
  if (destination.kind === 'saved') return Boolean(destination.addressId);
  if (destination.kind === 'profile') return profileComplete.value;
  return Boolean(destination.addressLine.trim() && destination.city.trim() && destination.zipCode.trim() && destination.stateId);
});

const destinationText = computed(() => {
  if (deliveryMode.value === 'pickup') return 'Retirada na loja';
  if (destination.kind === 'saved') {
    const a = addresses.value.find((x) => x.id === destination.addressId);
    return a ? `${a.addressLine} · ${a.city}, ${ufOf(a.stateId)} · ${a.zipCode}` : '';
  }
  const a = destination.kind === 'profile' ? me.value : destination;
  return a ? `${a.addressLine} · ${a.city}, ${ufOf(Number(a.stateId))} · ${a.zipCode}` : '';
});

const chooseSaved = (id) => Object.assign(destination, { kind: 'saved', addressId: id });

// Frete: cotação do servidor para o endereço e os itens marcados. Mudar o endereço
// invalida a cotação escolhida (o back recusa token de outro endereço).
const quotes = ref(null);
const quoteToken = ref(null);
const loadQuotes = useAction(async () => {
  quoteToken.value = null;
  quotes.value = await getShippingQuotes(destination);
  if (quotes.value.options?.length === 1) quoteToken.value = quotes.value.options[0].quoteToken;
});
watch(() => [destination.kind, destination.addressId, destination.addressLine, destination.city, destination.stateId, destination.zipCode].join('|'), () => {
  quotes.value = null;
  quoteToken.value = null;
});
watch([destinationReady, step, quotes], ([ready, current, loaded]) => {
  if (ready && current === 1 && deliveryMode.value === 'ship' && !loaded && !loadQuotes.isPending.value && !loadQuotes.error.value) {
    loadQuotes.run();
  }
}, { immediate: true });

const allowsPickup = computed(() => Boolean(quotes.value?.allowsPickup));
const quote = computed(() => quotes.value?.options?.find((o) => o.quoteToken === quoteToken.value) ?? null);
const freightReady = computed(() => {
  if (deliveryMode.value === 'pickup') return true;
  if (!destinationReady.value || !quotes.value) return false;
  return !quotes.value.requiresQuote || Boolean(quote.value);
});

// --------------------------------------------------------------- Pagamento ---
const methodId = ref(PAYMENT_METHODS[0].id);
const method = computed(() => PAYMENT_METHODS.find((m) => m.id === methodId.value));
const notes = ref('');

// ----------------------------------------------------------------- Revisão ---
const idempotencyKey = () => {
  try {
    let key = sessionStorage.getItem(KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(KEY_STORAGE, key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
};
const forgetKey = () => {
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* sem storage: a chave valia só para esta tela */
  }
};

// Erros que mandam de volta: carrinho mudou (sacola) ou cotação venceu (entrega).
const CART_ERRORS = ['Checkout.ItemsUnavailable', 'Checkout.NoItemsSelected', 'Checkout.MaxItemsExceeded', 'Checkout.MinOrderValue'];
const failure = ref(null);
const pay = useAction(async () => {
  failure.value = null;
  try {
    const order = await placeOrder({
      idempotencyKey: idempotencyKey(),
      paymentMethodId: methodId.value,
      couponCode: appliedCoupon.value?.code ?? null,
      destination,
      pickupAtStore: deliveryMode.value === 'pickup',
      shippingQuoteToken: quoteToken.value,
      notes: notes.value,
    });
    forgetKey();
    confirmed.value = order;
    // O back tirou os itens comprados do carrinho; relê a sacola (e larga o cupom usado).
    await (bag.couponCode.value ? bag.removeCoupon() : bag.loadCart()).catch(() => {});
  } catch (err) {
    const code = err?.code ?? '';
    if (err?.kind === 'network' || err?.kind === 'timeout') {
      failure.value = { kind: 'unknown', message: 'Não tivemos resposta do servidor. Tentar de novo não duplica o pedido.' };
    } else if (CART_ERRORS.includes(code) || code.startsWith('Coupon.')) {
      failure.value = { kind: 'cart', message: err.message };
      bag.loadCart();
    } else if (code.startsWith('Checkout.Shipping') || code === 'Checkout.PickupUnavailable') {
      failure.value = { kind: 'freight', message: err.message };
      quotes.value = null;
      quoteToken.value = null;
      step.value = 1;
    } else {
      failure.value = { kind: 'other', message: err?.message ?? 'Não foi possível finalizar a compra.' };
    }
  }
});

const currentStep = computed(() => (confirmed.value ? 3 : step.value));
const go = (next) => {
  failure.value = null;
  step.value = next;
};
const submit = () => {
  if (step.value === 3) pay.run();
};

const payment = computed(() => confirmed.value?.payment ?? null);

// Task 43: depois do pedido, acompanha o pagamento até sair de "pendente". Quem confirma é o
// back (aviso do Mercado Pago ou a loja); voltar da página de pagamento não confirma nada.
const PAYMENT_POLL_MS = 5000;
const isPaid = computed(() => confirmed.value?.paymentStatusId === 2);
watch(() => confirmed.value?.paymentStatusId === 1, (pending, _, onCleanup) => {
  if (!pending) return;
  const timer = setInterval(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      confirmed.value = (await getOrderDetail('store', confirmed.value.id)).order;
    } catch {
      /* mantém o último estado; a próxima volta tenta de novo */
    }
  }, PAYMENT_POLL_MS);
  onCleanup(() => clearInterval(timer));
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
      :steps="STEPS"
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
            Pedido nº <span class="ds-mono">{{ confirmed.number }}</span>
          </p>
        </div>
        <span :class="['ds-badge', isPaid ? 'ds-badge--success' : 'ds-badge--scheduled']">
          <span
            v-if="!isPaid"
            class="ds-badge__dot"
            aria-hidden="true"
          />
          {{ isPaid ? 'Pagamento confirmado' : `Pagamento ${(confirmed.paymentStatus || 'pendente').toLowerCase()}` }}
        </span>
      </header>

      <dl class="ds-dl">
        <dt>Total</dt>
        <dd>{{ brl(confirmed.totalAmount) }}</dd>
        <template v-if="payment">
          <dt>Pagamento</dt>
          <dd>{{ payment.method }}</dd>
        </template>
        <template v-if="confirmed.paymentExpiresAt">
          <dt>Pagar até</dt>
          <dd>{{ formatDateTime(confirmed.paymentExpiresAt) }}</dd>
        </template>
        <dt>Entrega</dt>
        <dd>{{ confirmed.pickupAtStore ? 'Retirada na loja' : `${confirmed.shippingAddressLine} · ${confirmed.shippingCity}, ${ufOf(confirmed.shippingStateId)}` }}</dd>
      </dl>

      <div class="ds-card ds-card--sunken ds-card--tight ds-cluster ds-cluster--2 ds-align-start">
        <Info
          :size="20"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <p class="ds-text-sm ds-grow ds-prose">
          <template v-if="isPaid">
            Pagamento confirmado. Você acompanha a separação e o envio em "Meus pedidos".
          </template>
          <template v-else-if="payment?.instructions">
            {{ payment.instructions }}
          </template>
          <template v-else-if="payment?.checkoutUrl">
            Conclua o pagamento na página do provedor. A confirmação aparece no pedido depois que o pagamento for aprovado.
          </template>
          <template v-else>
            A loja confirmará o recebimento do pagamento. Se ele não for confirmado até o prazo, o pedido é cancelado e os itens voltam ao estoque.
          </template>
        </p>
      </div>

      <div class="ds-cluster ds-cluster--2">
        <a
          v-if="payment?.checkoutUrl && !isPaid"
          class="ds-btn ds-btn--primary"
          :href="payment.checkoutUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ir para o pagamento
          <ExternalLink
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          <span class="ds-sr-only">(abre em nova aba)</span>
        </a>
        <a
          :class="['ds-btn', payment?.checkoutUrl && !isPaid ? 'ds-btn--secondary' : 'ds-btn--primary']"
          :href="href(`/conta/pedidos/store/${confirmed.id}`)"
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
      :error="loadError"
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

      <!-- Nada para comprar -->
      <article
        v-else-if="!lines.length || !summary?.canCheckout"
        class="ds-card ds-empty"
      >
        <ShoppingBag
          :size="24"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <p>{{ lines.length ? 'Revise a sacola antes de finalizar: há item marcado indisponível ou fora das regras da loja.' : 'Nenhum item marcado para comprar.' }}</p>
        <a
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :href="href('/sacola')"
        >Ir para a sacola</a>
      </article>

      <form
        v-else
        class="ds-grid ds-grid--sidebar"
        @submit.prevent="submit"
      >
        <div class="ds-stack--6">
          <!-- 1 · Entrega -->
          <article
            v-if="step === 1"
            class="ds-card ds-stack--5"
            aria-labelledby="checkout-delivery"
          >
            <h2
              id="checkout-delivery"
              class="ds-card__title"
            >
              Entrega
            </h2>

            <fieldset
              v-if="allowsPickup"
              class="ds-stack--2"
            >
              <legend class="ds-label">
                Como receber
              </legend>
              <div class="ds-grid ds-grid--2">
                <label class="ds-check ds-check--card">
                  <span class="ds-cluster ds-cluster--2">
                    <input
                      v-model="deliveryMode"
                      type="radio"
                      name="sc-mode"
                      value="ship"
                    >
                    <Truck
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    Receber no endereço
                  </span>
                </label>
                <label class="ds-check ds-check--card">
                  <span class="ds-cluster ds-cluster--2">
                    <input
                      v-model="deliveryMode"
                      type="radio"
                      name="sc-mode"
                      value="pickup"
                    >
                    <Store
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    Retirar na loja
                  </span>
                  <span class="ds-numeric">{{ brl(0) }}</span>
                </label>
              </div>
            </fieldset>

            <template v-if="deliveryMode === 'ship'">
              <fieldset class="ds-stack--2">
                <legend class="ds-label">
                  Endereço
                </legend>
                <label
                  v-for="a in addresses"
                  :key="a.id"
                  class="ds-check ds-check--card ds-check--top"
                >
                  <span class="ds-cluster ds-cluster--2 ds-cluster--nowrap ds-align-start">
                    <input
                      type="radio"
                      name="sc-address"
                      :checked="destination.kind === 'saved' && destination.addressId === a.id"
                      @change="chooseSaved(a.id)"
                    >
                    <span class="ds-stack--1 ds-min-0">
                      <span>{{ a.label || 'Endereço' }}{{ a.isDefault ? ' · padrão' : '' }}</span>
                      <span class="ds-text-xs ds-text-secondary">{{ a.addressLine }} · {{ a.city }}, {{ ufOf(a.stateId) }} · {{ a.zipCode }}</span>
                    </span>
                  </span>
                </label>
                <label
                  v-if="!addresses.length"
                  class="ds-check ds-check--card ds-check--top"
                >
                  <span class="ds-cluster ds-cluster--2 ds-cluster--nowrap ds-align-start">
                    <input
                      type="radio"
                      name="sc-address"
                      :checked="destination.kind === 'profile'"
                      :disabled="!profileComplete"
                      @change="destination.kind = 'profile'"
                    >
                    <span class="ds-stack--1 ds-min-0">
                      <span>Endereço do cadastro</span>
                      <span class="ds-text-xs ds-text-secondary">{{ profileComplete ? `${me.addressLine} · ${me.city}, ${ufOf(me.stateId)} · ${me.zipCode}` : 'Cadastro sem endereço completo.' }}</span>
                    </span>
                  </span>
                </label>
                <label class="ds-check ds-check--card">
                  <span class="ds-cluster ds-cluster--2">
                    <input
                      type="radio"
                      name="sc-address"
                      :checked="destination.kind === 'new'"
                      @change="destination.kind = 'new'"
                    >
                    Outro endereço
                  </span>
                </label>
              </fieldset>

              <div
                v-if="destination.kind === 'new'"
                class="ds-grid ds-grid--2"
              >
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="sc-addr"
                  >Endereço</label>
                  <input
                    id="sc-addr"
                    v-model="destination.addressLine"
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
                    v-model="destination.zipCode"
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
                    v-model="destination.city"
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
                    v-model.number="destination.stateId"
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
              <p class="ds-hint">
                <a :href="href('/conta/enderecos')">Gerenciar endereços</a>
              </p>

              <fieldset
                v-if="destinationReady"
                class="ds-stack--2"
                aria-live="polite"
              >
                <legend class="ds-label">
                  Frete
                </legend>
                <p
                  v-if="loadQuotes.isPending.value"
                  class="ds-hint"
                >
                  Consultando o frete…
                </p>
                <div
                  v-else-if="loadQuotes.error.value"
                  class="ds-cluster ds-cluster--2"
                  role="alert"
                >
                  <span class="ds-error">{{ loadQuotes.error.value.message }}</span>
                  <button
                    type="button"
                    class="ds-btn ds-btn--ghost ds-btn--sm"
                    @click="loadQuotes.run()"
                  >
                    Tentar de novo
                  </button>
                </div>
                <p
                  v-else-if="quotes && !quotes.requiresQuote"
                  class="ds-hint"
                >
                  A loja combina o frete com você depois do pedido.
                </p>
                <div
                  v-else-if="quotes"
                  class="ds-grid ds-grid--2"
                >
                  <label
                    v-for="option in quotes.options"
                    :key="option.quoteToken"
                    class="ds-check ds-check--card"
                  >
                    <span class="ds-cluster ds-cluster--2">
                      <input
                        v-model="quoteToken"
                        type="radio"
                        name="sc-ship"
                        :value="option.quoteToken"
                      >
                      <span class="ds-stack--1">
                        <span>{{ option.carrierName }} {{ option.serviceName }}</span>
                        <span class="ds-text-xs ds-text-secondary">até {{ option.deliveryDays }} {{ option.deliveryDays === 1 ? 'dia útil' : 'dias úteis' }}</span>
                      </span>
                    </span>
                    <span class="ds-numeric">{{ brl(option.price) }}</span>
                  </label>
                </div>
                <p
                  v-if="quotes?.expiresAt"
                  class="ds-hint"
                >
                  Cotação válida até {{ formatDateTime(quotes.expiresAt) }}.
                </p>
              </fieldset>
            </template>

            <p
              v-if="failure?.kind === 'freight'"
              class="ds-error"
              role="alert"
            >
              {{ failure.message }}
            </p>

            <div class="ds-cluster ds-cluster--end">
              <button
                type="button"
                class="ds-btn ds-btn--primary"
                :disabled="!freightReady"
                @click="go(2)"
              >
                Continuar para o pagamento
              </button>
            </div>
          </article>

          <!-- 2 · Pagamento -->
          <article
            v-else-if="step === 2"
            class="ds-card ds-stack--5"
            aria-labelledby="checkout-payment"
          >
            <h2
              id="checkout-payment"
              class="ds-card__title"
            >
              Pagamento
            </h2>
            <div
              class="ds-nav"
              role="radiogroup"
              aria-label="Forma de pagamento"
            >
              <button
                v-for="option in PAYMENT_METHODS"
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
            <p class="ds-hint">
              A cobrança é criada depois de confirmar o pedido.
            </p>
            <div class="ds-field">
              <label
                class="ds-label"
                for="sc-notes"
              >Observações (opcional)</label>
              <textarea
                id="sc-notes"
                v-model="notes"
                class="ds-input"
                rows="2"
                maxlength="500"
              />
            </div>
            <div class="ds-cluster ds-cluster--between">
              <button
                type="button"
                class="ds-btn ds-btn--ghost"
                @click="go(1)"
              >
                Voltar
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--primary"
                @click="go(3)"
              >
                Revisar pedido
              </button>
            </div>
          </article>

          <!-- 3 · Revisão -->
          <article
            v-else
            class="ds-card ds-stack--5"
            aria-labelledby="checkout-review"
          >
            <h2
              id="checkout-review"
              class="ds-card__title"
            >
              Revisão
            </h2>
            <dl class="ds-dl">
              <dt>Entrega</dt>
              <dd>{{ destinationText }}</dd>
              <template v-if="deliveryMode === 'ship' && quote">
                <dt>Frete</dt>
                <dd>{{ quote.carrierName }} {{ quote.serviceName }} · até {{ quote.deliveryDays }} dias úteis</dd>
              </template>
              <dt>Pagamento</dt>
              <dd>{{ method.label }}</dd>
              <template v-if="appliedCoupon">
                <dt>Cupom</dt>
                <dd class="ds-mono">
                  {{ appliedCoupon.code }}
                </dd>
              </template>
              <template v-if="notes.trim()">
                <dt>Observações</dt>
                <dd>{{ notes.trim() }}</dd>
              </template>
            </dl>
            <div class="ds-cluster ds-cluster--2">
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="go(1)"
              >
                Alterar entrega
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="go(2)"
              >
                Alterar pagamento
              </button>
            </div>
          </article>
        </div>

        <aside class="ds-stack--6">
          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Resumo
              </h2>
              <span class="ds-text-xs ds-text-secondary">{{ summary.selectedQuantity }} {{ summary.selectedQuantity === 1 ? 'item' : 'itens' }}</span>
            </header>
            <ul class="ds-stack--3 ds-list-reset">
              <li
                v-for="line in lines"
                :key="line.id"
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
                    <span class="ds-text-sm">{{ line.productName }}{{ line.variantLabel ? ` (${line.variantLabel})` : '' }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ line.quantity }} × {{ brl(line.unitPrice) }}</span>
                  </span>
                </span>
                <span class="ds-numeric ds-text-sm">{{ brl(line.lineTotal) }}</span>
              </li>
            </ul>
            <hr class="ds-divider">
            <dl class="ds-dl ds-text-sm">
              <dt>Subtotal</dt>
              <dd>{{ brl(summary.subTotal) }}</dd>
              <template v-if="summary.discountAmount">
                <dt>Cupom {{ appliedCoupon?.code }}</dt>
                <dd class="ds-text-success">
                  − {{ brl(summary.discountAmount) }}
                </dd>
              </template>
              <dt>Frete</dt>
              <dd>{{ deliveryMode === 'pickup' ? 'Retirada' : quote ? brl(quote.price) : '—' }}</dd>
            </dl>
            <p class="ds-hint">
              O total final é calculado pelo servidor ao confirmar.
            </p>

            <div
              v-if="failure && failure.kind !== 'freight'"
              class="ds-stack--2"
              role="alert"
            >
              <p class="ds-error">
                <AlertCircle
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                {{ failure.message }}
              </p>
              <a
                v-if="failure.kind === 'cart'"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                :href="href('/sacola')"
              >Revisar a sacola</a>
            </div>

            <button
              v-if="step === 3"
              type="submit"
              class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
              :disabled="pay.isPending.value || !freightReady"
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
              {{ failure?.kind === 'unknown' ? 'Tentar de novo' : 'Confirmar pedido' }}
            </button>
          </article>
        </aside>
      </form>
    </LoadState>
  </div>
</template>
