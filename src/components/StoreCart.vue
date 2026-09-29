<script setup>
import { computed } from 'vue';
import { Minus, Plus, Trash2, ShoppingBag, Package, AlertCircle, CheckCircle } from '@lucide/vue';

// Sacola da vitrine. Os totais aqui são estimativa; o pedido confirmado traz os valores do servidor.
const props = defineProps({
  // [{ product, quantity }]
  lines: { type: Array, default: () => [] },
  isSubmitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  order: { type: Object, default: null },
});

const emit = defineEmits(['update-quantity', 'remove', 'checkout', 'select-product', 'continue-shopping']);

const MAX_PER_ORDER = 10;
const SHIPPING_ESTIMATE = 20.00;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const itemCount = computed(() => props.lines.reduce((sum, l) => sum + l.quantity, 0));
const subTotal = computed(() => props.lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0));
const total = computed(() => subTotal.value + SHIPPING_ESTIMATE);
const maxFor = (line) => Math.min(line.product.stockQuantity, MAX_PER_ORDER);

const setQuantity = (line, quantity) => {
  if (quantity < 1 || quantity > maxFor(line)) return;
  emit('update-quantity', { productId: line.product.id, quantity });
};
</script>

<template>
  <div class="ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <p class="ds-label-caps">
          Loja
        </p>
        <h1 class="ds-title">
          Sacola
        </h1>
      </div>
      <span
        v-if="!order && lines.length"
        class="ds-badge"
      >{{ itemCount }} {{ itemCount === 1 ? 'item' : 'itens' }}</span>
    </div>

    <!-- Pedido confirmado -->
    <article
      v-if="order"
      class="ds-card ds-animate-in ds-stack--6"
      aria-live="polite"
    >
      <header class="ds-card__header">
        <div>
          <h2 class="ds-card__title">
            Pedido recebido
          </h2>
          <p class="ds-card__subtitle">
            Guarde o número do pedido para acompanhar a entrega.
          </p>
        </div>
        <span class="ds-badge ds-badge--success">
          <CheckCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Confirmado
        </span>
      </header>
      <dl class="ds-stack--3">
        <div class="ds-cluster ds-cluster--between">
          <dt class="ds-text-secondary">
            Pedido
          </dt>
          <dd><code>#{{ order.id }}</code></dd>
        </div>
        <div
          v-for="item in order.items"
          :key="item.productId"
          class="ds-cluster ds-cluster--between"
        >
          <dt class="ds-text-secondary">
            {{ item.quantity }}× {{ item.name }}
          </dt>
          <dd class="ds-numeric">
            {{ brl.format(item.unitPrice * item.quantity) }}
          </dd>
        </div>
        <div class="ds-cluster ds-cluster--between">
          <dt class="ds-text-secondary">
            Frete
          </dt>
          <dd class="ds-numeric">
            {{ brl.format(order.shippingCost) }}
          </dd>
        </div>
        <hr class="ds-divider">
        <div class="ds-cluster ds-cluster--between">
          <dt>Total</dt>
          <dd class="ds-numeric">
            {{ brl.format(order.totalAmount) }}
          </dd>
        </div>
      </dl>
      <footer class="ds-card__footer">
        <button
          type="button"
          class="ds-btn ds-btn--primary ds-btn--block"
          @click="emit('continue-shopping')"
        >
          Continuar comprando
        </button>
      </footer>
    </article>

    <!-- Vazia -->
    <article
      v-else-if="!lines.length"
      class="ds-card ds-empty"
    >
      <ShoppingBag
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Sua sacola está vazia.</p>
      <button
        type="button"
        class="ds-btn ds-btn--secondary ds-btn--sm"
        @click="emit('continue-shopping')"
      >
        Ver vitrine
      </button>
    </article>

    <!-- Itens + resumo -->
    <section
      v-else
      class="ds-grid ds-grid--sidebar"
    >
      <article class="ds-card ds-stack--5">
        <h2 class="ds-card__title">
          Itens
        </h2>
        <ul
          class="ds-stack--5"
          role="list"
        >
          <li
            v-for="(line, index) in lines"
            :key="line.product.id"
            class="ds-stack--5"
          >
            <hr
              v-if="index > 0"
              class="ds-divider"
            >
            <div class="ds-cluster ds-cluster--between">
              <div class="ds-cluster">
                <img
                  v-if="line.product.imageUrl"
                  class="ds-card__media ds-card__media--product ds-card__media--thumb"
                  :src="line.product.imageUrl"
                  alt=""
                >
                <div
                  v-else
                  class="ds-card__media ds-card__media--product ds-card__media--thumb ds-card__media--placeholder"
                  aria-hidden="true"
                >
                  <Package
                    :size="16"
                    :stroke-width="1.5"
                  />
                </div>
                <div class="ds-stack--1">
                  <button
                    type="button"
                    @click="emit('select-product', line.product.id)"
                  >
                    {{ line.product.name }}
                  </button>
                  <span class="ds-text-xs ds-text-secondary">{{ line.product.category }} · SKU {{ line.product.sku }}</span>
                  <span class="ds-text-sm ds-text-secondary ds-numeric">{{ brl.format(line.product.price) }} cada</span>
                </div>
              </div>

              <div class="ds-cluster">
                <div
                  class="ds-cluster ds-cluster--2"
                  role="group"
                  :aria-label="`Quantidade de ${line.product.name}`"
                >
                  <button
                    type="button"
                    class="ds-icon-btn ds-tap"
                    :aria-label="`Diminuir quantidade de ${line.product.name}`"
                    :disabled="line.quantity <= 1"
                    @click="setQuantity(line, line.quantity - 1)"
                  >
                    <Minus
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                  </button>
                  <output class="ds-numeric">{{ line.quantity }}</output>
                  <button
                    type="button"
                    class="ds-icon-btn ds-tap"
                    :aria-label="`Aumentar quantidade de ${line.product.name}`"
                    :disabled="line.quantity >= maxFor(line)"
                    @click="setQuantity(line, line.quantity + 1)"
                  >
                    <Plus
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <span class="ds-numeric">{{ brl.format(line.product.price * line.quantity) }}</span>
                <button
                  type="button"
                  class="ds-icon-btn ds-icon-btn--ghost ds-tap"
                  :aria-label="`Remover ${line.product.name} da sacola`"
                  @click="emit('remove', line.product.id)"
                >
                  <Trash2
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </li>
        </ul>
      </article>

      <aside class="ds-card ds-stack--5">
        <h2 class="ds-card__title">
          Resumo
        </h2>
        <dl class="ds-stack--3">
          <div class="ds-cluster ds-cluster--between">
            <dt class="ds-text-secondary">
              Subtotal ({{ itemCount }} {{ itemCount === 1 ? 'item' : 'itens' }})
            </dt>
            <dd class="ds-numeric">
              {{ brl.format(subTotal) }}
            </dd>
          </div>
          <div class="ds-cluster ds-cluster--between">
            <dt class="ds-text-secondary">
              Frete (estimado)
            </dt>
            <dd class="ds-numeric">
              {{ brl.format(SHIPPING_ESTIMATE) }}
            </dd>
          </div>
          <hr class="ds-divider">
          <div class="ds-cluster ds-cluster--between">
            <dt>Total</dt>
            <dd class="ds-stat__value ds-numeric">
              {{ brl.format(total) }}
            </dd>
          </div>
        </dl>

        <p
          v-if="error"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ error }}
        </p>

        <button
          type="button"
          class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
          :disabled="isSubmitting"
          :aria-busy="isSubmitting"
          @click="emit('checkout')"
        >
          <span
            v-if="isSubmitting"
            class="ds-spinner"
            aria-hidden="true"
          />
          Finalizar compra
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--block"
          @click="emit('continue-shopping')"
        >
          Continuar comprando
        </button>
      </aside>
    </section>
  </div>
</template>
