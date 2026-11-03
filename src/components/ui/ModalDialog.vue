<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { X } from '@lucide/vue';

// components/modal.md: overlay + diálogo. Esc e clique fora fecham; o foco entra
// no diálogo ao abrir, fica preso nele e volta para quem abriu ao fechar.
defineProps({
  title: { type: String, required: true },
});

const emit = defineEmits(['close']);

const titleId = useId();
const dialog = ref(null);
let opener = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;
  const items = [...dialog.value.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

onMounted(async () => {
  opener = document.activeElement;
  await nextTick();
  const target = dialog.value?.querySelector('[autofocus]') ?? dialog.value?.querySelector(FOCUSABLE);
  target?.focus();
});

onBeforeUnmount(() => {
  opener?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="ds-overlay"
      @click.self="emit('close')"
      @keydown="onKeydown"
    >
      <div
        ref="dialog"
        class="ds-modal ds-stack--5"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="ds-modal__header">
          <h2
            :id="titleId"
            class="ds-modal__title"
          >
            {{ title }}
          </h2>
          <button
            type="button"
            class="ds-icon-btn ds-icon-btn--ghost"
            aria-label="Fechar"
            @click="emit('close')"
          >
            <X
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
        </header>
        <slot />
        <footer
          v-if="$slots.footer"
          class="ds-modal__footer ds-cluster--end"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
