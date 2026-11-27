<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, Download, X } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { href } from '../../router';
import { usePagedSearch } from '../../composables/usePagedSearch';
import { usePermissions } from '../../composables/usePermissions';
import {
  cancelOrder, confirmManualRefund, confirmPayment, deliverOrder, getOrderDetail, retryPaymentOperation, searchOrders, shipOrder,
  startProcessing,
} from '../../services/admin-api';
import {
  ORDER_CHANGE_SOURCE, ORDER_STATUS, PAYMENT_OPERATION_AWAITING_MANUAL, PAYMENT_OPERATION_FAILED, PAYMENT_OPERATION_KIND, PAYMENT_OPERATION_REVIEW,
  PAYMENT_OPERATION_STATUS, PAYMENT_OPERATION_UNKNOWN, PAYMENT_STATUS, SHIPMENT_TYPE, TRANSACTION_METHOD, options, paymentOperationCode, ufOf,
} from '../../services/status';
import { brl, formatDateTime, fromDateInput, formatNumber, initials, shortName } from '../../services/format';
import { csvMoney, downloadCsv } from '../../services/csv';
import { PAGE_SIZE_MAX } from '../../services/paging';
import AdminDropOrders from './AdminDropOrders.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E5 · Pedidos da vitrine (task 37): busca paginada (GET orders/search), detalhe com linha
// do tempo (GET orders/{id}/detail) e uma rota por transição (confirm-payment, start-processing,
// ship, deliver, cancel). Cada transição devolve o detalhe atualizado. Pedidos de drop ficam
// em AdminDropOrders (CRUD do Drop).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const { can, denied } = usePermissions();

const PERIODS = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' },
  { days: 0, label: 'Todo o período' },
];
const SORTS = [
  { id: 'newest', label: 'Mais recentes' },
  { id: 'oldest', label: 'Mais antigos' },
  { id: 'total_desc', label: 'Maior valor' },
  { id: 'total_asc', label: 'Menor valor' },
];
const PICKUP = 4;
const ERRORS = {
  'Order.NotAwaitingPayment': 'O pedido não está mais aguardando pagamento. Atualizamos o detalhe.',
  'Order.CancelNotAllowed': 'O pedido não pode mais ser cancelado.',
  'Order.ShipmentRequired': 'Pedido com produto físico precisa dos dados de envio.',
  'Payment.MethodRequired': 'Informe o método de pagamento recebido.',
  'Order.StockUnavailable': 'Não há estoque para confirmar o pedido.',
  'Security.PermissionRequired': 'Você não tem permissão para esta ação.',
};
const messageOf = (error) => (error ? ERRORS[error.code] ?? Object.values(error.fieldErrors ?? {})[0]?.[0] ?? error.message : '');

const scope = ref('store');

// Filtros da tela -> query de orders/search. A lista e o CSV usam a mesma.
const toQuery = ({ days, statusId, paymentStatusId, number, ...rest }) => ({
  ...rest,
  number: Number(number) || null,
  statusIds: statusId ? [statusId] : [],
  paymentStatusIds: paymentStatusId ? [paymentStatusId] : [],
  createdFrom: days ? new Date(Date.now() - days * 864e5).toISOString() : null,
});
const search = usePagedSearch(
  (f) => searchOrders(toQuery(f)),
  { number: '', statusId: '', paymentStatusId: '', days: 30, sort: 'newest' },
);
const { filters } = search;

// CSV de todos os pedidos do filtro atual, não só da página: percorre a busca de 100 em 100.
const CSV_MAX_PAGES = 100;
const exportCsv = useAction(async () => {
  const query = toQuery(filters);
  const all = [];
  for (let page = 1; page <= CSV_MAX_PAGES; page += 1) {
    const result = await searchOrders({ ...query, page, pageSize: PAGE_SIZE_MAX });
    all.push(...result.items);
    if (page >= result.pages) break;
  }
  downloadCsv('pedidos-vitrine', ['pedido', 'data', 'cliente', 'status', 'pagamento', 'total'], all.map((o) => [
    `#${o.number}`, formatDateTime(o.createdAt), o.customerName ?? `Cliente #${o.customerId}`,
    ORDER_STATUS[o.statusId]?.label ?? o.status, PAYMENT_STATUS[o.paymentStatusId]?.label ?? o.paymentStatus, csvMoney(o.totalAmount),
  ]));
});

