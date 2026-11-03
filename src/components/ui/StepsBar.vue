<script setup>
// components/steps.md. `current` é o índice (0..n-1) da etapa atual;
// as anteriores ficam concluídas. current = -1: nenhuma começou.
defineProps({
  label: { type: String, required: true },
  // [{ label, meta? }]
  steps: { type: Array, required: true },
  current: { type: Number, default: 0 },
  // Todas as etapas até `current` concluídas (pedido entregue).
  complete: { type: Boolean, default: false },
});
</script>

<template>
  <ol
    class="ds-steps"
    :aria-label="label"
  >
    <li
      v-for="(step, index) in steps"
      :key="step.label"
      :class="['ds-steps__item', {
        'ds-steps__item--done': index < current || (complete && index === current),
        'ds-steps__item--current': index === current && !complete,
      }]"
      :aria-current="index === current ? 'step' : undefined"
    >
      <span
        class="ds-steps__bar"
        aria-hidden="true"
      />
      <span class="ds-steps__label">{{ step.label }}</span>
      <span
        v-if="step.meta"
        class="ds-steps__meta"
      >{{ step.meta }}</span>
    </li>
  </ol>
</template>
