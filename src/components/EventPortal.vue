<script setup>
import { Clock, ArrowRight, Package, RefreshCw } from '@lucide/vue';

// Portal de drops (task 16): GET storefront/{slug}/drop/events. O resumo público traz
// preço, capa e início/fim do drop; não traz estoque nem o horário da fila (esses
// ficam no detalhe). A fase é calculada pelas datas e pela hora do servidor (`now`).
const props = defineProps({
  events: { type: Array, default: () => [] },
  // serverNow() em ms (services/clock.js)
  now: { type: Number, required: true },
  isLoading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['select-event', 'retry']);

const SKELETON_CARDS = 3;
const HOUR = 60 * 60 * 1000;

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const pad = (n) => String(n).padStart(2, '0');
const formatCountdown = (diffMs) => {
  const total = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(total / 3600);
  const clock = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${pad(hours)}:${clock}` : clock;
};
const formatWhen = (ms) => `${dayFmt.format(ms)} às ${timeFmt.format(ms)}`;

const shortDescription = (text) => (text?.length > 105 ? `${text.slice(0, 105).trimEnd()}…` : text ?? '');

// Badge e linha de tempo do card, conforme o mapa de estados de components/badge.md.
const statusFor = (event) => {
  const starts = Date.parse(event.dropStartsAt);
  const ends = Date.parse(event.dropEndsAt);
  if (props.now >= ends) {
    return { variant: 'ds-badge--done', label: 'Encerrado', time: `Encerrado em ${formatWhen(ends)}.`, cta: 'Ver drop' };
  }
  if (props.now >= starts) {
    return { variant: 'ds-badge--live', live: true, label: 'AO VIVO', time: `Vendas abertas até ${timeFmt.format(ends)}.`, cta: 'Ver drop' };
  }
  const soon = starts - props.now < HOUR;
  return {
    variant: 'ds-badge--scheduled',
    label: soon ? `Começa às ${timeFmt.format(starts)}` : `Começa ${dayFmt.format(starts)}`,
    time: soon ? `Drop inicia em ${formatCountdown(starts - props.now)}` : `Drop em ${formatWhen(starts)}.`,
    cta: 'Ver drop',
  };
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
                  {{ event.requiresRegistration ? 'Preço · exige inscrição' : 'Preço' }}
                </div>
              </div>
              <div class="ds-stat">
                <div class="ds-stat__value">
                  {{ timeFmt.format(Date.parse(event.dropStartsAt)) }}
                </div>
                <div class="ds-stat__label">
                  Início · {{ dayFmt.format(Date.parse(event.dropStartsAt)) }}
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
