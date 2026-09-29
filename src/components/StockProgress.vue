<script setup>
import { computed } from 'vue';

const props = defineProps({
  unitsAllocated: { type: Number, default: 100 },
  unitsSold: { type: Number, default: 0 },
});

// Regra fixa de components/progress-chart.md: ≤ 20% restante vira coral. A cor é o alerta.
const CRITICAL_PCT = 20;

const integerBR = new Intl.NumberFormat('pt-BR');

const total = computed(() => Math.max(1, props.unitsAllocated));
const sold = computed(() => Math.max(0, Math.min(props.unitsSold, total.value)));
const available = computed(() => total.value - sold.value);
const pctAvailable = computed(() => Math.round((available.value / total.value) * 100));
const isSoldOut = computed(() => available.value === 0);
const isCritical = computed(() => pctAvailable.value <= CRITICAL_PCT);
</script>

<template>
  <article class="ds-card">
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Estoque
      </h2>
      <span
        v-if="isSoldOut"
        class="ds-badge ds-badge--done"
      >Esgotado</span>
      <span
        v-else-if="isCritical"
        class="ds-badge ds-badge--live"
      >Últimas unidades</span>
    </header>

    <div class="ds-stack--4">
      <div :class="['ds-stat', { 'ds-stat--critical': isCritical }]">
        <div class="ds-stat__value">
          {{ integerBR.format(available) }}<span class="ds-stat__unit">un. disponíveis</span>
        </div>
        <div class="ds-stat__label">
          de {{ integerBR.format(total) }} · {{ integerBR.format(sold) }} vendidas
        </div>
      </div>

      <div
        :class="['ds-meter', { 'ds-meter--critical': isCritical }]"
        role="progressbar"
        aria-label="Estoque restante"
        :aria-valuenow="pctAvailable"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuetext="`${available} de ${total} unidades disponíveis`"
      >
        <div
          class="ds-meter__fill"
          :style="{ width: `${pctAvailable}%` }"
        />
      </div>
    </div>
  </article>
</template>
