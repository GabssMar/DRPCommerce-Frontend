<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, Plus, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin } from '../../services/admin-api';
import { COUPON_TYPE, options } from '../../services/status';
import { brl, formatDate, formatNumber, formatTime, fromDateInput, percent, toDateInput } from '../../services/format';
import LoadState from '../ui/LoadState.vue';

// E8 · Cupons de drop. Rotas: /api/drop/drop-coupons (get-all / add / update).
// O cupom de drop exige limite de usos e pode ser exclusivo de inscritos.
const data = useAsync(async () => {
  const [coupons, events] = await Promise.all([admin.dropCoupons.getAll(), admin.dropEvents.getAll()]);
  return {
    coupons: coupons.filter((c) => !c.isDeleted).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)),
    events: events.filter((e) => !e.isDeleted),
  };
});

const rows = computed(() => data.data.value?.coupons ?? []);
const eventName = (id) => data.data.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;

const discountLabel = (c) => {
  const value = c.dropCouponTypeId === 1 ? `${formatNumber(c.discountValue)}%` : brl(c.discountValue);
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
  return `${formatDate(c.startsAt)} ${formatTime(c.startsAt)}–${formatTime(c.expiresAt)}`;
};

// Editor
const form = ref(null);
const openCoupon = (c = null) => {
  save.error.value = null;
  const startsAt = c?.startsAt ?? new Date().toISOString();
  const expiresAt = c?.expiresAt ?? new Date(Date.now() + 30 * 864e5).toISOString();
  form.value = reactive(c ? {
    ...c, typeId: c.dropCouponTypeId, startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt),
  } : {
    id: null, dropEventId: data.data.value.events[0]?.id ?? null, code: '', typeId: 1, discountValue: 10, maxDiscountCap: 0,
    minOrderValue: 0, maxUses: '', usedCount: 0, isActive: true, isSingleUse: false, isExclusiveToRegistered: false,
    startsDate: toDateInput(startsAt), expiresDate: toDateInput(expiresAt),
  });
};

const save = useAction(async (changes = {}) => {
  const f = { ...form.value, ...changes };
  const payload = {
    id: f.id ?? undefined,
    code: f.code.trim().toUpperCase(),
    dropEventId: Number(f.dropEventId),
    dropCouponTypeId: f.typeId,
    discountValue: Number(f.discountValue),
    maxDiscountCap: Number(f.maxDiscountCap) || 0,
    minOrderValue: Number(f.minOrderValue) || 0,
    maxUses: Number(f.maxUses),
    usedCount: f.usedCount ?? 0,
    isActive: f.isActive,
    isSingleUse: f.isSingleUse,
    isExclusiveToRegistered: f.isExclusiveToRegistered,
    startsAt: fromDateInput(f.startsDate),
    expiresAt: fromDateInput(f.expiresDate, true),
  };
  if (f.id) await admin.dropCoupons.update(payload);
  else await admin.dropCoupons.add(payload);
  if ('isActive' in changes) form.value.isActive = changes.isActive;
  await data.reload();
});
</script>

<template>
  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="8"
    @retry="data.reload"
  >
    <section class="ds-grid ds-grid--split">
      <div class="ds-stack--4 ds-min-0">
        <div class="ds-cluster ds-cluster--end">
          <button
            type="button"
            :class="['ds-btn', 'ds-btn--sm', form ? 'ds-btn--secondary' : 'ds-btn--primary']"
            @click="openCoupon()"
          >
            <Plus
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Novo cupom de drop
          </button>
        </div>

        <div class="ds-card ds-card--flush">
          <LoadState
            :is-empty="!rows.length"
            empty-text="Nenhum cupom de drop. Crie um para um drop específico."
          >
            <template #empty-action>
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                @click="openCoupon()"
              >
                Criar cupom de drop
              </button>
            </template>
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Cupons de drop
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Código
                    </th>
                    <th scope="col">
                      Drop
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
                    :key="c.id"
                    :aria-selected="form && form.id === c.id ? 'true' : undefined"
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
                      <span class="ds-stack--1">
                        <span class="ds-text-sm">{{ eventName(c.dropEventId) }}</span>
                        <span
                          v-if="c.isExclusiveToRegistered"
                          class="ds-text-xs ds-text-secondary"
                        >só inscritos</span>
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
                        <span class="ds-numeric ds-text-sm">{{ formatNumber(c.usedCount) }} / {{ formatNumber(c.maxUses) }}</span>
                        <span
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
            {{ form.id ? 'Editar cupom de drop' : 'Novo cupom de drop' }}
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
            for="dc-code"
          >Código</label>
          <input
            id="dc-code"
            v-model="form.code"
            class="ds-input ds-mono ds-uppercase"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="dc-event"
          >Drop</label>
          <select
            id="dc-event"
            v-model.number="form.dropEventId"
            class="ds-input"
            required
          >
            <option
              v-for="e in data.data.value.events"
              :key="e.id"
              :value="e.id"
            >
              {{ e.name }}
            </option>
          </select>
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
              for="dc-val"
            >{{ form.typeId === 1 ? 'Desconto (%)' : 'Desconto (R$)' }}</label>
            <input
              id="dc-val"
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
              for="dc-cap"
            >Teto do desconto (R$)</label>
            <input
              id="dc-cap"
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
              for="dc-min"
            >Pedido mínimo (R$)</label>
            <input
              id="dc-min"
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
              for="dc-max"
            >Limite de usos</label>
            <input
              id="dc-max"
              v-model="form.maxUses"
              class="ds-input"
              type="number"
              min="1"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="dc-start"
            >Início</label>
            <input
              id="dc-start"
              v-model="form.startsDate"
              class="ds-input"
              type="date"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="dc-end"
            >Fim</label>
            <input
              id="dc-end"
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
          >
          Só para inscritos
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
