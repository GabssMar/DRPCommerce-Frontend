<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, Plus, X } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { usePagedSearch } from '../../composables/usePagedSearch';
import { usePermissions } from '../../composables/usePermissions';
import {
  createCoupon, listConditionOperators, listConditionTypes, searchCoupons, setCouponActivation, updateCoupon, validateCoupon,
} from '../../services/admin-catalog-api';
import { fieldMessage } from '../../services/api-error';
import { COUPON_AVAILABILITY, COUPON_TYPE, options } from '../../services/status';
import { brl, formatDate, formatNumber, fromDateInput, percent, toDateInput } from '../../services/format';
import CatalogTabs from './CatalogTabs.vue';
import AdminDropCoupons from './AdminDropCoupons.vue';
import LoadState from '../ui/LoadState.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E8 · Cupons da vitrine (task 36): busca paginada (GET coupons/search), condições
// com tipos e operadores vindos do back, ativação com corpo booleano e simulador
// (GET coupons/validate). Cupons de drop ficam em AdminDropCoupons.
defineProps({ params: { type: Object, default: () => ({}) } });

const { can, denied } = usePermissions();

const MAX_CONDITIONS = 4;
const CONFLICTS = { 'Coupon.DuplicateCode': 'code' };
const ERRORS = {
  'Coupon.InUse': 'O cupom já foi usado: só validade, limite de usos e ativação podem mudar.',
  'Coupon.MaxUsesBelowUsage': 'O limite de usos não pode ficar abaixo dos usos já feitos.',
};
const messageOf = (error) => (error ? ERRORS[error.code] ?? error.message : '');

const scope = ref('store');

const search = usePagedSearch(searchCoupons, { code: '', typeId: null, availability: null });
const { filters } = search;

// Tipos e operadores de condição vêm do back; o que cada um pede é lido da descrição.
const catalog = useAsync(async () => {
  const [types, operators] = await Promise.all([listConditionTypes(), listConditionOperators()]);
  return { types, operators };
});
const types = computed(() => catalog.data.value?.types ?? []);
const operators = computed(() => catalog.data.value?.operators ?? []);
const operatorOf = (id) => operators.value.find((o) => o.id === id);
const needsSecond = (operatorId) => /entre| e /i.test(operatorOf(operatorId)?.description ?? '');
const isMoney = (typeId) => /valor|gasto/i.test(types.value.find((t) => t.id === typeId)?.description ?? '');

const discountLabel = (c) => {
  const value = c.typeId === 1 ? `${formatNumber(c.discountValue)}%` : brl(c.discountValue);
  return { value, cap: c.maxDiscountCap ? `teto ${brl(c.maxDiscountCap)}` : '' };
};

// ------------------------------------------------------------- editor ---
const form = ref(null);
const locked = computed(() => Boolean(form.value?.id) && form.value.usedCount > 0);
const openCoupon = (c = null) => {
  save.error.value = null;
  activation.error.value = null;
  const startsAt = c?.startsAt ?? new Date().toISOString();
  const expiresAt = c?.expiresAt ?? new Date(Date.now() + 30 * 864e5).toISOString();
  form.value = reactive(c ? {
    id: c.id, code: c.code, typeId: c.typeId, discountValue: c.discountValue, maxDiscountCap: c.maxDiscountCap, maxUses: c.maxUses ?? '',
    usedCount: c.usedCount, isActive: c.isActive, isSingleUse: c.isSingleUse, startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt),
    startsAtOriginal: c.startsAt, startsDateOriginal: toDateInput(startsAt),
    conditions: c.conditions.map((k) => ({ typeId: k.typeId, operatorId: k.operatorId, value: k.value, secondValue: k.secondValue ?? '' })),
  } : {
    id: null, code: '', typeId: 1, discountValue: 10, maxDiscountCap: 0, maxUses: '', usedCount: 0, isActive: true, isSingleUse: false,
    startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt), conditions: [],
  });
};

const freeTypes = (current) => types.value.filter((t) => t.id === current || !form.value.conditions.some((k) => k.typeId === t.id));
const addCondition = () => {
  const type = freeTypes(null)[0];
  if (type) form.value.conditions.push({ typeId: type.id, operatorId: operators.value[0]?.id, value: '', secondValue: '' });
};
const removeCondition = (i) => form.value.conditions.splice(i, 1);

