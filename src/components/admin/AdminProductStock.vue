<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { exclusive, useAction } from '../../composables/useAsync';
import { usePagedSearch } from '../../composables/usePagedSearch';
import { usePermissions } from '../../composables/usePermissions';
import {
  adjustStock, commitReservation, createReservation, getReservation, getStock, listMovements, releaseReservation,
} from '../../services/admin-catalog-api';
import { formatDateTime, formatNumber } from '../../services/format';
import { toPage } from '../../services/paging';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';

// Aba Estoque do editor (task 34). O saldo é do SKU e vem pronto do back (físico,
// reservado, disponível e version); a tela não calcula o disponível.
const props = defineProps({ product: { type: Object, required: true } });
const emit = defineEmits(['updated']);

const { can, denied } = usePermissions();

const MOVEMENT_TYPES = {
  Adjustment: 'Ajuste', Reservation: 'Reserva', Release: 'Liberação', Commit: 'Baixa da reserva', Expiration: 'Expiração', Return: 'Devolução',
};
const RESERVATION_STATUS = {
  Reserved: { label: 'Reservada', tone: 'live' }, Released: { label: 'Liberada', tone: 'done' },
  Committed: { label: 'Efetivada', tone: 'success' }, Expired: { label: 'Expirada', tone: 'done' },
};
const REASONS = ['Recebimento de fornecedor', 'Devolução', 'Avaria', 'Correção de inventário', 'Venda balcão'];
const ERRORS = {
  'Inventory.StaleVersion': 'O saldo mudou enquanto você editava. Conferimos o saldo atual: revise a quantidade e envie de novo.',
  'Inventory.InvalidAdjustment': 'O ajuste deixaria o saldo abaixo do reservado ou negativo.',
  'Inventory.UntrackedSku': 'Este SKU não controla estoque.',
  'Inventory.OrderReservationProtected': 'Reserva de pedido: ela é liberada ou efetivada pelo próprio pedido.',
  'Inventory.ReservationClosed': 'A reserva já foi encerrada.',
  'Inventory.InsufficientStock': 'Saldo disponível insuficiente para a reserva.',
  'Inventory.ReservationNotFound': 'Reserva não encontrada.',
};
const messageOf = (error) => (error ? ERRORS[error.code] ?? error.message : '');

const tracked = computed(() => (props.product.variants ?? []).filter((v) => v.tracksStock));
const skuLabel = (v) => (v.isDefault ? v.sku : `${v.name} · ${v.sku}`);

// ------------------------------------------------------------- ajuste ---
const adjusting = ref(null);
const form = reactive({ direction: 'in', quantity: '', reason: REASONS[0], note: '' });
const key = ref('');

const openAdjust = (v) => {
  save.error.value = null;
  adjusting.value = { variant: v, version: v.version };
  Object.assign(form, { direction: 'in', quantity: '', reason: REASONS[0], note: '' });
  key.value = crypto.randomUUID();
};
const change = computed(() => (form.direction === 'out' ? -1 : 1) * (Number(form.quantity) || 0));
const reasonText = () => [form.reason, form.note.trim()].filter(Boolean).join(': ');

const save = useAction(async () => {
  const { variant, version } = adjusting.value;
  try {
    await adjustStock(variant.id, { quantityChange: change.value, reason: reasonText(), idempotencyKey: key.value, expectedVersion: version });
  } catch (err) {
    // Saldo mudou: lê o atual, mantém o formulário e a mesma chave.
    if (err.code === 'Inventory.StaleVersion') {
      const current = await getStock(variant.id);
      adjusting.value = { variant: current, version: current.version };
      emit('updated');
    }
    throw err;
  }
  adjusting.value = null;
  movements.reload();
  emit('updated');
});

// -------------------------------------------------------- movimentações ---
// O back filtra por um SKU de cada vez: a lista é do SKU escolhido.
const movements = usePagedSearch(
  (f) => (f.productVariantId ? listMovements(f) : Promise.resolve(toPage([]))),
  { productVariantId: tracked.value[0]?.id ?? null },
);
watch(tracked, (list) => {
  if (!list.some((v) => v.id === movements.filters.productVariantId)) movements.filters.productVariantId = list[0]?.id ?? null;
});

// ------------------------------------------------------------- reservas ---
const reserving = ref(null);
const known = ref([]);
const reserve = useAction(async () => {
  const r = reserving.value;
  const created = await createReservation({
    idempotencyKey: r.key, reference: r.reference.trim(),
    items: r.lines.filter((l) => Number(l.quantity) > 0).map((l) => ({ productVariantId: l.variantId, quantity: Number(l.quantity) })),
  });
  known.value = [created, ...known.value.filter((x) => x.id !== created.id)];
  reserving.value = null;
  emit('updated');
  movements.reload();
});
const openReserve = () => {
  reserve.error.value = null;
  reserving.value = { key: crypto.randomUUID(), reference: '', lines: tracked.value.map((v) => ({ variantId: v.id, label: skuLabel(v), quantity: '' })) };
};

