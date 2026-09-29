<script setup>
import { computed, nextTick, reactive, ref, useTemplateRef, watch, onUnmounted } from 'vue';
import { X, AlertCircle, ShieldCheck } from '@lucide/vue';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  productData: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  secondsToExpiry: { type: Number, default: 600 },
  // Mensagem de erro do último envio; o App a define ao tratar o evento `submit`.
  errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['close', 'submit']);

const CRITICAL_SECONDS = 60;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const dialog = useTemplateRef('dialog');
let returnFocusTo = null;

const formData = reactive({
  fullName: 'Cliente Exemplo',
  email: 'cliente@exemplo.com',
  addressLine: 'Rua Exemplo, 100',
  zipCode: '01000-000',
  city: 'São Paulo',
  state: 'SP',
  couponCode: '',
});
const errors = reactive({});

const appliedCoupon = ref(false);
const couponError = ref('');

// Totais ainda calculados no front (mock). Na integração (task 18) passam a vir da API.
const basePrice = computed(() => props.productData?.price || 0);
const shipping = 20.00;
const discount = computed(() => (appliedCoupon.value ? basePrice.value * 0.10 : 0));
const total = computed(() => basePrice.value + shipping - discount.value);

const isExpired = computed(() => props.secondsToExpiry <= 0);
const isCritical = computed(() => props.secondsToExpiry < CRITICAL_SECONDS);
const expiryLabel = computed(() => {
  const secs = Math.max(0, props.secondsToExpiry);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
});

// --- Foco e rolagem (components/modal.md, comportamento obrigatório) ---------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

watch(() => props.isOpen, async (open) => {
  if (open) {
    returnFocusTo = document.activeElement;
    document.body.style.overflow = 'hidden';
    await nextTick();
    dialog.value?.querySelector('input')?.focus();
  } else {
    document.body.style.overflow = '';
    returnFocusTo?.focus?.();
    returnFocusTo = null;
  }
});

onUnmounted(() => { document.body.style.overflow = ''; });

const requestClose = () => {
  if (!props.isLoading) emit('close');
};

