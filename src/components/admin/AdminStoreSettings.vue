<script setup>
import { computed, reactive, watch } from 'vue';
import { AlertCircle, CheckCircle } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { usePermissions } from '../../composables/usePermissions';
import { getStoreSettings, updateStoreSettings } from '../../services/admin-api';
import { formatNumber } from '../../services/format';
import LoadState from '../ui/LoadState.vue';

// Configurações comerciais (task 39). Rotas (/api/store): GET e PUT store-settings
// (settings.manage). Limites do back: moeda de 3 letras, pedido mínimo ≥ 0, itens por
// pedido de 1 a 10.000 (vazio = sem limite) e prazo de pagamento de 5 a 10.080 minutos.
const { can, denied } = usePermissions();

const LIMITS = { itemsMax: 10000, minutesMin: 5, minutesMax: 10080 };

const settings = useAsync(getStoreSettings);
const form = reactive({ currencyCode: 'BRL', minOrderValue: 0, maxItemsPerOrder: '', allowBackorder: false, pendingOrderExpirationMinutes: 60 });

watch(() => settings.data.value, (s) => {
  if (!s) return;
  Object.assign(form, {
    currencyCode: s.currencyCode,
    minOrderValue: s.minOrderValue,
    maxItemsPerOrder: s.maxItemsPerOrder ?? '',
    allowBackorder: s.allowBackorder,
    pendingOrderExpirationMinutes: s.pendingOrderExpirationMinutes,
  });
}, { immediate: true });

const errors = computed(() => {
  const out = {};
  if (!/^[A-Za-z]{3}$/.test(form.currencyCode)) out.currencyCode = 'Use 3 letras, como BRL.';
  if (form.minOrderValue === '' || Number(form.minOrderValue) < 0) out.minOrderValue = 'O pedido mínimo não pode ser negativo.';
  const items = form.maxItemsPerOrder;
  if (items !== '' && !(Number.isInteger(Number(items)) && items >= 1 && items <= LIMITS.itemsMax)) out.maxItemsPerOrder = `Informe de 1 a ${formatNumber(LIMITS.itemsMax)} unidades, ou deixe vazio.`;
  const minutes = Number(form.pendingOrderExpirationMinutes);
  if (!(Number.isInteger(minutes) && minutes >= LIMITS.minutesMin && minutes <= LIMITS.minutesMax)) {
    out.pendingOrderExpirationMinutes = `Informe de ${LIMITS.minutesMin} a ${formatNumber(LIMITS.minutesMax)} minutos.`;
  }
  return out;
});
const invalid = computed(() => Object.keys(errors.value).length > 0);

const expirationText = computed(() => {
  const minutes = Number(form.pendingOrderExpirationMinutes);
  if (!Number.isFinite(minutes) || minutes < 60) return '';
  const hours = minutes / 60;
  return `${formatNumber(minutes)} min = ${hours % 1 ? hours.toFixed(1).replace('.', ',') : formatNumber(hours)} h`;
});

const save = useAction(async () => {
  settings.data.value = await updateStoreSettings({
    currencyCode: form.currencyCode.trim().toUpperCase(),
    minOrderValue: Number(form.minOrderValue),
    maxItemsPerOrder: form.maxItemsPerOrder === '' ? null : Number(form.maxItemsPerOrder),
    allowBackorder: form.allowBackorder,
    pendingOrderExpirationMinutes: Number(form.pendingOrderExpirationMinutes),
  });
});
</script>