// ------------------------------------------------------------- detalhe ---
const openId = ref(Number(props.params.id) || null);
const detail = useAsync(() => (openId.value ? getOrderDetail(openId.value) : null), { immediate: Boolean(openId.value) });
watch(openId, () => {
  transition.error.value = null;
  modal.value = null;
  resetForms();
  detail.clear();
  detail.reload();
});
const order = computed(() => detail.data.value);
const customerNameOf = (id) => search.items.value.find((o) => o.customerId === id)?.customerName ?? `Cliente #${id}`;

const paid = computed(() => order.value?.paymentStatusId === 2);
const next = computed(() => {
  const o = order.value;
  if (!o) return null;
  if (o.statusId === 1 && o.paymentStatusId === 1) return { id: 'pay', label: 'Confirmar pagamento' };
  if (o.statusId === 2) return { id: 'process', label: 'Iniciar processamento' };
  if (o.statusId === 3) return { id: 'ship', label: 'Enviar pedido' };
  if (o.statusId === 4) return { id: 'deliver', label: 'Marcar como entregue' };
  return null;
});
const canCancel = computed(() => [1, 2, 3].includes(order.value?.statusId));
const cancelBlocked = computed(() => {
  if (!can('orders.cancel')) return denied('orders.cancel', 'cancelar pedidos');
  if (paid.value && !can('orders.refund')) return denied('orders.refund', 'estornar pedidos pagos');
  return undefined;
});

const modal = ref(null);
const blankForms = () => ({
  pay: { transactionMethodId: 1, gatewayReference: '', note: '' },
  ship: { shipmentTypeId: '', carrierName: '', trackingCode: '', estimatedDate: '', note: '' },
  cancel: { reason: '' },
  refund: { operationId: null, reference: '', note: '' },
});
const forms = reactive(blankForms());
const resetForms = () => Object.assign(forms, blankForms());
const openModal = (id) => { transition.error.value = null; modal.value = id; };

// Toda transição devolve o detalhe atualizado: a tela troca o detalhe e recarrega a lista.
const transition = useAction(async (call) => {
  const id = order.value.id;
  const updated = await call(id);
  // O detalhe pode ter trocado de pedido enquanto a chamada rodava.
  if (openId.value === id) detail.data.value = updated;
  modal.value = null;
  resetForms();
  await search.reload();
});
const run = (call) => transition.run(call).then(() => {
  if (transition.error.value?.code === 'Order.NotAwaitingPayment') detail.reload();
});

const advance = () => {
  if (next.value.id === 'pay') openModal('pay');
  else if (next.value.id === 'ship') openModal('ship');
  else run(next.value.id === 'process' ? startProcessing : deliverOrder);
};
const submitPay = () => run((id) => confirmPayment(id, {
  transactionMethodId: order.value.payment ? undefined : forms.pay.transactionMethodId,
  gatewayReference: forms.pay.gatewayReference.trim() || undefined,
  note: forms.pay.note.trim() || undefined,
}));
const submitShip = () => {
  const f = forms.ship;
  return run((id) => shipOrder(id, {
    shipmentTypeId: f.shipmentTypeId || undefined,
    carrierName: f.carrierName.trim() || undefined,
    trackingCode: f.trackingCode.trim() || undefined,
    estimatedDelivery: f.estimatedDate ? fromDateInput(f.estimatedDate, true) : undefined,
    note: f.note.trim() || undefined,
  }));
};
const submitCancel = () => run((id) => cancelOrder(id, forms.cancel.reason.trim()));

