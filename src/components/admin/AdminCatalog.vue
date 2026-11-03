<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, Package, Plus } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { navigate, route } from '../../router';
import { admin, adjustStock } from '../../services/admin-api';
import { brl, formatNumber } from '../../services/format';
import CatalogTabs from './CatalogTabs.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';

// E7 · Catálogo e estoque. Rotas (/api/store): products get-all/add/update ·
// categories get-all/add/update · suppliers/get-all · drop-products/get-all (alocado em drop).
// Estoque: Product ainda não tem saldo no back-end; stockQuantity e
// POST products/adjust-stock seguem a proposta da task 19.
defineProps({ params: { type: Object, default: () => ({}) } });

const LOW_STOCK = 5;
const PAGE_SIZE = 20;

const data = useAsync(async () => {
  const [products, categories, suppliers, dropProducts, events] = await Promise.all([
    admin.products.getAll(), admin.categories.getAll(), admin.suppliers.getAll(), admin.dropProducts.getAll(), admin.dropEvents.getAll(),
  ]);
  const openEvents = new Set(events.filter((e) => e.dropEventStatusId < 7).map((e) => e.id));
  const inDrops = (productId) => dropProducts
    .filter((dp) => dp.productId === productId && openEvents.has(dp.dropEventId) && !dp.isDeleted)
    .reduce((s, dp) => s + Math.max(0, dp.unitsAllocated - dp.unitsSold), 0);
  return {
    products: products.filter((p) => !p.isDeleted).map((p) => ({ ...p, inDrops: inDrops(p.id) })),
    categories: categories.filter((c) => !c.isDeleted),
    suppliers,
  };
});

const products = computed(() => data.data.value?.products ?? []);
const categories = computed(() => data.data.value?.categories ?? []);
const categoryName = (id) => categories.value.find((c) => c.id === id)?.name ?? '—';
const hasStock = (p) => typeof p.stockQuantity === 'number';

const kpis = computed(() => ({
  active: products.value.filter((p) => p.isActive).length,
  low: products.value.filter((p) => p.isActive && hasStock(p) && p.stockQuantity <= LOW_STOCK && p.inDrops === 0).length,
  inDrops: products.value.reduce((s, p) => s + p.inDrops, 0),
}));

const filters = reactive({ search: '', categoryId: null });
const page = ref(1);
watch(filters, () => { page.value = 1; });
const rows = computed(() => products.value.filter((p) => {
  const term = filters.search.trim().toLowerCase();
  if (term && !`${p.name} ${p.sku} ${p.barCode}`.toLowerCase().includes(term)) return false;
  return !filters.categoryId || p.categoryId === filters.categoryId;
}));
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const situation = (p) => {
  if (!p.isActive) return { label: 'Inativo', tone: 'done' };
  if (!hasStock(p)) return { label: 'Ativo', tone: 'success' };
  if (p.stockQuantity === 0 && p.inDrops > 0) return { label: 'Exclusivo de drop', tone: 'inverse' };
  if (p.stockQuantity === 0) return { label: 'Esgotado', tone: 'done' };
  if (p.stockQuantity <= LOW_STOCK) return { label: 'Últimas unidades', tone: 'live', dot: true };
  return { label: 'Ativo', tone: 'success' };
};

// ---------------------------------------------------------- ajuste estoque ---
const ADJUST_TYPES = [
  { id: 'in', label: 'Entrada' },
  { id: 'out', label: 'Saída' },
  { id: 'count', label: 'Contagem' },
];
const REASONS = ['Recebimento de fornecedor', 'Devolução', 'Avaria', 'Correção de inventário', 'Venda balcão'];
const adjusting = ref(null);
const adjust = reactive({ type: 'in', quantity: 0, reason: REASONS[0] });
const openAdjust = (p) => {
  adjusting.value = p;
  Object.assign(adjust, { type: 'in', quantity: 0, reason: REASONS[0] });
};
const delta = computed(() => {
  const q = Math.max(0, Number(adjust.quantity) || 0);
  if (!adjusting.value) return 0;
  if (adjust.type === 'in') return q;
  if (adjust.type === 'out') return -q;
  return q - (adjusting.value.stockQuantity ?? 0);
});
const nextStock = computed(() => (adjusting.value?.stockQuantity ?? 0) + delta.value);
const saveAdjust = useAction(async () => {
  await adjustStock({ productId: adjusting.value.id, delta: delta.value, reason: adjust.reason });
  adjusting.value = null;
  await data.reload();
});

