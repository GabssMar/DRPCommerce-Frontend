<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, Download, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { admin, advanceDropOrder, dropNextStatuses } from '../../services/admin-api';
import { ORDER_STATUS, PAYMENT_STATUS, options } from '../../services/status';
import { brl, dropOrderCode, formatDateTime, initials, localDayKey, shortName } from '../../services/format';
import { csvMoney, downloadCsv } from '../../services/csv';
import LoadState from '../ui/LoadState.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E5 · Pedidos de drop. Rotas (/api/drop): drop-orders/get-all, POST drop-purchases/{id}/fulfillment
// (só depois do pagamento confirmado: 3, 4 e 5), drop-notifications/add (aviso ao cliente) e
// POST customers/get-list-by-list-id. O CRUD de drop-orders responde 403 DropPurchase.UseWorkflow
// e a compra do drop não tem cancelamento nem estorno no back.
const PAGE_SIZE = 20;
const PERIODS = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 14, label: 'Últimos 14 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 0, label: 'Todo o período' },
];

const INITIAL_FILTERS = { search: '', statusId: '', days: 14 };
const filters = reactive({ ...INITIAL_FILTERS });
const filtersActive = computed(() => Object.keys(INITIAL_FILTERS).some((k) => filters[k] !== INITIAL_FILTERS[k]));
const clearFilters = () => Object.assign(filters, INITIAL_FILTERS);
const page = ref(1);
watch(filters, () => { page.value = 1; });

const data = useAsync(async () => {
  const [orders, events] = await Promise.all([admin.dropOrders.getAll(), admin.dropEvents.getAll()]);
  const live = orders.filter((o) => !o.isDeleted);
  const customers = await admin.customers.getByIds(live.map((o) => o.customerId));
  return { orders: live, events, customers };
});

const customerOf = (id) => data.data.value?.customers.find((c) => c.id === id) ?? null;
const eventName = (id) => data.data.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;

const rows = computed(() => {
  const term = filters.search.trim().toLowerCase();
  const since = filters.days ? localDayKey(Date.now() - (filters.days - 1) * 864e5) : '';
  return (data.data.value?.orders ?? [])
    .filter((o) => !filters.statusId || o.dropOrderStatusId === Number(filters.statusId))
    .filter((o) => !since || localDayKey(o.createdAt) >= since)
    .filter((o) => !term || `${dropOrderCode(o.id)} ${o.id} ${customerOf(o.customerId)?.fullName ?? ''} ${o.shippingZipCode ?? ''}`.toLowerCase().includes(term))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
});
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

// Seleção em lote
const selected = ref(new Set());
const toggle = (o) => {
  const next = new Set(selected.value);
  if (next.has(o.id)) next.delete(o.id);
  else next.add(o.id);
  selected.value = next;
};
const allOnPage = computed(() => pageRows.value.length > 0 && pageRows.value.every((o) => selected.value.has(o.id)));
const toggleAll = () => {
  const next = new Set(selected.value);
  pageRows.value.forEach((o) => (allOnPage.value ? next.delete(o.id) : next.add(o.id)));
  selected.value = next;
};

const bulkProcessing = useAction(async () => {
  // Só compras pagas que ainda não chegaram em "Em processamento", uma por vez.
  const ready = rows.value.filter((o) => selected.value.has(o.id) && dropNextStatuses(o).includes(3));
  for (const order of ready) await advanceDropOrder(order, 3);
  selected.value = new Set();
  await data.reload();
});

// Detalhe
const openId = ref(null);
const open = computed(() => (data.data.value?.orders ?? []).find((o) => o.id === openId.value) ?? null);
const statusId = ref(1);
watch(open, (o) => { if (o) statusId.value = o.dropOrderStatusId; });
// Só o status atual e os passos que o back aceita agora.
const statusOptions = computed(() => {
  if (!open.value) return [];
  const allowed = new Set([open.value.dropOrderStatusId, ...dropNextStatuses(open.value)]);
  return options(ORDER_STATUS).filter((s) => allowed.has(s.id));
});
const locked = computed(() => Boolean(open.value) && dropNextStatuses(open.value).length === 0);

const save = useAction(async () => {
  const o = open.value;
  if (statusId.value === o.dropOrderStatusId) return;
  await advanceDropOrder(o, statusId.value);
  await admin.dropNotifications.add({
    dropEventId: o.dropEventId, customerId: o.customerId, dropNotificationChannelId: 1, dropNotificationTypeId: 5,
    subject: `Pedido ${dropOrderCode(o.id)}: ${ORDER_STATUS[statusId.value].label.toLowerCase()}`,
    body: 'Acompanhe o andamento em Meus pedidos.', dropNotificationStatusId: 1,
    scheduledAt: new Date().toISOString(), sentAt: null,
  });
  await data.reload();
});


// CSV do filtro atual
const exportCsv = () => {
  const header = ['pedido', 'data', 'cliente', 'status', 'pagamento', 'total'];
  const lines = rows.value.map((o) => [
    dropOrderCode(o.id), formatDateTime(o.createdAt), customerOf(o.customerId)?.fullName ?? o.customerId,
    ORDER_STATUS[o.dropOrderStatusId]?.label, PAYMENT_STATUS[o.dropOrderPaymentStatusId]?.label, csvMoney(o.totalAmount),
  ]);
  downloadCsv('pedidos-drop', header, lines);
};
</script>

