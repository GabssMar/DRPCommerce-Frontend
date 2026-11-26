<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { AlertCircle, CheckCircle, ExternalLink, Minus, Plus } from '@lucide/vue';
import {
  checkoutDrop, DROP_PAYMENT_STATUS, getDropPurchase, getDropReservation, getMe, listMyDropReservations,
  RESERVATION_STATUS, reserveDrop,
} from '../../services/client-api';
import { href } from '../../router';
import { ufOf } from '../../services/status';
import { brl } from '../../services/format';
import ModalDialog from '../ui/ModalDialog.vue';

// Compra do drop (task 18). Três passos, tudo com valores do servidor:
//   1. escolher variações e quantidades da participação, até maxPerCustomer somando todas;
//   2. reservar (POST events/{id}/reservations) e ver o resumo: linhas, total e prazo
//      (o mesmo da sessão da fila, 15 min fixos), com o endereço do cadastro;
//   3. ir para o pagamento (POST reservations/{id}/checkout) e acompanhar a compra
//      (GET purchases/{id}): voltar do Mercado Pago não confirma; quem confirma é o back.
// Reabrir retoma a reserva ativa (GET reservations) e a compra já criada.
const props = defineProps({
  event: { type: Object, required: true },
  // sessão da fila: { id, issuedAt, expiresAt }
  session: { type: Object, default: null },
  // serverNow() em ms
  now: { type: Number, required: true },
});

const emit = defineEmits(['close', 'session-ended', 'paid']);

const KEY_PREFIX = 'veloce_drop_reserve_';
const PURCHASE_PREFIX = 'veloce_drop_purchase_';
const POLL_MS = 5000;
const CRITICAL_SECONDS = 60;

const store = {
  get: (key) => {
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sem storage: vale só nesta tela */
    }
  },
};

const step = ref('loading'); // loading | choose | reserved | purchase
const error = ref(null); // { message, back?: 'choose' }
const busy = ref(false);
const reservation = ref(null);
const purchase = ref(null);
const me = ref(null);

// ------------------------------------------------------------- 1. escolher ---
const products = computed(() => props.event.products ?? []);
const participationId = ref(products.value[0]?.participationId ?? null);
const product = computed(() => products.value.find((p) => p.participationId === participationId.value) ?? null);
const quantities = ref({});
watch(participationId, () => {
  quantities.value = {};
});

const optionsLabel = (attributes) => Object.values(attributes ?? {}).join(' · ');
const chosen = computed(() => (product.value?.variants ?? [])
  .filter((v) => (quantities.value[v.id] ?? 0) > 0)
  .map((v) => ({ variantId: v.id, quantity: quantities.value[v.id] })));
const chosenUnits = computed(() => chosen.value.reduce((sum, l) => sum + l.quantity, 0));
const limit = computed(() => product.value?.maxPerCustomer ?? 1);

const setQuantity = (variant, next) => {
  const others = chosenUnits.value - (quantities.value[variant.id] ?? 0);
  const value = Math.max(0, Math.min(next, variant.available, limit.value - others));
  quantities.value = { ...quantities.value, [variant.id]: value };
};