// --------------------------------------------------------------- produto ---
const editing = ref(null);
const openProduct = (p = null) => {
  editing.value = p ? { ...p } : {
    id: null, enterpriseId: 1, categoryId: categories.value[0]?.id ?? null, supplierId: null, name: '', slug: '',
    description: '', sku: '', barCode: '', price: 0, costPrice: 0, weight: 0, height: 0, width: 0, length: 0,
    brand: '', imageUrls: '', isActive: true, isDigital: false,
  };
};
const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const saveProduct = useAction(async () => {
  const p = editing.value;
  const payload = {
    ...p,
    slug: p.slug.trim() || slugify(p.name),
    price: Number(p.price), costPrice: Number(p.costPrice),
    weight: Number(p.weight), height: Number(p.height), width: Number(p.width), length: Number(p.length),
    supplierId: p.supplierId || null,
  };
  delete payload.inDrops;
  if (p.id) await admin.products.update(payload);
  else await admin.products.add(payload);
  editing.value = null;
  await data.reload();
});

// ------------------------------------------------------------- categorias ---
const showCategories = computed(() => route.value.path === '/admin/catalogo/categorias');
const closeCategories = () => navigate('/admin/catalogo');
const newCategory = ref('');
const addCategory = useAction(async () => {
  const name = newCategory.value.trim();
  await admin.categories.add({
    enterpriseId: 1, parentCategoryId: null, name, slug: slugify(name), description: '', imageUrl: '',
    displayOrder: categories.value.length + 1, isActive: true,
  });
  newCategory.value = '';
  await data.reload();
});
const toggleCategory = useAction(async (c) => {
  await admin.categories.patch(c, { isActive: !c.isActive });
  await data.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Catálogo
    </h1>
    <div class="ds-cluster ds-cluster--2">
      <CatalogTabs />
      <button
        type="button"
        class="ds-btn ds-btn--primary"
        @click="openProduct()"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Novo produto
      </button>
    </div>
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="10"
    @retry="data.reload"
  >
    <section class="ds-grid ds-grid--kpi-3">
      <article class="ds-card ds-card--tight ds-stack--1">
        <span class="ds-text-xs ds-text-secondary">Produtos ativos</span>
        <span class="ds-tile__value">{{ formatNumber(kpis.active) }}</span>
      </article>
      <article class="ds-card ds-card--tight ds-stack--1">
        <span class="ds-text-xs ds-text-secondary">Estoque baixo (≤ {{ LOW_STOCK }})</span>
        <span :class="['ds-tile__value', { 'ds-text-danger': kpis.low }]">{{ formatNumber(kpis.low) }}</span>
      </article>
      <article class="ds-card ds-card--tight ds-stack--1">
        <span class="ds-text-xs ds-text-secondary">Alocado em drops abertos</span>
        <span class="ds-tile__value">{{ formatNumber(kpis.inDrops) }} <span class="ds-text-xs ds-text-secondary">un.</span></span>
      </article>
    </section>

    <div class="ds-toolbar">
      <div class="ds-toolbar__search">
        <label
          class="ds-sr-only"
          for="cat-search"
        >Buscar produtos</label>
        <input
          id="cat-search"
          v-model="filters.search"
          class="ds-input"
          type="search"
          placeholder="Nome, SKU ou código de barras"
        >
      </div>
      <div
        class="ds-nav"
        role="group"
        aria-label="Categoria"
      >
        <button
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': !filters.categoryId }]"
          :aria-pressed="!filters.categoryId"
          @click="filters.categoryId = null"
        >
          Todas
        </button>
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': filters.categoryId === c.id }]"
          :aria-pressed="filters.categoryId === c.id"
          @click="filters.categoryId = c.id"
        >
          {{ c.name }}
        </button>
      </div>
    </div>

    <div class="ds-card ds-card--flush">
      <LoadState
        :is-empty="!rows.length"
        empty-text="Nenhum produto encontrado."
      >
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Produtos do catálogo
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Produto
                </th>
                <th scope="col">
                  SKU
                </th>
                <th scope="col">
                  Categoria
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
                  Estoque
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
                v-for="p in pageRows"
                :key="p.id"
                :aria-selected="adjusting?.id === p.id || editing?.id === p.id ? 'true' : undefined"
              >
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-cluster ds-cluster--2"
                    @click="openProduct(p)"
                  >
                    <img
                      v-if="p.imageUrls"
                      class="ds-card__media ds-card__media--thumb ds-card__media--product ds-card__media--sm"
                      :src="p.imageUrls.split(',')[0]"
                      alt=""
                    >
                    <span
                      v-else
                      class="ds-icon-tile ds-icon-tile--square"
                      aria-hidden="true"
                    ><Package
                      :size="16"
                      :stroke-width="1.5"
                    /></span>
                    {{ p.name }}
                  </button>
                </td>
                <td class="ds-mono ds-text-sm">
                  {{ p.sku }}
                </td>
                <td>{{ categoryName(p.categoryId) }}</td>
                <td class="ds-table__td--numeric">
                  {{ brl(p.price) }}
                </td>
                <td :class="['ds-table__td--numeric', { 'ds-text-danger': hasStock(p) && p.stockQuantity <= LOW_STOCK && p.isActive && !p.inDrops }]">
                  {{ hasStock(p) ? formatNumber(p.stockQuantity) : '—' }}
                  <span
                    v-if="p.inDrops"
                    class="ds-text-xs ds-text-secondary"
                  > + {{ formatNumber(p.inDrops) }} em drop</span>
                </td>
                <td>
                  <span :class="['ds-badge', `ds-badge--${situation(p).tone}`]">
                    <span
                      v-if="situation(p).dot"
                      class="ds-badge__dot"
                      aria-hidden="true"
                    />
                    {{ situation(p).label }}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    :class="['ds-btn', 'ds-btn--sm', situation(p).tone === 'live' ? 'ds-btn--secondary' : 'ds-btn--ghost']"
                    @click="openAdjust(p)"
                  >
                    Ajustar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ds-table-footer">
          <span class="ds-hint">Clique no nome para editar o produto.</span>
          <PaginationNav
            v-model:page="page"
            :page-size="PAGE_SIZE"
            :total="rows.length"
          />
        </div>
      </LoadState>
    </div>
  </LoadState>

  <!-- Ajustar estoque -->
  <ModalDialog
    v-if="adjusting"
    title="Ajustar estoque"
    @close="adjusting = null"
  >
    <div class="ds-cluster ds-cluster--2">
      <img
        v-if="adjusting.imageUrls"
        class="ds-card__media ds-card__media--thumb ds-card__media--product ds-card__media--sm"
        :src="adjusting.imageUrls.split(',')[0]"
        alt=""
      >
      <span class="ds-stack--1">
        <span>{{ adjusting.name }}</span>
        <span class="ds-text-xs ds-text-secondary ds-mono">{{ adjusting.sku }} · estoque atual {{ formatNumber(adjusting.stockQuantity ?? 0) }}</span>
      </span>
    </div>
    <form
      id="adjust-form"
      class="ds-stack--4"
      @submit.prevent="saveAdjust.run()"
    >
      <div
        class="ds-nav"
        role="radiogroup"
        aria-label="Tipo de ajuste"
      >
        <button
          v-for="t in ADJUST_TYPES"
          :key="t.id"
          type="button"
          role="radio"
          :aria-checked="adjust.type === t.id"
          :class="['ds-nav__item', { 'ds-nav__item--active': adjust.type === t.id }]"
          @click="adjust.type = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adj-qty"
        >{{ adjust.type === 'count' ? 'Quantidade contada' : 'Quantidade' }}</label>
        <input
          id="adj-qty"
          v-model.number="adjust.quantity"
          class="ds-input"
          type="number"
          min="0"
          required
          autofocus
          aria-describedby="adj-qty-hint"
        >
        <span
          id="adj-qty-hint"
          :class="['ds-hint', { 'ds-text-danger': nextStock < 0 }]"
          aria-live="polite"
        >Novo estoque: {{ formatNumber(nextStock) }}</span>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adj-reason"
        >Motivo</label>
        <select
          id="adj-reason"
          v-model="adjust.reason"
          class="ds-input"
        >
          <option
            v-for="r in REASONS"
            :key="r"
          >
            {{ r }}
          </option>
        </select>
      </div>
      <p
        v-if="saveAdjust.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ saveAdjust.error.value.status === 404 ? 'O back-end ainda não tem o endpoint de ajuste de estoque (task 19).' : saveAdjust.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="adjusting = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="adjust-form"
        class="ds-btn ds-btn--primary"
        :disabled="!delta || nextStock < 0 || saveAdjust.isPending.value"
      >
        Registrar ajuste
      </button>
    </template>
  </ModalDialog>

  <!-- Produto -->
  <ModalDialog
    v-if="editing"
    :title="editing.id ? 'Editar produto' : 'Novo produto'"
    @close="editing = null"
  >
    <form
      id="product-form"
      class="ds-stack--4"
      @submit.prevent="saveProduct.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="pr-name"
        >Nome</label>
        <input
          id="pr-name"
          v-model="editing.name"
          class="ds-input"
          required
          autofocus
        >
      </div>
      <div class="ds-grid ds-grid--2">
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-sku"
          >SKU</label>
          <input
            id="pr-sku"
            v-model="editing.sku"
            class="ds-input ds-mono"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-bar"
          >Código de barras</label>
          <input
            id="pr-bar"
            v-model="editing.barCode"
            class="ds-input ds-mono"
            inputmode="numeric"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-cat"
          >Categoria</label>
          <select
            id="pr-cat"
            v-model.number="editing.categoryId"
            class="ds-input"
            required
          >
            <option
              v-for="c in categories"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-sup"
          >Fornecedor</label>
          <select
            id="pr-sup"
            v-model="editing.supplierId"
            class="ds-input"
          >
            <option :value="null">
              Sem fornecedor
            </option>
            <option
              v-for="s in data.data.value?.suppliers ?? []"
              :key="s.id"
              :value="s.id"
            >
              {{ s.companyName }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-price"
          >Preço (R$)</label>
          <input
            id="pr-price"
            v-model="editing.price"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-cost"
          >Custo (R$)</label>
          <input
            id="pr-cost"
            v-model="editing.costPrice"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-brand"
          >Marca</label>
          <input
            id="pr-brand"
            v-model="editing.brand"
            class="ds-input"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pr-weight"
          >Peso (kg)</label>
          <input
            id="pr-weight"
            v-model="editing.weight"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
          >
        </div>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="pr-img"
        >Imagens (URLs separadas por vírgula)</label>
        <input
          id="pr-img"
          v-model="editing.imageUrls"
          class="ds-input"
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="pr-desc"
        >Descrição</label>
        <textarea
          id="pr-desc"
          v-model="editing.description"
          class="ds-input"
          rows="3"
        />
      </div>
      <div class="ds-cluster ds-cluster--2">
        <label class="ds-check">
          <input
            v-model="editing.isActive"
            type="checkbox"
          >
          Ativo na vitrine
        </label>
        <label class="ds-check">
          <input
            v-model="editing.isDigital"
            type="checkbox"
          >
          Produto digital
        </label>
      </div>
      <p
        v-if="saveProduct.error.value"
        class="ds-error"
        role="alert"
      >
        {{ saveProduct.error.value.message }}
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
        form="product-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveProduct.isPending.value"
      >
        Salvar produto
      </button>
    </template>
  </ModalDialog>

  <!-- Categorias -->
  <ModalDialog
    v-if="showCategories"
    title="Categorias"
    @close="closeCategories"
  >
    <ul class="ds-stack--1 ds-list-reset">
      <li
        v-for="c in categories"
        :key="c.id"
        class="ds-row-divided"
      >
        <span>{{ c.name }}</span>
        <span class="ds-cluster ds-cluster--2">
          <span :class="['ds-badge', c.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ c.isActive ? 'Ativa' : 'Inativa' }}</span>
          <button
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm"
            :disabled="toggleCategory.isPending.value"
            @click="toggleCategory.run(c)"
          >
            {{ c.isActive ? 'Desativar' : 'Ativar' }}
          </button>
        </span>
      </li>
    </ul>
    <form
      class="ds-input-group"
      @submit.prevent="addCategory.run()"
    >
      <label
        class="ds-sr-only"
        for="new-category"
      >Nova categoria</label>
      <input
        id="new-category"
        v-model="newCategory"
        class="ds-input"
        placeholder="Nova categoria"
        required
      >
      <button
        type="submit"
        class="ds-btn ds-btn--secondary"
        :disabled="addCategory.isPending.value"
      >
        Adicionar
      </button>
    </form>
    <p
      v-if="addCategory.error.value || toggleCategory.error.value"
      class="ds-error"
      role="alert"
    >
      {{ (addCategory.error.value || toggleCategory.error.value).message }}
    </p>
  </ModalDialog>
</template>
