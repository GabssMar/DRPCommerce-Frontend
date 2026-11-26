<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Check, Package, Search, ShoppingBag, SlidersHorizontal } from '@lucide/vue';
import { useAsync, useAction } from '../composables/useAsync';
import { useBag } from '../composables/useBag';
import { href, navigate, redirect, withQuery } from '../router';
import {
  DEFAULT_SORT, SHOWCASE_PAGE_SIZE, SORTS, flattenTree, getCategoryBySlug, getCategoryTree, getProductBySlug,
  productImage, searchProducts,
} from '../services/storefront-api';
import { brl } from '../services/format';
import LoadState from './ui/LoadState.vue';
import PaginationNav from './ui/PaginationNav.vue';

// Vitrine (task 29): catálogo paginado do back, sem fila e sem cronômetro.
//   GET storefront/{slug}/products/search · categories/tree · categories/by-slug/{slug}
// Estado na URL, para o F5 e o voltar funcionarem:
//   #/vitrine?busca=&ordem=&estoque=1&pagina=   e   #/vitrine/c/:slug?...
const props = defineProps({
  categorySlug: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['select-product']);

const LOW_STOCK = 5;
const SKELETON_CARDS = 6;
const SORT_VALUES = SORTS.map((s) => s.value);

const { addToBag, hasProduct } = useBag();

// ------------------------------------------------------------ filtros ---
const filters = computed(() => ({
  term: (props.query.busca ?? '').trim(),
  sort: SORT_VALUES.includes(props.query.ordem) ? props.query.ordem : DEFAULT_SORT,
  inStock: props.query.estoque === '1',
  page: Math.max(1, Math.trunc(Number(props.query.pagina)) || 1),
}));

const basePath = computed(() => (props.categorySlug ? `/vitrine/c/${props.categorySlug}` : '/vitrine'));

// Mudar filtro volta para a página 1 (components/toolbar.md).
const urlFor = (changes, path = basePath.value) => {
  const next = { ...filters.value, page: 1, ...changes };
  return withQuery(path, {
    busca: next.term,
    ordem: next.sort === DEFAULT_SORT ? '' : next.sort,
    estoque: next.inStock ? '1' : '',
    pagina: next.page > 1 ? next.page : '',
  });
};

const term = ref(filters.value.term);
watch(() => filters.value.term, (value) => {
  term.value = value;
});
const submitSearch = () => navigate(urlFor({ term: term.value.trim() }));
const clearFilters = () => navigate(basePath.value);

// Link antigo #/vitrine?categoria=slug -> #/vitrine/c/slug.
watch(() => props.query.categoria, (slug) => {
  if (slug && !props.categorySlug) redirect(urlFor({ page: filters.value.page }, `/vitrine/c/${encodeURIComponent(slug)}`));
}, { immediate: true });

// -------------------------------------------------------------- dados ---
const tree = useAsync(async () => flattenTree(await getCategoryTree()));
const categories = computed(() => tree.data.value ?? []);
const categoryName = (id) => categories.value.find((c) => c.id === id)?.name ?? '';
const optionLabel = (c) => `${'— '.repeat(c.depth)}${c.name}`;

const changeCategory = (slug) => navigate(urlFor({}, slug ? `/vitrine/c/${slug}` : '/vitrine'));

const results = useAsync(async () => {
  const category = props.categorySlug ? await getCategoryBySlug(props.categorySlug) : null;
  const page = await searchProducts({ ...filters.value, categoryId: category?.id, pageSize: SHOWCASE_PAGE_SIZE });
  return { category, page };
}, { immediate: false });

watch(() => [props.categorySlug, filters.value], () => results.reload(), { immediate: true, deep: true });

// useAsync mantém o último dado bom: só vale a categoria da URL atual.
const category = computed(() => {
  const current = results.data.value?.category;
  return current && current.slug === props.categorySlug ? current : null;
});
const page = computed(() => results.data.value?.page ?? null);
const products = computed(() => page.value?.items ?? []);
const categoryUnavailable = computed(() => props.categorySlug && results.error.value?.kind === 'not-found');
const hasFilters = computed(() => Boolean(filters.value.term || filters.value.inStock || filters.value.sort !== DEFAULT_SORT));

const resultsHeading = ref(null);
const goToPage = async (n) => {
  navigate(urlFor({ page: n }));
  await nextTick();
  resultsHeading.value?.scrollIntoView({ block: 'start' });
};

const resultSummary = computed(() => {
  if (!page.value) return '';
  const { total } = page.value;
  const found = `${total} ${total === 1 ? 'produto' : 'produtos'}`;
  return filters.value.term ? `${found} para «${filters.value.term}»` : found;
});

// ------------------------------------------------------------- cards ---
const priceOf = (p) => (p.maxPrice > p.price ? `a partir de ${brl(p.price)}` : brl(p.price));

const stockBadge = (p) => {
  if (!p.inStock) return { variant: 'ds-badge--done', label: 'Sem estoque' };
  if (p.availableQuantity > 0 && p.availableQuantity <= LOW_STOCK) return { variant: 'ds-badge--live', label: 'Últimas unidades' };
  return null;
};

// Produto simples entra direto (o SKU único vem do by-slug); com opções, abre o detalhe.
const lastAdded = ref('');
const adding = ref(null);
const quickAdd = useAction(async (product) => {
  adding.value = product.id;
  try {
    const { variants } = await getProductBySlug(product.slug);
    const variant = variants.find((v) => v.canPurchase);
    if (!variant) throw new Error(`${product.name} ficou indisponível.`);
    await addToBag({ productId: product.id, variantId: variant.id, slug: product.slug, quantity: 1 });
    lastAdded.value = `${product.name} adicionado à sacola.`;
  } finally {
    adding.value = null;
  }
});
</script>

<template>
  <div class="ds-stack--8">
    <header class="ds-stack--2">
      <p class="ds-label-caps">
        <a
          v-if="categorySlug"
          :href="href('/vitrine')"
        >Vitrine</a>
        <template v-else>
          Loja
        </template>
      </p>
      <h1 class="ds-title">
        {{ category?.name ?? (categorySlug ? 'Categoria' : 'Vitrine') }}
      </h1>
      <p class="ds-text-secondary">
        {{ category?.description || 'Produtos com estoque regular: compre quando quiser, sem fila e sem cronômetro.' }}
      </p>
    </header>

    <article
      v-if="categoryUnavailable"
      class="ds-card ds-empty"
      role="alert"
    >
      <Package
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Categoria indisponível.</p>
      <a
        class="ds-btn ds-btn--secondary ds-btn--sm"
        :href="href('/vitrine')"
      >Ver toda a vitrine</a>
    </article>

    <section
      v-else
      class="ds-stack--5"
      aria-labelledby="vitrine-products-title"
    >
      <div class="ds-toolbar">
        <form
          class="ds-toolbar__search"
          role="search"
          @submit.prevent="submitSearch"
        >
          <label
            class="ds-sr-only"
            for="vitrine-search"
          >Buscar produtos</label>
          <div class="ds-cluster ds-cluster--nowrap">
            <input
              id="vitrine-search"
              v-model="term"
              class="ds-input"
              type="search"
              placeholder="Buscar produtos"
              maxlength="200"
              enterkeyhint="search"
            >
            <button
              type="submit"
              class="ds-icon-btn ds-tap"
              aria-label="Buscar"
            >
              <Search
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
          </div>
        </form>

        <label
          class="ds-sr-only"
          for="vitrine-category"
        >Categoria</label>
        <select
          id="vitrine-category"
          class="ds-input ds-toolbar__filter"
          :value="categorySlug"
          :disabled="tree.isLoading.value && !categories.length"
          @change="changeCategory($event.target.value)"
        >
          <option value="">
            Todas as categorias
          </option>
          <option
            v-for="c in categories"
            :key="c.id"
            :value="c.slug"
          >
            {{ optionLabel(c) }}
          </option>
        </select>

        <label
          class="ds-sr-only"
          for="vitrine-sort"
        >Ordenar por</label>
        <select
          id="vitrine-sort"
          class="ds-input ds-toolbar__filter"
          :value="filters.sort"
          @change="navigate(urlFor({ sort: $event.target.value }))"
        >
          <option
            v-for="s in SORTS"
            :key="s.value"
            :value="s.value"
          >
            {{ s.label }}
          </option>
        </select>

        <label class="ds-check ds-check--pill">
          <input
            type="checkbox"
            :checked="filters.inStock"
            @change="navigate(urlFor({ inStock: $event.target.checked }))"
          >
          <span>Só com estoque</span>
        </label>
      </div>

      <div class="ds-cluster ds-cluster--between">
        <h2
          id="vitrine-products-title"
          ref="resultsHeading"
          class="ds-label-caps"
        >
          Catálogo
        </h2>
        <p
          v-if="page"
          class="ds-text-sm ds-text-secondary"
          aria-live="polite"
        >
          {{ resultSummary }}
        </p>
      </div>

      <div :aria-busy="results.isLoading.value || results.isRefreshing.value">
        <div
          v-if="results.isLoading.value"
          class="ds-grid ds-grid--3"
        >
          <p
            class="ds-sr-only"
            role="status"
          >
            Carregando produtos…
          </p>
          <article
            v-for="n in SKELETON_CARDS"
            :key="n"
            class="ds-card ds-stack--4"
            aria-hidden="true"
          >
            <div class="ds-card__media ds-skeleton" />
            <div class="ds-skeleton ds-skeleton--title" />
            <div class="ds-skeleton ds-skeleton--text" />
            <div class="ds-skeleton ds-skeleton--text ds-skeleton--short" />
          </article>
        </div>

        <LoadState
          v-else-if="results.error.value"
          class="ds-card"
          :error="results.error.value"
          @retry="results.reload()"
        />

        <article
          v-else-if="!products.length"
          class="ds-card ds-empty"
        >
          <SlidersHorizontal
            :size="24"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          <template v-if="filters.page > 1 && page?.total">
            <p>Esta página não existe mais.</p>
            <button
              type="button"
              class="ds-btn ds-btn--secondary ds-btn--sm"
              @click="goToPage(1)"
            >
              Ir para a primeira página
            </button>
          </template>
          <template v-else-if="hasFilters">
            <p>Nenhum produto encontrado com esses filtros.</p>
            <button
              type="button"
              class="ds-btn ds-btn--secondary ds-btn--sm"
              @click="clearFilters"
            >
              Limpar filtros
            </button>
          </template>
          <p v-else>
            {{ categorySlug ? 'Nenhum produto nesta categoria por enquanto.' : 'Nenhum produto disponível na vitrine agora.' }}
          </p>
        </article>

        <div
          v-else
          class="ds-stack--6"
        >
          <div class="ds-grid ds-grid--3">
            <article
              v-for="product in products"
              :key="product.id"
              class="ds-card ds-card--interactive ds-animate-in ds-stack--4"
              @click="emit('select-product', product.slug)"
            >
              <img
                v-if="productImage(product)"
                class="ds-card__media ds-card__media--product"
                :src="productImage(product)"
                :alt="product.name"
                loading="lazy"
              >
              <div
                v-else
                class="ds-card__media ds-card__media--product ds-card__media--placeholder"
                aria-hidden="true"
              >
                <Package
                  :size="24"
                  :stroke-width="1.5"
                />
              </div>

              <header class="ds-card__header">
                <div class="ds-stack--1">
                  <p
                    v-if="categoryName(product.categoryId)"
                    class="ds-label-caps"
                  >
                    {{ categoryName(product.categoryId) }}
                  </p>
                  <h3 class="ds-card__title">
                    <!-- Link no título: o card inteiro é clicável, e o teclado chega por aqui. -->
                    <a
                      :href="href(`/vitrine/p/${product.slug}`)"
                      @click.stop
                    >{{ product.name }}</a>
                  </h3>
                </div>
                <span
                  v-if="stockBadge(product)"
                  :class="['ds-badge', stockBadge(product).variant]"
                >{{ stockBadge(product).label }}</span>
              </header>

              <p class="ds-text-sm ds-text-secondary">
                {{ product.description }}
              </p>

              <div class="ds-stat">
                <div class="ds-stat__value">
                  {{ priceOf(product) }}
                </div>
                <div class="ds-stat__label">
                  {{ product.hasVariants ? 'Escolha as opções no produto' : product.inStock ? 'Pronta entrega' : 'Sem estoque no momento' }}
                </div>
              </div>

              <footer class="ds-card__footer">
                <a
                  v-if="product.hasVariants && product.canPurchase"
                  class="ds-btn ds-btn--secondary ds-btn--block"
                  :href="href(`/vitrine/p/${product.slug}`)"
                  @click.stop
                >Escolher opções</a>
                <button
                  v-else
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--block"
                  :disabled="!product.canPurchase || hasProduct(product.id) || adding === product.id"
                  :aria-busy="adding === product.id"
                  :aria-label="hasProduct(product.id) ? `${product.name} já está na sacola` : `Adicionar ${product.name} à sacola`"
                  @click.stop="quickAdd.run(product)"
                >
                  <Check
                    v-if="hasProduct(product.id)"
                    class="ds-btn__icon"
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  <ShoppingBag
                    v-else
                    class="ds-btn__icon"
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  {{ !product.canPurchase ? 'Indisponível' : hasProduct(product.id) ? 'Na sacola' : 'Adicionar à sacola' }}
                </button>
              </footer>
            </article>
          </div>

          <PaginationNav
            :page="page.page"
            :page-size="page.pageSize"
            :total="page.total"
            @update:page="goToPage"
          />
        </div>
      </div>

      <p
        class="ds-sr-only"
        aria-live="polite"
      >
        {{ lastAdded }}
      </p>
      <p
        v-if="quickAdd.error.value"
        class="ds-hint ds-text-danger"
        role="alert"
      >
        {{ quickAdd.error.value.message }}
      </p>
    </section>
  </div>
</template>