<template>
  <div class="ds-toolbar">
    <div class="ds-toolbar__search">
      <label
        class="ds-sr-only"
        for="do-search"
      >Buscar pedidos de drop</label>
      <input
        id="do-search"
        v-model="filters.search"
        class="ds-input"
        type="search"
        placeholder="Nº do pedido, cliente ou CEP"
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
    <div class="ds-toolbar__actions">
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
  </div>

  <section class="ds-grid ds-grid--split">
    <div class="ds-card ds-card--flush">
      <LoadState
        :is-loading="data.isLoading.value"
        :error="data.error.value"
        :is-empty="!rows.length"
        :empty-text="filtersActive ? 'Nenhum pedido de drop com estes filtros.' : 'Nenhum pedido de drop ainda.'"
        :lines="8"
        flush
        @retry="data.reload"
      >
        <template #empty-action>
          <button
            v-if="filtersActive"
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="clearFilters"
          >
            Limpar filtros
          </button>
          <a
            v-else
            class="ds-btn ds-btn--secondary ds-btn--sm"
            :href="href('/admin/drops')"
          >
            Ver drops
          </a>
        </template>
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Pedidos de drop
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
                :key="o.id"
                :aria-selected="openId === o.id ? 'true' : undefined"
              >
                <td>
                  <input
                    class="ds-checkbox"
                    type="checkbox"
                    :checked="selected.has(o.id)"
                    :aria-label="`Selecionar ${dropOrderCode(o.id)}`"
                    @change="toggle(o)"
                  >
                </td>
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-stack--1"
                    @click="openId = o.id"
                  >
                    <span class="ds-mono">{{ dropOrderCode(o.id) }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ formatDateTime(o.createdAt) }}</span>
                  </button>
                </td>
                <td>{{ shortName(customerOf(o.customerId)?.fullName ?? `#${o.customerId}`) }}</td>
                <td>
                  <StatusBadge
                    :id="o.dropOrderStatusId"
                    :table="ORDER_STATUS"
                  />
                </td>
                <td>
                  <StatusBadge
                    :id="o.dropOrderPaymentStatusId"
                    :table="PAYMENT_STATUS"
                    :dot="false"
                  />
                </td>
                <td :class="['ds-table__td--numeric', { 'ds-table__td--muted': o.dropOrderStatusId >= 6 }]">
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
          <span class="ds-text-xs ds-text-secondary">{{ eventName(open.dropEventId) }}</span>
          <h2 class="ds-title--md ds-mono">
            {{ dropOrderCode(open.id) }}
          </h2>
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
        >{{ initials(customerOf(open.customerId)?.fullName) }}</span>
        <span class="ds-stack--1">
          <span>{{ customerOf(open.customerId)?.fullName ?? `Cliente #${open.customerId}` }}</span>
          <span class="ds-text-xs ds-text-secondary">cliente #{{ open.customerId }}</span>
        </span>
      </div>

      <form
        class="ds-stack--5"
        @submit.prevent="save.run()"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="do-status"
          >Status do pedido</label>
          <select
            id="do-status"
            v-model.number="statusId"
            class="ds-input"
            :disabled="locked"
          >
            <option
              v-for="s in statusOptions"
              :key="s.id"
              :value="s.id"
            >
              {{ s.label }}
            </option>
          </select>
        </div>
        <p class="ds-hint">
          {{ open.shippingAddressLine }} · {{ open.shippingCity }} · {{ open.shippingZipCode }}.
          Compras de drop avançam depois do pagamento confirmado e ainda não têm envio, nota, cancelamento nem estorno no back-end.
        </p>
        <dl class="ds-dl ds-text-sm">
          <dt>Subtotal</dt>
          <dd>{{ brl(open.subTotal) }}</dd>
          <template v-if="open.discountAmount">
            <dt>Cupom</dt>
            <dd class="ds-text-success">
              − {{ brl(open.discountAmount) }}
            </dd>
          </template>
          <dt>Frete</dt>
          <dd>{{ brl(open.shippingCost) }}</dd>
          <dt class="ds-dl__total">
            Total
          </dt>
          <dd class="ds-text-medium">
            {{ brl(open.totalAmount) }}
          </dd>
        </dl>
        <p
          v-if="save.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ save.error.value.message }}
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
            type="submit"
            class="ds-btn ds-btn--primary ds-grow"
            :disabled="locked || save.isPending.value"
            :aria-busy="save.isPending.value"
          >
            <span
              v-if="save.isPending.value"
              class="ds-spinner"
              aria-hidden="true"
            />
            Salvar e notificar cliente
          </button>
        </div>
      </form>
    </article>

    <article
      v-else
      class="ds-card ds-card--sunken ds-empty"
    >
      <p>Abra um pedido na lista para ver o detalhe e mudar o status.</p>
    </article>
  </section>
</template>
