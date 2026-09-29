<script setup>
import { computed, ref, watch } from 'vue';
import { Minus, Plus, ShoppingBag, Package } from '@lucide/vue';

// Detalhe de produto da vitrine (cliente casual): compra direta, sem fila.
const props = defineProps({
  product: { type: Object, default: null },
  quantityInBag: { type: Number, default: 0 },
});

const emit = defineEmits(['add-to-bag', 'open-bag', 'back']);

const MAX_PER_ORDER = 10;
const LOW_STOCK = 5;

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const quantity = ref(1);
const lastAdded = ref('');

watch(() => props.product?.id, () => {
  quantity.value = 1;
  lastAdded.value = '';
});

// Quanto ainda cabe no pedido: estoque menos o que já está na sacola, até o limite por pedido.
const maxQuantity = computed(() => {
  if (!props.product) return 0;
  return Math.max(0, Math.min(props.product.stockQuantity, MAX_PER_ORDER) - props.quantityInBag);
});
const isSoldOut = computed(() => props.product?.stockQuantity === 0);

const stockBadge = computed(() => {
  if (!props.product) return null;
  if (isSoldOut.value) return { variant: 'ds-badge--done', label: 'Esgotado' };
  if (props.product.stockQuantity <= LOW_STOCK) return { variant: 'ds-badge--live', label: 'Últimas unidades' };
  return { variant: 'ds-badge--success', label: 'Em estoque' };
});

const stockText = computed(() => {
  if (!props.product) return '';
  if (isSoldOut.value) return 'Sem estoque no momento.';
  return `${props.product.stockQuantity} ${props.product.stockQuantity === 1 ? 'unidade disponível' : 'unidades disponíveis'}.`;
});

const addToBag = () => {
  if (maxQuantity.value === 0) return;
  const qty = Math.min(quantity.value, maxQuantity.value);
  emit('add-to-bag', { productId: props.product.id, quantity: qty });
  lastAdded.value = `${qty} ${qty === 1 ? 'unidade adicionada' : 'unidades adicionadas'} à sacola.`;
  quantity.value = 1;
};

</script>

<template>
  <article
    v-if="!product"
    class="ds-card ds-empty"
  >
    <Package
      :size="24"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p>Produto não encontrado.</p>
    <button
      type="button"
      class="ds-btn ds-btn--secondary ds-btn--sm"
      @click="emit('back')"
    >
      Voltar à vitrine
    </button>
  </article>

  <div
    v-else
    class="ds-stack--8"
  >
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <p class="ds-label-caps">
          {{ product.category }}
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
            v-if="product.imageUrl"
            class="ds-card__media ds-card__media--product"
            :src="product.imageUrl"
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
            <div class="ds-stack--1">
              <dt class="ds-label-caps">
                Categoria
              </dt>
              <dd class="ds-text-sm">
                {{ product.category }}
              </dd>
            </div>
            <div class="ds-stack--1">
              <dt class="ds-label-caps">
                SKU
              </dt>
              <dd class="ds-text-sm">
                {{ product.sku }}
              </dd>
            </div>
            <div class="ds-stack--1">
              <dt class="ds-label-caps">
                Estoque
              </dt>
              <dd class="ds-text-sm">
                {{ product.stockQuantity }} un.
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <div class="ds-stack--6">
        <article class="ds-card ds-stack--5">
          <div class="ds-stat ds-stat--lg">
            <div class="ds-stat__value">
              <span class="ds-stat__unit">R$</span>{{ numberBRL.format(product.price) }}
            </div>
            <div class="ds-stat__label">
              {{ stockText }}
            </div>
          </div>

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
              {{ quantityInBag > 0 ? `${quantityInBag} já na sacola · ` : '' }}até {{ MAX_PER_ORDER }} por pedido
            </span>
          </div>

          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
            :disabled="maxQuantity === 0"
            @click="addToBag"
          >
            <ShoppingBag
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ isSoldOut ? 'Indisponível' : maxQuantity === 0 ? 'Limite na sacola' : 'Adicionar à sacola' }}
          </button>

          <button
            v-if="quantityInBag > 0"
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
        </article>
      </div>
    </section>
  </div>
</template>
