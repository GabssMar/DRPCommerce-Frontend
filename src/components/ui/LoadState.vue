<script setup>
import { computed } from 'vue';
import { AlertCircle, Inbox } from '@lucide/vue';

// Os três estados de patterns/states.md em volta de um bloco de conteúdo:
// carregando (esqueleto com a altura final), erro (mensagem + tentar de novo) e
// vazio. Atualização em segundo plano não volta ao esqueleto.
const props = defineProps({
  isLoading: { type: Boolean, default: false },
  error: { type: Object, default: null },
  isEmpty: { type: Boolean, default: false },
  emptyText: { type: String, default: 'Nada por aqui ainda.' },
  // Quantas linhas de esqueleto desenhar.
  lines: { type: Number, default: 4 },
  // Sem padding próprio (dentro de card --flush o pai já dá o espaço).
  flush: { type: Boolean, default: false },
});

const emit = defineEmits(['retry']);

// A mensagem já vem por `kind` do ApiError. Tentar de novo só aparece quando
// repetir pode dar outro resultado (não em permissão, inexistente ou validação).
const NO_RETRY = new Set(['forbidden', 'not-found', 'validation']);
const canRetry = computed(() => !NO_RETRY.has(props.error?.kind));
const waitHint = computed(() =>
  props.error?.kind === 'rate-limit' && props.error.retryAfter
    ? `Tente de novo em ${props.error.retryAfter} s.`
    : '',
);
</script>

<template>
  <div
    v-if="isLoading"
    :class="['ds-stack--3', { 'ds-card__note': flush }]"
    role="status"
    aria-live="polite"
  >
    <span class="ds-sr-only">Carregando…</span>
    <div
      v-for="n in lines"
      :key="n"
      :class="['ds-skeleton', 'ds-skeleton--text', { 'ds-skeleton--short': n === lines }]"
    />
  </div>

  <div
    v-else-if="error"
    class="ds-empty"
    role="alert"
  >
    <AlertCircle
      class="ds-text-danger"
      :size="24"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p class="ds-text-danger">
      {{ error.message }}
    </p>
    <p v-if="waitHint">
      {{ waitHint }}
    </p>
    <button
      v-if="canRetry"
      type="button"
      class="ds-btn ds-btn--secondary ds-btn--sm"
      @click="emit('retry')"
    >
      Tentar de novo
    </button>
  </div>

  <div
    v-else-if="isEmpty"
    class="ds-empty"
  >
    <Inbox
      :size="24"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p>{{ emptyText }}</p>
    <slot name="empty-action" />
  </div>

  <slot v-else />
</template>