<template>
  <LoadState
    :is-loading="settings.isLoading.value"
    :error="settings.error.value"
    :lines="6"
    @retry="settings.reload"
  >
    <form
      class="ds-card ds-container--narrow ds-stack--5"
      @submit.prevent="save.run()"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Regras de venda
        </h2>
      </header>
      <fieldset
        class="ds-stack--5"
        :disabled="!can('settings.manage')"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="ss-currency"
          >Moeda</label>
          <input
            id="ss-currency"
            v-model="form.currencyCode"
            class="ds-input ds-mono ds-uppercase"
            maxlength="3"
            required
            aria-describedby="ss-currency-hint"
            :aria-invalid="Boolean(errors.currencyCode)"
          >
          <span
            id="ss-currency-hint"
            :class="errors.currencyCode ? 'ds-error' : 'ds-hint'"
            :role="errors.currencyCode ? 'alert' : undefined"
          >
            <AlertCircle
              v-if="errors.currencyCode"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ errors.currencyCode || 'Código de 3 letras. A loja não converte moeda.' }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="ss-min"
          >Pedido mínimo (R$)</label>
          <input
            id="ss-min"
            v-model="form.minOrderValue"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
            aria-describedby="ss-min-hint"
            :aria-invalid="Boolean(errors.minOrderValue)"
          >
          <span
            id="ss-min-hint"
            :class="errors.minOrderValue ? 'ds-error' : 'ds-hint'"
            :role="errors.minOrderValue ? 'alert' : undefined"
          >
            <AlertCircle
              v-if="errors.minOrderValue"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ errors.minOrderValue || 'Vale sobre o subtotal dos produtos. Zero = sem mínimo.' }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="ss-items"
          >Máximo de unidades por pedido</label>
          <input
            id="ss-items"
            v-model="form.maxItemsPerOrder"
            class="ds-input"
            type="number"
            min="1"
            :max="LIMITS.itemsMax"
            step="1"
            aria-describedby="ss-items-hint"
            :aria-invalid="Boolean(errors.maxItemsPerOrder)"
          >
          <span
            id="ss-items-hint"
            :class="errors.maxItemsPerOrder ? 'ds-error' : 'ds-hint'"
            :role="errors.maxItemsPerOrder ? 'alert' : undefined"
          >
            <AlertCircle
              v-if="errors.maxItemsPerOrder"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ errors.maxItemsPerOrder || 'Vazio = sem limite.' }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="ss-expiration"
          >Prazo para pagar (minutos)</label>
          <input
            id="ss-expiration"
            v-model="form.pendingOrderExpirationMinutes"
            class="ds-input"
            type="number"
            :min="LIMITS.minutesMin"
            :max="LIMITS.minutesMax"
            step="1"
            required
            aria-describedby="ss-expiration-hint"
            :aria-invalid="Boolean(errors.pendingOrderExpirationMinutes)"
          >
          <span
            id="ss-expiration-hint"
            :class="errors.pendingOrderExpirationMinutes ? 'ds-error' : 'ds-hint'"
            :role="errors.pendingOrderExpirationMinutes ? 'alert' : undefined"
          >
            <AlertCircle
              v-if="errors.pendingOrderExpirationMinutes"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ errors.pendingOrderExpirationMinutes || `Depois disso o pedido pendente expira e o estoque volta.${expirationText ? ` (${expirationText})` : ''}` }}
          </span>
        </div>
        <div class="ds-stack--1">
          <label class="ds-check">
            <input
              v-model="form.allowBackorder"
              type="checkbox"
            >
            Permitir venda sem estoque
          </label>
          <span
            v-if="form.allowBackorder"
            class="ds-hint"
            role="status"
          >Clientes poderão comprar itens sem saldo.</span>
        </div>
      </fieldset>
      <p
        v-if="save.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ save.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <span
          v-if="save.done.value && !save.error.value"
          class="ds-text-sm ds-text-success"
          role="status"
        ><CheckCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        /> Regras salvas.</span>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="invalid || save.isPending.value || !can('settings.manage')"
          :title="denied('settings.manage', 'alterar as configurações')"
          :aria-busy="save.isPending.value"
        >
          <span
            v-if="save.isPending.value"
            class="ds-spinner"
            aria-hidden="true"
          />
          Salvar regras
        </button>
      </div>
    </form>
  </LoadState>
</template>
