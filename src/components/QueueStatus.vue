<script setup>
import { computed, ref, watch, onWatcherCleanup } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { api } from '../services/api';

const props = defineProps({
  eventData: { type: Object, default: null },
  virtualTime: { type: Date, default: null },
  queueEntry: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  secondsToExpiry: { type: Number, default: 600 },
});

const emit = defineEmits(['join-queue', 'leave-queue', 'checkout']);

const CRITICAL_SECONDS = 60;
const integerBR = new Intl.NumberFormat('pt-BR');

const localQueue = ref(props.queueEntry);
const startPosition = ref(null);

watch(() => props.queueEntry, (entry) => {
  localQueue.value = entry;
});

// Posição de quando o cliente entrou: base do medidor de progresso na fila.
watch(localQueue, (entry) => {
  if (!entry) startPosition.value = null;
  else if (entry.statusId === 1 && startPosition.value == null) startPosition.value = entry.position;
}, { immediate: true });

// Polling de 3s enquanto aguarda. Só troca os números: a estrutura da tela não pisca.
watch(localQueue, (entry) => {
  if (!entry || entry.statusId !== 1) return;

  const intervalId = setInterval(async () => {
    try {
      const response = await api.getQueueStatus(entry.id, entry.dropEventId);
      if (response.isSuccess) {
        localQueue.value = response.content;
        if (response.content.statusId !== 1) emit('join-queue', response.content);
      }
    } catch (err) {
      console.error('Queue check failed', err);
    }
  }, 3000);

  onWatcherCleanup(() => clearInterval(intervalId));
}, { immediate: true });

const now = computed(() => (props.virtualTime ? new Date(props.virtualTime) : new Date()));
const formatClock = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const formatWindow = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const estimate = (pos) => (pos <= 0 ? 'menos de 1 min' : `≈ ${Math.max(1, Math.ceil(pos * 0.15))} min`);

// Máquina de estados de patterns/drop-page.md. Cada estado define badge, conteúdo e o CTA.
const view = computed(() => {
  const ev = props.eventData;
  if (!ev) return null;

  const queueOpens = new Date(ev.queueOpensAt);
  const dropEnds = new Date(ev.dropEndsAt);
  const entry = localQueue.value;

  if (now.value >= dropEnds) {
    return {
      key: 'ended',
      badge: { variant: 'ds-badge--done', label: 'Encerrado' },
      text: 'O drop encerrou. A fila não aceita mais entradas.',
      cta: { label: 'Fila encerrada', variant: 'ds-btn--secondary', disabled: true },
    };
  }
  if (now.value < queueOpens) {
    return {
      key: 'scheduled',
      badge: { variant: 'ds-badge--scheduled', label: `Abre em ${formatClock(queueOpens)}` },
      text: `A fila abre às ${formatClock(queueOpens)}. Deixe esta tela aberta para entrar assim que liberar.`,
      cta: { label: 'Entrar na fila', variant: 'ds-btn--primary', disabled: true },
    };
  }
  if (!entry) {
    return {
      key: 'open',
      badge: { variant: 'ds-badge--live', label: 'AO VIVO', live: true },
      text: 'As compras seguem a ordem de chegada. Entre na fila para garantir sua vez no checkout.',
      cta: { label: 'Entrar na fila', variant: 'ds-btn--primary', action: 'join-queue', icon: true },
    };
  }
  if (entry.statusId === 1) {
    return {
      key: 'waiting',
      badge: { variant: 'ds-badge--waiting', label: 'Na fila', dot: true },
      cta: { label: 'Sair da fila', variant: 'ds-btn--secondary', action: 'leave-queue' },
    };
  }
  if (entry.statusId === 2) {
    return {
      key: 'your-turn',
      badge: { variant: 'ds-badge--live', label: 'Sua vez!', live: true },
      cta: { label: 'Finalizar compra', variant: 'ds-btn--primary ds-btn--lg', action: 'checkout', icon: true },
    };
  }
  return {
    key: 'expired',
    badge: { variant: 'ds-badge--done', label: 'Sessão encerrada' },
    text: 'Sua janela de compra expirou. Você pode entrar na fila novamente enquanto o drop estiver ativo.',
    cta: { label: 'Entrar na fila novamente', variant: 'ds-btn--secondary', action: 'join-queue' },
  };
});

const queueProgress = computed(() => {
  const start = startPosition.value;
  const pos = localQueue.value?.position ?? 0;
  if (!start) return 0;
  return Math.round(Math.min(100, Math.max(0, ((start - pos) / start) * 100)));
});

const isWindowCritical = computed(() => props.secondsToExpiry < CRITICAL_SECONDS);

const onCta = () => {
  const action = view.value?.cta.action;
  if (action && !props.isLoading) emit(action);
};
</script>

<template>
  <article
    v-if="view"
    class="ds-card ds-stack--5"
  >
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Fila prioritária
      </h2>
      <span :class="['ds-badge', view.badge.variant]">
        <span
          v-if="view.badge.live || view.badge.dot"
          class="ds-badge__dot"
          aria-hidden="true"
        />
        {{ view.badge.label }}
      </span>
    </header>

    <!-- CTA logo abaixo do cabeçalho: mesma posição em todos os estados (patterns/drop-page.md, regra 4). -->
    <div>
      <button
        type="button"
        :class="['ds-btn', 'ds-btn--block', view.cta.variant]"
        :disabled="view.cta.disabled || (isLoading && view.cta.action === 'join-queue')"
        :aria-busy="isLoading && view.cta.action === 'join-queue'"
        @click="onCta"
      >
        <span
          v-if="isLoading && view.cta.action === 'join-queue'"
          class="ds-spinner"
          aria-hidden="true"
        />
        {{ view.cta.label }}
        <ArrowRight
          v-if="view.cta.icon && !isLoading"
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-if="view.key === 'waiting'"
      class="ds-stack--4"
    >
      <div class="ds-stat ds-stat--lg">
        <div class="ds-stat__value ds-numeric">
          {{ integerBR.format(localQueue.position) }}<span class="ds-stat__unit">º</span>
        </div>
        <div class="ds-stat__label">
          sua posição na fila · {{ estimate(localQueue.position) }}
        </div>
      </div>
      <div
        class="ds-meter"
        role="progressbar"
        aria-label="Progresso na fila"
        :aria-valuenow="queueProgress"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="ds-meter__fill"
          :style="{ width: `${queueProgress}%` }"
        />
      </div>
      <p class="ds-hint">
        Atualizado a cada 3 segundos. Você pode sair desta tela sem perder a posição.
      </p>
    </div>

    <div
      v-else-if="view.key === 'your-turn'"
      :class="['ds-stat', 'ds-stat--lg', { 'ds-stat--critical': isWindowCritical }]"
    >
      <div class="ds-stat__value ds-numeric">
        {{ formatWindow(secondsToExpiry) }}
      </div>
      <div class="ds-stat__label">
        para finalizar a compra antes de a vaga expirar
      </div>
    </div>

    <p
      v-else
      class="ds-text-secondary"
    >
      {{ view.text }}
    </p>



    <!-- Regiões sempre montadas: posição em polite, "sua vez" em assertive. -->
    <p
      class="ds-sr-only"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ view.key === 'waiting' ? `Sua posição na fila: ${localQueue.position}` : '' }}
    </p>
    <p
      class="ds-sr-only"
      aria-live="assertive"
    >
      {{ view.key === 'your-turn' ? 'É a sua vez. Finalize a compra.' : '' }}
    </p>
  </article>
</template>
