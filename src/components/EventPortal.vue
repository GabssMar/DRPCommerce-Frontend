<script setup>
import { Clock, ArrowRight, Package, RefreshCw } from '@lucide/vue';

const props = defineProps({
  events: { type: Array, default: () => [] },
  virtualTime: { type: Date, required: true },
  isLoading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['select-event', 'retry']);

const SKELETON_CARDS = 3;
const CRITICAL_STOCK_PCT = 20;

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerBR = new Intl.NumberFormat('pt-BR');

const formatCountdown = (diffMs) => {
  if (diffMs <= 0) return '00:00';
  const totalSecs = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const shortDescription = (text) => (text.length > 105 ? `${text.slice(0, 105).trimEnd()}…` : text);

const formatClock = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const hasPurchased = (event) => localStorage.getItem(`veloce_order_success_${event.id}`) !== null;
const available = (event) => Math.max(0, event.totalUnitsAvailable - event.unitsSold);
const isSoldOut = (event) => available(event) === 0;
const isCriticalStock = (event) => (available(event) / Math.max(1, event.totalUnitsAvailable)) * 100 <= CRITICAL_STOCK_PCT;

// Badge e linha de tempo do card, conforme o mapa de estados de components/badge.md.
const statusFor = (event) => {
  const now = new Date(props.virtualTime);
  const queueOpens = new Date(event.queueOpensAt);
  const dropStarts = new Date(event.dropStartsAt);
  const dropEnds = new Date(event.dropEndsAt);

  if (hasPurchased(event)) {
    return { variant: 'ds-badge--success', label: 'Pedido confirmado', time: 'Sua unidade está garantida.', cta: 'Ver pedido' };
  }
  if (now >= dropEnds) {
    return { variant: 'ds-badge--done', label: 'Encerrado', time: 'Evento concluído.', cta: 'Ver resultados' };
  }
  if (isSoldOut(event)) {
    return { variant: 'ds-badge--done', label: 'Esgotado', time: 'Todas as unidades foram vendidas.', cta: 'Ver drop' };
  }
  if (now < queueOpens) {
    return { variant: 'ds-badge--scheduled', label: `Abre em ${formatClock(queueOpens)}`, time: `Fila abre em ${formatCountdown(queueOpens - now)}`, cta: 'Ver drop' };
  }
  if (now < dropStarts) {
    return { variant: 'ds-badge--live', live: true, label: 'AO VIVO', time: `Fila aberta · drop inicia em ${formatCountdown(dropStarts - now)}`, cta: 'Ver drop' };
  }
  return { variant: 'ds-badge--live', live: true, label: 'AO VIVO', time: 'Vendas liberadas por ordem da fila.', cta: 'Ver drop' };
};
</script>

<template>
  <div class="ds-stack--8">
    <header class="ds-stack--2">
      <p class="ds-label-caps">
        Lançamentos limitados
      </p>
      <h1 class="ds-title">
        Hypebeast Waiting Room Portal
      </h1>
      <p class="ds-text-secondary">
        Acompanhe os cronômetros, garanta sua vaga na fila prioritária e compre unidades de tiragem limitada.
      </p>
    </header>

    <section
      class="ds-stack--5"
      aria-labelledby="portal-drops-title"
    >
      <h2
        id="portal-drops-title"
        class="ds-label-caps"
      >
        Drops disponíveis
      </h2>

      <div
        aria-live="polite"
        :aria-busy="isLoading"
      >
        <article
          v-if="error"
          class="ds-card ds-empty"
        >
          <p class="ds-text-danger">
            {{ error }}
          </p>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="emit('retry')"
          >
            <RefreshCw
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Tentar de novo
          </button>
        </article>

        <div
          v-else-if="isLoading && !events.length"
          class="ds-grid ds-grid--3"
        >
          <p class="ds-sr-only">
            Carregando drops…
          </p>
          <article
            v-for="n in SKELETON_CARDS"
            :key="n"
            class="ds-card ds-stack--4"
            aria-hidden="true"
          >
            <div class="ds-card__media ds-skeleton" />
            <div class="ds-skeleton ds-skeleton--title" />
            <div class="ds-skeleton ds-skeleton--text" />
            <div class="ds-skeleton ds-skeleton--text ds-skeleton--short" />
          </article>
        </div>

        <article
          v-else-if="!events.length"
          class="ds-card ds-empty"
        >
          <Package
            :size="24"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          <p>Nenhum drop ativo agora.</p>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="emit('retry')"
          >
            Atualizar lista
          </button>
        </article>

        <div
          v-else
          class="ds-grid ds-grid--3"
        >
          <article
            v-for="event in events"
            :key="event.id"
            class="ds-card ds-card--interactive ds-animate-in ds-stack--4"
            @click="emit('select-event', event.id)"
          >
            <img
              class="ds-card__media"
              :src="event.coverImageUrl"
              :alt="event.name"
              loading="lazy"
            >

            <header class="ds-card__header">
              <h3 class="ds-card__title">
                {{ event.name }}
              </h3>
              <span :class="['ds-badge', statusFor(event).variant]">
                <span
                  v-if="statusFor(event).live"
                  class="ds-badge__dot"
                  aria-hidden="true"
                />
                {{ statusFor(event).label }}
              </span>
            </header>

            <p class="ds-text-sm ds-text-secondary">
              {{ shortDescription(event.description) }}
            </p>

            <div class="ds-stat-grid">
              <div class="ds-stat">
                <div class="ds-stat__value">
                  <span class="ds-stat__unit">R$</span>{{ numberBRL.format(event.price) }}
                </div>
                <div class="ds-stat__label">
                  Preço
                </div>
              </div>
              <div :class="['ds-stat', { 'ds-stat--critical': isCriticalStock(event) }]">
                <div class="ds-stat__value">
                  {{ integerBR.format(available(event)) }}<span class="ds-stat__unit">un.</span>
                </div>
                <div class="ds-stat__label">
                  de {{ integerBR.format(event.totalUnitsAvailable) }} disponíveis
                </div>
              </div>
            </div>

            <p class="ds-cluster ds-cluster--2 ds-text-sm ds-text-secondary">
              <Clock
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ statusFor(event).time }}
            </p>

            <footer class="ds-card__footer">
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--block"
                :aria-label="`${statusFor(event).cta}: ${event.name}`"
              >
                {{ statusFor(event).cta }}
                <ArrowRight
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </button>
            </footer>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
