<script setup>
import { computed, ref } from 'vue';
import { Package, Plus } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { usePagedSearch } from '../../composables/usePagedSearch';
import { usePermissions } from '../../composables/usePermissions';
import { href, navigate, route } from '../../router';
import { admin } from '../../services/admin-api';
import { searchProducts } from '../../services/admin-catalog-api';
import { brl, formatNumber } from '../../services/format';
import { currentEnterpriseId } from '../../services/session';
import CatalogTabs from './CatalogTabs.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';

// E7 · Catálogo (task 33): busca paginada no back (GET products/search). A edição
// fica em #/admin/catalogo/produtos/:id. Categorias: categories get-all/add/update.
defineProps({ params: { type: Object, default: () => ({}) } });

const { can, denied } = usePermissions();

const SORTS = [
  { id: 'name', label: 'Nome' },
  { id: 'newest', label: 'Mais recentes' },
  { id: 'price_asc', label: 'Menor preço' },
  { id: 'price_desc', label: 'Maior preço' },
];

const search = usePagedSearch(searchProducts, {
  term: '', categoryId: null, brand: '', minPrice: '', maxPrice: '', inStock: null, isActive: null, sort: 'name',
});
const { filters } = search;

const lookups = useAsync(async () => {
  const categories = await admin.categories.getAll();
  return { categories: categories.filter((c) => !c.isDeleted) };
});
const categories = computed(() => lookups.data.value?.categories ?? []);
const categoryName = (id) => categories.value.find((c) => c.id === id)?.name ?? '—';

// Saldo do produto: soma das variantes que controlam estoque.
const tracked = (p) => p.variants.filter((v) => v.tracksStock);
const availableOf = (p) => tracked(p).reduce((sum, v) => sum + v.availableQuantity, 0);
// Produto transferido para o Drop (task 44) é do catálogo do Drop: a vitrine não vende nem movimenta o saldo dele.
const situation = (p) => {
  if (p.isTransferredToDrop) return { label: 'No Drop', tone: 'inverse' };
  if (!p.isActive) return { label: 'Inativo', tone: 'done' };
  if (tracked(p).length && availableOf(p) <= 0) return { label: 'Esgotado', tone: 'waiting' };
  return { label: 'Ativo', tone: 'success' };
};
const skuOf = (p) => (p.hasVariants ? `${p.variants.filter((v) => !v.isDefault).length} SKUs` : p.sku);

const openProduct = (id) => navigate(`/admin/catalogo/produtos/${id}`);