const lookupId = ref('');
const lookup = useAction(async () => {
  const found = await getReservation(Number(lookupId.value));
  known.value = [found, ...known.value.filter((x) => x.id !== found.id)];
  lookupId.value = '';
});
const finish = useAction(async (reservation, action) => {
  const updated = await (action === 'release' ? releaseReservation : commitReservation)(reservation.id);
  known.value = known.value.map((x) => (x.id === updated.id ? updated : x));
  emit('updated');
  movements.reload();
});
const skuOfItem = (item) => (props.product.variants ?? []).find((v) => v.id === item.productVariantId)?.sku ?? `SKU #${item.productVariantId}`;
exclusive(finish, lookup, reserve);
const reservationError = computed(() => messageOf(finish.error.value || lookup.error.value || reserve.error.value));
</script>

<template>
  <section class="ds-stack--6">
    <article
      v-if="!tracked.length"
      class="ds-card"
    >
      <p class="ds-text-secondary">
        {{ product.isDigital ? 'Produto digital: não controla estoque.' : 'Este produto usa variantes: o estoque é controlado em cada SKU. Cadastre a primeira variante na aba Variantes.' }}
      </p>
    </article>

    <article
      v-for="v in tracked"
      :key="v.id"
      class="ds-card ds-stack--3"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          {{ skuLabel(v) }}
        </h2>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :disabled="!can('inventory.manage')"
          :title="denied('inventory.manage', 'movimentar estoque')"
          @click="openAdjust(v)"
        >
          Ajustar estoque
        </button>
      </header>
      <div class="ds-stat-grid">
        <div class="ds-stat">
          <span class="ds-stat__value">{{ formatNumber(v.stockQuantity) }}</span>
          <span class="ds-stat__label">Físico</span>
        </div>
        <div class="ds-stat">
          <span class="ds-stat__value">{{ formatNumber(v.reservedQuantity) }}</span>
          <span class="ds-stat__label">Reservado</span>
        </div>
        <div :class="['ds-stat', { 'ds-stat--critical': v.availableQuantity <= 0 }]">
          <span class="ds-stat__value">{{ formatNumber(v.availableQuantity) }}</span>
          <span class="ds-stat__label">Disponível</span>
        </div>
      </div>
    </article>

    <article class="ds-card ds-card--flush">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Movimentações
        </h2>
        <select
          v-model="movements.filters.productVariantId"
          class="ds-input ds-toolbar__filter"
          aria-label="SKU das movimentações"
        >
          <option
            v-for="v in tracked"
            :key="v.id"
            :value="v.id"
          >
            {{ skuLabel(v) }}
          </option>
        </select>
      </header>
      <LoadState
        :is-loading="movements.isLoading.value"
        :error="movements.error.value"
        :is-empty="!movements.items.value.length"
        empty-text="Nenhuma movimentação neste SKU."
        :lines="4"
        flush
        @retry="movements.reload"
      >
        <template #empty-action>
          <button
            v-if="can('inventory.manage') && tracked.some((v) => v.id === movements.filters.productVariantId)"
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="openAdjust(tracked.find((v) => v.id === movements.filters.productVariantId))"
          >
            Ajustar estoque
          </button>
        </template>
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Movimentações de estoque
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Quando
                </th>
                <th scope="col">
                  Operação
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Quantidade
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Saldo
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Reservado
                </th>
                <th scope="col">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in movements.items.value"
                :key="m.id"
              >
                <td class="ds-numeric">
                  {{ formatDateTime(m.occurredAt) }}
                </td>
                <td>{{ MOVEMENT_TYPES[m.type] ?? m.type }}</td>
                <td class="ds-table__td--numeric">
                  {{ m.quantityChange > 0 ? '+' : '' }}{{ formatNumber(m.quantityChange) }}
                </td>
                <td class="ds-table__td--numeric">
                  {{ formatNumber(m.stockAfter) }}
                </td>
                <td class="ds-table__td--numeric">
                  {{ formatNumber(m.reservedAfter) }}
                </td>
                <td class="ds-text-sm">
                  <span class="ds-stack--1">
                    <span>{{ m.reason || '—' }}</span>
                    <span class="ds-text-xs ds-text-secondary">usuário #{{ m.actorUserId }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ds-table-footer">
          <span class="ds-hint">Mais recentes primeiro.</span>
          <PaginationNav
            v-model:page="movements.page.value"
            :page-size="movements.pageSize"
            :total="movements.total.value"
          />
        </div>
      </LoadState>
    </article>

    <article class="ds-card ds-stack--3">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Reservas avulsas
        </h2>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :disabled="!tracked.length || !can('inventory.manage')"
          :title="denied('inventory.manage', 'movimentar estoque')"
          @click="openReserve"
        >
          Nova reserva
        </button>
      </header>
      <p class="ds-hint">
        Separa unidades sem pedido. O back não lista reservas: aparecem aqui as que você criar ou consultar pelo número.
      </p>
      <form
        class="ds-input-group"
        @submit.prevent="lookup.run()"
      >
        <label
          class="ds-sr-only"
          for="rs-lookup"
        >Número da reserva</label>
        <input
          id="rs-lookup"
          v-model="lookupId"
          class="ds-input"
          type="number"
          min="1"
          placeholder="Número da reserva"
          required
        >
        <button
          type="submit"
          class="ds-btn ds-btn--ghost ds-btn--sm"
          :disabled="lookup.isPending.value"
        >
          Consultar
        </button>
      </form>
      <div
        v-for="r in known"
        :key="r.id"
        class="ds-row-divided ds-text-sm"
      >
        <span class="ds-stack--1">
          <span class="ds-text-medium">#{{ r.id }}{{ r.reference ? ` · ${r.reference}` : '' }}</span>
          <span class="ds-text-xs ds-text-secondary">{{ r.items.map((i) => `${formatNumber(i.quantity)} × ${skuOfItem(i)}`).join(', ') }} · expira {{ formatDateTime(r.expiresAt) }}</span>
        </span>
        <span class="ds-cluster ds-cluster--2">
          <span :class="['ds-badge', `ds-badge--${RESERVATION_STATUS[r.status]?.tone ?? 'done'}`]">{{ RESERVATION_STATUS[r.status]?.label ?? r.status }}</span>
          <template v-if="r.status === 'Reserved'">
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="finish.isPending.value || !can('inventory.manage')"
              @click="finish.run(r, 'release')"
            >
              Liberar
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="finish.isPending.value || !can('inventory.manage')"
              @click="finish.run(r, 'commit')"
            >
              Efetivar
            </button>
          </template>
        </span>
      </div>
      <p
        v-if="reservationError"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ reservationError }}
      </p>
    </article>
  </section>

  <ModalDialog
    v-if="adjusting"
    :title="`Ajustar ${skuLabel(adjusting.variant)}`"
    @close="adjusting = null"
  >
    <form
      id="adjust-form"
      class="ds-stack--4"
      @submit.prevent="save.run()"
    >
      <p class="ds-text-sm ds-text-secondary">
        Físico {{ formatNumber(adjusting.variant.stockQuantity) }} · reservado {{ formatNumber(adjusting.variant.reservedQuantity) }} · disponível {{ formatNumber(adjusting.variant.availableQuantity) }}
      </p>
      <div
        class="ds-nav"
        role="radiogroup"
        aria-label="Tipo de ajuste"
      >
        <button
          v-for="t in [{ id: 'in', label: 'Entrada' }, { id: 'out', label: 'Saída' }]"
          :key="t.id"
          type="button"
          role="radio"
          :aria-checked="form.direction === t.id"
          :class="['ds-nav__item', { 'ds-nav__item--active': form.direction === t.id }]"
          @click="form.direction = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adj-qty"
        >Quantidade</label>
        <input
          id="adj-qty"
          v-model="form.quantity"
          class="ds-input"
          type="number"
          min="1"
          step="1"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adj-reason"
        >Motivo</label>
        <select
          id="adj-reason"
          v-model="form.reason"
          class="ds-input"
        >
          <option
            v-for="r in REASONS"
            :key="r"
          >
            {{ r }}
          </option>
        </select>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adj-note"
        >Observação</label>
        <input
          id="adj-note"
          v-model="form.note"
          class="ds-input"
          maxlength="300"
        >
      </div>
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
        {{ messageOf(save.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="adjusting = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="adjust-form"
        class="ds-btn ds-btn--primary"
        :disabled="!change || save.isPending.value"
        :aria-busy="save.isPending.value"
      >
        <span
          v-if="save.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Registrar ajuste
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="reserving"
    title="Nova reserva"
    @close="reserving = null"
  >
    <form
      id="reserve-form"
      class="ds-stack--4"
      @submit.prevent="reserve.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="rs-ref"
        >Referência</label>
        <input
          id="rs-ref"
          v-model="reserving.reference"
          class="ds-input"
          maxlength="200"
          placeholder="Ex.: separado para evento"
        >
      </div>
      <div
        v-for="(line, i) in reserving.lines"
        :key="line.variantId"
        class="ds-field"
      >
        <label
          class="ds-label"
          :for="`rs-qty-${i}`"
        >{{ line.label }}</label>
        <input
          :id="`rs-qty-${i}`"
          v-model="line.quantity"
          class="ds-input"
          type="number"
          min="0"
          max="10000"
          step="1"
          placeholder="Quantidade"
        >
      </div>
      <p class="ds-hint">
        Até 100 SKUs e 10.000 unidades no total. A reserva expira no prazo de pagamento da loja.
      </p>
      <p
        v-if="reserve.error.value"
        class="ds-error"
        role="alert"
      >
        {{ messageOf(reserve.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="reserving = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="reserve-form"
        class="ds-btn ds-btn--primary"
        :disabled="!reserving.lines.some((l) => Number(l.quantity) > 0) || reserve.isPending.value"
      >
        Reservar
      </button>
    </template>
  </ModalDialog>
</template>