// Chave idempotente: a mesma para a mesma escolha nesta sessão (retentativa, F5);
// escolha diferente ganha chave nova.
const keyFor = (sessionId, lines) => {
  const signature = JSON.stringify([participationId.value, [...lines].sort((a, b) => a.variantId - b.variantId)]);
  const saved = store.get(`${KEY_PREFIX}${sessionId}`);
  if (saved?.signature === signature) return saved.key;
  const key = crypto.randomUUID();
  store.set(`${KEY_PREFIX}${sessionId}`, { signature, key });
  return key;
};
const renewKey = () => {
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}${props.session?.id}`);
  } catch {
    /* sem storage */
  }
};

// --------------------------------------------------------------- erros ---
const SESSION_ENDED = ['DropPurchase.SessionExpired', 'DropPurchase.SessionNotFound', 'DropPurchase.ReservationExpired', 'DropPurchase.ReservationNotFound'];
const handleError = (err, attempt) => {
  const code = err?.code ?? '';
  if (err?.kind === 'network' || err?.kind === 'timeout') {
    error.value = { message: 'Não tivemos resposta do servidor. Tentar de novo não duplica a reserva nem o pedido.', retry: attempt };
  } else if (SESSION_ENDED.includes(code)) {
    error.value = { message: 'Seu prazo de compra terminou. A reserva foi liberada.' };
    emit('session-ended');
  } else if (code === 'DropPurchase.PurchaseLimit') {
    error.value = { message: `Este CPF já atingiu o limite de ${limit.value} ${limit.value === 1 ? 'unidade' : 'unidades'} deste produto no drop (contando reservas e compras).`, back: 'choose' };
  } else if (code === 'DropPurchase.InsufficientStock' || code === 'DropPurchase.ProductUnavailable') {
    error.value = { message: 'Alguma opção esgotou ou ficou indisponível. Escolha de novo.', back: 'choose' };
  } else if (code === 'DropPurchase.IdempotencyConflict') {
    renewKey();
    error.value = { message: 'A escolha mudou desde a última tentativa. Confirme de novo.', back: 'choose' };
  } else if (code === 'DropPurchase.AddressRequired') {
    error.value = { message: 'Complete o endereço do seu cadastro para continuar.', address: true };
  } else {
    error.value = { message: err?.message ?? 'Não foi possível continuar a compra.' };
  }
};

// ------------------------------------------------------------- 2. reservar ---
const reserve = async () => {
  if (busy.value || !chosen.value.length || !props.session) return;
  busy.value = true;
  error.value = null;
  try {
    reservation.value = await reserveDrop(props.event.id, {
      participationId: participationId.value,
      sessionId: props.session.id,
      idempotencyKey: keyFor(props.session.id, chosen.value),
      lines: chosen.value,
    });
    step.value = 'reserved';
  } catch (err) {
    // Sem resposta: a reserva pode ter sido criada. Procura antes de liberar outra tentativa.
    if (err?.kind === 'network' || err?.kind === 'timeout') {
      const found = await findActiveReservation().catch(() => null);
      if (found) {
        reservation.value = found;
        step.value = 'reserved';
        return;
      }
    }
    handleError(err, 'reserve');
  } finally {
    busy.value = false;
  }
};

const findActiveReservation = async () => {
  const mine = await listMyDropReservations();
  const active = mine
    .filter((r) => r.dropEventId === props.event.id && r.dropReservationStatusId === RESERVATION_STATUS.ACTIVE
      && Date.parse(r.expiresAt) > props.now)
    .sort((a, b) => b.id - a.id)[0];
  return active ? getDropReservation(active.id) : null;
};

const secondsLeft = computed(() => {
  const expiresAt = reservation.value?.expiresAt ?? props.session?.expiresAt;
  return expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - props.now) / 1000)) : null;
});
const windowLabel = computed(() => (secondsLeft.value == null ? '' : `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, '0')}`));

const addressComplete = computed(() => Boolean(me.value?.addressLine && me.value?.city && me.value?.zipCode && me.value?.stateId));

// ------------------------------------------------------------- 3. pagar ---
let pollTimer = null;
const stopPolling = () => {
  clearInterval(pollTimer);
  pollTimer = null;
};
onScopeDispose(stopPolling);

const isPending = computed(() => purchase.value?.dropOrderPaymentStatusId === DROP_PAYMENT_STATUS.PENDING);
const refreshPurchase = async () => {
  if (!purchase.value) return;
  try {
    purchase.value = await getDropPurchase(purchase.value.id);
  } catch {
    /* mantém o último estado; a próxima volta tenta de novo */
  }
};
watch(isPending, (pending) => {
  stopPolling();
  if (pending) pollTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') refreshPurchase();
  }, POLL_MS);
}, { immediate: true });
watch(() => purchase.value?.dropOrderPaymentStatusId, (statusId) => {
  if (statusId === DROP_PAYMENT_STATUS.PAID) emit('paid', purchase.value);
});

const pay = async () => {
  if (busy.value || !reservation.value) return;
  busy.value = true;
  error.value = null;
  try {
    purchase.value = await checkoutDrop(reservation.value.id);
    store.set(`${PURCHASE_PREFIX}${reservation.value.id}`, purchase.value.id);
    step.value = 'purchase';
  } catch (err) {
    handleError(err, 'pay');
  } finally {
    busy.value = false;
  }
};

const retry = () => (error.value?.retry === 'pay' ? pay() : reserve());

const purchaseState = computed(() => {
  const p = purchase.value;
  if (!p) return null;
  if (p.financialReviewCode) {
    return { tone: 'ds-badge--waiting', label: 'Em revisão', text: 'O pagamento caiu em revisão financeira. A loja vai entrar em contato; nada mais é cobrado até a revisão terminar.' };
  }
  if (p.dropOrderPaymentStatusId === DROP_PAYMENT_STATUS.PAID) {
    return { tone: 'ds-badge--success', label: 'Pago', text: 'Pagamento confirmado. Sua compra está garantida.' };
  }
  if (p.dropOrderPaymentStatusId === DROP_PAYMENT_STATUS.FAILED) {
    return { tone: 'ds-badge--done', label: 'Pagamento recusado', text: 'O pagamento não foi aprovado. Se ainda estiver dentro do prazo, tente pagar de novo pelo link.' };
  }
  return {
    tone: 'ds-badge--scheduled',
    label: 'Aguardando pagamento',
    text: p.paymentCheckoutUrl
      ? 'Conclua o pagamento na página do Mercado Pago. A confirmação aparece aqui sozinha; voltar daquela página não confirma a compra.'
      : 'Aguardando a confirmação do pagamento pela loja. Esta tela atualiza sozinha.',
  };
});

// ------------------------------------------------------------- abrir ---
const open = async () => {
  step.value = 'loading';
  error.value = null;
  try {
    const [profile, active] = await Promise.all([getMe().catch(() => null), findActiveReservation().catch(() => null)]);
    me.value = profile;
    if (active) {
      reservation.value = active;
      const purchaseId = store.get(`${PURCHASE_PREFIX}${active.id}`);
      if (purchaseId) {
        purchase.value = await getDropPurchase(purchaseId).catch(() => null);
        if (purchase.value) {
          step.value = 'purchase';
          return;
        }
      }
      step.value = 'reserved';
      return;
    }
  } catch {
    /* sem reserva para retomar: começa da escolha */
  }
  step.value = 'choose';
};
open();
</script>

<template>
  <ModalDialog
    :title="step === 'purchase' ? 'Pagamento' : 'Comprar no drop'"
    @close="emit('close')"
  >
    <p
      v-if="step === 'loading'"
      class="ds-hint"
    >
      Carregando…
    </p>

    <!-- 1 · Escolher -->
    <div
      v-else-if="step === 'choose'"
      class="ds-stack--5"
    >
      <div
        v-if="products.length > 1"
        class="ds-field"
      >
        <label
          class="ds-label"
          for="drop-participation"
        >Produto</label>
        <select
          id="drop-participation"
          v-model.number="participationId"
          class="ds-input"
        >
          <option
            v-for="p in products"
            :key="p.participationId"
            :value="p.participationId"
          >
            {{ p.name }}
          </option>
        </select>
      </div>
      <p class="ds-text-sm ds-text-secondary">
        {{ product?.name }} · até {{ limit }} {{ limit === 1 ? 'unidade' : 'unidades' }} por CPF, somando todas as opções.
      </p>
      <ul
        class="ds-stack--3 ds-list-reset"
        aria-label="Opções"
      >
        <li
          v-for="variant in product?.variants ?? []"
          :key="variant.id"
          class="ds-cluster ds-cluster--between"
        >
          <span class="ds-stack--1">
            <span>{{ optionsLabel(variant.attributes) || 'Unidade' }}</span>
            <span class="ds-text-xs ds-text-secondary">
              {{ brl(variant.price) }} · {{ variant.available > 0 ? `${variant.available} disponíveis` : 'esgotado' }}
            </span>
          </span>
          <span
            class="ds-cluster ds-cluster--2"
            role="group"
            :aria-label="`Quantidade de ${optionsLabel(variant.attributes) || 'unidade'}`"
          >
            <button
              type="button"
              class="ds-icon-btn ds-tap"
              :aria-label="`Menos ${optionsLabel(variant.attributes) || 'unidade'}`"
              :disabled="!(quantities[variant.id] > 0)"
              @click="setQuantity(variant, (quantities[variant.id] ?? 0) - 1)"
            >
              <Minus
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
            <output class="ds-numeric">{{ quantities[variant.id] ?? 0 }}</output>
            <button
              type="button"
              class="ds-icon-btn ds-tap"
              :aria-label="`Mais ${optionsLabel(variant.attributes) || 'unidade'}`"
              :disabled="variant.available <= (quantities[variant.id] ?? 0) || chosenUnits >= limit"
              @click="setQuantity(variant, (quantities[variant.id] ?? 0) + 1)"
            >
              <Plus
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
          </span>
        </li>
      </ul>
      <p
        v-if="windowLabel"
        :class="['ds-hint', { 'ds-text-danger': secondsLeft < CRITICAL_SECONDS }]"
      >
        Prazo da sua vez: {{ windowLabel }}. A reserva segura as unidades até o fim desse prazo.
      </p>
    </div>

    <!-- 2 · Reservado -->
    <div
      v-else-if="step === 'reserved'"
      class="ds-stack--5"
    >
      <ul class="ds-stack--3 ds-list-reset">
        <li
          v-for="line in reservation.lines"
          :key="line.variantId"
          class="ds-cluster ds-cluster--between"
        >
          <span class="ds-stack--1">
            <span>{{ line.itemName }}</span>
            <span class="ds-text-xs ds-text-secondary">{{ optionsLabel(JSON.parse(line.optionsJson || '{}')) || line.sku }} · {{ line.quantity }} × {{ brl(line.unitPrice) }}</span>
          </span>
        </li>
      </ul>
      <dl class="ds-dl">
        <dt>Frete</dt>
        <dd>Grátis</dd>
        <dt class="ds-dl__total">
          Total
        </dt>
        <dd class="ds-dl__total">
          {{ brl(reservation.totalAmount) }}
        </dd>
      </dl>
      <div :class="['ds-stat', { 'ds-stat--critical': secondsLeft < CRITICAL_SECONDS }]">
        <div class="ds-stat__value ds-numeric">
          {{ windowLabel }}
        </div>
        <div class="ds-stat__label">
          para pagar antes de a reserva expirar
        </div>
      </div>
      <div class="ds-card ds-card--sunken ds-stack--1">
        <span class="ds-label-caps">Entrega</span>
        <p
          v-if="addressComplete"
          class="ds-text-sm"
        >
          {{ me.addressLine }} · {{ me.city }}, {{ ufOf(me.stateId) }} · {{ me.zipCode }}
        </p>
        <p
          v-else
          class="ds-text-sm ds-text-danger"
        >
          Seu cadastro está sem endereço completo.
        </p>
        <a
          class="ds-text-sm"
          :href="href('/conta')"
        >Alterar endereço do cadastro</a>
      </div>
    </div>

    <!-- 3 · Compra -->
    <div
      v-else-if="step === 'purchase' && purchase"
      class="ds-stack--5"
      aria-live="polite"
    >
      <div class="ds-cluster ds-cluster--between">
        <span class="ds-text-sm ds-text-secondary">Pedido <span class="ds-mono">#{{ purchase.id }}</span> · {{ brl(purchase.totalAmount) }}</span>
        <span :class="['ds-badge', purchaseState.tone]">{{ purchaseState.label }}</span>
      </div>
      <p class="ds-text-sm">
        <CheckCircle
          v-if="purchase.dropOrderPaymentStatusId === DROP_PAYMENT_STATUS.PAID"
          class="ds-text-success"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ purchaseState.text }}
      </p>
      <a
        v-if="purchase.paymentCheckoutUrl && isPending"
        class="ds-btn ds-btn--primary ds-btn--block"
        :href="purchase.paymentCheckoutUrl"
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
    </div>

    <div
      v-if="error"
      class="ds-stack--2"
      role="alert"
    >
      <p class="ds-error">
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ error.message }}
      </p>
      <a
        v-if="error.address"
        class="ds-btn ds-btn--secondary ds-btn--sm"
        :href="href('/conta')"
      >Completar cadastro</a>
    </div>

    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="emit('close')"
      >
        {{ step === 'purchase' ? 'Fechar' : 'Voltar' }}
      </button>
      <button
        v-if="error?.retry"
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="busy"
        @click="retry"
      >
        Tentar de novo
      </button>
      <button
        v-else-if="error?.back === 'choose'"
        type="button"
        class="ds-btn ds-btn--secondary"
        @click="error = null; step = 'choose'"
      >
        Escolher de novo
      </button>
      <button
        v-else-if="step === 'choose'"
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="busy || !chosen.length || !session"
        :aria-busy="busy"
        @click="reserve"
      >
        Reservar {{ chosenUnits ? `(${chosenUnits})` : '' }}
      </button>
      <button
        v-else-if="step === 'reserved'"
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="busy || !addressComplete"
        :aria-busy="busy"
        @click="pay"
      >
        Ir para o pagamento
      </button>
      <button
        v-else-if="step === 'purchase' && isPending"
        type="button"
        class="ds-btn ds-btn--secondary"
        @click="refreshPurchase"
      >
        Atualizar status
      </button>
    </template>
  </ModalDialog>
</template>
