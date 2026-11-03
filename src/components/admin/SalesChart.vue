<script setup>
import { computed, ref, watch } from 'vue';
import { brl, formatDate, formatWeekday, formatNumber } from '../../services/format';

// components/chart-bars.md: faturamento por dia, vitrine (série 1) com drop
// (série 2) empilhado. SVG inline, eixo no zero, tabela .ds-sr-only equivalente.
const props = defineProps({
  // [{ date: 'YYYY-MM-DD', drop, store, orderCount }]
  buckets: { type: Array, required: true },
  showDrop: { type: Boolean, default: true },
  showStore: { type: Boolean, default: true },
});

const COLUMN = 10;
const BAR = 7;
const HEIGHT = 100;
const MIN_BAR = 1.2; // ~2px: dia sem venda não vira "sem dado"

// Data local (meio-dia evita virar o dia no fuso).
const asDate = (key) => new Date(`${key}T12:00:00-03:00`);

const totals = computed(() => props.buckets.map((b) => (props.showStore ? b.store : 0) + (props.showDrop ? b.drop : 0)));

// Teto "redondo" para o eixo: 1, 2 ou 5 × 10^n acima do maior dia.
const ceiling = computed(() => {
  const max = Math.max(...totals.value, 0);
  if (!max) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((v) => v >= max);
});

const ticks = computed(() => [3, 2, 1, 0].map((i) => (ceiling.value / 3) * i));
const shortMoney = (v) => (v >= 1000 ? `R$ ${formatNumber(Math.round(v / 100) / 10)}k` : v ? `R$ ${formatNumber(Math.round(v))}` : '0');

const bars = computed(() => props.buckets.map((b, i) => {
  const scale = (v) => (v / ceiling.value) * HEIGHT;
  const store = props.showStore ? scale(b.store) : 0;
  const drop = props.showDrop ? scale(b.drop) : 0;
  const empty = !store && !drop;
  return {
    key: b.date,
    x: i * COLUMN + (COLUMN - BAR) / 2,
    store: empty ? MIN_BAR : store,
    drop,
  };
}));

const every = computed(() => Math.ceil(props.buckets.length / 14));
const labels = computed(() => props.buckets.map((b, i) => (i % every.value === 0 || i === props.buckets.length - 1 ? b.date.slice(8) : '')));

const active = ref(props.buckets.length - 1);
watch(() => props.buckets.length, (n) => { active.value = n - 1; });
const activeBucket = computed(() => props.buckets[active.value] ?? null);

const summary = computed(() => {
  const total = totals.value.reduce((s, v) => s + v, 0);
  const best = totals.value.indexOf(Math.max(...totals.value));
  const bestDay = props.buckets[best];
  return `${brl(total)} em ${props.buckets.length} dias${bestDay && totals.value[best] ? `; maior dia ${formatDate(asDate(bestDay.date))} com ${brl(totals.value[best])}` : ''}.`;
});
</script>

<template>
  <figure
    class="ds-chart"
    role="img"
    :aria-label="`Faturamento por dia: ${summary}`"
  >
    <div class="ds-chart__plot">
      <div
        class="ds-chart__axis"
        aria-hidden="true"
      >
        <span
          v-for="tick in ticks"
          :key="tick"
        >{{ shortMoney(tick) }}</span>
      </div>
      <div class="ds-min-0">
        <svg
          class="ds-chart-bars"
          :viewBox="`0 0 ${buckets.length * COLUMN} ${HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="tick in ticks.slice(0, 3)"
            :key="tick"
            class="ds-chart__gridline"
            x1="0"
            :x2="buckets.length * COLUMN"
            :y1="HEIGHT - (tick / ceiling) * HEIGHT"
            :y2="HEIGHT - (tick / ceiling) * HEIGHT"
          />
          <line
            class="ds-chart__baseline"
            x1="0"
            :x2="buckets.length * COLUMN"
            :y1="HEIGHT"
            :y2="HEIGHT"
          />
          <g
            v-for="(bar, i) in bars"
            :key="bar.key"
          >
            <rect
              :class="['ds-chart-bars__hit', { 'ds-chart-bars__hit--active': i === active }]"
              :x="i * COLUMN"
              y="0"
              :width="COLUMN"
              :height="HEIGHT"
              tabindex="0"
              @mouseenter="active = i"
              @focus="active = i"
            />
            <rect
              class="ds-chart-bars__bar"
              :x="bar.x"
              :y="HEIGHT - bar.store"
              :width="BAR"
              :height="bar.store"
            />
            <rect
              v-if="bar.drop"
              class="ds-chart-bars__bar ds-chart-bars__bar--2"
              :x="bar.x"
              :y="HEIGHT - bar.store - bar.drop"
              :width="BAR"
              :height="bar.drop"
            />
          </g>
        </svg>
        <div
          class="ds-chart__labels"
          aria-hidden="true"
        >
          <span
            v-for="(label, i) in labels"
            :key="buckets[i].date"
          >{{ label }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="activeBucket"
      class="ds-chart__tooltip ds-card ds-card--tight ds-stack--1"
      aria-hidden="true"
    >
      <span class="ds-text-xs ds-text-secondary">{{ formatWeekday(asDate(activeBucket.date)) }}, {{ formatDate(asDate(activeBucket.date)) }}</span>
      <span
        v-if="showStore"
        class="ds-cluster ds-cluster--between ds-text-sm"
      ><span>Vitrine</span><strong class="ds-text-medium">{{ brl(activeBucket.store) }}</strong></span>
      <span
        v-if="showDrop"
        class="ds-cluster ds-cluster--between ds-text-sm"
      ><span>Drop</span><strong class="ds-text-medium">{{ brl(activeBucket.drop) }}</strong></span>
      <span class="ds-text-xs ds-text-secondary">{{ activeBucket.orderCount }} {{ activeBucket.orderCount === 1 ? 'pedido' : 'pedidos' }}</span>
    </div>

    <table class="ds-sr-only">
      <caption>Faturamento por dia</caption>
      <thead>
        <tr>
          <th scope="col">
            Dia
          </th>
          <th scope="col">
            Vitrine
          </th>
          <th scope="col">
            Drop
          </th>
          <th scope="col">
            Pedidos
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="b in buckets"
          :key="b.date"
        >
          <td>{{ formatDate(asDate(b.date)) }}</td>
          <td>{{ brl(b.store) }}</td>
          <td>{{ brl(b.drop) }}</td>
          <td>{{ b.orderCount }}</td>
        </tr>
      </tbody>
    </table>
  </figure>
</template>
