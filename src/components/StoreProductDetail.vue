<script setup>
import { computed, ref, watch } from 'vue';
import { Minus, Plus, ShoppingBag, Package } from '@lucide/vue';
import { useAction, useAsync } from '../composables/useAsync';
import { MAX_PER_ORDER, useBag } from '../composables/useBag';
import { href } from '../router';
import { flattenTree, getCategoryTree, getProductBySlug, productImage, variantLabel } from '../services/storefront-api';
import { initialSelection, optionGroups, resolveVariant } from '../services/variants';
import { brl } from '../services/format';
import LoadState from './ui/LoadState.vue';
import VariantPicker from './ui/VariantPicker.vue';

// Detalhe de produto da vitrine (task 29): GET storefront/{slug}/products/by-slug/{slug}.
// Produto com opções só vai para a sacola com o SKU escolhido; preço e saldo
// exibidos são os do SKU, como o back devolve.
const props = defineProps({
  slug: { type: String, required: true },
});

const emit = defineEmits(['open-bag']);

const LOW_STOCK = 5;

const { addToBag, quantityOf } = useBag();

const page = useAsync(async () => {
  const [detail, tree] = await Promise.all([getProductBySlug(props.slug), getCategoryTree().catch(() => [])]);
  return { ...detail, categories: flattenTree(tree) };
}, { immediate: false });

const selection = ref({});
const quantity = ref(1);
const lastAdded = ref('');

watch(() => props.slug, async () => {
  await page.reload();
  selection.value = initialSelection(page.data.value?.variants);
  quantity.value = 1;
  lastAdded.value = '';
}, { immediate: true });

const product = computed(() => page.data.value?.product ?? null);
const variants = computed(() => page.data.value?.variants ?? []);
const category = computed(() => page.data.value?.categories.find((c) => c.id === product.value?.categoryId) ?? null);
const groups = computed(() => optionGroups(variants.value));
const hasOptions = computed(() => groups.value.length > 0);
const variant = computed(() => (hasOptions.value ? resolveVariant(variants.value, selection.value) : variants.value[0] ?? null));
const missing = computed(() => groups.value.filter((g) => selection.value[g.key] == null).map((g) => g.key.toLowerCase()));

const inBag = computed(() => (variant.value ? quantityOf(variant.value.id) : 0));

// Até o saldo do SKU (quando o back informa) e o limite por pedido, menos o que já está na sacola.
const maxQuantity = computed(() => {
  const v = variant.value;
  if (!v || !v.canPurchase) return 0;
  const cap = v.availableQuantity > 0 ? Math.min(v.availableQuantity, MAX_PER_ORDER) : MAX_PER_ORDER;
  return Math.max(0, cap - inBag.value);
});

watch(variant, () => {
  quantity.value = 1;
});

const priceText = computed(() => {
  if (variant.value) return brl(variant.value.price);
  const p = product.value;
  return p.maxPrice > p.price ? `a partir de ${brl(p.price)}` : brl(p.price);
});

const stockBadge = computed(() => {
  const v = variant.value;
  if (!product.value?.inStock || (v && !v.canPurchase)) return { variant: 'ds-badge--done', label: 'Sem estoque' };
  if (v && v.availableQuantity > 0 && v.availableQuantity <= LOW_STOCK) return { variant: 'ds-badge--live', label: 'Últimas unidades' };
  return { variant: 'ds-badge--success', label: 'Em estoque' };
});

const stockText = computed(() => {
  const v = variant.value;
  if (!v) return missing.value.length ? `Escolha ${missing.value.join(' e ')} para ver o preço e o estoque.` : '';
  if (!v.canPurchase) return 'Sem estoque no momento.';
  if (v.availableQuantity <= 0) return 'Disponível.';
  return `${v.availableQuantity} ${v.availableQuantity === 1 ? 'unidade disponível' : 'unidades disponíveis'}.`;
});

const buttonText = computed(() => {
  if (!product.value?.canPurchase) return 'Indisponível';
  if (!variant.value) return `Escolha ${missing.value.join(' e ')}`;
  if (!variant.value.canPurchase) return 'Indisponível';
  if (maxQuantity.value === 0) return 'Limite na sacola';
  return 'Adicionar à sacola';
});

// Logado, o back confere o estoque do SKU; a recusa (400) aparece abaixo do botão.
const adding = useAction(async () => {
  if (!variant.value || maxQuantity.value === 0) return;
  lastAdded.value = '';
  const qty = Math.min(quantity.value, maxQuantity.value);
  await addToBag({ productId: product.value.id, variantId: variant.value.id, slug: product.value.slug, quantity: qty });
  const label = hasOptions.value ? ` (${variantLabel(variant.value)})` : '';
  lastAdded.value = `${qty} ${qty === 1 ? 'unidade adicionada' : 'unidades adicionadas'} à sacola${label}.`;
  quantity.value = 1;
});

