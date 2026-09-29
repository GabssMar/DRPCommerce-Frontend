<script setup>
import { computed, ref } from 'vue';
import { Package, RefreshCw, ShoppingBag, Check } from '@lucide/vue';

// Vitrine: catálogo regular para o cliente casual. Sem fila, sem cronômetro.
const props = defineProps({
  products: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  bagItemIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['add-to-bag', 'select-product', 'retry']);

const SKELETON_CARDS = 4;
const LOW_STOCK = 5;
const ALL = 'Todos';

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const selectedCategory = ref(ALL);
const categories = computed(() => [ALL, ...new Set(props.products.map((p) => p.category))]);
const visibleProducts = computed(() => (
  selectedCategory.value === ALL
    ? props.products
    : props.products.filter((p) => p.category === selectedCategory.value)
));

const stockBadge = (product) => {
  if (product.stockQuantity === 0) return { variant: 'ds-badge--done', label: 'Esgotado' };
  if (product.stockQuantity <= LOW_STOCK) return { variant: 'ds-badge--live', label: 'Últimas unidades' };
  return null;
};

const inBag = (product) => props.bagItemIds.includes(product.id);
const lastAdded = ref('');

const addToBag = (product) => {
  emit('add-to-bag', product.id);
  lastAdded.value = `${product.name} adicionado à sacola.`;
};
</script>

<template>
  <div class="ds-stack--8">
    <header class="ds-stack--2">
      <p class="ds-label-caps">
        Loja
      </p>
      <h1 class="ds-title">
        Vitrine
      </h1>
      <p class="ds-text-secondary">
        Produtos com estoque regular: compre quando quiser, sem fila e sem cronômetro.
      </p>
    </header>

    <section
      class="ds-stack--5"
      aria-labelledby="vitrine-products-title"
    >
      <div class="ds-cluster ds-cluster--between">
        <h2
          id="vitrine-products-title"
          class="ds-label-caps"
        >
          Catálogo
        </h2>
        <div
          v-if="products.length"
          class="ds-nav"
          role="group"
          aria-label="Filtrar por categoria"
        >
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            :class="['ds-nav__item', { 'ds-nav__item--active': selectedCategory === category }]"
            :aria-pressed="selectedCategory === category"
            @click="selectedCategory = category"
          >
            {{ category }}
          </button>
        </div>
      </div>

      <div
        aria-live="polite"
        :aria-busy="isLoading"
      >
        <article
          v-if="error"
          class="ds-card ds-empty"
        >
          <p class="ds-text-danger">
            {{ error }}
          </p>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="emit('retry')"
          >
            <RefreshCw
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Tentar de novo
          </button>
        </article>

        <div
          v-else-if="isLoading && !products.length"
          class="ds-grid ds-grid--3"
        >
          <p class="ds-sr-only">
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

        <article
          v-else-if="!products.length"
          class="ds-card ds-empty"
        >
          <Package
            :size="24"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          <p>Nenhum produto disponível na vitrine agora.</p>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="emit('retry')"
          >
            Atualizar
          </button>
        </article>

        <article
          v-else-if="!visibleProducts.length"
          class="ds-card ds-empty"
        >
          <p>Nada em «{{ selectedCategory }}».</p>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="selectedCategory = ALL"
          >
            Limpar filtro
          </button>
        </article>

        <div
          v-else
          class="ds-grid ds-grid--3"
        >
          <article
            v-for="product in visibleProducts"
            :key="product.id"
            class="ds-card ds-card--interactive ds-animate-in ds-stack--4"
            @click="emit('select-product', product.id)"
          >
            <img
              v-if="product.imageUrl"
              class="ds-card__media ds-card__media--product"
              :src="product.imageUrl"
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
                <p class="ds-label-caps">
                  {{ product.category }}
                </p>
                <h3 class="ds-card__title">
                  <!-- Botão no título: o card inteiro é clicável, e o teclado chega por aqui. -->
                  <button
                    type="button"
                    @click.stop="emit('select-product', product.id)"
                  >
                    {{ product.name }}
                  </button>
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
                <span class="ds-stat__unit">R$</span>{{ numberBRL.format(product.price) }}
              </div>
              <div class="ds-stat__label">
                {{ product.stockQuantity > 0 ? `${product.stockQuantity} em estoque` : 'Sem estoque no momento' }}
              </div>
            </div>

            <footer class="ds-card__footer">
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--block"
                :disabled="product.stockQuantity === 0 || inBag(product)"
                :aria-label="inBag(product) ? `${product.name} já está na sacola` : `Adicionar ${product.name} à sacola`"
                @click.stop="addToBag(product)"
              >
                <Check
                  v-if="inBag(product)"
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
                {{ product.stockQuantity === 0 ? 'Indisponível' : inBag(product) ? 'Na sacola' : 'Adicionar à sacola' }}
              </button>
            </footer>
          </article>
        </div>
      </div>

      <p
        class="ds-sr-only"
        aria-live="polite"
      >
        {{ lastAdded }}
      </p>
    </section>
  </div>
</template>
