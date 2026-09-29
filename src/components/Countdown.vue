<script setup>
import { computed } from 'vue';

const props = defineProps({
  eventData: { type: Object, default: null },
  virtualTime: { type: Date, default: null },
});

// Regra dos 60s (foundations/motion.md, caso especial countdown): a cor é o alerta.
const CRITICAL_SECONDS = 60;

const pad = (n) => String(n).padStart(2, '0');
const formatClock = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatRemaining = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
};

// Cada fase: título, badge (components/badge.md), legenda e texto fixo para o aria-live.
const state = computed(() => {
  if (!props.eventData) return null;

  const now = props.virtualTime ? new Date(props.virtualTime) : new Date();
  const queueOpens = new Date(props.eventData.queueOpensAt);
  const dropStarts = new Date(props.eventData.dropStartsAt);
  const dropEnds = new Date(props.eventData.dropEndsAt);

  if (now < queueOpens) {
    return {
      title: 'A fila abre em',
      badge: { variant: 'ds-badge--scheduled', label: `Abre em ${formatClock(queueOpens)}` },
      remaining: queueOpens - now,
      legend: `Entre na fila a partir das ${formatClock(queueOpens)}.`,
      announcement: 'Drop agendado.',
    };
  }
  if (now < dropStarts) {
    return {
      title: 'O drop começa em',
      badge: { variant: 'ds-badge--live', label: 'AO VIVO', live: true },
      remaining: dropStarts - now,
      legend: 'A fila está aberta: garanta sua posição.',
      announcement: 'A fila abriu.',
    };
  }
  if (now < dropEnds) {
    return {
      title: 'O drop encerra em',
      badge: { variant: 'ds-badge--live', label: 'AO VIVO', live: true },
      remaining: dropEnds - now,
      legend: 'Vendas liberadas por ordem de chamada da fila.',
      announcement: 'O drop começou. Vendas liberadas.',
    };
  }
  return {
    title: 'Drop encerrado',
    badge: { variant: 'ds-badge--done', label: 'Encerrado' },
    remaining: null,
    legend: 'Inscrições e vendas deste drop estão fechadas.',
    announcement: 'O drop encerrou.',
  };
});

const isCritical = computed(() => state.value?.remaining != null && state.value.remaining < CRITICAL_SECONDS * 1000);
</script>

<template>
  <article
    v-if="state"
    class="ds-card ds-card--inverse ds-stack--5"
  >
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        {{ state.title }}
      </h2>
      <span :class="['ds-badge', state.badge.variant]">
        <span
          v-if="state.badge.live"
          class="ds-badge__dot"
          aria-hidden="true"
        />
        {{ state.badge.label }}
      </span>
    </header>

    <div :class="['ds-stat', 'ds-stat--lg', { 'ds-stat--critical': isCritical }]">
      <div
        v-if="state.remaining != null"
        class="ds-stat__value ds-numeric"
      >
        {{ formatRemaining(state.remaining) }}
      </div>
      <div class="ds-stat__label">
        {{ state.legend }}
      </div>
    </div>

    <!-- Texto fixo por fase, nunca o contador: senão o leitor de tela anuncia a cada segundo. -->
    <p
      class="ds-sr-only"
      aria-live="polite"
    >
      {{ state.announcement }}
    </p>
  </article>
</template>