const trapFocus = (e) => {
  const items = [...dialog.value.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
};

// --- Validação por campo (components/input.md) ------------------------------
const FIELDS = [
  { id: 'fullName', label: 'Nome completo', type: 'text', autocomplete: 'name' },
  { id: 'email', label: 'E-mail', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'voce@exemplo.com' },
  { id: 'addressLine', label: 'Endereço de entrega', type: 'text', autocomplete: 'street-address', placeholder: 'Rua, número, complemento' },
  { id: 'zipCode', label: 'CEP', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric', placeholder: '00000-000' },
  { id: 'city', label: 'Cidade', type: 'text', autocomplete: 'address-level2' },
  { id: 'state', label: 'UF', type: 'text', autocomplete: 'address-level1', maxlength: 2, placeholder: 'SP' },
];

const validators = {
  fullName: (v) => (v.trim().length >= 3 ? '' : 'Informe seu nome completo.'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Informe um e-mail válido.'),
  addressLine: (v) => (v.trim() ? '' : 'Informe o endereço de entrega.'),
  zipCode: (v) => (/^\d{5}-?\d{3}$/.test(v.trim()) ? '' : 'CEP deve ter 8 dígitos (00000-000).'),
  city: (v) => (v.trim() ? '' : 'Informe a cidade.'),
  state: (v) => (/^[A-Za-z]{2}$/.test(v.trim()) ? '' : 'UF deve ter 2 letras.'),
};

const validateField = (id) => {
  errors[id] = validators[id](formData[id]);
};

const handleApplyCoupon = () => {
  if (formData.couponCode.trim().toUpperCase() === 'DROP10') {
    appliedCoupon.value = true;
    couponError.value = '';
  } else {
    couponError.value = 'Cupom inválido. Confira o código e tente de novo.';
    appliedCoupon.value = false;
  }
};

const handleSubmit = () => {
  if (isExpired.value || props.isLoading) return;
  FIELDS.forEach(({ id }) => validateField(id));
  const firstInvalid = FIELDS.find(({ id }) => errors[id]);
  if (firstInvalid) {
    dialog.value.querySelector(`#co-${firstInvalid.id}`)?.focus();
    return;
  }
  emit('submit', {
    dropEventId: props.productData.dropEventId,
    customerId: 1,
    couponCode: appliedCoupon.value ? 'DROP10' : null,
    addressLine: formData.addressLine,
    city: formData.city,
    state: formData.state.toUpperCase(),
    zipCode: formData.zipCode,
  });
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="ds-overlay"
      @click.self="requestClose"
    >
      <div
        ref="dialog"
        class="ds-modal ds-stack--5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-title"
        :aria-busy="isLoading"
        @keydown.esc="requestClose"
        @keydown.tab="trapFocus"
      >
        <header class="ds-modal__header">
          <div class="ds-stack--1">
            <h2
              id="co-title"
              class="ds-modal__title"
            >
              Finalizar compra
            </h2>
            <p :class="['ds-text-sm', 'ds-numeric', isCritical ? 'ds-text-danger' : 'ds-text-secondary']">
              Sua reserva expira em {{ expiryLabel }}
            </p>
          </div>
          <button
            type="button"
            class="ds-icon-btn ds-icon-btn--ghost ds-tap"
            aria-label="Fechar"
            :disabled="isLoading"
            @click="requestClose"
          >
            <X
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
        </header>

        <section class="ds-card ds-card--sunken ds-card--tight ds-cluster ds-cluster--between">
          <div class="ds-stack--1">
            <span class="ds-label-caps">Reservado para você</span>
            <span>{{ productData?.name || 'Produto do drop' }}</span>
            <span class="ds-text-xs ds-text-secondary">SKU {{ productData?.sku || '—' }}</span>
          </div>
          <span class="ds-numeric">{{ brl.format(basePrice) }}</span>
        </section>

        <p
          v-if="errorMessage"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ errorMessage }}
        </p>

        <form
          id="co-form"
          class="ds-stack--4"
          novalidate
          @submit.prevent="handleSubmit"
        >
          <div
            v-for="field in FIELDS"
            :key="field.id"
            class="ds-field"
          >
            <label
              class="ds-label"
              :for="`co-${field.id}`"
            >{{ field.label }}</label>
            <input
              :id="`co-${field.id}`"
              v-model="formData[field.id]"
              class="ds-input"
              :type="field.type"
              :autocomplete="field.autocomplete"
              :inputmode="field.inputmode"
              :placeholder="field.placeholder"
              :maxlength="field.maxlength"
              required
              :aria-invalid="!!errors[field.id]"
              :aria-describedby="errors[field.id] ? `co-${field.id}-err` : undefined"
              @blur="validateField(field.id)"
            >
            <span
              v-if="errors[field.id]"
              :id="`co-${field.id}-err`"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ errors[field.id] }}
            </span>
          </div>

          <div class="ds-field">
            <label
              class="ds-label"
              for="co-coupon"
            >Cupom de desconto (opcional)</label>
            <div class="ds-input-group">
              <input
                id="co-coupon"
                v-model="formData.couponCode"
                class="ds-input"
                type="text"
                autocomplete="off"
                placeholder="DROP10"
                :disabled="appliedCoupon"
                :aria-invalid="!!couponError"
                :aria-describedby="couponError ? 'co-coupon-err' : (appliedCoupon ? 'co-coupon-ok' : undefined)"
              >
              <button
                type="button"
                class="ds-btn ds-btn--secondary"
                :disabled="appliedCoupon || !formData.couponCode"
                @click="handleApplyCoupon"
              >
                {{ appliedCoupon ? 'Aplicado' : 'Aplicar' }}
              </button>
            </div>
            <span
              v-if="couponError"
              id="co-coupon-err"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ couponError }}
            </span>
            <span
              v-else-if="appliedCoupon"
              id="co-coupon-ok"
              class="ds-hint ds-text-success"
            >Cupom aplicado: 10% de desconto.</span>
          </div>

          <dl class="ds-card ds-card--sunken ds-card--tight ds-stack--2">
            <div class="ds-cluster ds-cluster--between">
              <dt class="ds-text-secondary">
                Produto
              </dt>
              <dd class="ds-numeric">
                {{ brl.format(basePrice) }}
              </dd>
            </div>
            <div class="ds-cluster ds-cluster--between">
              <dt class="ds-text-secondary">
                Frete
              </dt>
              <dd class="ds-numeric">
                {{ brl.format(shipping) }}
              </dd>
            </div>
            <div
              v-if="appliedCoupon"
              class="ds-cluster ds-cluster--between"
            >
              <dt class="ds-text-secondary">
                Cupom (10%)
              </dt>
              <dd class="ds-numeric ds-text-success">
                − {{ brl.format(discount) }}
              </dd>
            </div>
            <hr class="ds-divider">
            <div class="ds-cluster ds-cluster--between">
              <dt>Total</dt>
              <dd class="ds-numeric">
                {{ brl.format(total) }}
              </dd>
            </div>
          </dl>
        </form>

        <footer class="ds-modal__footer">
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--block"
            :disabled="isLoading"
            @click="requestClose"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="co-form"
            class="ds-btn ds-btn--primary ds-btn--block"
            :disabled="isLoading || isExpired"
            :aria-busy="isLoading"
          >
            <span
              v-if="isLoading"
              class="ds-spinner"
              aria-hidden="true"
            />
            <ShieldCheck
              v-else
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Confirmar compra
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
