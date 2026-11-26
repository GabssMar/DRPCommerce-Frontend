<script setup>
import { computed } from 'vue';
import { optionGroups, optionState } from '../../services/variants';

// components/option.md: um grupo de opções por atributo do SKU (Tamanho, Cor).
// Valor sem SKU ou esgotado (junto com o que já foi escolhido) fica riscado,
// com aria-disabled e o motivo no title. Clicar no valor escolhido desmarca.
const props = defineProps({
  variants: { type: Array, required: true },
  // { Tamanho: '40', Cor: 'Preto' }
  modelValue: { type: Object, required: true },
});

const emit = defineEmits(['update:modelValue']);

const groups = computed(() => optionGroups(props.variants).map((group) => ({
  ...group,
  options: group.values.map((value) => ({ value, ...optionState(props.variants, props.modelValue, group.key, value) })),
})));

const choose = (key, option) => {
  if (option.disabled) return;
  const selected = props.modelValue[key] === option.value;
  emit('update:modelValue', { ...props.modelValue, [key]: selected ? null : option.value });
};
</script>

<template>
  <div class="ds-stack--4">
    <fieldset
      v-for="group in groups"
      :key="group.key"
      class="ds-stack--2"
    >
      <legend class="ds-label">
        {{ modelValue[group.key] ? `${group.key}:` : group.key }}
        <span
          v-if="modelValue[group.key]"
          class="ds-text-secondary"
        >{{ modelValue[group.key] }}</span>
      </legend>
      <div
        class="ds-option-group"
        role="group"
        :aria-label="group.key"
      >
        <button
          v-for="option in group.options"
          :key="option.value"
          type="button"
          class="ds-option"
          :aria-pressed="modelValue[group.key] === option.value"
          :aria-disabled="option.disabled || undefined"
          :title="option.reason || undefined"
          @click="choose(group.key, option)"
        >
          {{ option.value }}<span
            v-if="option.reason"
            class="ds-sr-only"
          >, {{ option.reason.toLowerCase() }}</span>
        </button>
      </div>
    </fieldset>
  </div>
</template>
