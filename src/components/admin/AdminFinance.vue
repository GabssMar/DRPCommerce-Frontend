<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { admin, registerInvoice, searchOrders } from '../../services/admin-api';
import {
  INVOICE_STATUS, INVOICE_TYPE, TRANSACTION_METHOD, TRANSACTION_STATUS, TRANSACTION_TYPE, labelOf, options,
} from '../../services/status';
import {
  brl, brlCompact, dropOrderCode, formatDateTime, formatNumber, fromDateInput, localDayKey, storeOrderCode, toDateInput,
} from '../../services/format';
import { PAGE_SIZE_MAX } from '../../services/paging';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E6 · Financeiro. Rotas: GET drop-transactions/get-all + transactions/get-all, GET invoices/get-all,
// POST invoices/add (registrar nota emitida fora) e PUT invoices/update (cancelar: statusId 4).
// As transações só são lidas: o CRUD do drop responde 403 DropPurchase.UseWorkflow, e a vitrine
// confirma, cancela e estorna pelo ciclo do pedido (Pedidos), que movimenta estoque e cupom junto.
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const tab = computed(() => (props.params.tab === 'notas' ? 'notas' : 'transacoes'));
const PAGE_SIZE = 20;
const PERIOD_DAYS = 14;

const data = useAsync(async () => {
  const [dropTx, storeTx, invoices] = await Promise.all([
    admin.dropTransactions.getAll(), admin.transactions.getAll(), admin.invoices.getAll(),
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
  return { transactions, invoices };
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


// Notas fiscais
const invoices = computed(() => [...(data.data.value?.invoices ?? [])].sort((a, b) => b.id - a.id));
const invoiceLabel = (i) => `${labelOf(INVOICE_TYPE, i.invoiceTypeId)} ${i.number} · série ${i.series}`;
const cancelInvoice = useAction(async (invoice) => {
  await admin.invoices.patch(invoice, { invoiceStatusId: 4 });
  await data.reload();
});

// Registrar nota: pedidos pagos da vitrine, fora de cancelado/reembolsado, sem nota ativa.
const blankInvoice = () => ({
  orderId: '', typeId: 1, number: '', series: '1', accessKey: '', taxAmount: 0, fileUrl: '', issuedDate: toDateInput(Date.now()),
});
const invoiceForm = reactive(blankInvoice());
const registering = ref(false);
const paidOrders = useAsync(
  async () => (await searchOrders({ paymentStatusIds: [2], sort: 'newest', page: 1, pageSize: PAGE_SIZE_MAX })).items,
  { immediate: false, initial: [] },
);
const invoiceable = computed(() => {
  const withInvoice = new Set(invoices.value.filter((i) => i.invoiceStatusId !== 4).map((i) => i.orderId));
  return (paidOrders.data.value ?? []).filter((o) => ![6, 7].includes(o.statusId) && !withInvoice.has(o.id));
});
const register = useAction(async () => {
  const order = invoiceable.value.find((o) => o.id === Number(invoiceForm.orderId));
  await registerInvoice({
    order,
    typeId: Number(invoiceForm.typeId),
    number: invoiceForm.number.trim(),
    series: invoiceForm.series.trim(),
    accessKey: invoiceForm.accessKey.replace(/\s/g, ''),
    taxAmount: Number(invoiceForm.taxAmount) || 0,
    fileUrl: invoiceForm.fileUrl.trim(),
    issuedAt: fromDateInput(invoiceForm.issuedDate),
  });
  registering.value = false;
  await data.reload();
});
const openRegister = () => {
  Object.assign(invoiceForm, blankInvoice());
  register.error.value = null;
  registering.value = true;
  paidOrders.reload();
};
const invoiceReady = computed(() => Boolean(
  invoiceForm.orderId && invoiceForm.number.trim() && invoiceForm.series.trim() && invoiceForm.accessKey.trim(),
));
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
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ds-table-footer">
            <span class="ds-hint">Somente leitura: o pagamento da vitrine é confirmado e estornado no pedido, em Pedidos.</span>
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
          @click="openRegister"
        >
          Registrar nota
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
        O sistema não emite NF-e: registre aqui a nota emitida no seu emissor fiscal. Pedidos de drop ainda não aceitam nota.
      </p>
    </article>
  </LoadState>

  <ModalDialog
    v-if="registering"
    title="Registrar nota fiscal"
    @close="registering = false"
  >
    <form
      id="invoice-form"
      class="ds-stack--4"
      @submit.prevent="register.run()"
    >
      <p class="ds-text-sm ds-text-secondary">
        Para notas já emitidas no seu emissor fiscal. O registro não envia nada à SEFAZ.
      </p>
      <div class="ds-field">
        <label
          class="ds-label"
          for="inv-order"
        >Pedido da vitrine (pago, sem nota)</label>
        <select
          id="inv-order"
          v-model="invoiceForm.orderId"
          class="ds-input"
          required
          :disabled="paidOrders.isLoading.value"
        >
          <option
            value=""
            disabled
          >
            {{ paidOrders.isLoading.value ? 'Carregando pedidos…' : invoiceable.length ? 'Selecione' : 'Nenhum pedido pago sem nota' }}
          </option>
          <option
            v-for="o in invoiceable"
            :key="o.id"
            :value="o.id"
          >
            #{{ o.number }} · {{ o.customerName }} · {{ brl(o.totalAmount) }}
          </option>
        </select>
        <span
          v-if="paidOrders.error.value"
          class="ds-error"
          role="alert"
        >{{ paidOrders.error.value.message }}</span>
        <span
          v-else
          class="ds-hint"
        >Lista os {{ PAGE_SIZE_MAX }} pedidos pagos mais recentes.</span>
      </div>
      <div class="ds-grid ds-grid--sidebar">
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-type"
          >Tipo</label>
          <select
            id="inv-type"
            v-model.number="invoiceForm.typeId"
            class="ds-input"
          >
            <option
              v-for="t in options(INVOICE_TYPE)"
              :key="t.id"
              :value="t.id"
            >
              {{ t.label }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-date"
          >Emitida em</label>
          <input
            id="inv-date"
            v-model="invoiceForm.issuedDate"
            class="ds-input"
            type="date"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-number"
          >Número</label>
          <input
            id="inv-number"
            v-model="invoiceForm.number"
            class="ds-input"
            maxlength="100"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-series"
          >Série</label>
          <input
            id="inv-series"
            v-model="invoiceForm.series"
            class="ds-input"
            maxlength="100"
            required
          >
        </div>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="inv-key"
        >Chave de acesso</label>
        <input
          id="inv-key"
          v-model="invoiceForm.accessKey"
          class="ds-input ds-mono"
          maxlength="500"
          inputmode="numeric"
          required
        >
        <span class="ds-hint">Na NF-e, os 44 dígitos impressos no DANFE.</span>
      </div>
      <div class="ds-grid ds-grid--sidebar">
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-tax"
          >Impostos (R$)</label>
          <input
            id="inv-tax"
            v-model="invoiceForm.taxAmount"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="inv-file"
          >Link do PDF ou XML (opcional)</label>
          <input
            id="inv-file"
            v-model="invoiceForm.fileUrl"
            class="ds-input"
            type="url"
            maxlength="500"
          >
        </div>
      </div>
      <p
        v-if="register.error.value"
        class="ds-error"
        role="alert"
      >
        {{ Object.values(register.error.value.fieldErrors ?? {})[0]?.[0] ?? register.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="registering = false"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="invoice-form"
        class="ds-btn ds-btn--primary"
        :disabled="!invoiceReady || register.isPending.value"
        :aria-busy="register.isPending.value"
      >
        Registrar
      </button>
    </template>
  </ModalDialog>
</template>
