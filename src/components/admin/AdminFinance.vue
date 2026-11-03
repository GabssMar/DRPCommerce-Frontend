<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { admin, issueInvoice, refundOrder } from '../../services/admin-api';
import {
  INVOICE_STATUS, INVOICE_TYPE, TRANSACTION_METHOD, TRANSACTION_STATUS, TRANSACTION_TYPE, labelOf, options,
} from '../../services/status';
import { brl, brlCompact, dropOrderCode, formatDateTime, formatNumber, localDayKey, storeOrderCode } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E6 · Financeiro. Rotas: GET drop-transactions/get-all + transactions/get-all,
// PUT …/update (capturar: statusId 3 · cancelar: statusId 5), reembolso (transação typeId 2),
// GET invoices/get-all · POST invoices/add · PUT invoices/update (cancelar: statusId 4).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const tab = computed(() => (props.params.tab === 'notas' ? 'notas' : 'transacoes'));
const PAGE_SIZE = 20;
const PERIOD_DAYS = 14;

const data = useAsync(async () => {
  const [dropTx, storeTx, invoices, storeOrders] = await Promise.all([
    admin.dropTransactions.getAll(), admin.transactions.getAll(), admin.invoices.getAll(), admin.orders.getAll(),
  ]);
  const transactions = [
    ...dropTx.map((t) => ({
      source: 'drop', key: `drop:${t.id}`, orderId: t.dropOrderId, typeId: t.dropTransactionTypeId,
      methodId: t.dropTransactionMethodId, statusId: t.dropTransactionStatusId, raw: t,
    })),
    ...storeTx.map((t) => ({
      source: 'store', key: `store:${t.id}`, orderId: t.orderId, typeId: t.transactionTypeId,
      methodId: t.transactionMethodId, statusId: t.transactionStatusId, raw: t,
    })),
  ].map((t) => ({ ...t, amount: t.raw.amount, fee: t.raw.fee, createdAt: t.raw.createdAt, reference: t.raw.gatewayReference }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { transactions, invoices, storeOrders };
});

const codeOf = (t) => (t.source === 'drop' ? dropOrderCode(t.orderId) : storeOrderCode(t.orderId));
const isRefund = (t) => t.typeId !== 1;

// KPIs dos últimos 14 dias
const kpis = computed(() => {
  const since = localDayKey(Date.now() - (PERIOD_DAYS - 1) * 864e5);
  const list = (data.data.value?.transactions ?? []).filter((t) => localDayKey(t.createdAt) >= since);
  const sum = (rows, fn = (t) => t.amount) => rows.reduce((s, t) => s + fn(t), 0);
  const refunds = list.filter(isRefund);
  return {
    captured: sum(list.filter((t) => !isRefund(t) && t.statusId === 3)),
    pending: sum(list.filter((t) => !isRefund(t) && [1, 2].includes(t.statusId))),
    fees: sum(list, (t) => t.fee),
    refunds: sum(refunds),
    refundCount: refunds.length,
  };
});
const compact = (v) => brlCompact(v);

const filters = reactive({ source: 'all', methodId: '', statusId: '' });
const page = ref(1);
watch(filters, () => { page.value = 1; });
const rows = computed(() => (data.data.value?.transactions ?? [])
  .filter((t) => filters.source === 'all' || t.source === filters.source)
  .filter((t) => !filters.methodId || t.methodId === Number(filters.methodId))
  .filter((t) => !filters.statusId || t.statusId === Number(filters.statusId)));
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const resource = (t) => (t.source === 'drop' ? admin.dropTransactions : admin.transactions);
const statusField = (t) => (t.source === 'drop' ? 'dropTransactionStatusId' : 'transactionStatusId');

const capture = useAction(async (t) => {
  await resource(t).patch(t.raw, { [statusField(t)]: 3, paidAt: new Date().toISOString() });
  await data.reload();
});
const cancel = useAction(async (t) => {
  await resource(t).patch(t.raw, { [statusField(t)]: 5 });
  await data.reload();
});

const refunding = ref(null);
const refund = useAction(async () => {
  const t = refunding.value;
  const order = t.source === 'drop' ? await admin.dropOrders.getById(t.orderId) : await admin.orders.getById(t.orderId);
  await refundOrder(t.source, order, t.raw);
  refunding.value = null;
  await data.reload();
});
const actionError = computed(() => capture.error.value || cancel.error.value);

// Notas fiscais
const invoices = computed(() => [...(data.data.value?.invoices ?? [])].sort((a, b) => b.id - a.id));
const invoiceLabel = (i) => `${labelOf(INVOICE_TYPE, i.invoiceTypeId)} ${i.number} · série ${i.series}`;
const cancelInvoice = useAction(async (invoice) => {
  await admin.invoices.patch(invoice, { invoiceStatusId: 4 });
  await data.reload();
});

const showEmit = ref(false);
const emitOrderId = ref('');
const invoiceable = computed(() => {
  const withInvoice = new Set(invoices.value.filter((i) => i.invoiceStatusId !== 4).map((i) => i.orderId));
  return (data.data.value?.storeOrders ?? [])
    .filter((o) => o.orderPaymentStatusId === 2 && ![6, 7].includes(o.orderStatusId) && !withInvoice.has(o.id))
    .sort((a, b) => b.id - a.id);
});
const emitNote = useAction(async () => {
  const order = invoiceable.value.find((o) => o.id === Number(emitOrderId.value));
  const next = Math.max(0, ...invoices.value.map((i) => Number(i.number) || 0)) + 1;
  await issueInvoice(order, next);
  showEmit.value = false;
  emitOrderId.value = '';
  await data.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Financeiro
    </h1>
    <nav
      class="ds-nav"
      aria-label="Seções do financeiro"
    >
      <a
        class="ds-nav__item"
        :href="href('/admin/financeiro')"
        :aria-current="tab === 'transacoes' ? 'page' : undefined"
      >Transações</a>
      <a
        class="ds-nav__item"
        :href="href('/admin/financeiro/notas')"
        :aria-current="tab === 'notas' ? 'page' : undefined"
      >Notas fiscais</a>
    </nav>
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="10"
    @retry="data.reload"
  >
    <template v-if="tab === 'transacoes'">
      <section class="ds-grid ds-grid--kpi">
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Capturado</span>
          <div
            class="ds-stat"
            :title="brl(kpis.captured)"
          >
            <div class="ds-stat__value">
              {{ compact(kpis.captured).value }}<span class="ds-stat__unit">{{ compact(kpis.captured).unit }}</span>
            </div>
            <div class="ds-stat__label">
              {{ PERIOD_DAYS }} dias
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Aguardando</span>
          <div
            class="ds-stat"
            :title="brl(kpis.pending)"
          >
            <div class="ds-stat__value">
              {{ compact(kpis.pending).value }}<span class="ds-stat__unit">{{ compact(kpis.pending).unit }}</span>
            </div>
            <div class="ds-stat__label">
              pendentes e autorizados
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Taxas</span>
          <div
            class="ds-stat"
            :title="brl(kpis.fees)"
          >
            <div class="ds-stat__value">
              {{ compact(kpis.fees).value }}<span class="ds-stat__unit">{{ compact(kpis.fees).unit }}</span>
            </div>
            <div class="ds-stat__label">
              soma das taxas do gateway
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Reembolsos</span>
          <div
            class="ds-stat"
            :title="brl(kpis.refunds)"
          >
            <div class="ds-stat__value">
              {{ compact(kpis.refunds).value }}<span class="ds-stat__unit">{{ compact(kpis.refunds).unit }}</span>
            </div>
            <div class="ds-stat__label">
              {{ formatNumber(kpis.refundCount) }} {{ kpis.refundCount === 1 ? 'transação' : 'transações' }}
            </div>
          </div>
        </article>
      </section>

      <div class="ds-toolbar">
        <div
          class="ds-nav"
          role="group"
          aria-label="Origem"
        >
          <button
            v-for="s in [{ id: 'all', label: 'Todas' }, { id: 'drop', label: 'Drop' }, { id: 'store', label: 'Vitrine' }]"
            :key="s.id"
            type="button"
            :class="['ds-nav__item', { 'ds-nav__item--active': filters.source === s.id }]"
            :aria-pressed="filters.source === s.id"
            @click="filters.source = s.id"
          >
            {{ s.label }}
          </button>
        </div>
        <label
          class="ds-sr-only"
          for="fi-method"
        >Método</label>
        <select
          id="fi-method"
          v-model="filters.methodId"
          class="ds-input ds-toolbar__filter"
        >
          <option value="">
            Todos os métodos
          </option>
          <option
            v-for="m in options(TRANSACTION_METHOD)"
            :key="m.id"
            :value="m.id"
          >
            {{ m.label }}
          </option>
        </select>
        <label
          class="ds-sr-only"
          for="fi-status"
        >Status</label>
        <select
          id="fi-status"
          v-model="filters.statusId"
          class="ds-input ds-toolbar__filter"
        >
          <option value="">
            Todos os status
          </option>
          <option
            v-for="s in options(TRANSACTION_STATUS)"
            :key="s.id"
            :value="s.id"
          >
            {{ s.label }}
          </option>
        </select>
      </div>

      <p
        v-if="actionError"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ actionError.message }}
      </p>

      <div class="ds-card ds-card--flush">
        <LoadState
          :is-empty="!rows.length"
          empty-text="Nenhuma transação com esses filtros."
        >
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Transações de pagamento e reembolso
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Pedido
                  </th>
                  <th scope="col">
                    Tipo
                  </th>
                  <th scope="col">
                    Método
                  </th>
                  <th scope="col">
                    Gateway
                  </th>
                  <th scope="col">
                    Status
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Valor
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Taxa
                  </th>
                  <th scope="col">
                    <span class="ds-sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="t in pageRows"
                  :key="t.key"
                >
                  <td>
                    <span class="ds-stack--1">
                      <span class="ds-mono">{{ codeOf(t) }}</span>
                      <span :class="['ds-badge', 'ds-self-start', t.source === 'drop' ? 'ds-badge--inverse' : 'ds-badge--done']">{{ t.source === 'drop' ? 'Drop' : 'Vitrine' }}</span>
                    </span>
                  </td>
                  <td>{{ labelOf(TRANSACTION_TYPE, t.typeId) }}</td>
                  <td>{{ labelOf(TRANSACTION_METHOD, t.methodId) }}</td>
                  <td class="ds-mono ds-text-sm ds-text-secondary">
                    {{ t.reference || '—' }}
                  </td>
                  <td>
                    <StatusBadge
                      :id="t.statusId"
                      :table="TRANSACTION_STATUS"
                      :dot="false"
                    />
                  </td>
                  <td class="ds-table__td--numeric ds-nowrap">
                    {{ isRefund(t) ? '− ' : '' }}{{ brl(t.amount) }}
                  </td>
                  <td class="ds-table__td--numeric">
                    {{ brl(t.fee) }}
                  </td>
                  <td>
                    <button
                      v-if="t.typeId === 1 && t.statusId === 2"
                      type="button"
                      class="ds-btn ds-btn--secondary ds-btn--sm"
                      :disabled="capture.isPending.value"
                      @click="capture.run(t)"
                    >
                      Capturar
                    </button>
                    <button
                      v-else-if="t.typeId === 1 && t.statusId === 1"
                      type="button"
                      class="ds-btn ds-btn--ghost ds-btn--sm"
                      :disabled="cancel.isPending.value"
                      @click="cancel.run(t)"
                    >
                      Cancelar
                    </button>
                    <button
                      v-else-if="t.typeId === 1 && t.statusId === 3"
                      type="button"
                      class="ds-btn ds-btn--ghost ds-btn--sm"
                      @click="refunding = t"
                    >
                      Reembolsar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ds-table-footer">
            <span class="ds-hint">Capturar confirma um pagamento autorizado no cartão.</span>
            <PaginationNav
              v-model:page="page"
              :page-size="PAGE_SIZE"
              :total="rows.length"
            />
          </div>
        </LoadState>
      </div>
    </template>

    <article
      class="ds-card ds-stack--4"
      :class="{ 'ds-card--flush': tab === 'notas' }"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          {{ tab === 'notas' ? 'Notas fiscais' : 'Notas fiscais recentes' }}
        </h2>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="showEmit = true"
        >
          Emitir nota
        </button>
      </header>

      <div
        v-if="tab === 'transacoes'"
        class="ds-stack--1"
      >
        <div
          v-for="i in invoices.slice(0, 4)"
          :key="i.id"
          class="ds-row-divided ds-text-sm"
        >
          <span class="ds-cluster ds-cluster--2">
            <span class="ds-mono">{{ invoiceLabel(i) }}</span>
            <span class="ds-text-secondary">{{ storeOrderCode(i.orderId) }}</span>
          </span>
          <span class="ds-cluster ds-cluster--2">
            <span class="ds-numeric">{{ brl(i.totalAmount) }}</span>
            <StatusBadge
              :id="i.invoiceStatusId"
              :table="INVOICE_STATUS"
              :dot="false"
            />
          </span>
        </div>
        <a
          class="ds-text-sm ds-text-brand"
          :href="href('/admin/financeiro/notas')"
        >Ver todas as notas</a>
      </div>

      <div
        v-else
        class="ds-table-scroll"
      >
        <table class="ds-table">
          <caption class="ds-sr-only">
            Notas fiscais emitidas
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Nota
              </th>
              <th scope="col">
                Pedido
              </th>
              <th scope="col">
                Emitida em
              </th>
              <th
                scope="col"
                class="ds-table__th--numeric"
              >
                Total
              </th>
              <th scope="col">
                Situação
              </th>
              <th scope="col">
                <span class="ds-sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="i in invoices"
              :key="i.id"
            >
              <td class="ds-mono">
                {{ invoiceLabel(i) }}
              </td>
              <td class="ds-mono">
                {{ storeOrderCode(i.orderId) }}
              </td>
              <td class="ds-numeric ds-nowrap">
                {{ formatDateTime(i.issuedAt) }}
              </td>
              <td class="ds-table__td--numeric">
                {{ brl(i.totalAmount) }}
              </td>
              <td>
                <StatusBadge
                  :id="i.invoiceStatusId"
                  :table="INVOICE_STATUS"
                  :dot="false"
                />
              </td>
              <td>
                <button
                  v-if="i.invoiceStatusId !== 4"
                  type="button"
                  class="ds-btn ds-btn--ghost ds-btn--sm"
                  :disabled="cancelInvoice.isPending.value"
                  @click="cancelInvoice.run(i)"
                >
                  Cancelar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p :class="['ds-hint', { 'ds-card__note': tab === 'notas' }]">
        Pedidos de drop ainda não geram nota: a nota fiscal só aceita pedidos da vitrine.
      </p>
    </article>
  </LoadState>

  <ModalDialog
    v-if="refunding"
    title="Reembolsar pagamento"
    @close="refunding = null"
  >
    <p class="ds-text-sm">
      Registra o reembolso de {{ brl(refunding.amount) }} do pedido {{ codeOf(refunding) }} e marca o pedido como "Reembolsado".
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
        @click="refunding = null"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="refund.isPending.value"
        @click="refund.run()"
      >
        Reembolsar
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="showEmit"
    title="Emitir nota fiscal"
    @close="showEmit = false"
  >
    <form
      id="emit-form"
      class="ds-stack--4"
      @submit.prevent="emitNote.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="emit-order"
        >Pedido da vitrine (pago, sem nota)</label>
        <select
          id="emit-order"
          v-model="emitOrderId"
          class="ds-input"
          required
        >
          <option
            value=""
            disabled
          >
            Selecione
          </option>
          <option
            v-for="o in invoiceable"
            :key="o.id"
            :value="o.id"
          >
            {{ storeOrderCode(o.id) }} · {{ brl(o.totalAmount) }}
          </option>
        </select>
        <span class="ds-hint">A nota nasce "Pendente" até a autorização da SEFAZ.</span>
      </div>
      <p
        v-if="emitNote.error.value"
        class="ds-error"
        role="alert"
      >
        {{ emitNote.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="showEmit = false"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="emit-form"
        class="ds-btn ds-btn--primary"
        :disabled="!emitOrderId || emitNote.isPending.value"
      >
        Emitir
      </button>
    </template>
  </ModalDialog>
</template>