const save = useAction(async () => {
  const f = form.value;
  const payload = {
    code: f.code.replace(/\s/g, '').toUpperCase(),
    typeId: f.typeId,
    discountValue: Number(f.discountValue),
    maxDiscountCap: Number(f.maxDiscountCap) || 0,
    maxUses: f.maxUses === '' ? null : Number(f.maxUses),
    isActive: f.isActive,
    isSingleUse: f.isSingleUse,
    // Início intocado volta como veio: o back trava o início de cupom já usado e compara o instante.
    startsAt: f.id && f.startsDate === f.startsDateOriginal ? f.startsAtOriginal : fromDateInput(f.startsDate),
    expiresAt: fromDateInput(f.expiresDate, true),
    conditions: f.conditions.map((k) => ({
      typeId: k.typeId, operatorId: k.operatorId, value: Number(k.value), secondValue: needsSecond(k.operatorId) ? Number(k.secondValue) : null,
    })),
  };
  const saved = f.id ? await updateCoupon({ ...payload, id: f.id }) : await createCoupon(payload);
  openCoupon(saved);
  await search.reload();
});

const activation = useAction(async () => {
  const updated = await setCouponActivation(form.value.id, !form.value.isActive);
  form.value.isActive = updated.isActive;
  await search.reload();
});

