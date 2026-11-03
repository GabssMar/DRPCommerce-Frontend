<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, Download, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin, issueInvoice, refundOrder, saveShipment, setOrderStatus } from '../../services/admin-api';
import { normalizeOrders } from '../../services/sales';
import { INVOICE_STATUS, ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_TYPE, options, ufOf } from '../../services/status';
import { brl, dropOrderCode, formatDateTime, initials, localDayKey, shortName, storeOrderCode } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E5 · Pedidos (drop + vitrine). Rotas: GET drop-orders/get-all + orders/get-all,
// PUT …/update (status, objeto inteiro), POST/PUT shipments (envio), POST invoices/add (NF),
// POST drop-transactions/add | transactions/add (reembolso, typeId 2),
// POST customers/get-list-by-list-id, POST drop-notifications/add (aviso ao cliente do drop).
defineProps({ params: { type: Object, default: () => ({}) } });

const PAGE_SIZE = 20;
const PERIODS = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 14, label: 'Últimos 14 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 0, label: 'Todo o período' },
];
const CARRIERS = ['Correios', 'Jadlog', 'Loggi', 'Retirada na loja'];

const filters = reactive({ search: '', source: 'all', statusId: '', days: 14 });
const page = ref(1);
watch(filters, () => { page.value = 1; });

const data = useAsync(async () => {
  const [dropOrders, storeOrders, events, shipments, invoices] = await Promise.all([
    admin.dropOrders.getAll(), admin.orders.getAll(), admin.dropEvents.getAll(), admin.shipments.getAll(), admin.invoices.getAll(),
  ]);
  const orders = normalizeOrders({ dropOrders, storeOrders }).filter((o) => !o.raw.isDeleted);
  const customers = await admin.customers.getByIds(orders.map((o) => o.customerId));
  return { orders, events, shipments, invoices, customers };
});

const customerOf = (id) => data.data.value?.customers.find((c) => c.id === id) ?? null;
const codeOf = (o) => (o.source === 'drop' ? dropOrderCode(o.id) : storeOrderCode(o.id));
const eventName = (id) => data.data.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;

