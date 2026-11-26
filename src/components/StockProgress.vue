<script setup>
import { computed } from 'vue';

// Estoque do drop (task 16). O detalhe público só traz o saldo livre de cada variação
// (`available`), não o total alocado nem o vendido. Sem total, a tela mostra o saldo e
// "Últimas unidades"; a barra de proporção só aparece quando o total é conhecido.
const props = defineProps({
  available: { type: Number, default: null },
  total: { type: Number, default: null },
  // Atualizando em segundo plano (polling): indicador discreto, sem esconder o número.
  isRefreshing: { type: Boolean, default: false },
});

// components/progress-chart.md: ≤ 20% restante vira coral. Sem total: ≤ 5 unidades.
const CRITICAL_PCT = 20;
const LOW_STOCK = 5;

const integerBR = new Intl.NumberFormat('pt-BR');

const known = computed(() => props.available != null);
const left = computed(() => Math.max(0, props.available ?? 0));
const hasTotal = computed(() => props.total != null && props.total > 0);
const pctAvailable = computed(() => (hasTotal.value ? Math.round((left.value / props.total) * 100) : null));
const isSoldOut = computed(() => known.value && left.value === 0);
const isCritical = computed(() => known.value && !isSoldOut.value
  && (hasTotal.value ? pctAvailable.value <= CRITICAL_PCT : left.value <= LOW_STOCK));
</script>

<template>
  <article
    class="ds-card"
    :aria-busy="isRefreshing"
  >
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
          {{ known ? integerBR.format(left) : '—' }}<span class="ds-stat__unit">un. disponíveis</span>
        </div>
        <div class="ds-stat__label">
          {{ hasTotal ? `de ${integerBR.format(total)}` : 'saldo livre agora, somando todas as opções' }}
        </div>
      </div>

      <div
        v-if="hasTotal"
        :class="['ds-meter', { 'ds-meter--critical': isCritical }]"
        role="progressbar"
        aria-label="Estoque restante"
        :aria-valuenow="pctAvailable"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuetext="`${left} de ${total} unidades disponíveis`"
      >
        <div
          class="ds-meter__fill"
          :style="{ width: `${pctAvailable}%` }"
        />
      </div>
    </div>
  </article>
</template>
