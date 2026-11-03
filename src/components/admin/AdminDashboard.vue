<script setup>
import { computed, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { useAsync } from '../../composables/useAsync';
import { href } from '../../router';
import { admin } from '../../services/admin-api';
import { normalizeOrders, summarizeSales } from '../../services/sales';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../services/status';
import { brl, brlCompact, formatDate, formatNumber, formatTime, percent } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import SalesChart from './SalesChart.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E1 · Dashboard de vendas. Rotas: GET drop-orders/get-all + orders/get-all,
// GET drop-order-items/get-all + order-items/get-all. Soma no front, em
// America/Sao_Paulo e sem cancelados/reembolsados (até existir sales-summary).
defineProps({ params: { type: Object, default: () => ({}) } });

const PERIODS = [
  { days: 1, label: 'Hoje' },
  { days: 14, label: '14 dias' },
  { days: 30, label: 'Mês' },
];
const SOURCES = [
  { id: 'all', label: 'Drop + Vitrine' },
  { id: 'drop', label: 'Drop' },
  { id: 'store', label: 'Vitrine' },
];
const days = ref(14);
const source = ref('all');
const showTable = ref(false);

const data = useAsync(async () => {
  const [dropOrders, storeOrders, dropItems, storeItems] = await Promise.all([
    admin.dropOrders.getAll(), admin.orders.getAll(), admin.dropOrderItems.getAll(), admin.orderItems.getAll(),
  ]);
  return { orders: normalizeOrders({ dropOrders, storeOrders }), items: { drop: dropItems, store: storeItems }, loadedAt: new Date() };
});

const summary = computed(() => (data.data.value
  ? summarizeSales(data.data.value.orders, { days: days.value, source: source.value, items: data.data.value.items })
  : null));

const revenue = computed(() => brlCompact(summary.value?.revenue ?? 0));
const ticket = computed(() => brlCompact(summary.value?.averageTicket ?? 0));
const dayLabel = (key) => formatDate(new Date(`${key}T12:00:00-03:00`));
const periodLabel = computed(() => (summary.value
  ? (days.value === 1 ? 'hoje' : `${dayLabel(summary.value.from)} → ${dayLabel(summary.value.to)}`)
  : ''));

const payments = computed(() => {
  const list = summary.value?.byPayment ?? [];
  const total = list.reduce((s, p) => s + p.revenue, 0);
  return list.map((p) => ({ ...p, pct: percent(p.revenue, total), tone: PAYMENT_STATUS[p.paymentStatusId].tone }));
});

const statusTiles = computed(() => (summary.value?.byStatus ?? []).map((s) => ({
  ...s,
  label: ORDER_STATUS[s.statusId].label,
  excluded: s.statusId >= 6,
  focus: s.statusId === 3, // Em processamento: o que a equipe precisa despachar
})));
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Vendas
    </h1>
    <div class="ds-cluster ds-cluster--2">
      <div
        class="ds-nav"
        role="group"
        aria-label="Período"
      >
        <button
          v-for="p in PERIODS"
          :key="p.days"
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': days === p.days }]"
          :aria-pressed="days === p.days"
          @click="days = p.days"
        >
          {{ p.label }}
        </button>
      </div>
      <div
        class="ds-nav"
        role="group"
        aria-label="Origem"
      >
        <button
          v-for="s in SOURCES"
          :key="s.id"
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': source === s.id }]"
          :aria-pressed="source === s.id"
          @click="source = s.id"
        >
          {{ s.label }}
        </button>
      </div>
      <button
        type="button"
        class="ds-icon-btn"
        aria-label="Atualizar dados"
        :disabled="data.isRefreshing.value"
        @click="data.reload()"
      >
        <RefreshCw
          :size="20"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
      <span
        v-if="data.data.value"
        class="ds-text-xs ds-text-secondary"
        aria-live="polite"
      >atualizado às {{ formatTime(data.data.value.loadedAt) }}</span>
    </div>
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="10"
    @retry="data.reload"
  >
    <template v-if="summary">
      <section class="ds-grid ds-grid--kpi">
        <article class="ds-card ds-card--brand ds-stack--2">
          <span class="ds-label-caps">Faturamento bruto</span>
          <div
            class="ds-stat"
            :title="brl(summary.revenue)"
          >
            <div class="ds-stat__value">
              {{ revenue.value }}<span class="ds-stat__unit">{{ revenue.unit }}</span>
            </div>
            <div class="ds-stat__label">
              {{ periodLabel }} · sem cancelados
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Pedidos</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ formatNumber(summary.orderCount) }}
            </div>
            <div class="ds-stat__label">
              {{ formatNumber(summary.drop.orderCount) }} drop · {{ formatNumber(summary.store.orderCount) }} vitrine
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Ticket médio</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ ticket.value }}<span class="ds-stat__unit">{{ ticket.unit }}</span>
            </div>
            <div class="ds-stat__label">
              drop {{ brl(summary.drop.orderCount ? summary.drop.revenue / summary.drop.orderCount : 0) }}
              · vitrine {{ brl(summary.store.orderCount ? summary.store.revenue / summary.store.orderCount : 0) }}
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Unidades</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ formatNumber(summary.unitCount) }}<span class="ds-stat__unit">un.</span>
            </div>
            <div class="ds-stat__label">
              {{ formatNumber(summary.drop.unitCount) }} drop · {{ formatNumber(summary.store.unitCount) }} vitrine
            </div>
          </div>
        </article>
      </section>

      <section class="ds-grid ds-grid--sidebar">
        <article class="ds-card ds-stack--5 ds-min-0">
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Faturamento por dia
            </h2>
            <div class="ds-chart__legend">
              <span
                v-if="source !== 'store'"
                class="ds-chart__key"
              ><span class="ds-swatch ds-swatch--2" />Drop</span>
              <span
                v-if="source !== 'drop'"
                class="ds-chart__key"
              ><span class="ds-swatch" />Vitrine</span>
            </div>
          </header>
          <SalesChart
            :buckets="summary.buckets"
            :show-drop="source !== 'store'"
            :show-store="source !== 'drop'"
          />
          <button
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm ds-self-start"
            :aria-expanded="showTable"
            aria-controls="sales-table"
            @click="showTable = !showTable"
          >
            {{ showTable ? 'Esconder tabela' : 'Ver como tabela' }}
          </button>
          <div
            v-if="showTable"
            id="sales-table"
            class="ds-table-scroll"
          >
            <table class="ds-table ds-text-sm">
              <caption class="ds-sr-only">
                Faturamento por dia
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Dia
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Vitrine
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Drop
                  </th>
                  <th
                    scope="col"
                    class="ds-table__th--numeric"
                  >
                    Pedidos
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in [...summary.buckets].reverse()"
                  :key="b.date"
                >
                  <td>{{ dayLabel(b.date) }}</td>
                  <td class="ds-table__td--numeric">
                    {{ brl(b.store) }}
                  </td>
                  <td class="ds-table__td--numeric">
                    {{ brl(b.drop) }}
                  </td>
                  <td class="ds-table__td--numeric">
                    {{ b.orderCount }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <aside class="ds-stack--6">
          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Pagamento
              </h2>
            </header>
            <div
              class="ds-progress"
              role="img"
              :aria-label="payments.map((p) => `${p.pct}% ${PAYMENT_STATUS[p.paymentStatusId].label.toLowerCase()}`).join(', ')"
            >
              <span
                v-for="p in payments"
                :key="p.paymentStatusId"
                :class="['ds-progress__seg', `ds-progress__seg--${p.tone}`]"
                :style="{ width: `${p.pct}%` }"
              />
            </div>
            <div class="ds-stack--2 ds-text-sm">
              <span
                v-for="p in payments"
                :key="p.paymentStatusId"
                class="ds-cluster ds-cluster--between"
              >
                <StatusBadge
                  :id="p.paymentStatusId"
                  :table="PAYMENT_STATUS"
                  :dot="false"
                />
                <span class="ds-numeric">{{ brlCompact(p.revenue).value }}{{ brlCompact(p.revenue).unit === 'mil' ? 'k' : brlCompact(p.revenue).unit }} · {{ p.pct }}%</span>
              </span>
            </div>
            <span class="ds-hint">Vendido não é recebido: o pendente ainda pode falhar.</span>
          </article>

          <article class="ds-card ds-card--flush">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Mais vendidos
              </h2>
            </header>
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Produtos mais vendidos no período
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Produto
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Un.
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Receita
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="p in summary.topProducts"
                    :key="p.key"
                  >
                    <td>
                      <span class="ds-cluster ds-cluster--2">
                        {{ p.name }}
                        <span
                          v-if="p.source === 'drop'"
                          class="ds-badge ds-badge--inverse"
                        >Drop</span>
                      </span>
                    </td>
                    <td class="ds-table__td--numeric">
                      {{ formatNumber(p.unitCount) }}
                    </td>
                    <td class="ds-table__td--numeric">
                      {{ brl(p.revenue) }}
                    </td>
                  </tr>
                  <tr v-if="!summary.topProducts.length">
                    <td
                      colspan="3"
                      class="ds-text-secondary"
                    >
                      Sem vendas no período.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </aside>
      </section>

      <section class="ds-card ds-stack--4">
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            Pedidos por status
          </h2>
          <a
            class="ds-text-sm ds-text-brand"
            :href="href('/admin/pedidos')"
          >Abrir pedidos</a>
        </header>
        <div class="ds-grid ds-grid--tiles">
          <div
            v-for="tile in statusTiles"
            :key="tile.statusId"
            :class="['ds-tile', { 'ds-tile--inverse': tile.focus, 'ds-tile--excluded': tile.excluded }]"
          >
            <span class="ds-text-xs ds-text-secondary">{{ tile.label }}</span>
            <span class="ds-tile__value">{{ formatNumber(tile.orderCount) }}</span>
          </div>
        </div>
        <span class="ds-hint">Cancelados e reembolsados aparecem tracejados: não entram no faturamento.</span>
      </section>
    </template>
  </LoadState>
</template>