const rows = computed(() => {
  const term = filters.search.trim().toLowerCase();
  const since = filters.days ? localDayKey(Date.now() - (filters.days - 1) * 864e5) : '';
  return (data.data.value?.orders ?? [])
    .filter((o) => filters.source === 'all' || o.source === filters.source)
    .filter((o) => !filters.statusId || o.statusId === Number(filters.statusId))
    .filter((o) => !since || localDayKey(o.createdAt) >= since)
    .filter((o) => {
      if (!term) return true;
      const c = customerOf(o.customerId);
      return `${codeOf(o)} ${o.id} ${c?.fullName ?? ''} ${o.raw.shippingZipCode ?? ''}`.toLowerCase().includes(term);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
});
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

// Seleção em lote
const selected = ref(new Set());
const keyOf = (o) => `${o.source}:${o.id}`;
const toggle = (o) => {
  const next = new Set(selected.value);
  if (next.has(keyOf(o))) next.delete(keyOf(o));
  else next.add(keyOf(o));
  selected.value = next;
};
const allOnPage = computed(() => pageRows.value.length > 0 && pageRows.value.every((o) => selected.value.has(keyOf(o))));
const toggleAll = () => {
  const next = new Set(selected.value);
  pageRows.value.forEach((o) => (allOnPage.value ? next.delete(keyOf(o)) : next.add(keyOf(o))));
  selected.value = next;
};
const selectedOrders = computed(() => rows.value.filter((o) => selected.value.has(keyOf(o))));

const bulkProcessing = useAction(async () => {
  const pick = (src) => selectedOrders.value.filter((o) => o.source === src).map((o) => o.raw);
  const drop = pick('drop');
  const store = pick('store');
  if (drop.length) await admin.dropOrders.patchRange(drop, { dropOrderStatusId: 3 });
  if (store.length) await admin.orders.patchRange(store, { orderStatusId: 3 });
  selected.value = new Set();
  await data.reload();
});

// Detalhe
const openKey = ref(null);
const open = computed(() => rows.value.find((o) => keyOf(o) === openKey.value) ?? (data.data.value?.orders ?? []).find((o) => keyOf(o) === openKey.value) ?? null);
const shipment = computed(() => (open.value?.source === 'store' ? data.data.value.shipments.find((s) => s.orderId === open.value.id) ?? null : null));
const invoice = computed(() => (open.value?.source === 'store' ? data.data.value.invoices.find((i) => i.orderId === open.value.id && i.invoiceStatusId !== 4) ?? null : null));
const ordersOfCustomer = computed(() => (data.data.value?.orders ?? []).filter((o) => o.customerId === open.value?.customerId).length);

const edit = reactive({ statusId: 1, carrierName: 'Correios', shipmentTypeId: 1, trackingCode: '' });
watch(open, (o) => {
  if (!o) return;
  Object.assign(edit, {
    statusId: o.statusId,
    carrierName: shipment.value?.carrierName ?? 'Correios',
    shipmentTypeId: shipment.value?.shipmentTypeId ?? 1,
    trackingCode: shipment.value?.trackingCode ?? '',
  });
});

const save = useAction(async () => {
  const o = open.value;
  if (edit.statusId !== o.statusId) await setOrderStatus(o.source, o.raw, edit.statusId);
  if (o.source === 'store' && (edit.trackingCode || shipment.value)) {
    await saveShipment(o.raw, shipment.value, {
      carrierName: edit.carrierName, shipmentTypeId: edit.shipmentTypeId, trackingCode: edit.trackingCode.trim(),
      stateUf: ufOf(o.raw.shippingStateId),
    });
  }
  if (o.source === 'drop' && edit.statusId !== o.statusId) {
    await admin.dropNotifications.add({
      dropEventId: o.eventId, customerId: o.customerId, dropNotificationChannelId: 1, dropNotificationTypeId: 5,
      subject: `Pedido ${codeOf(o)}: ${ORDER_STATUS[edit.statusId].label.toLowerCase()}`,
      body: 'Acompanhe o andamento em Meus pedidos.', dropNotificationStatusId: 1,
      scheduledAt: new Date().toISOString(), sentAt: null,
    });
  }
  await data.reload();
});

const emitInvoice = useAction(async () => {
  const next = Math.max(0, ...data.data.value.invoices.map((i) => Number(i.number) || 0)) + 1;
  await issueInvoice(open.value.raw, next);
  await data.reload();
});

const showRefund = ref(false);
const refund = useAction(async () => {
  const o = open.value;
  const payments = o.source === 'drop' ? await admin.dropTransactions.getAll() : await admin.transactions.getAll();
  const payment = payments.find((t) => (o.source === 'drop' ? t.dropOrderId : t.orderId) === o.id
    && (o.source === 'drop' ? t.dropTransactionTypeId : t.transactionTypeId) === 1);
  await refundOrder(o.source, o.raw, payment);
  showRefund.value = false;
  await data.reload();
});
const canRefund = computed(() => open.value && open.value.paymentStatusId === 2 && open.value.statusId !== 7);

// CSV do filtro atual
const exportCsv = () => {
  const header = ['pedido', 'origem', 'data', 'cliente', 'status', 'pagamento', 'total'];
  const lines = rows.value.map((o) => [
    codeOf(o), o.source === 'drop' ? 'Drop' : 'Vitrine', formatDateTime(o.createdAt), customerOf(o.customerId)?.fullName ?? o.customerId,
    ORDER_STATUS[o.statusId]?.label, PAYMENT_STATUS[o.paymentStatusId]?.label, o.totalAmount.toFixed(2).replace('.', ','),
  ]);
  const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  // BOM: o Excel abre o CSV em UTF-8 sem estragar os acentos.
  const BOM = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos-${localDayKey(Date.now())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Pedidos
    </h1>
    <button
      type="button"
      class="ds-btn ds-btn--secondary"
      :disabled="!rows.length"
      @click="exportCsv"
    >
      <Download
        class="ds-btn__icon"
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Exportar CSV
    </button>
  </div>

  <div class="ds-toolbar">
    <div class="ds-toolbar__search">
      <label
        class="ds-sr-only"
        for="or-search"
      >Buscar pedidos</label>
      <input
        id="or-search"
        v-model="filters.search"
        class="ds-input"
        type="search"
        placeholder="Nº do pedido, cliente ou CEP"
      >
    </div>
    <div
      class="ds-nav"
      role="group"
      aria-label="Origem"
    >
      <button
        v-for="s in [{ id: 'all', label: 'Todos' }, { id: 'drop', label: 'Drop' }, { id: 'store', label: 'Vitrine' }]"
        :key="s.id"
        type="button"
        :class="['ds-nav__item', { 'ds-nav__item--active': filters.source === s.id }]"
        :aria-pressed="filters.source === s.id"
        @click="filters.source = s.id"
      >
        {{ s.label }}
      </button>
    </div>
    <div class="ds-toolbar__actions">
      <label
        class="ds-sr-only"
        for="or-status"
      >Status</label>
      <select
        id="or-status"
        v-model="filters.statusId"
        class="ds-input ds-toolbar__filter"
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
      <label
        class="ds-sr-only"
        for="or-period"
      >Período</label>
      <select
        id="or-period"
        v-model.number="filters.days"
        class="ds-input ds-toolbar__filter"
      >
        <option
          v-for="p in PERIODS"
          :key="p.days"
          :value="p.days"
        >
          {{ p.label }}
        </option>
      </select>
    </div>
  </div>

  <section class="ds-grid ds-grid--split">
    <div class="ds-card ds-card--flush">
      <LoadState
        :is-loading="data.isLoading.value"
        :error="data.error.value"
        :is-empty="!rows.length"
        empty-text="Nenhum pedido com esses filtros."
        :lines="8"
        flush
        @retry="data.reload"
      >
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Pedidos de drop e vitrine
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    class="ds-checkbox"
                    type="checkbox"
                    :checked="allOnPage"
                    aria-label="Selecionar todos desta página"
                    @change="toggleAll"
                  >
                </th>
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
                v-for="o in pageRows"
                :key="keyOf(o)"
                :aria-selected="openKey === keyOf(o) ? 'true' : undefined"
              >
                <td>
                  <input
                    class="ds-checkbox"
                    type="checkbox"
                    :checked="selected.has(keyOf(o))"
                    :aria-label="`Selecionar ${codeOf(o)}`"
                    @change="toggle(o)"
                  >
                </td>
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-stack--1"
                    @click="openKey = keyOf(o)"
                  >
                    <span class="ds-mono">{{ codeOf(o) }}</span>
                    <span class="ds-cluster ds-cluster--2">
                      <span :class="['ds-badge', o.source === 'drop' ? 'ds-badge--inverse' : 'ds-badge--done']">{{ o.source === 'drop' ? 'Drop' : 'Vitrine' }}</span>
                      <span class="ds-text-xs ds-text-secondary">{{ formatDateTime(o.createdAt) }}</span>
                    </span>
                  </button>
                </td>
                <td>{{ shortName(customerOf(o.customerId)?.fullName ?? `#${o.customerId}`) }}</td>
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
          <span class="ds-cluster ds-cluster--2">
            <template v-if="selected.size">
              <span class="ds-text-sm">{{ selected.size }} {{ selected.size === 1 ? 'selecionado' : 'selecionados' }}</span>
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                :disabled="bulkProcessing.isPending.value"
                @click="bulkProcessing.run()"
              >
                Marcar como em processamento
              </button>
            </template>
            <span
              v-if="bulkProcessing.error.value"
              class="ds-error"
              role="alert"
            >{{ bulkProcessing.error.value.message }}</span>
          </span>
          <PaginationNav
            v-model:page="page"
            :page-size="PAGE_SIZE"
            :total="rows.length"
          />
        </div>
      </LoadState>
    </div>

    <article
      v-if="open"
      class="ds-card ds-stack--5"
      aria-live="polite"
    >
      <header class="ds-cluster ds-cluster--between ds-align-start">
        <div class="ds-stack--1">
          <span class="ds-cluster ds-cluster--2">
            <span :class="['ds-badge', open.source === 'drop' ? 'ds-badge--inverse' : 'ds-badge--done']">{{ open.source === 'drop' ? 'Drop' : 'Vitrine' }}</span>
            <span
              v-if="open.source === 'drop'"
              class="ds-text-xs ds-text-secondary"
            >{{ eventName(open.eventId) }}</span>
          </span>
          <h2 class="ds-title--md ds-mono">
            {{ codeOf(open) }}
          </h2>
        </div>
        <button
          type="button"
          class="ds-icon-btn ds-icon-btn--ghost"
          aria-label="Fechar detalhe"
          @click="openKey = null"
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
        >{{ initials(customerOf(open.customerId)?.fullName) }}</span>
        <span class="ds-stack--1">
          <span>{{ customerOf(open.customerId)?.fullName ?? `Cliente #${open.customerId}` }}</span>
          <span class="ds-text-xs ds-text-secondary">cliente #{{ open.customerId }} · {{ ordersOfCustomer }} {{ ordersOfCustomer === 1 ? 'pedido' : 'pedidos' }}</span>
        </span>
      </div>

      <form
        class="ds-stack--5"
        @submit.prevent="save.run()"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="o-status"
          >Status do pedido</label>
          <select
            id="o-status"
            v-model.number="edit.statusId"
            class="ds-input"
          >
            <option
              v-for="s in options(ORDER_STATUS)"
              :key="s.id"
              :value="s.id"
            >
              {{ s.label }}
            </option>
          </select>
        </div>

        <div
          v-if="open.source === 'store'"
          class="ds-card ds-card--sunken ds-stack--3"
        >
          <span class="ds-label-caps">Envio</span>
          <div class="ds-grid ds-grid--2">
            <div class="ds-field">
              <label
                class="ds-label"
                for="o-carrier"
              >Transportadora</label>
              <select
                id="o-carrier"
                v-model="edit.carrierName"
                class="ds-input"
              >
                <option
                  v-for="c in CARRIERS"
                  :key="c"
                >
                  {{ c }}
                </option>
              </select>
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="o-type"
              >Modalidade</label>
              <select
                id="o-type"
                v-model.number="edit.shipmentTypeId"
                class="ds-input"
              >
                <option
                  v-for="t in options(SHIPMENT_TYPE)"
                  :key="t.id"
                  :value="t.id"
                >
                  {{ t.label }}
                </option>
              </select>
            </div>
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="o-track"
            >Código de rastreio</label>
            <input
              id="o-track"
              v-model="edit.trackingCode"
              class="ds-input ds-mono"
              placeholder="Ex.: QB000000000BR"
            >
          </div>
          <p class="ds-text-sm ds-text-secondary">
            {{ open.raw.shippingAddressLine }} · {{ open.raw.shippingCity }}, {{ ufOf(open.raw.shippingStateId) }} · {{ open.raw.shippingZipCode }}
          </p>
        </div>
        <p
          v-else
          class="ds-hint"
        >
          {{ open.raw.shippingAddressLine }} · {{ open.raw.shippingCity }}, {{ ufOf(Number(open.raw.shippingState)) || open.raw.shippingState }} · {{ open.raw.shippingZipCode }}.
          Pedido de drop ainda não tem envio nem nota no back-end.
        </p>

        <dl class="ds-dl ds-text-sm">
          <dt>Subtotal</dt>
          <dd>{{ brl(open.raw.subTotal) }}</dd>
          <template v-if="open.raw.discountAmount">
            <dt>Cupom</dt>
            <dd class="ds-text-success">
              − {{ brl(open.raw.discountAmount) }}
            </dd>
          </template>
          <dt>Frete</dt>
          <dd>{{ brl(open.raw.shippingCost) }}</dd>
          <dt class="ds-dl__total">
            Total
          </dt>
          <dd class="ds-text-medium">
            {{ brl(open.totalAmount) }}
          </dd>
        </dl>

        <div
          v-if="open.source === 'store'"
          class="ds-cluster ds-cluster--between ds-text-sm"
        >
          <span>Nota fiscal</span>
          <span
            v-if="invoice"
            class="ds-cluster ds-cluster--2"
          >
            <span class="ds-mono">NF-e {{ invoice.number }}</span>
            <StatusBadge
              :id="invoice.invoiceStatusId"
              :table="INVOICE_STATUS"
              :dot="false"
            />
          </span>
          <button
            v-else
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm"
            :disabled="open.paymentStatusId !== 2 || emitInvoice.isPending.value"
            @click="emitInvoice.run()"
          >
            Emitir nota
          </button>
        </div>

        <p
          v-if="save.error.value || emitInvoice.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ (save.error.value || emitInvoice.error.value).message }}
        </p>
        <p
          v-else-if="save.done.value"
          class="ds-hint ds-text-success"
          role="status"
        >
          Pedido atualizado.
        </p>

        <div class="ds-cluster ds-cluster--2">
          <button
            v-if="canRefund"
            type="button"
            class="ds-btn ds-btn--ghost"
            @click="showRefund = true"
          >
            Reembolsar
          </button>
          <button
            type="submit"
            class="ds-btn ds-btn--primary ds-grow"
            :disabled="save.isPending.value"
            :aria-busy="save.isPending.value"
          >
            {{ open.source === 'drop' ? 'Salvar e notificar cliente' : 'Salvar' }}
          </button>
        </div>
      </form>
    </article>

    <article
      v-else
      class="ds-card ds-card--sunken ds-empty"
    >
      <p>Abra um pedido na lista para ver o detalhe, mudar o status e informar o envio.</p>
    </article>
  </section>

  <ModalDialog
    v-if="showRefund && open"
    title="Reembolsar pedido"
    @close="showRefund = false"
  >
    <p class="ds-text-sm">
      Registra uma transação de reembolso de {{ brl(open.totalAmount) }} para {{ codeOf(open) }} e marca o pedido como
      "Reembolsado". O estorno no meio de pagamento é feito pelo provedor.
    </p>
    <p
      v-if="refund.error.value"
      class="ds-error"
      role="alert"
    >
      {{ refund.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="showRefund = false"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="refund.isPending.value"
        @click="refund.run()"
      >
        Reembolsar {{ brl(open.totalAmount) }}
      </button>
    </template>
  </ModalDialog>
</template>
