<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { Check, ChevronLeft, ChevronRight } from '@lucide/vue';
import { href } from '../../router';
import { brl } from '../../services/format';
import { FREE_PLAN_CODE, planHighlights } from '../../services/plans-api';

// Cartões dos planos do catálogo (GET enterprise-plans).
//   mode "link":   landing page; cada cartão leva ao cadastro do lojista com o plano.
//   mode "select": painel; o cartão vira um botão que emite `select`.
//   layout "carousel": todos os planos numa linha que rola (components/carousel.md).
const props = defineProps({
  plans: { type: Array, required: true },
  mode: { type: String, default: 'link' },
  currentPlanId: { type: Number, default: null },
  selectedPlanId: { type: Number, default: null },
  // Na landing, sem o painel habilitado, não há para onde levar o cadastro.
  showActions: { type: Boolean, default: true },
  layout: { type: String, default: 'grid' },
});
const emit = defineEmits(['select']);

const isFree = (plan) => plan.code === FREE_PLAN_CODE || plan.monthlyPrice === 0;

// ------------------------------------------------------------- CARROSSEL ---
const trackId = `plans-${useId()}`;
const track = ref(null);
const canPrev = ref(false);
const canNext = ref(false);

// Tolerância de 1px: o scroll fracionário de telas com zoom não chega exatamente na ponta.
const updateEdges = () => {
  const el = track.value;
  if (!el) return;
  canPrev.value = el.scrollLeft > 1;
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
};

// Um cartão por clique: largura do item + o espaço entre eles.
const step = (direction) => {
  const el = track.value;
  const item = el?.querySelector('.ds-carousel__item');
  if (!item) return;
  const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
  el.scrollBy({ left: direction * (item.getBoundingClientRect().width + gap) });
};

let observer = null;
onMounted(() => {
  if (props.layout !== 'carousel') return;
  updateEdges();
  observer = new ResizeObserver(updateEdges);
  if (track.value) observer.observe(track.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.plans.length, () => nextTick(updateEdges));
</script>

<template>
  <div :class="{ 'ds-carousel': layout === 'carousel' }">
    <div
      v-if="layout === 'carousel'"
      class="ds-carousel__controls"
    >
      <button
        type="button"
        class="ds-icon-btn"
        aria-label="Planos anteriores"
        :aria-controls="trackId"
        :disabled="!canPrev"
        @click="step(-1)"
      >
        <ChevronLeft
          :size="20"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="ds-icon-btn"
        aria-label="Próximos planos"
        :aria-controls="trackId"
        :disabled="!canNext"
        @click="step(1)"
      >
        <ChevronRight
          :size="20"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
    </div>
    <ul
      :id="trackId"
      ref="track"
      :class="layout === 'carousel' ? 'ds-carousel__track' : 'ds-list-reset ds-grid ds-grid--3'"
      :role="layout === 'carousel' ? 'region' : undefined"
      :aria-label="layout === 'carousel' ? 'Planos' : undefined"
      :tabindex="layout === 'carousel' ? 0 : undefined"
      @scroll.passive="updateEdges"
    >
      <li
        v-for="plan in plans"
        :key="plan.id"
        :class="['ds-card ds-stack--4', { 'ds-carousel__item': layout === 'carousel' }]"
      >
        <div class="ds-cluster ds-cluster--between">
          <h3 class="ds-card__title">
            {{ plan.name }}
          </h3>
          <span
            v-if="currentPlanId === plan.id"
            class="ds-badge ds-badge--success"
          >Plano atual</span>
          <span
            v-else-if="selectedPlanId === plan.id"
            class="ds-badge ds-badge--waiting"
          >Escolhido</span>
        </div>
        <p>
          <span class="ds-title ds-title--lg ds-numeric">{{ isFree(plan) ? 'Grátis' : brl(plan.monthlyPrice) }}</span>
          <span
            v-if="!isFree(plan)"
            class="ds-text-sm ds-text-secondary"
          > por mês</span>
        </p>
        <ul class="ds-list-reset ds-stack--2 ds-grow">
          <li
            v-for="item in planHighlights(plan.entitlements)"
            :key="item"
            class="ds-cluster ds-cluster--2 ds-cluster--nowrap ds-align-start ds-text-sm"
          >
            <Check
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            <span class="ds-min-0">{{ item }}</span>
          </li>
        </ul>
        <template v-if="showActions">
          <a
            v-if="mode === 'link'"
            class="ds-btn ds-btn--secondary ds-btn--block"
            :href="href(`/admin/assinar/${plan.id}`)"
          >
            {{ isFree(plan) ? 'Começar grátis' : `Assinar o ${plan.name}` }}
          </a>
          <button
            v-else
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--block"
            :aria-pressed="selectedPlanId === plan.id"
            @click="emit('select', plan.id)"
          >
            {{ currentPlanId === plan.id ? 'Mudar só o adicional' : `Escolher o ${plan.name}` }}
          </button>
        </template>
      </li>
    </ul>
  </div>
</template>