// ---------------------------------------------------------- simulador ---
const sim = reactive({ code: '', subTotal: '', itemQuantity: '', customerId: '' });
const outcome = ref(null);
const simulate = useAction(async () => {
  outcome.value = await validateCoupon({
    code: sim.code.trim().toUpperCase(), subTotal: Number(sim.subTotal) || 0, itemQuantity: Number(sim.itemQuantity) || 0, customerId: sim.customerId,
  });
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Cupons
    </h1>
    <div class="ds-cluster ds-cluster--2">
      <CatalogTabs />
      <button
        v-if="scope === 'store'"
        type="button"
        :class="['ds-btn', form ? 'ds-btn--secondary' : 'ds-btn--primary']"
        :disabled="!can('coupons.manage')"
        :title="denied('coupons.manage', 'gerenciar cupons')"
        @click="openCoupon()"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Novo cupom
      </button>
    </div>
  </div>

  <div
    class="ds-nav ds-self-start"
    role="group"
    aria-label="Onde vale"
  >
    <button
      v-for="s in [{ id: 'store', label: 'Vitrine' }, { id: 'drop', label: 'Drops' }]"
      :key="s.id"
      type="button"
      :class="['ds-nav__item', { 'ds-nav__item--active': scope === s.id }]"
      :aria-pressed="scope === s.id"
      @click="scope = s.id"
    >
      {{ s.label }}
    </button>
  </div>

  <AdminDropCoupons v-if="scope === 'drop'" />

  <template v-else>
    <div class="ds-toolbar">
      <div class="ds-toolbar__search">
        <label
          class="ds-sr-only"
          for="cp-search"
        >Buscar cupom</label>
        <input
          id="cp-search"
          v-model="filters.code"
          class="ds-input ds-uppercase"
          type="search"
          placeholder="Código do cupom"
        >
      </div>
      <select
        v-model="filters.availability"
        class="ds-input ds-toolbar__filter"
        aria-label="Situação"
      >
        <option :value="null">
          Todas as situações
        </option>
        <option
          v-for="a in options(COUPON_AVAILABILITY)"
          :key="a.id"
          :value="a.id"
        >
          {{ a.label }}
        </option>
      </select>
      <select
        v-model="filters.typeId"
        class="ds-input ds-toolbar__filter"
        aria-label="Tipo de desconto"
      >
        <option :value="null">
          Todos os tipos
        </option>
        <option
          v-for="t in options(COUPON_TYPE)"
          :key="t.id"
          :value="t.id"
        >
          {{ t.label }}
        </option>
      </select>
    </div>

    <section class="ds-grid ds-grid--split">
      <div class="ds-card ds-card--flush ds-min-0">
        <LoadState
          :is-loading="search.isLoading.value"
          :error="search.error.value"
          :is-empty="!search.items.value.length"
          :empty-text="search.isFiltered.value ? 'Nenhum cupom com estes filtros.' : 'Nenhum cupom criado. Crie o primeiro para oferecer desconto na vitrine.'"
          :lines="6"
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
            <button
              v-else-if="can('coupons.manage')"
              type="button"
              class="ds-btn ds-btn--secondary ds-btn--sm"
              @click="openCoupon()"
            >
              Criar cupom
            </button>
          </template>
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Cupons da vitrine
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Código
                  </th>
                  <th scope="col">
                    Desconto
                  </th>
                  <th scope="col">
                    Condições
                  </th>
                  <th scope="col">
                    Uso
                  </th>
                  <th scope="col">
                    Validade
                  </th>
                  <th scope="col">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in search.items.value"
                  :key="c.id"
                  :aria-selected="form?.id === c.id ? 'true' : undefined"
                >
                  <td>
                    <button
                      type="button"
                      class="ds-table__open ds-mono"
                      @click="openCoupon(c)"
                    >
                      {{ c.code }}
                    </button>
                  </td>
                  <td>
                    {{ discountLabel(c).value }}<span
                      v-if="discountLabel(c).cap"
                      class="ds-text-xs ds-text-secondary"
                    > · {{ discountLabel(c).cap }}</span>
                  </td>
                  <td class="ds-text-sm">
                    <span
                      v-if="!c.conditions.length"
                      class="ds-text-secondary"
                    >Sem condições</span>
                    <span
                      v-else
                      class="ds-stack--1"
                    >
                      <span
                        v-for="k in c.conditions"
                        :key="k.typeId"
                      >{{ k.description }}</span>
                    </span>
                  </td>
                  <td>
                    <span
                      class="ds-stack--1"
                      title="Inclui usos comprometidos em pedidos pendentes. Eles são liberados se o pedido expirar ou for cancelado."
                    >
                      <span class="ds-numeric ds-text-sm">{{ formatNumber(c.usedCount) }} / {{ c.maxUses ? formatNumber(c.maxUses) : 'ilimitado' }}</span>
                      <span
                        v-if="c.maxUses"
                        class="ds-meter"
                        aria-hidden="true"
                      ><span
                        class="ds-meter__fill"
                        :style="{ width: `${Math.min(100, percent(c.usedCount, c.maxUses))}%` }"
                      /></span>
                    </span>
                  </td>
                  <td class="ds-text-sm ds-nowrap">
                    {{ formatDate(c.startsAt) }} a {{ formatDate(c.expiresAt) }}
                  </td>
                  <td>
                    <StatusBadge
                      :id="c.availability"
                      :table="COUPON_AVAILABILITY"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ds-table-footer">
            <span class="ds-hint">O uso conta também pedidos pendentes; é liberado se o pedido expirar ou for cancelado.</span>
            <PaginationNav
              v-model:page="search.page.value"
              :page-size="search.pageSize"
              :total="search.total.value"
            />
          </div>
        </LoadState>
      </div>

      <form
        v-if="form"
        class="ds-card ds-stack--4"
        @submit.prevent="save.run()"
      >
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            {{ form.id ? 'Editar cupom' : 'Novo cupom' }}
          </h2>
          <button
            type="button"
            class="ds-icon-btn ds-icon-btn--ghost"
            aria-label="Fechar"
            @click="form = null"
          >
            <X
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
        </header>
        <p
          v-if="locked"
          class="ds-hint"
        >
          Cupom já usado: só a validade e o limite de usos podem mudar. Para parar de oferecer, desative.
        </p>
        <fieldset
          class="ds-stack--4"
          :disabled="locked || !can('coupons.manage')"
        >
          <div class="ds-field">
            <label
              class="ds-label"
              for="cp-code"
            >Código</label>
            <input
              id="cp-code"
              v-model="form.code"
              class="ds-input ds-mono ds-uppercase"
              minlength="3"
              maxlength="50"
              pattern="[A-Za-z0-9_\-]+"
              required
              aria-describedby="cp-code-error"
              :aria-invalid="Boolean(fieldMessage(save.error.value, 'code', CONFLICTS))"
            >
            <span
              v-if="fieldMessage(save.error.value, 'code', CONFLICTS)"
              id="cp-code-error"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="14"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ fieldMessage(save.error.value, 'code', CONFLICTS) }}
            </span>
          </div>
          <div
            class="ds-nav"
            role="radiogroup"
            aria-label="Tipo de desconto"
          >
            <button
              v-for="t in options(COUPON_TYPE)"
              :key="t.id"
              type="button"
              role="radio"
              :aria-checked="form.typeId === t.id"
              :class="['ds-nav__item', { 'ds-nav__item--active': form.typeId === t.id }]"
              @click="form.typeId = t.id"
            >
              {{ t.label }}
            </button>
          </div>
          <div class="ds-grid ds-grid--2">
            <div class="ds-field">
              <label
                class="ds-label"
                for="cp-val"
              >{{ form.typeId === 1 ? 'Desconto (%)' : 'Desconto (R$)' }}</label>
              <input
                id="cp-val"
                v-model="form.discountValue"
                class="ds-input"
                type="number"
                min="0.01"
                :max="form.typeId === 1 ? 100 : undefined"
                step="0.01"
                required
              >
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="cp-cap"
              >Teto do desconto (R$)</label>
              <input
                id="cp-cap"
                v-model="form.maxDiscountCap"
                class="ds-input"
                type="number"
                min="0"
                step="0.01"
              >
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="cp-start"
              >Início</label>
              <input
                id="cp-start"
                v-model="form.startsDate"
                class="ds-input"
                type="date"
                required
              >
            </div>
          </div>
        </fieldset>
        <fieldset
          class="ds-grid ds-grid--2"
          :disabled="!can('coupons.manage')"
        >
          <div class="ds-field">
            <label
              class="ds-label"
              for="cp-end"
            >Fim</label>
            <input
              id="cp-end"
              v-model="form.expiresDate"
              class="ds-input"
              type="date"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="cp-max"
            >Limite de usos</label>
            <input
              id="cp-max"
              v-model="form.maxUses"
              class="ds-input"
              type="number"
              :min="Math.max(1, form.usedCount)"
              aria-describedby="cp-max-hint"
            >
            <span
              id="cp-max-hint"
              class="ds-hint"
            >Vazio = ilimitado</span>
          </div>
        </fieldset>
        <label class="ds-check">
          <input
            v-model="form.isSingleUse"
            type="checkbox"
            :disabled="locked || !can('coupons.manage')"
          >
          Um uso por cliente
        </label>

        <fieldset
          class="ds-stack--2"
          :disabled="locked || !can('coupons.manage')"
        >
          <legend class="ds-label">
            Condições (todas precisam valer)
          </legend>
          <LoadState
            :is-loading="catalog.isLoading.value"
            :error="catalog.error.value"
            :lines="2"
            @retry="catalog.reload"
          >
            <div
              v-for="(k, i) in form.conditions"
              :key="i"
              class="ds-card ds-card--sunken ds-card--tight ds-stack--2"
            >
              <div class="ds-grid ds-grid--2">
                <div class="ds-field">
                  <label
                    class="ds-label"
                    :for="`cp-ct-${i}`"
                  >Regra</label>
                  <select
                    :id="`cp-ct-${i}`"
                    v-model.number="k.typeId"
                    class="ds-input"
                  >
                    <option
                      v-for="t in freeTypes(k.typeId)"
                      :key="t.id"
                      :value="t.id"
                    >
                      {{ t.description }}
                    </option>
                  </select>
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    :for="`cp-co-${i}`"
                  >Operador</label>
                  <select
                    :id="`cp-co-${i}`"
                    v-model.number="k.operatorId"
                    class="ds-input"
                  >
                    <option
                      v-for="o in operators"
                      :key="o.id"
                      :value="o.id"
                    >
                      {{ o.description }}
                    </option>
                  </select>
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    :for="`cp-cv-${i}`"
                  >{{ needsSecond(k.operatorId) ? 'De' : 'Valor' }}{{ isMoney(k.typeId) ? ' (R$)' : '' }}</label>
                  <input
                    :id="`cp-cv-${i}`"
                    v-model="k.value"
                    class="ds-input"
                    type="number"
                    min="0"
                    :step="isMoney(k.typeId) ? 0.01 : 1"
                    required
                  >
                </div>
                <div
                  v-if="needsSecond(k.operatorId)"
                  class="ds-field"
                >
                  <label
                    class="ds-label"
                    :for="`cp-cs-${i}`"
                  >Até{{ isMoney(k.typeId) ? ' (R$)' : '' }}</label>
                  <input
                    :id="`cp-cs-${i}`"
                    v-model="k.secondValue"
                    class="ds-input"
                    type="number"
                    :min="k.value || 0"
                    :step="isMoney(k.typeId) ? 0.01 : 1"
                    required
                  >
                </div>
              </div>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm ds-self-start"
                @click="removeCondition(i)"
              >
                Remover condição
              </button>
            </div>
            <button
              v-if="form.conditions.length < MAX_CONDITIONS && freeTypes(null).length"
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm ds-self-start"
              @click="addCondition"
            >
              Adicionar condição
            </button>
          </LoadState>
        </fieldset>

        <p
          v-if="save.error.value && !fieldMessage(save.error.value, 'code', CONFLICTS)"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ messageOf(save.error.value) }}
        </p>
        <p
          v-else-if="save.done.value"
          class="ds-hint ds-text-success"
          role="status"
        >
          Cupom salvo.
        </p>
        <p
          v-if="activation.error.value"
          class="ds-error"
          role="alert"
        >
          {{ activation.error.value.message }}
        </p>
        <div class="ds-cluster ds-cluster--2">
          <button
            v-if="form.id"
            type="button"
            class="ds-btn ds-btn--ghost"
            :disabled="activation.isPending.value || !can('coupons.manage')"
            :title="denied('coupons.manage', 'gerenciar cupons')"
            @click="activation.run()"
          >
            {{ form.isActive ? 'Desativar' : 'Ativar' }}
          </button>
          <button
            type="submit"
            class="ds-btn ds-btn--primary ds-grow"
            :disabled="save.isPending.value || !can('coupons.manage')"
            :title="denied('coupons.manage', 'gerenciar cupons')"
          >
            Salvar cupom
          </button>
        </div>
      </form>

      <article
        v-else
        class="ds-card ds-card--sunken ds-empty"
      >
        <p>Abra um cupom para editar ou crie um novo.</p>
      </article>
    </section>

    <form
      class="ds-card ds-stack--4"
      @submit.prevent="simulate.run()"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Simular cupom
        </h2>
      </header>
      <p class="ds-hint">
        Testa o cupom com um pedido de exemplo. A simulação não reserva nem consome uso.
      </p>
      <div class="ds-grid ds-grid--form">
        <div class="ds-field">
          <label
            class="ds-label"
            for="sm-code"
          >Código</label>
          <input
            id="sm-code"
            v-model="sim.code"
            class="ds-input ds-mono ds-uppercase"
            maxlength="50"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="sm-sub"
          >Subtotal (R$)</label>
          <input
            id="sm-sub"
            v-model="sim.subTotal"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="sm-qty"
          >Itens no pedido</label>
          <input
            id="sm-qty"
            v-model="sim.itemQuantity"
            class="ds-input"
            type="number"
            min="0"
            max="10000"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="sm-customer"
          >Cliente (número, opcional)</label>
          <input
            id="sm-customer"
            v-model="sim.customerId"
            class="ds-input"
            type="number"
            min="1"
          >
        </div>
      </div>
      <p
        v-if="simulate.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ simulate.error.value.message }}
      </p>
      <div
        v-else-if="outcome"
        class="ds-stack--1"
        role="status"
      >
        <span :class="['ds-badge ds-self-start', outcome.isValid ? 'ds-badge--success' : 'ds-badge--done']">{{ outcome.isValid ? 'Cupom válido' : 'Cupom recusado' }}</span>
        <span v-if="outcome.isValid">Desconto de {{ brl(outcome.discountAmount) }}; o pedido fica em {{ brl(outcome.subTotalAfterDiscount) }}.</span>
        <span v-else>{{ outcome.message }}</span>
      </div>
      <div class="ds-cluster ds-cluster--end">
        <button
          type="submit"
          class="ds-btn ds-btn--secondary"
          :disabled="simulate.isPending.value"
          :aria-busy="simulate.isPending.value"
        >
          <span
            v-if="simulate.isPending.value"
            class="ds-spinner"
            aria-hidden="true"
          />
          Simular
        </button>
      </div>
    </form>
  </template>
</template>