const notFound = computed(() => page.error.value?.kind === 'not-found');
</script>

<template>
  <article
    v-if="notFound"
    class="ds-card ds-empty"
  >
    <Package
      :size="24"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p>Produto não encontrado ou fora da vitrine.</p>
    <a
      class="ds-btn ds-btn--secondary ds-btn--sm"
      :href="href('/vitrine')"
    >Voltar à vitrine</a>
  </article>

  <LoadState
    v-else-if="page.isLoading.value || page.error.value"
    class="ds-card"
    :is-loading="page.isLoading.value"
    :error="page.error.value"
    :lines="8"
    @retry="page.reload()"
  />

  <div
    v-else-if="product"
    class="ds-stack--8"
  >
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <p class="ds-label-caps">
          <a
            v-if="category"
            :href="href(`/vitrine/c/${category.slug}`)"
          >{{ category.name }}</a>
          <template v-else>
            Vitrine
          </template>
        </p>
        <h1 class="ds-title">
          {{ product.name }}
        </h1>
      </div>
      <span :class="['ds-badge', stockBadge.variant]">{{ stockBadge.label }}</span>
    </div>

    <section class="ds-grid ds-grid--sidebar">
      <div class="ds-stack--6">
        <figure class="ds-card ds-card--flush ds-animate-in">
          <img
            v-if="productImage(product)"
            class="ds-card__media ds-card__media--product"
            :src="productImage(product)"
            :alt="product.name"
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
        </figure>

        <article class="ds-card ds-stack--5">
          <h2 class="ds-card__title">
            Sobre o produto
          </h2>
          <p class="ds-text-secondary">
            {{ product.description }}
          </p>
          <hr class="ds-divider">
          <dl class="ds-stat-grid">
            <div
              v-if="product.brand"
              class="ds-stack--1"
            >
              <dt class="ds-label-caps">
                Marca
              </dt>
              <dd class="ds-text-sm">
                {{ product.brand }}
              </dd>
            </div>
            <div
              v-if="category"
              class="ds-stack--1"
            >
              <dt class="ds-label-caps">
                Categoria
              </dt>
              <dd class="ds-text-sm">
                {{ category.name }}
              </dd>
            </div>
            <div class="ds-stack--1">
              <dt class="ds-label-caps">
                SKU
              </dt>
              <dd class="ds-text-sm">
                {{ variant?.sku ?? '—' }}
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <div class="ds-stack--6">
        <article class="ds-card ds-stack--5">
          <div class="ds-stat ds-stat--lg">
            <div class="ds-stat__value">
              {{ priceText }}
            </div>
            <div
              class="ds-stat__label"
              aria-live="polite"
            >
              {{ stockText }}
            </div>
          </div>

          <VariantPicker
            v-if="hasOptions"
            v-model="selection"
            :variants="variants"
          />

          <div class="ds-field">
            <span
              id="qty-label"
              class="ds-label"
            >Quantidade</span>
            <div
              class="ds-cluster"
              role="group"
              aria-labelledby="qty-label"
            >
              <button
                type="button"
                class="ds-icon-btn ds-tap"
                aria-label="Diminuir quantidade"
                :disabled="quantity <= 1 || maxQuantity === 0"
                @click="quantity -= 1"
              >
                <Minus
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </button>
              <output
                class="ds-numeric"
                aria-live="polite"
              >{{ maxQuantity === 0 ? 0 : quantity }}</output>
              <button
                type="button"
                class="ds-icon-btn ds-tap"
                aria-label="Aumentar quantidade"
                :disabled="quantity >= maxQuantity"
                @click="quantity += 1"
              >
                <Plus
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </button>
            </div>
            <span class="ds-hint">
              {{ inBag > 0 ? `${inBag} já na sacola · ` : '' }}até {{ MAX_PER_ORDER }} por pedido
            </span>
          </div>

          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
            :disabled="maxQuantity === 0 || adding.isPending.value"
            :aria-busy="adding.isPending.value"
            @click="adding.run()"
          >
            <ShoppingBag
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ buttonText }}
          </button>

          <button
            v-if="inBag > 0"
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--block"
            @click="emit('open-bag')"
          >
            Ver sacola
          </button>

          <p
            class="ds-hint ds-text-success"
            aria-live="polite"
          >
            {{ lastAdded }}
          </p>
          <p
            v-if="adding.error.value"
            class="ds-error"
            role="alert"
          >
            {{ adding.error.value.message }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>
