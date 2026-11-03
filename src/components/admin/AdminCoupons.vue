<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, Plus, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin } from '../../services/admin-api';
import { COUPON_TYPE, options } from '../../services/status';
import { brl, formatDate, formatNumber, formatTime, fromDateInput, percent, toDateInput } from '../../services/format';
import CatalogTabs from './CatalogTabs.vue';
import LoadState from '../ui/LoadState.vue';

// E8 · Cupons. Rotas: vitrine em /api/store/coupons, drop em /api/drop/drop-coupons
// (get-all / add / update). Diferenças do back: maxUses é opcional só na vitrine;
// isExclusiveToRegistered só existe no drop.
defineProps({ params: { type: Object, default: () => ({}) } });

const data = useAsync(async () => {
  const [store, drop, events] = await Promise.all([admin.coupons.getAll(), admin.dropCoupons.getAll(), admin.dropEvents.getAll()]);
  const normalized = [
    ...store.filter((c) => !c.isDeleted).map((c) => ({ ...c, source: 'store', typeId: c.couponTypeId, key: `store:${c.id}` })),
    ...drop.filter((c) => !c.isDeleted).map((c) => ({ ...c, source: 'drop', typeId: c.dropCouponTypeId, key: `drop:${c.id}` })),
  ].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return { coupons: normalized, events: events.filter((e) => !e.isDeleted) };
});

const scope = ref('all');
const rows = computed(() => (data.data.value?.coupons ?? []).filter((c) => scope.value === 'all' || c.source === scope.value));
const eventName = (id) => data.data.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;

const discountLabel = (c) => {
  const value = c.typeId === 1 ? `${formatNumber(c.discountValue)}%` : brl(c.discountValue);
  const extras = [c.maxDiscountCap ? `teto ${brl(c.maxDiscountCap)}` : '', c.minOrderValue ? `mín. ${brl(c.minOrderValue)}` : ''].filter(Boolean);
  return { value, extra: extras.join(' · ') };
};

const situation = (c) => {
  const now = Date.now();
  if (!c.isActive) return { label: 'Inativo', tone: 'done' };
  if (now > Date.parse(c.expiresAt)) return { label: 'Encerrado', tone: 'done' };
  if (c.maxUses && c.usedCount >= c.maxUses) return { label: 'Esgotado', tone: 'done' };
  if (now < Date.parse(c.startsAt)) return { label: 'Agendado', tone: 'scheduled' };
  if (c.maxUses && c.usedCount / c.maxUses >= 0.9) return { label: 'Quase esgotado', tone: 'live', dot: true };
  return { label: 'Ativo', tone: 'success' };
};

const validity = (c) => {
  if (Date.now() > Date.parse(c.expiresAt)) return `expirou ${formatDate(c.expiresAt)}`;
  if (c.source === 'drop') return `${formatDate(c.startsAt)} ${formatTime(c.startsAt)}–${formatTime(c.expiresAt)}`;
  return `até ${formatDate(c.expiresAt)}`;
};

// Editor
const form = ref(null);
const openCoupon = (c = null) => {
  const startsAt = c?.startsAt ?? new Date().toISOString();
  const expiresAt = c?.expiresAt ?? new Date(Date.now() + 30 * 864e5).toISOString();
  form.value = reactive(c ? {
    ...c, where: c.source === 'store' ? 'store' : String(c.dropEventId), maxUses: c.maxUses ?? '',
    startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt),
  } : {
    id: null, source: 'store', where: 'store', code: '', typeId: 1, discountValue: 10, maxDiscountCap: 0, minOrderValue: 0,
    maxUses: '', usedCount: 0, isActive: true, isSingleUse: false, isExclusiveToRegistered: false,
    startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt),
  });
};

const isDrop = computed(() => form.value && form.value.where !== 'store');

