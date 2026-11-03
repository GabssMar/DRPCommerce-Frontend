<script setup>
import { computed, ref, watch } from 'vue';
import { AlertCircle, Copy, ExternalLink, Package, Truck } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href, navigate } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import { cancelOrder, getOrderDetail, listMyOrders } from '../../services/client-api';
import { ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_TYPE, ufOf } from '../../services/status';
import { brl, dropOrderCode, formatDate, formatDateTime, storeOrderCode } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import StatusBadge from '../ui/StatusBadge.vue';
import StepsBar from '../ui/StepsBar.vue';

// C12 · Meus pedidos e rastreio. Rotas: GET storefront/orders(/{id}),
// GET storefront/drop/orders(/{id}), GET orders|drop-orders/get-by-id (totais e endereço),
// GET order-items/get-all, GET shipments/get-all, GET invoices/get-all,
// PUT orders|drop-orders/update (cancelar).
const props = defineProps({
  selectedSource: { type: String, default: null },
  selectedId: { type: Number, default: null },
});

const signedIn = computed(() => isSignedIn(REALMS.storefront));
const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'drop', label: 'Drops' },
  { id: 'store', label: 'Vitrine' },
];
const filter = ref('all');

const list = useAsync(() => (signedIn.value ? listMyOrders() : Promise.resolve([])));
const orders = computed(() => (list.data.value ?? []).filter((o) => filter.value === 'all' || o.source === filter.value));

// Ao lado do status do pedido, o pagamento precisa dizer que é pagamento.
const PAYMENT_LABELS = { 1: 'Pagamento pendente', 5: 'Pagamento falhou' };

const codeOf = (o) => (o.source === 'drop' ? dropOrderCode(o.id) : storeOrderCode(o.id));

// Pedido aberto: o da URL ou o mais recente.
const selected = computed(() => {
  const all = list.data.value ?? [];
  return all.find((o) => o.source === props.selectedSource && o.id === props.selectedId) ?? orders.value[0] ?? null;
});

const detail = useAsync(() => (selected.value ? getOrderDetail(selected.value.source, selected.value.id) : Promise.resolve(null)), { immediate: false });
watch(() => selected.value && `${selected.value.source}:${selected.value.id}`, (key) => {
  if (key) detail.reload();
}, { immediate: true });

const order = computed(() => detail.data.value?.order ?? null);
const shipment = computed(() => detail.data.value?.shipment ?? null);
const invoice = computed(() => detail.data.value?.invoice ?? null);
const items = computed(() => detail.data.value?.items ?? []);

// Andamento: Confirmado → Em processamento → Enviado → Entregue (ids 2..5).
const progress = computed(() => {
  const s = selected.value;
  if (!s) return { current: -1, complete: false, steps: [] };
  const steps = [
    { label: 'Confirmado', meta: formatDateTime(s.createdAt) },
    { label: 'Em processamento', meta: '' },
    { label: 'Enviado', meta: shipment.value?.shippedAt ? formatDateTime(shipment.value.shippedAt) : '' },
    {
      label: 'Entregue',
      meta: shipment.value?.deliveredAt
        ? formatDateTime(shipment.value.deliveredAt)
        : shipment.value?.estimatedDelivery ? `previsto ${formatDate(shipment.value.estimatedDelivery)}` : '',
    },
  ];
  const current = Math.min(Math.max(s.statusId - 2, -1), 3);
  return { steps, current, complete: s.statusId === 5 };
});
const isClosed = computed(() => [6, 7].includes(selected.value?.statusId));

const coupon = computed(() => (order.value?.discountAmount ? order.value.discountAmount : 0));
const address = computed(() => {
  const o = order.value;
  if (!o) return '';
  const uf = o.shippingStateId ? ufOf(o.shippingStateId) : ufOf(Number(o.shippingState)) || o.shippingState;
  return `${o.shippingAddressLine} · ${o.shippingCity}, ${uf} · ${o.shippingZipCode}`;
});

const copied = ref(false);
const copyTracking = async () => {
  try {
    await navigator.clipboard.writeText(shipment.value.trackingCode);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    copied.value = false;
  }
};

const canCancel = computed(() => selected.value && [1, 2].includes(selected.value.statusId) && selected.value.paymentStatusId !== 2);
const cancel = useAction(async () => {
  await cancelOrder(selected.value.source, order.value);
  await list.reload();
  await detail.reload();
});

const open = (o) => navigate(`/conta/pedidos/${o.source}/${o.id}`);
</script>

