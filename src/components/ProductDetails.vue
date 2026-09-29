<script setup>
import { computed } from 'vue';
import { Shield, Sparkles, Globe } from '@lucide/vue';

const props = defineProps({
  productData: { type: Object, default: null },
});

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerBR = new Intl.NumberFormat('pt-BR');

// Valor ausente é "—", nunca 0 (components/stat.md, regra 4).
const price = computed(() => (props.productData?.price == null ? '—' : numberBRL.format(props.productData.price)));

const features = [
  { icon: Shield, label: 'Autenticidade', desc: 'Verificada por NFC' },
  { icon: Globe, label: 'Frete grátis', desc: 'Todo o Brasil' },
  { icon: Sparkles, label: 'Exclusividade', desc: 'Sem reestoque' }
];
</script>

<template>
  <div
    v-if="productData"
    class="ds-stack--6"
  >
    <figure class="ds-card ds-card--flush ds-animate-in">
      <img
        class="ds-card__media"
        :src="productData.bannerImageUrl || productData.coverImageUrl"
        :alt="productData.name"
      >
    </figure>

    <article class="ds-card ds-stack--5">
      <header class="ds-stack--2">
        <p class="ds-label-caps">
          Edição limitada · {{ integerBR.format(productData.totalUnitsAvailable) }} unidades
        </p>
        <!-- O nome já é o h1 da tela (App); este card descreve o produto. -->
        <h2 class="ds-card__title">
          Sobre o produto
        </h2>
      </header>

      <div class="ds-stat ds-stat--lg">
        <div class="ds-stat__value">
          <span class="ds-stat__unit">R$</span>{{ price }}
        </div>
        <div class="ds-stat__label">
          Preço por unidade
        </div>
      </div>

      <p class="ds-text-secondary">
        {{ productData.description }}
      </p>

      <hr class="ds-divider">

      <ul
        class="ds-stat-grid"
        role="list"
      >
        <li
          v-for="feat in features"
          :key="feat.label"
          class="ds-stack--1"
        >
          <span class="ds-cluster ds-cluster--2 ds-label-caps">
            <component
              :is="feat.icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ feat.label }}
          </span>
          <span class="ds-text-sm">{{ feat.desc }}</span>
        </li>
      </ul>
    </article>
  </div>
</template>