const save = useAction(async (changes = {}) => {
  const f = { ...form.value, ...changes };
  const common = {
    id: f.id ?? undefined,
    code: f.code.trim().toUpperCase(),
    discountValue: Number(f.discountValue),
    maxDiscountCap: Number(f.maxDiscountCap) || 0,
    minOrderValue: Number(f.minOrderValue) || 0,
    usedCount: f.usedCount ?? 0,
    isActive: f.isActive,
    isSingleUse: f.isSingleUse,
    startsAt: fromDateInput(f.startsDate),
    expiresAt: fromDateInput(f.expiresDate, true),
  };
  if (isDrop.value) {
    if (f.maxUses === '' || f.maxUses == null) throw new Error('Cupom de drop precisa de limite de usos.');
    const payload = { ...common, dropEventId: Number(f.where), dropCouponTypeId: f.typeId, maxUses: Number(f.maxUses), isExclusiveToRegistered: f.isExclusiveToRegistered };
    if (f.id) await admin.dropCoupons.update(payload);
    else await admin.dropCoupons.add(payload);
  } else {
    const payload = { ...common, enterpriseId: f.enterpriseId ?? 1, couponTypeId: f.typeId, maxUses: f.maxUses === '' ? null : Number(f.maxUses) };
    if (f.id) await admin.coupons.update(payload);
    else await admin.coupons.add(payload);
  }
  if ('isActive' in changes) form.value.isActive = changes.isActive;
  await data.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Cupons
    </h1>
    <CatalogTabs />
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="8"
    @retry="data.reload"
  >
    <section class="ds-grid ds-grid--split">
      <div class="ds-stack--4 ds-min-0">
        <div class="ds-cluster ds-cluster--between">
          <div
            class="ds-nav"
            role="group"
            aria-label="Onde vale"
          >
            <button
              v-for="s in [{ id: 'all', label: 'Todos' }, { id: 'store', label: 'Vitrine' }, { id: 'drop', label: 'Drops' }]"
              :key="s.id"
              type="button"
              :class="['ds-nav__item', { 'ds-nav__item--active': scope === s.id }]"
              :aria-pressed="scope === s.id"
              @click="scope = s.id"
            >
              {{ s.label }}
            </button>
          </div>
          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--sm"
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

        <div class="ds-card ds-card--flush">
          <LoadState
            :is-empty="!rows.length"
            empty-text="Nenhum cupom."
          >
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Cupons de desconto
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Código
                    </th>
                    <th scope="col">
                      Vale em
                    </th>
                    <th scope="col">
                      Desconto
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
                    v-for="c in rows"
                    :key="c.key"
                    :aria-selected="form && form.id === c.id && form.source === c.source ? 'true' : undefined"
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
                      <span
                        v-if="c.source === 'store'"
                        class="ds-badge ds-badge--done"
                      >Vitrine</span>
                      <span
                        v-else
                        class="ds-stack--1"
                      >
                        <span class="ds-badge ds-badge--inverse ds-self-start">Drop</span>
                        <span class="ds-text-xs ds-text-secondary">{{ eventName(c.dropEventId) }}{{ c.isExclusiveToRegistered ? ' · só inscritos' : '' }}</span>
                      </span>
                    </td>
                    <td>
                      {{ discountLabel(c).value }}<span
                        v-if="discountLabel(c).extra"
                        class="ds-text-xs ds-text-secondary"
                      > · {{ discountLabel(c).extra }}</span>
                    </td>
                    <td>
                      <span class="ds-stack--1">
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
                      {{ validity(c) }}
                    </td>
                    <td>
                      <span :class="['ds-badge', `ds-badge--${situation(c).tone}`]">
                        <span
                          v-if="situation(c).dot"
                          class="ds-badge__dot"
                          aria-hidden="true"
                        />
                        {{ situation(c).label }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </LoadState>
        </div>
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
        <div class="ds-field">
          <label
            class="ds-label"
            for="cp-code"
          >Código</label>
          <input
            id="cp-code"
            v-model="form.code"
            class="ds-input ds-mono ds-uppercase"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="cp-where"
          >Vale em</label>
          <select
            id="cp-where"
            v-model="form.where"
            class="ds-input"
            :disabled="Boolean(form.id)"
            aria-describedby="cp-where-hint"
          >
            <option value="store">
              Vitrine
            </option>
            <option
              v-for="e in data.data.value.events"
              :key="e.id"
              :value="String(e.id)"
            >
              Drop: {{ e.name }}
            </option>
          </select>
          <span
            v-if="form.id"
            id="cp-where-hint"
            class="ds-hint"
          >Vitrine e drop ficam em tabelas diferentes: para mudar, crie outro cupom.</span>
        </div>
        <fieldset class="ds-stack--2">
          <legend class="ds-label">
            Tipo de desconto
          </legend>
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
        </fieldset>
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
              min="0"
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
              for="cp-min"
            >Pedido mínimo (R$)</label>
            <input
              id="cp-min"
              v-model="form.minOrderValue"
              class="ds-input"
              type="number"
              min="0"
              step="0.01"
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
              min="1"
              :required="isDrop"
              aria-describedby="cp-max-hint"
            >
            <span
              id="cp-max-hint"
              class="ds-hint"
            >{{ isDrop ? 'Obrigatório no drop' : 'Vazio = ilimitado' }}</span>
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
        </div>
        <label class="ds-check">
          <input
            v-model="form.isSingleUse"
            type="checkbox"
          >
          Um uso por cliente
        </label>
        <label class="ds-check">
          <input
            v-model="form.isExclusiveToRegistered"
            type="checkbox"
            :disabled="!isDrop"
          >
          Só para inscritos (apenas cupons de drop)
        </label>
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
        <p
          v-else-if="save.done.value"
          class="ds-hint ds-text-success"
          role="status"
        >
          Cupom salvo.
        </p>
        <div class="ds-cluster ds-cluster--2">
          <button
            v-if="form.id"
            type="button"
            class="ds-btn ds-btn--ghost"
            :disabled="save.isPending.value"
            @click="save.run({ isActive: !form.isActive })"
          >
            {{ form.isActive ? 'Desativar' : 'Ativar' }}
          </button>
          <button
            type="submit"
            class="ds-btn ds-btn--primary ds-grow"
            :disabled="save.isPending.value"
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
  </LoadState>
</template>