// Andamento do estorno/cancelamento da cobrança. O back processa sozinho; a equipe só
// reagenda uma falha ou confirma um estorno manual já devolvido fora do sistema.
const operations = computed(() => (order.value?.paymentOperations ?? []).map((op) => ({
  ...op, kindId: paymentOperationCode(op.kind), statusId: paymentOperationCode(op.status),
})));
const operationBlocked = computed(() => denied('orders.cancel', 'cancelar pedidos') ?? denied('orders.refund', 'estornar pedidos pagos'));
const retryOperation = (op) => run((id) => retryPaymentOperation(id, op.id));
const openManualRefund = (op) => {
  Object.assign(forms.refund, { operationId: op.id, reference: '', note: '' });
  openModal('refund');
};
const submitManualRefund = () => run((id) => confirmManualRefund(id, forms.refund.operationId, {
  reference: forms.refund.reference.trim(),
  note: forms.refund.note.trim(),
}));

const withShipment = computed(() => Boolean(forms.ship.shipmentTypeId));
const timeline = computed(() => [...(order.value?.history ?? [])].reverse());
const changeText = (h) => (h.fromStatusId ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus);
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Pedidos
    </h1>
    <div
      class="ds-nav"
      role="group"
      aria-label="Origem"
    >
      <button
        v-for="s in [{ id: 'store', label: 'Vitrine' }, { id: 'drop', label: 'Drop' }]"
        :key="s.id"
        type="button"
        :class="['ds-nav__item', { 'ds-nav__item--active': scope === s.id }]"
        :aria-pressed="scope === s.id"
        @click="scope = s.id"
      >
        {{ s.label }}
      </button>
    </div>
  </div>

  <AdminDropOrders v-if="scope === 'drop'" />

  <template v-else>
    <div class="ds-toolbar">
      <div class="ds-toolbar__search">
        <label
          class="ds-sr-only"
          for="or-number"
        >Número do pedido</label>
        <input
          id="or-number"
          v-model="filters.number"
          class="ds-input"
          type="search"
          inputmode="numeric"
          placeholder="Número do pedido"
        >
      </div>
      <select
        v-model="filters.statusId"
        class="ds-input ds-toolbar__filter"
        aria-label="Status"
      >
        <option value="">
          Todos os status
        </option>
        <option
          v-for="s in options(ORDER_STATUS)"
          :key="s.id"
          :value="s.id"
        >
          {{ s.label }}
        </option>
      </select>
      <select
        v-model="filters.paymentStatusId"
        class="ds-input ds-toolbar__filter"
        aria-label="Pagamento"
      >
        <option value="">
          Qualquer pagamento
        </option>
        <option
          v-for="s in options(PAYMENT_STATUS)"
          :key="s.id"
          :value="s.id"
        >
          {{ s.label }}
        </option>
      </select>
      <select
        v-model.number="filters.days"
        class="ds-input ds-toolbar__filter"
        aria-label="Período"
      >
        <option
          v-for="p in PERIODS"
          :key="p.days"
          :value="p.days"
        >
          {{ p.label }}
        </option>
      </select>
      <select
        v-model="filters.sort"
        class="ds-input ds-toolbar__filter"
        aria-label="Ordenar por"
      >
        <option
          v-for="s in SORTS"
          :key="s.id"
          :value="s.id"
        >
          {{ s.label }}
        </option>
      </select>
      <div class="ds-toolbar__actions">
        <button
          type="button"
          class="ds-btn ds-btn--secondary"
          :disabled="!search.items.value.length || exportCsv.isPending.value"
          :aria-busy="exportCsv.isPending.value"
          @click="exportCsv.run()"
        >
          <span
            v-if="exportCsv.isPending.value"
            class="ds-spinner"
            aria-hidden="true"
          />
          <Download
            v-else
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Exportar CSV
        </button>
      </div>
    </div>
    <p
      v-if="exportCsv.error.value"
      class="ds-error"
      role="alert"
    >
      <AlertCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Não foi possível exportar: {{ messageOf(exportCsv.error.value) }}
    </p>

    <section class="ds-grid ds-grid--split">
      <div class="ds-card ds-card--flush ds-min-0">
        <LoadState
          :is-loading="search.isLoading.value"
          :error="search.error.value"
          :is-empty="!search.items.value.length"
          :empty-text="search.isFiltered.value ? 'Nenhum pedido com estes filtros.' : 'Nenhum pedido ainda. As compras feitas na vitrine aparecem aqui.'"
          :lines="8"
          flush
          @retry="search.reload"
        >
          <template #empty-action>
            <button
              v-if="search.isFiltered.value"
              type="button"
              class="ds-btn ds-btn--secondary ds-btn--sm"
              @click="search.clearFilters()"
            >
              Limpar filtros
            </button>
            <a
              v-else
              class="ds-btn ds-btn--secondary ds-btn--sm"
              :href="href('/admin/catalogo')"
            >
              Ver catálogo
            </a>
          </template>
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Pedidos da vitrine
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Pedido
                  </th>
                  <th scope="col">
                    Cliente
                  </th>
                  <th scope="col">
                    Status
                  </th>
                  <th scope="col">
                    Pagamento
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="o in search.items.value"
                  :key="o.id"
                  :aria-selected="openId === o.id ? 'true' : undefined"
                >
                  <td>
                    <button
                      type="button"
                      class="ds-table__open ds-stack--1"
                      @click="openId = o.id"
                    >
                      <span class="ds-mono">#{{ o.number }}</span>
                      <span class="ds-text-xs ds-text-secondary">{{ formatDateTime(o.createdAt) }}</span>
                    </button>
                  </td>
                  <td>{{ shortName(o.customerName) }}</td>
                  <td>
                    <StatusBadge
                      :id="o.statusId"
                      :table="ORDER_STATUS"
                    />
                  </td>
                  <td>
                    <StatusBadge
                      :id="o.paymentStatusId"
                      :table="PAYMENT_STATUS"
                      :dot="false"
                    />
                  </td>
                  <td :class="['ds-table__td--numeric', { 'ds-table__td--muted': o.statusId >= 6 }]">
                    {{ brl(o.totalAmount) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ds-table-footer">
            <span class="ds-hint">Número comercial do pedido, na ordem em que foi feito.</span>
            <PaginationNav
              v-model:page="search.page.value"
              :page-size="search.pageSize"
              :total="search.total.value"
            />
          </div>
        </LoadState>
      </div>

      <article
        v-if="openId"
        class="ds-card ds-stack--5"
        aria-live="polite"
      >
        <LoadState
          :is-loading="detail.isLoading.value"
          :error="detail.error.value"
          :lines="8"
          @retry="detail.reload"
        >
          <template v-if="order">
            <header class="ds-cluster ds-cluster--between ds-align-start">
              <div class="ds-stack--1">
                <h2 class="ds-title--md ds-mono">
                  Pedido #{{ order.number }}
                </h2>
                <span class="ds-cluster ds-cluster--2">
                  <StatusBadge
                    :id="order.statusId"
                    :table="ORDER_STATUS"
                  />
                  <StatusBadge
                    :id="order.paymentStatusId"
                    :table="PAYMENT_STATUS"
                    :dot="false"
                  />
                </span>
              </div>
              <button
                type="button"
                class="ds-icon-btn ds-icon-btn--ghost"
                aria-label="Fechar detalhe"
                @click="openId = null"
              >
                <X
                  :size="20"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </button>
            </header>

            <div class="ds-cluster ds-cluster--2">
              <span
                class="ds-avatar"
                aria-hidden="true"
              >{{ initials(customerNameOf(order.customerId)) }}</span>
              <span class="ds-stack--1">
                <span>{{ customerNameOf(order.customerId) }}</span>
                <span class="ds-text-xs ds-text-secondary">cliente #{{ order.customerId }} · feito em {{ formatDateTime(order.createdAt) }}</span>
              </span>
            </div>

            <div class="ds-stack--2">
              <span class="ds-label-caps">Itens</span>
              <div
                v-for="i in order.items"
                :key="i.id"
                class="ds-row-divided ds-text-sm"
              >
                <span class="ds-stack--1">
                  <span>{{ i.itemName }}{{ i.variantName ? ` · ${i.variantName}` : '' }}</span>
                  <span class="ds-text-xs ds-text-secondary ds-mono">{{ i.sku }} · {{ formatNumber(i.quantity) }} × {{ brl(i.unitPrice) }}</span>
                </span>
                <span class="ds-numeric">{{ brl(i.totalPrice) }}</span>
              </div>
            </div>

            <dl class="ds-dl ds-text-sm">
              <dt>Subtotal</dt>
              <dd>{{ brl(order.subTotal) }}</dd>
              <template v-if="order.discountAmount">
                <dt>Cupom</dt>
                <dd class="ds-text-success">
                  − {{ brl(order.discountAmount) }}
                </dd>
              </template>
              <dt>Frete</dt>
              <dd>{{ brl(order.shippingCost) }}</dd>
              <dt class="ds-dl__total">
                Total
              </dt>
              <dd class="ds-text-medium">
                {{ brl(order.totalAmount) }}
              </dd>
            </dl>

            <div class="ds-stack--1 ds-text-sm">
              <span class="ds-label-caps">Pagamento</span>
              <span v-if="order.payment">{{ order.payment.method }} · {{ order.payment.status }} · {{ brl(order.payment.amount) }}{{ order.payment.paidAt ? ` · pago em ${formatDateTime(order.payment.paidAt)}` : '' }}</span>
              <span
                v-else
                class="ds-text-secondary"
              >Ainda sem cobrança.</span>
              <span
                v-if="order.paymentExpiresAt && order.statusId === 1"
                class="ds-text-xs ds-text-secondary"
              >Vence em {{ formatDateTime(order.paymentExpiresAt) }}</span>
            </div>

            <div
              v-if="operations.length"
              class="ds-stack--2 ds-text-sm"
            >
              <span class="ds-label-caps">Estorno e cancelamento da cobrança</span>
              <div
                v-for="op in operations"
                :key="op.id"
                class="ds-stack--1"
              >
                <span class="ds-cluster ds-cluster--2">
                  <span class="ds-text-medium">{{ PAYMENT_OPERATION_KIND[op.kindId]?.label ?? 'Operação' }} · {{ brl(op.amount) }}</span>
                  <StatusBadge
                    :id="op.statusId"
                    :table="PAYMENT_OPERATION_STATUS"
                    :dot="false"
                  />
                </span>
                <span
                  v-if="op.reference || op.completedAt"
                  class="ds-text-xs ds-text-secondary"
                >{{ op.reference ? `Ref. ${op.reference}` : '' }}{{ op.reference && op.completedAt ? ' · ' : '' }}{{ op.completedAt ? `concluído em ${formatDateTime(op.completedAt)}` : '' }}</span>
                <span
                  v-if="op.statusId === PAYMENT_OPERATION_AWAITING_MANUAL"
                  class="ds-hint"
                >Devolva o dinheiro ao cliente fora do sistema e confirme aqui com o comprovante.</span>
                <span
                  v-else-if="op.statusId === PAYMENT_OPERATION_REVIEW"
                  class="ds-hint"
                >Faltam dados para concluir no provedor. Confira a conexão de pagamento em Integrações.</span>
                <span
                  v-else-if="op.statusId === PAYMENT_OPERATION_UNKNOWN"
                  class="ds-hint"
                >O provedor não confirmou o resultado. O sistema consulta de novo sozinho; não refaça o estorno.</span>
                <div
                  v-if="[PAYMENT_OPERATION_FAILED, PAYMENT_OPERATION_AWAITING_MANUAL].includes(op.statusId)"
                  class="ds-cluster ds-cluster--2"
                >
                  <button
                    v-if="op.statusId === PAYMENT_OPERATION_FAILED"
                    type="button"
                    class="ds-btn ds-btn--secondary ds-btn--sm"
                    :disabled="Boolean(operationBlocked) || transition.isPending.value"
                    :title="operationBlocked"
                    @click="retryOperation(op)"
                  >
                    Tentar de novo
                  </button>
                  <button
                    v-else
                    type="button"
                    class="ds-btn ds-btn--secondary ds-btn--sm"
                    :disabled="Boolean(operationBlocked) || transition.isPending.value"
                    :title="operationBlocked"
                    @click="openManualRefund(op)"
                  >
                    Confirmar devolução
                  </button>
                </div>
              </div>
            </div>

            <div class="ds-stack--1 ds-text-sm">
              <span class="ds-label-caps">Entrega</span>
              <span class="ds-text-secondary">{{ order.shippingAddressLine }} · {{ order.shippingCity }}, {{ ufOf(order.shippingStateId) }} · {{ order.shippingZipCode }}</span>
              <span
                v-for="s in order.shipments"
                :key="s.id"
              >{{ s.shipmentType }}{{ s.carrierName ? ` · ${s.carrierName}` : '' }}{{ s.trackingCode ? ` · ${s.trackingCode}` : '' }} · {{ s.status }}</span>
            </div>

            <div class="ds-stack--2">
              <span class="ds-label-caps">Linha do tempo</span>
              <ul class="ds-feed">
                <li
                  v-for="(h, i) in timeline"
                  :key="i"
                  class="ds-feed__item"
                >
                  <time class="ds-feed__time">{{ formatDateTime(h.changedAt) }}</time>
                  <span class="ds-stack--1">
                    <span class="ds-text-medium">{{ changeText(h) }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ ORDER_CHANGE_SOURCE[h.source] ?? 'Sistema' }}{{ h.actorId ? ` · usuário #${h.actorId}` : '' }}{{ h.reason ? ` · ${h.reason}` : '' }}</span>
                  </span>
                </li>
              </ul>
            </div>

            <p
              v-if="transition.error.value && !modal"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ messageOf(transition.error.value) }}
            </p>

            <div class="ds-cluster ds-cluster--2">
              <button
                v-if="canCancel"
                type="button"
                class="ds-btn ds-btn--ghost"
                :disabled="Boolean(cancelBlocked) || transition.isPending.value"
                :title="cancelBlocked"
                @click="openModal('cancel')"
              >
                Cancelar pedido
              </button>
              <button
                v-if="next"
                type="button"
                class="ds-btn ds-btn--primary ds-grow"
                :disabled="transition.isPending.value || !can('orders.manage')"
                :title="denied('orders.manage', 'gerenciar pedidos')"
                :aria-busy="transition.isPending.value"
                @click="advance"
              >
                {{ next.label }}
              </button>
            </div>
            <p
              v-if="canCancel && cancelBlocked"
              class="ds-hint"
            >
              {{ cancelBlocked }}
            </p>
          </template>
        </LoadState>
      </article>

      <article
        v-else
        class="ds-card ds-card--sunken ds-empty"
      >
        <p>Abra um pedido na lista para ver o detalhe e avançar para a próxima etapa.</p>
      </article>
    </section>
  </template>

  <ModalDialog
    v-if="modal === 'pay' && order"
    title="Confirmar pagamento"
    @close="modal = null"
  >
    <form
      id="pay-form"
      class="ds-stack--4"
      @submit.prevent="submitPay"
    >
      <p class="ds-text-secondary">
        Registre só depois de conferir o recebimento de {{ brl(order.totalAmount) }}. A confirmação separa o estoque e usa o cupom do pedido.
      </p>
      <div
        v-if="!order.payment"
        class="ds-field"
      >
        <label
          class="ds-label"
          for="py-method"
        >Como o cliente pagou</label>
        <select
          id="py-method"
          v-model.number="forms.pay.transactionMethodId"
          class="ds-input"
        >
          <option
            v-for="m in options(TRANSACTION_METHOD).filter((x) => x.id <= 3)"
            :key="m.id"
            :value="m.id"
          >
            {{ m.label }}
          </option>
        </select>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="py-ref"
        >Referência do recebimento</label>
        <input
          id="py-ref"
          v-model="forms.pay.gatewayReference"
          class="ds-input"
          maxlength="200"
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="py-note"
        >Observação</label>
        <input
          id="py-note"
          v-model="forms.pay.note"
          class="ds-input"
          maxlength="500"
        >
      </div>
      <p
        v-if="transition.error.value"
        class="ds-error"
        role="alert"
      >
        {{ messageOf(transition.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="modal = null"
      >
        Voltar
      </button>
      <button
        type="submit"
        form="pay-form"
        class="ds-btn ds-btn--primary"
        :disabled="transition.isPending.value"
      >
        Confirmar pagamento
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="modal === 'ship' && order"
    title="Enviar pedido"
    @close="modal = null"
  >
    <form
      id="ship-form"
      class="ds-stack--4"
      @submit.prevent="submitShip"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="sh-type"
        >Modalidade</label>
        <select
          id="sh-type"
          v-model.number="forms.ship.shipmentTypeId"
          class="ds-input"
        >
          <option value="">
            Sem envio físico (digital ou serviço)
          </option>
          <option
            v-for="t in options(SHIPMENT_TYPE)"
            :key="t.id"
            :value="t.id"
          >
            {{ t.label }}
          </option>
        </select>
      </div>
      <template v-if="withShipment">
        <div class="ds-field">
          <label
            class="ds-label"
            for="sh-carrier"
          >Transportadora</label>
          <input
            id="sh-carrier"
            v-model="forms.ship.carrierName"
            class="ds-input"
            maxlength="200"
            :required="forms.ship.shipmentTypeId !== PICKUP"
          >
        </div>
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="sh-track"
            >Código de rastreio</label>
            <input
              id="sh-track"
              v-model="forms.ship.trackingCode"
              class="ds-input ds-mono"
              maxlength="100"
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="sh-eta"
            >Previsão de entrega</label>
            <input
              id="sh-eta"
              v-model="forms.ship.estimatedDate"
              class="ds-input"
              type="date"
              required
            >
          </div>
        </div>
      </template>
      <div class="ds-field">
        <label
          class="ds-label"
          for="sh-note"
        >Observação</label>
        <input
          id="sh-note"
          v-model="forms.ship.note"
          class="ds-input"
          maxlength="500"
        >
      </div>
      <p
        v-if="transition.error.value"
        class="ds-error"
        role="alert"
      >
        {{ messageOf(transition.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="modal = null"
      >
        Voltar
      </button>
      <button
        type="submit"
        form="ship-form"
        class="ds-btn ds-btn--primary"
        :disabled="transition.isPending.value"
      >
        Marcar como enviado
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="modal === 'cancel' && order"
    :title="`Cancelar pedido #${order.number}?`"
    @close="modal = null"
  >
    <form
      id="cancel-form"
      class="ds-stack--4"
      @submit.prevent="submitCancel"
    >
      <p class="ds-text-secondary">
        {{ paid ? 'O pedido já foi pago: o estorno é registrado, mas a devolução do dinheiro é feita fora do sistema. O estoque e o cupom voltam.' : 'O estoque reservado e o cupom voltam. O cliente é avisado do cancelamento.' }}
      </p>
      <div class="ds-field">
        <label
          class="ds-label"
          for="cn-reason"
        >Motivo</label>
        <input
          id="cn-reason"
          v-model="forms.cancel.reason"
          class="ds-input"
          maxlength="500"
          required
          autofocus
        >
      </div>
      <p
        v-if="transition.error.value"
        class="ds-error"
        role="alert"
      >
        {{ messageOf(transition.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="modal = null"
      >
        Voltar
      </button>
      <button
        type="submit"
        form="cancel-form"
        class="ds-btn ds-btn--danger"
        :disabled="transition.isPending.value"
      >
        Cancelar pedido
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="modal === 'refund' && order"
    :title="`Confirmar devolução do pedido #${order.number}`"
    @close="modal = null"
  >
    <form
      id="refund-form"
      class="ds-stack--4"
      @submit.prevent="submitManualRefund"
    >
      <p class="ds-text-secondary">
        Confirme só depois de devolver o dinheiro ao cliente. O registro fica com o seu usuário, a referência e a observação.
      </p>
      <div class="ds-field">
        <label
          class="ds-label"
          for="rf-reference"
        >Comprovante ou referência</label>
        <input
          id="rf-reference"
          v-model="forms.refund.reference"
          class="ds-input"
          maxlength="200"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="rf-note"
        >Observação (opcional)</label>
        <input
          id="rf-note"
          v-model="forms.refund.note"
          class="ds-input"
          maxlength="500"
        >
      </div>
      <p
        v-if="transition.error.value"
        class="ds-error"
        role="alert"
      >
        {{ messageOf(transition.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="modal = null"
      >
        Voltar
      </button>
      <button
        type="submit"
        form="refund-form"
        class="ds-btn ds-btn--primary"
        :disabled="!forms.refund.reference.trim() || transition.isPending.value"
        :aria-busy="transition.isPending.value"
      >
        Confirmar devolução
      </button>
    </template>
  </ModalDialog>
</template>
