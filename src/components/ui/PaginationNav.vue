<script setup>
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { formatNumber } from '../../services/format';

// components/pagination.md: intervalo + total em texto e dois botões.
const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
});

const emit = defineEmits(['update:page']);

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const from = computed(() => (props.total ? (props.page - 1) * props.pageSize + 1 : 0));
const to = computed(() => Math.min(props.page * props.pageSize, props.total));
</script>

<template>
  <nav
    v-if="total"
    class="ds-pagination"
    aria-label="Paginação"
  >
    <span
      class="ds-pagination__status"
      aria-live="polite"
    >{{ formatNumber(from) }}–{{ formatNumber(to) }} de {{ formatNumber(total) }}</span>
    <button
      type="button"
      class="ds-icon-btn ds-icon-btn--ghost"
      aria-label="Página anterior"
      :disabled="page <= 1"
      @click="emit('update:page', page - 1)"
    >
      <ChevronLeft
        :size="20"
        :stroke-width="1.5"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      class="ds-icon-btn ds-icon-btn--ghost"
      aria-label="Próxima página"
      :disabled="page >= lastPage"
      @click="emit('update:page', page + 1)"
    >
      <ChevronRight
        :size="20"
        :stroke-width="1.5"
        aria-hidden="true"
      />
    </button>
  </nav>
</template>
