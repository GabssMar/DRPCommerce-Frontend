<script setup>
import { computed, reactive, watch } from 'vue';
import { AlertCircle, Globe, Shield, Sparkles } from '@lucide/vue';
import { initialSelection, optionGroups, resolveVariant } from '../services/variants';
import VariantPicker from './ui/VariantPicker.vue';

// Detalhe do drop (task 16): GET storefront/{slug}/drop/events/{id}. Cada produto do
// evento é uma participação, com variações (SKU, opções, preço e saldo livre). A escolha
// da variação fica aqui; a reserva com participationId + variantId é a task 18.
const props = defineProps({
  event: { type: Object, default: null },
});

const LOW_STOCK = 5;

const numberBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerBR = new Intl.NumberFormat('pt-BR');

// Seleção por participação: { [participationId]: { Tamanho: '40' } }.
const selections = reactive({});
watch(() => props.event?.id, () => {
  Object.keys(selections).forEach((key) => delete selections[key]);
  (props.event?.products ?? []).forEach((p) => {
    selections[p.participationId] = initialSelection(p.variants);
  });
}, { immediate: true });

const products = computed(() => (props.event?.products ?? []).map((product) => {
  const selection = selections[product.participationId] ?? {};
  const hasOptions = optionGroups(product.variants).length > 0;
  const variant = hasOptions ? resolveVariant(product.variants, selection) : product.variants[0] ?? null;
  const prices = product.variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const available = product.variants.reduce((sum, v) => sum + Math.max(0, v.available), 0);
  return { ...product, hasOptions, variant, min, max, available };
}));

// Valor ausente é "—", nunca 0 (components/stat.md, regra 4).
const priceOf = (p) => {
  if (p.variant) return numberBRL.format(p.variant.price);
  if (p.min == null) return '—';
  return p.max > p.min ? `${numberBRL.format(p.min)}+` : numberBRL.format(p.min);
};

const stockText = (p) => {
  const v = p.variant;
  if (!v) return p.available ? `${integerBR.format(p.available)} unidades no total. Escolha a opção para ver o saldo.` : 'Esgotado.';
  if (v.available <= 0) return 'Esgotado nesta opção.';
  return `${integerBR.format(v.available)} ${v.available === 1 ? 'unidade disponível' : 'unidades disponíveis'}${v.available <= LOW_STOCK ? ' · últimas unidades' : ''}.`;
};

const features = [
  { icon: Shield, label: 'Autenticidade', desc: 'Verificada por NFC' },
  { icon: Globe, label: 'Frete grátis', desc: 'Todo o Brasil' },
  { icon: Sparkles, label: 'Exclusividade', desc: 'Sem reestoque' },
];
</script>

<template>
  <div
    v-if="event"
    class="ds-stack--6"
  >
    <figure class="ds-card ds-card--flush ds-animate-in">
      <img
        class="ds-card__media"
        :src="event.bannerImageUrl || event.coverImageUrl"
        :alt="event.name"
      >
    </figure>

    <article
      v-for="product in products"
      :key="product.participationId"
      class="ds-card ds-stack--5"
    >
      <header class="ds-stack--2">
        <p class="ds-label-caps">
          Edição limitada · até {{ product.maxPerCustomer }} {{ product.maxPerCustomer === 1 ? 'unidade' : 'unidades' }} por CPF
        </p>
        <!-- O nome do evento já é o h1 da tela (App); aqui vai o produto. -->
        <h2 class="ds-card__title">
          {{ product.name }}
        </h2>
      </header>

      <div class="ds-stat ds-stat--lg">
        <div class="ds-stat__value">
          <span class="ds-stat__unit">R$</span>{{ priceOf(product) }}
        </div>
        <div class="ds-stat__label">
          Preço por unidade
        </div>
      </div>

      <p class="ds-text-secondary">
        {{ product.description || event.description }}
      </p>

      <VariantPicker
        v-if="product.hasOptions"
        v-model="selections[product.participationId]"
        :variants="product.variants"
      />

      <p
        class="ds-hint"
        aria-live="polite"
      >
        {{ stockText(product) }}
        O limite por CPF soma todas as opções deste produto.
      </p>

      <p
        v-if="product.concentrationWarning"
        class="ds-hint"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Estoque pequeno para o limite por pessoa: poucas compras podem esgotar o drop.
      </p>
    </article>

    <article class="ds-card ds-stack--5">
      <p class="ds-text-secondary">
        {{ event.description }}
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