// ------------------------------------------------------------- categorias ---
const slugify = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const showCategories = computed(() => route.value.path === '/admin/catalogo/categorias');
const closeCategories = () => navigate('/admin/catalogo');
const newCategory = ref('');
const addCategory = useAction(async () => {
  const name = newCategory.value.trim();
  await admin.categories.add({
    enterpriseId: currentEnterpriseId(), parentCategoryId: null, name, slug: slugify(name), description: '', imageUrl: '',
    displayOrder: categories.value.length + 1, isActive: true,
  });
  newCategory.value = '';
  await lookups.reload();
});
const toggleCategory = useAction(async (c) => {
  await admin.categories.patch(c, { isActive: !c.isActive });
  await lookups.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Catálogo
    </h1>
    <div class="ds-cluster ds-cluster--2">
      <CatalogTabs />
      <a
        v-if="!denied('products.create', 'cadastrar produtos')"
        class="ds-btn ds-btn--primary"
        :href="href('/admin/catalogo/produtos/novo')"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Novo produto
      </a>
      <button
        v-else
        type="button"
        class="ds-btn ds-btn--primary"
        disabled
        :title="denied('products.create', 'cadastrar produtos')"
      >
        Novo produto
      </button>
    </div>
  </div>

  <div class="ds-toolbar">
    <div class="ds-toolbar__search">
      <label
        class="ds-sr-only"
        for="cat-search"
      >Buscar produtos</label>
      <input
        id="cat-search"
        v-model="filters.term"
        class="ds-input"
        type="search"
        placeholder="Nome, SKU ou marca"
      >
    </div>
    <select
      v-model="filters.categoryId"
      class="ds-input ds-toolbar__filter"
      aria-label="Categoria"
    >
      <option :value="null">
        Todas as categorias
      </option>
      <option
        v-for="c in categories"
        :key="c.id"
        :value="c.id"
      >
        {{ c.name }}
      </option>
    </select>
    <input
      v-model="filters.brand"
      class="ds-input ds-toolbar__filter"
      aria-label="Marca"
      placeholder="Marca"
    >
    <input
      v-model="filters.minPrice"
      class="ds-input ds-toolbar__filter"
      type="number"
      min="0"
      step="0.01"
      aria-label="Preço mínimo (R$)"
      placeholder="Preço mín."
    >
    <input
      v-model="filters.maxPrice"
      class="ds-input ds-toolbar__filter"
      type="number"
      min="0"
      step="0.01"
      aria-label="Preço máximo (R$)"
      placeholder="Preço máx."
    >
    <select
      v-model="filters.inStock"
      class="ds-input ds-toolbar__filter"
      aria-label="Estoque"
    >
      <option :value="null">
        Qualquer estoque
      </option>
      <option :value="true">
        Com estoque
      </option>
      <option :value="false">
        Sem estoque
      </option>
    </select>
    <select
      v-model="filters.isActive"
      class="ds-input ds-toolbar__filter"
      aria-label="Situação"
    >
      <option :value="null">
        Ativos e inativos
      </option>
      <option :value="true">
        Só ativos
      </option>
      <option :value="false">
        Só inativos
      </option>
    </select>
    <select
      v-model="filters.sort"
      class="ds-input ds-toolbar__filter"
      aria-label="Ordenar por"
    >
      <option
        v-for="s in SORTS"
        :key="s.id"
        :value="s.id"
      >
        {{ s.label }}
      </option>
    </select>
  </div>

  <div class="ds-card ds-card--flush">
    <LoadState
      :is-loading="search.isLoading.value"
      :error="search.error.value"
      :is-empty="!search.items.value.length"
      :empty-text="search.isFiltered.value ? 'Nenhum produto com estes filtros.' : 'Nenhum produto cadastrado. Cadastre o primeiro para vender na vitrine.'"
      :lines="10"
      flush
      @retry="search.reload"
    >
      <template #empty-action>
        <button
          v-if="search.isFiltered.value"
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="search.clearFilters()"
        >
          Limpar filtros
        </button>
        <a
          v-else-if="can('products.create')"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :href="href('/admin/catalogo/produtos/novo')"
        >
          Cadastrar produto
        </a>
      </template>
      <div class="ds-table-scroll">
        <table
          class="ds-table"
          :aria-busy="search.isRefreshing.value"
        >
          <span
            v-if="search.isRefreshing.value"
            class="ds-spinner"
            aria-hidden="true"
          />
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
                Disponível
              </th>
              <th scope="col">
                Situação
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in search.items.value"
              :key="p.id"
            >
              <td>
                <button
                  type="button"
                  class="ds-table__open ds-cluster ds-cluster--2"
                  @click="openProduct(p.id)"
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
                  <span class="ds-stack--1">
                    <span>{{ p.name }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ p.brand }}</span>
                  </span>
                </button>
              </td>
              <td class="ds-mono ds-text-sm">
                {{ skuOf(p) }}
              </td>
              <td>{{ categoryName(p.categoryId) }}</td>
              <td class="ds-table__td--numeric">
                {{ brl(p.price) }}
              </td>
              <td class="ds-table__td--numeric">
                {{ tracked(p).length ? formatNumber(availableOf(p)) : '—' }}
              </td>
              <td>
                <span :class="['ds-badge', `ds-badge--${situation(p).tone}`]">{{ situation(p).label }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ds-table-footer">
        <span class="ds-hint">Clique no nome para editar o produto e as variantes.</span>
        <PaginationNav
          v-model:page="search.page.value"
          :page-size="search.pageSize"
          :total="search.total.value"
        />
      </div>
    </LoadState>
  </div>

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
