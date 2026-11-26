<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, Pencil, Plus, Trash2, X } from '@lucide/vue';
import { useAction } from '../../composables/useAsync';
import { usePermissions } from '../../composables/usePermissions';
import {
  createVariant, deleteVariant, enableVariants, updateVariant, updateVariantDimensions, updateVariantPricing,
} from '../../services/admin-catalog-api';
import { fieldMessage } from '../../services/api-error';
import { brl, formatNumber } from '../../services/format';
import ModalDialog from '../ui/ModalDialog.vue';

// Aba Variantes do editor (task 33). Todas as variantes usam as mesmas chaves de
// opção (de 1 a 8); preço e dimensões vazios herdam do produto. O SKU padrão não
// é editável e, com variantes, deixa de controlar estoque.
const props = defineProps({ product: { type: Object, required: true } });
const emit = defineEmits(['updated']);

const { can, denied } = usePermissions();

const MAX_OPTIONS = 8;
const DIMENSIONS = { weight: 'Peso (kg)', height: 'Altura (cm)', width: 'Largura (cm)', length: 'Comprimento (cm)' };
const CONFLICTS = { 'ProductVariant.DuplicateSku': 'sku' };
const VARIANT_ERRORS = {
  'ProductVariant.DuplicateCombination': 'Já existe uma variante com esta combinação de opções.',
  'ProductVariant.OptionSchema': 'Use as mesmas opções das outras variantes.',
  'Inventory.StockInUse': 'A variante tem saldo em estoque: as opções só mudam com o saldo zerado.',
};

const variants = computed(() => props.product.variants ?? []);
const standard = computed(() => variants.value.find((v) => v.isDefault));
const extra = computed(() => variants.value.filter((v) => !v.isDefault));
const schema = computed(() => Object.keys(extra.value[0]?.attributes ?? {}));
const optionsText = (v) => Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(' · ') || '—';

// ------------------------------------------------------------- habilitar ---
const blockedReason = computed(() => {
  const s = standard.value;
  if (!s) return '';
  if (s.stockQuantity > 0 || s.reservedQuantity > 0) return 'O SKU padrão tem saldo ou reserva. Zere o estoque antes de usar variantes.';
  return '';
});
const confirmEnable = ref(false);
const enable = useAction(async () => {
  await enableVariants(props.product.id);
  confirmEnable.value = false;
  emit('updated');
});

// -------------------------------------------------------------- variante ---
const editing = ref(null);
const toInput = (value) => (value ?? '');
const fromInput = (value) => (value === '' || value === null ? null : Number(value));

const openVariant = (v = null) => {
  save.error.value = null;
  const keys = v ? Object.keys(v.attributes) : schema.value;
  editing.value = {
    id: v?.id ?? null,
    name: v?.name ?? '',
    sku: v?.sku ?? '',
    barCode: v?.barCode ?? '',
    isActive: v?.isActive ?? true,
    options: (keys.length ? keys : ['']).map((key) => ({ key, value: v?.attributes[key] ?? '' })),
    price: toInput(v?.priceOverride),
    costPrice: toInput(v?.costPriceOverride),
    ...Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, toInput(v?.[`${k}Override`])])),
    original: v,
  };
};
const fixedKeys = computed(() => schema.value.length > 0 && !(editing.value?.id && extra.value.length === 1));
const addOption = () => editing.value.options.push({ key: '', value: '' });
const removeOption = (i) => editing.value.options.splice(i, 1);

const payloadOf = (e) => ({
  details: {
    name: e.name.trim(),
    sku: e.sku.trim(),
    barCode: e.barCode.trim(),
    isActive: e.isActive,
    attributes: Object.fromEntries(e.options.filter((o) => o.key.trim()).map((o) => [o.key.trim(), o.value.trim()])),
  },
  pricing: { price: fromInput(e.price), costPrice: fromInput(e.costPrice) },
  dimensions: Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, fromInput(e[k])])),
});
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

const save = useAction(async () => {
  const e = editing.value;
  const { details, pricing, dimensions } = payloadOf(e);
  const productId = props.product.id;
  if (!e.id) {
    await createVariant(productId, { details, pricing: can('products.change_price') ? pricing : null, dimensions });
  } else {
    const o = e.original;
    await updateVariant(productId, e.id, details);
    if (can('products.change_price') && changed(pricing, { price: o.priceOverride, costPrice: o.costPriceOverride })) {
      await updateVariantPricing(productId, e.id, pricing);
    }
    const before = Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, o[`${k}Override`]]));
    if (changed(dimensions, before)) await updateVariantDimensions(productId, e.id, dimensions);
  }
  editing.value = null;
  emit('updated');
});
const saveMessage = computed(() => {
  const err = save.error.value;
  if (!err || fieldMessage(err, 'sku', CONFLICTS)) return '';
  return VARIANT_ERRORS[err.code] ?? err.message;
});

