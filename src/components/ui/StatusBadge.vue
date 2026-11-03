<script setup>
import { computed } from 'vue';
import { statusOf } from '../../services/status';

// Badge de status a partir de uma tabela de status.js e do id vindo da API.
const props = defineProps({
  table: { type: Object, required: true },
  id: { type: [Number, String], default: null },
  // Texto no lugar do rótulo da tabela (ex.: "AO VIVO" para o status Ativo).
  label: { type: String, default: '' },
  // Ponto colorido: andamento e urgência têm, encerrado não.
  dot: { type: Boolean, default: undefined },
});

const status = computed(() => statusOf(props.table, Number(props.id)));
const showDot = computed(() => props.dot ?? ['live', 'waiting', 'scheduled'].includes(status.value.tone));
</script>

<template>
  <span :class="['ds-badge', `ds-badge--${status.tone}`]">
    <span
      v-if="showDot"
      class="ds-badge__dot"
      aria-hidden="true"
    />
    {{ label || status.label }}
  </span>
</template>