<template>
  <div class="ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <h1 class="ds-title ds-title--lg">
        Meus pedidos
      </h1>
      <div class="ds-cluster ds-cluster--2">
        <div
          class="ds-nav"
          role="group"
          aria-label="Filtrar por origem"
        >
          <button
            v-for="f in FILTERS"
            :key="f.id"
            type="button"
            :class="['ds-nav__item', { 'ds-nav__item--active': filter === f.id }]"
            :aria-pressed="filter === f.id"
            @click="filter = f.id"
          >
            {{ f.label }}
          </button>
        </div>
      </div>
    </div>

    <article
      v-if="!signedIn"
      class="ds-card ds-empty"
    >
      <Package
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Entre na sua conta para ver seus pedidos.</p>
      <a
        class="ds-btn ds-btn--primary ds-btn--sm"
        :href="href('/conta')"
      >Entrar</a>
    </article>

    <LoadState
      v-else
      :is-loading="list.isLoading.value"
      :error="list.error.value"
      :is-empty="!orders.length"
      empty-text="Nenhum pedido por aqui ainda."
      :lines="6"
      @retry="list.reload"
    >
      <section class="ds-grid ds-grid--pair">
        <ul
          class="ds-stack--3 ds-list-reset"
          aria-label="Pedidos"
        >
          <li
            v-for="o in orders"
            :key="`${o.source}-${o.id}`"
          >
            <button
              type="button"
              :class="['ds-card', 'ds-card--tight', 'ds-card--interactive', 'ds-cluster', 'ds-cluster--2', { 'ds-card--selected': selected === o }]"
              :aria-current="selected === o ? 'true' : undefined"
              @click="open(o)"
            >
              <img
                v-if="o.imageUrl"
                class="ds-card__media ds-card__media--thumb ds-card__media--product"
                :src="o.imageUrl"
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
              <span class="ds-stack--1 ds-grow ds-min-0">
                <span class="ds-cluster ds-cluster--between">
                  <strong class="ds-text-medium">{{ o.title }}</strong>
                  <span :class="['ds-badge', o.source === 'drop' ? 'ds-badge--inverse' : 'ds-badge--done']">{{ o.source === 'drop' ? 'Drop' : 'Vitrine' }}</span>
                </span>
                <span class="ds-text-xs ds-text-secondary ds-mono">{{ codeOf(o) }} · {{ formatDate(o.createdAt) }}</span>
                <StatusBadge
                  :id="o.paymentStatusId === 1 && o.statusId <= 2 ? 1 : o.statusId"
                  class="ds-self-start"
                  :table="o.paymentStatusId === 1 && o.statusId <= 2 ? PAYMENT_STATUS : ORDER_STATUS"
                  :label="o.paymentStatusId === 1 && o.statusId <= 2 ? 'Pagamento pendente' : ''"
                />
              </span>
            </button>
          </li>
        </ul>

        <article
          v-if="selected"
          class="ds-card ds-stack--6"
          aria-live="polite"
        >
          <header class="ds-cluster ds-cluster--between ds-align-start">
            <div class="ds-stack--1">
              <span class="ds-label-caps">{{ selected.source === 'drop' ? 'Pedido de drop' : 'Pedido da vitrine' }}</span>
              <h2 class="ds-title--md">
                {{ selected.title }}
              </h2>
              <span class="ds-text-sm ds-text-secondary ds-mono">{{ codeOf(selected) }} · feito em {{ formatDateTime(selected.createdAt) }}</span>
            </div>
            <div class="ds-cluster ds-cluster--2">
              <StatusBadge
                :id="selected.paymentStatusId"
                :table="PAYMENT_STATUS"
                :label="PAYMENT_LABELS[selected.paymentStatusId] ?? ''"
              />
              <StatusBadge
                v-if="selected.statusId !== 1"
                :id="selected.statusId"
                :table="ORDER_STATUS"
              />
            </div>
          </header>

          <StepsBar
            v-if="!isClosed"
            label="Andamento do pedido"
            :steps="progress.steps"
            :current="progress.current"
            :complete="progress.complete"
          />

          <LoadState
            :is-loading="detail.isLoading.value"
            :error="detail.error.value"
            :lines="5"
            @retry="detail.reload"
          >
            <template v-if="order">
              <div
                v-if="shipment"
                class="ds-card ds-card--sunken ds-stack--4"
              >
                <div class="ds-cluster ds-cluster--between">
                  <span class="ds-cluster ds-cluster--2">
                    <Truck
                      :size="20"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    <strong class="ds-text-medium">Entrega {{ (SHIPMENT_TYPE[shipment.shipmentTypeId]?.label ?? '').toLowerCase() }} · {{ shipment.carrierName }}</strong>
                  </span>
                  <span class="ds-text-sm">
                    {{ shipment.deliveredAt ? 'Entregue em' : 'Chega até' }}
                    <strong class="ds-text-medium">{{ formatDate(shipment.deliveredAt || shipment.estimatedDelivery) }}</strong>
                  </span>
                </div>
                <div
                  v-if="shipment.trackingCode"
                  class="ds-input-group"
                >
                  <input
                    class="ds-input ds-mono"
                    :value="shipment.trackingCode"
                    readonly
                    aria-label="Código de rastreio"
                  >
                  <button
                    type="button"
                    class="ds-btn ds-btn--secondary"
                    @click="copyTracking"
                  >
                    <Copy
                      class="ds-btn__icon"
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    {{ copied ? 'Copiado' : 'Copiar' }}
                  </button>
                  <a
                    class="ds-btn ds-btn--primary"
                    :href="`https://rastreamento.correios.com.br/app/index.php?objetos=${shipment.trackingCode}`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Rastrear
                    <ExternalLink
                      class="ds-btn__icon"
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    <span class="ds-sr-only">(abre em nova aba)</span>
                  </a>
                </div>
                <p class="ds-text-sm ds-text-secondary">
                  {{ address }}
                </p>
              </div>
              <div
                v-else
                class="ds-card ds-card--sunken ds-stack--2"
              >
                <span class="ds-label-caps">Entrega</span>
                <p class="ds-text-sm ds-text-secondary">
                  {{ address }}
                </p>
                <p class="ds-hint">
                  {{ selected.source === 'drop'
                    ? 'Pedidos de drop ainda não têm rastreio nem nota fiscal no sistema.'
                    : 'O código de rastreio aparece aqui quando o pedido for enviado.' }}
                </p>
              </div>

              <div class="ds-stack--3">
                <span class="ds-label-caps">Itens</span>
                <div
                  v-for="(item, index) in items"
                  :key="index"
                  class="ds-cluster ds-cluster--between"
                >
                  <span class="ds-stack--1">
                    <span>{{ item.itemName }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ item.quantity }} un. × {{ brl(item.unitPrice) }}</span>
                  </span>
                  <span class="ds-numeric">{{ brl(item.totalPrice) }}</span>
                </div>
              </div>

              <hr class="ds-divider">

              <dl class="ds-dl">
                <dt>Subtotal</dt>
                <dd>{{ brl(order.subTotal) }}</dd>
                <template v-if="coupon">
                  <dt>Cupom</dt>
                  <dd class="ds-text-success">
                    − {{ brl(coupon) }}
                  </dd>
                </template>
                <dt>Frete</dt>
                <dd>{{ brl(order.shippingCost) }}</dd>
                <dt>Impostos</dt>
                <dd>{{ brl(order.taxAmount) }}</dd>
                <dt class="ds-dl__total">
                  Total
                </dt>
                <dd class="ds-dl__total">
                  {{ brl(order.totalAmount) }}
                </dd>
              </dl>

              <p
                v-if="cancel.error.value"
                class="ds-error"
                role="alert"
              >
                <AlertCircle
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                {{ cancel.error.value.message }}
              </p>
              <div class="ds-cluster ds-cluster--end ds-cluster--2">
                <button
                  v-if="canCancel"
                  type="button"
                  class="ds-btn ds-btn--ghost-danger"
                  :disabled="cancel.isPending.value"
                  @click="cancel.run()"
                >
                  Cancelar pedido
                </button>
                <a
                  class="ds-btn ds-btn--ghost"
                  :href="href('/conta/notificacoes')"
                >Preciso de ajuda</a>
                <a
                  v-if="invoice?.fileUrl"
                  class="ds-btn ds-btn--secondary"
                  :href="invoice.fileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >Baixar nota fiscal</a>
                <button
                  v-else-if="selected.source === 'store'"
                  type="button"
                  class="ds-btn ds-btn--secondary"
                  disabled
                  title="A nota fica disponível depois da emissão"
                >
                  Baixar nota fiscal
                </button>
              </div>
            </template>
          </LoadState>
        </article>
      </section>
    </LoadState>
  </div>
</template>