// --------------------------------------------------------------- excluir ---
const removing = ref(null);
const remove = useAction(async () => {
  await deleteVariant(props.product.id, removing.value.id);
  removing.value = null;
  emit('updated');
});
const removeMessage = computed(() => {
  const err = remove.error.value;
  if (!err) return '';
  return err.code === 'Validation.InvalidInput' ? 'Só é possível excluir SKU sem saldo e sem reserva.' : err.message;
});
</script>

<template>
  <article
    v-if="!product.hasVariants"
    class="ds-card ds-stack--3"
  >
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Produto sem variantes
      </h2>
    </header>
    <p class="ds-text-secondary">
      Hoje o produto tem um SKU só ({{ standard?.sku }}). Com variantes, cada tamanho, cor ou modelo ganha SKU, preço,
      dimensões e estoque próprios. Depois de habilitar, não dá para voltar.
    </p>
    <p
      v-if="blockedReason"
      class="ds-hint"
    >
      {{ blockedReason }}
    </p>
    <button
      type="button"
      class="ds-btn ds-btn--secondary ds-self-start"
      :disabled="Boolean(blockedReason) || !can('products.edit')"
      :title="denied('products.edit', 'editar produtos')"
      @click="confirmEnable = true"
    >
      Usar variantes
    </button>
  </article>

  <article
    v-else
    class="ds-card ds-card--flush"
  >
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Variantes
      </h2>
      <button
        type="button"
        class="ds-btn ds-btn--primary ds-btn--sm"
        :disabled="!can('products.create')"
        :title="denied('products.create', 'cadastrar variantes')"
        @click="openVariant()"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Nova variante
      </button>
    </header>
    <div class="ds-table-scroll">
      <table class="ds-table">
        <caption class="ds-sr-only">
          SKUs do produto
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Variante
            </th>
            <th scope="col">
              SKU
            </th>
            <th
              scope="col"
              class="ds-table__th--numeric"
            >
              Preço
            </th>
            <th
              scope="col"
              class="ds-table__th--numeric"
            >
              Disponível
            </th>
            <th scope="col">
              Situação
            </th>
            <th scope="col">
              <span class="ds-sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in variants"
            :key="v.id"
          >
            <td>
              <span class="ds-stack--1">
                <span>{{ v.name }}</span>
                <span
                  v-if="!v.isDefault"
                  class="ds-text-xs ds-text-secondary"
                >{{ optionsText(v) }}</span>
                <span
                  v-if="v.isDefault"
                  class="ds-text-xs ds-text-secondary"
                >SKU padrão · não controla estoque</span>
              </span>
            </td>
            <td class="ds-mono ds-text-sm">
              {{ v.sku }}
            </td>
            <td :class="['ds-table__td--numeric', { 'ds-text-secondary': v.priceOverride == null }]">
              {{ brl(v.price) }}
              <span
                v-if="v.priceOverride == null && !v.isDefault"
                class="ds-text-xs"
              > herdado</span>
            </td>
            <td class="ds-table__td--numeric">
              {{ v.tracksStock ? formatNumber(v.availableQuantity) : '—' }}
            </td>
            <td>
              <span :class="['ds-badge', v.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ v.isActive ? 'Ativa' : 'Inativa' }}</span>
            </td>
            <td>
              <div
                v-if="!v.isDefault"
                class="ds-cluster ds-cluster--2 ds-cluster--end"
              >
                <button
                  type="button"
                  class="ds-icon-btn ds-icon-btn--ghost"
                  :disabled="!can('products.edit')"
                  :aria-label="`Editar ${v.name}`"
                  :title="denied('products.edit', 'editar variantes') ?? `Editar ${v.name}`"
                  @click="openVariant(v)"
                >
                  <Pencil
                    :size="20"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  class="ds-icon-btn ds-icon-btn--ghost"
                  :disabled="!can('products.delete')"
                  :aria-label="`Excluir ${v.name}`"
                  :title="denied('products.delete', 'excluir variantes') ?? `Excluir ${v.name}`"
                  @click="remove.error.value = null; removing = v"
                >
                  <Trash2
                    :size="20"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="ds-hint ds-card__note">
      Preço em cinza é herdado do produto. O saldo é movimentado na aba Estoque.
    </p>
  </article>

  <ModalDialog
    v-if="confirmEnable"
    title="Usar variantes?"
    @close="confirmEnable = false"
  >
    <p class="ds-text-secondary">
      O SKU padrão deixa de controlar estoque e cada variante passa a ter o seu. Não há como desfazer.
    </p>
    <p
      v-if="enable.error.value"
      class="ds-error"
      role="alert"
    >
      {{ enable.error.value.code === 'Validation.InvalidInput' ? 'O SKU padrão tem saldo ou reserva. Zere o estoque antes.' : enable.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="confirmEnable = false"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="enable.isPending.value"
        @click="enable.run()"
      >
        Usar variantes
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="editing"
    :title="editing.id ? `Editar ${editing.original.name}` : 'Nova variante'"
    @close="editing = null"
  >
    <form
      id="variant-form"
      class="ds-stack--5"
      @submit.prevent="save.run()"
    >
      <div class="ds-grid ds-grid--2">
        <div class="ds-field">
          <label
            class="ds-label"
            for="pv-name"
          >Nome</label>
          <input
            id="pv-name"
            v-model="editing.name"
            class="ds-input"
            maxlength="100"
            placeholder="Ex.: Azul · M"
            required
            autofocus
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pv-sku"
          >SKU</label>
          <input
            id="pv-sku"
            v-model="editing.sku"
            class="ds-input ds-mono"
            maxlength="100"
            required
            aria-describedby="pv-sku-error"
            :aria-invalid="Boolean(fieldMessage(save.error.value, 'sku', CONFLICTS))"
          >
          <span
            v-if="fieldMessage(save.error.value, 'sku', CONFLICTS)"
            id="pv-sku-error"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="14"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ fieldMessage(save.error.value, 'sku', CONFLICTS) }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pv-bar"
          >Código de barras</label>
          <input
            id="pv-bar"
            v-model="editing.barCode"
            class="ds-input ds-mono"
            maxlength="100"
            inputmode="numeric"
          >
        </div>
      </div>

      <fieldset class="ds-stack--2">
        <legend class="ds-label">
          Opções
        </legend>
        <div
          v-for="(option, i) in editing.options"
          :key="i"
          class="ds-cluster ds-cluster--2 ds-align-end"
        >
          <div class="ds-field ds-grow">
            <label
              class="ds-label"
              :for="`pv-key-${i}`"
            >Opção {{ i + 1 }}</label>
            <input
              :id="`pv-key-${i}`"
              v-model="option.key"
              class="ds-input"
              maxlength="50"
              placeholder="Tamanho"
              :readonly="fixedKeys"
              required
            >
          </div>
          <div class="ds-field ds-grow">
            <label
              class="ds-label"
              :for="`pv-value-${i}`"
            >Valor</label>
            <input
              :id="`pv-value-${i}`"
              v-model="option.value"
              class="ds-input"
              maxlength="100"
              placeholder="M"
              required
            >
          </div>
          <button
            v-if="!fixedKeys && editing.options.length > 1"
            type="button"
            class="ds-icon-btn ds-icon-btn--ghost"
            :aria-label="`Remover opção ${option.key || i + 1}`"
            @click="removeOption(i)"
          >
            <X
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
        </div>
        <button
          v-if="!fixedKeys && editing.options.length < MAX_OPTIONS"
          type="button"
          class="ds-btn ds-btn--ghost ds-btn--sm ds-self-start"
          @click="addOption"
        >
          Adicionar opção
        </button>
        <span class="ds-hint">{{ fixedKeys ? 'As opções são as mesmas das outras variantes.' : 'De 1 a 8 opções. As próximas variantes usarão as mesmas.' }}</span>
      </fieldset>

      <fieldset
        class="ds-grid ds-grid--2"
        :disabled="!can('products.change_price')"
      >
        <legend class="ds-label">
          Preço próprio {{ can('products.change_price') ? '(vazio herda do produto)' : '(sem permissão para alterar)' }}
        </legend>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pv-price"
          >Preço (R$)</label>
          <input
            id="pv-price"
            v-model="editing.price"
            class="ds-input"
            type="number"
            min="0.01"
            step="0.01"
            :placeholder="brl(product.price)"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pv-cost"
          >Custo (R$)</label>
          <input
            id="pv-cost"
            v-model="editing.costPrice"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            :placeholder="brl(product.costPrice)"
          >
        </div>
      </fieldset>

      <fieldset class="ds-grid ds-grid--2">
        <legend class="ds-label">
          Dimensões próprias (vazio herda do produto)
        </legend>
        <div
          v-for="(label, key) in DIMENSIONS"
          :key="key"
          class="ds-field"
        >
          <label
            class="ds-label"
            :for="`pv-${key}`"
          >{{ label }}</label>
          <input
            :id="`pv-${key}`"
            v-model="editing[key]"
            class="ds-input"
            type="number"
            min="0.01"
            step="0.01"
            :placeholder="formatNumber(product[key])"
          >
        </div>
      </fieldset>

      <label class="ds-check">
        <input
          v-model="editing.isActive"
          type="checkbox"
        >
        Variante ativa
      </label>
      <p
        v-if="saveMessage"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ saveMessage }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="editing = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="variant-form"
        class="ds-btn ds-btn--primary"
        :disabled="save.isPending.value"
        :aria-busy="save.isPending.value"
      >
        <span
          v-if="save.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Salvar variante
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="removing"
    :title="`Excluir ${removing.name}?`"
    @close="removing = null"
  >
    <p class="ds-text-secondary">
      O SKU {{ removing.sku }} sai do catálogo. Só é possível excluir sem saldo e sem reserva.
    </p>
    <p
      v-if="removeMessage"
      class="ds-error"
      role="alert"
    >
      {{ removeMessage }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="removing = null"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="remove.isPending.value"
        @click="remove.run()"
      >
        Excluir
      </button>
    </template>
  </ModalDialog>
</template>
