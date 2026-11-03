<script setup>
import { computed, onScopeDispose, ref } from 'vue';
import { AlertCircle, Megaphone } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { useNow } from '../../composables/useNow';
import { href, navigate } from '../../router';
import { admin, callQueueBatch, listEventVariants, setDropStatus } from '../../services/admin-api';
import { DROP_EVENT_STATUS, FRAUD_SEVERITY, FRAUD_SIGNAL_TYPE, labelOf } from '../../services/status';
import { formatDuration, formatNumber, formatTime, formatTimeSec, percent, shortName } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E3 · Monitor do drop ao vivo. Rotas: GET queue-entries, drop-reservations,
// waitlist-entries, fraud-signals, drop-audit-logs, drop-orders (get-all, por evento);
// PUT queue-entries/update-range (chamar lote: statusId 2 + calledAt);
// PUT drop-events/update (encerrar: statusId 7). Atualiza a cada 5 s.
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const REFRESH_MS = 5000;
const now = useNow(1000);

const events = useAsync(() => admin.dropEvents.getAll());
// Ativo primeiro, depois fila aberta, depois esgotado (ainda com checkouts abertos).
const LIVE_ORDER = [5, 4, 6];
const liveEvents = computed(() => (events.data.value ?? [])
  .filter((e) => LIVE_ORDER.includes(e.dropEventStatusId) && !e.isDeleted)
  .sort((a, b) => LIVE_ORDER.indexOf(a.dropEventStatusId) - LIVE_ORDER.indexOf(b.dropEventStatusId)));
const eventId = computed(() => Number(props.params.id) || liveEvents.value[0]?.id || null);

const data = useAsync(async () => {
  const id = eventId.value;
  if (!id) return null;
  const [event, entries, reservations, waitlist, signals, logs, orders, variants] = await Promise.all([
    admin.dropEvents.getById(id),
    admin.queueEntries.getAll(),
    admin.dropReservations.getAll(),
    admin.waitlist.getAll(),
    admin.fraudSignals.getAll(),
    admin.dropAuditLogs.getAll(),
    admin.dropOrders.getAll(),
    listEventVariants(id),
  ]);
  const own = (rows) => rows.filter((r) => r.dropEventId === id);
  const active = own(reservations).filter((r) => r.dropReservationStatusId === 1);
  const customers = await admin.customers.getByIds(active.map((r) => r.customerId));
  return {
    event, variants, customers, loadedAt: Date.now(),
    entries: own(entries), active, waitlist: own(waitlist),
    signals: own(signals), logs: own(logs), orders: own(orders),
  };
}, { immediate: false });

// Recarrega quando a lista de eventos chega e depois a cada 5 s.
const ready = useAsync(async () => {
  await events.reload();
  return data.reload();
});
const timer = setInterval(() => data.reload(), REFRESH_MS);
onScopeDispose(() => clearInterval(timer));

const d = computed(() => data.data.value);
const event = computed(() => d.value?.event ?? null);

const waiting = computed(() => (d.value?.entries ?? []).filter((e) => e.queueEntryStatusId === 1));
const joinedLastMinute = computed(() => (d.value?.entries ?? []).filter((e) => now.value - Date.parse(e.enteredAt) < 60e3).length);
const called = computed(() => (d.value?.entries ?? []).filter((e) => e.calledAt || e.queueEntryStatusId >= 2).length);
const completed = computed(() => (d.value?.entries ?? []).filter((e) => e.queueEntryStatusId === 4).length);

const stock = computed(() => {
  const variants = d.value?.variants ?? [];
  const allocated = variants.reduce((s, v) => s + v.unitsAllocated, 0);
  const sold = variants.reduce((s, v) => s + v.unitsSold, 0);
  const reserved = (d.value?.active ?? []).reduce((s, r) => s + r.quantity, 0);
  return { allocated, sold, reserved, free: Math.max(0, allocated - sold - reserved) };
});

const funnel = computed(() => {
  const entries = d.value?.entries ?? [];
  const total = entries.length || 1;
  return [
    { label: 'Entraram', value: entries.length },
    { label: 'Chamados', value: called.value },
    { label: 'Pedidos', value: completed.value },
    { label: 'Expiraram', value: entries.filter((e) => e.queueEntryStatusId === 5).length, critical: true },
    { label: 'Removidos', value: entries.filter((e) => e.queueEntryStatusId === 6).length, critical: true },
  ].map((row) => ({ ...row, pct: Math.max(row.value ? 0.5 : 0, (row.value / total) * 100) }));
});

const reservations = computed(() => [...(d.value?.active ?? [])]
  .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
  .map((r) => {
    const remaining = Date.parse(r.expiresAt) - now.value;
    const customer = d.value.customers.find((c) => c.id === r.customerId);
    return {
      ...r,
      remaining,
      expiring: remaining < 60e3,
      who: `#${r.customerId} · ${shortName(customer?.fullName ?? '')}`,
      variant: d.value.variants.find((v) => v.id === r.dropProductId)?.sku.split('-').pop() ?? '—',
    };
  }));

const openSignals = computed(() => (d.value?.signals ?? [])
  .filter((s) => !s.reviewedAt)
  .sort((a, b) => b.fraudSeverityId - a.fraudSeverityId || Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
  .slice(0, 3));

const feed = computed(() => [...(d.value?.logs ?? [])]
  .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  .slice(0, 6));

const endsIn = computed(() => (event.value ? Date.parse(event.value.dropEndsAt) - now.value : 0));
const updatedAgo = computed(() => (d.value ? Math.max(0, Math.round((now.value - d.value.loadedAt) / 1000)) : 0));

// Chamar lote
const batchSize = ref(20);
const callBatch = useAction(async () => {
  const result = await callQueueBatch(d.value.entries, Number(batchSize.value) || 1);
  await data.reload();
  return result;
});

// Encerrar
const showEndModal = ref(false);
const endDrop = useAction(async () => {
  await setDropStatus(event.value, 7);
  showEndModal.value = false;
  await data.reload();
});

const selectEvent = (e) => navigate(`/admin/ao-vivo/${e.target.value}`);
</script>

<template>
  <LoadState
    :is-loading="ready.isLoading.value"
    :error="events.error.value || (data.error.value && !d ? data.error.value : null)"
    :is-empty="!eventId"
    empty-text="Nenhum drop com fila aberta agora."
    :lines="10"
    @retry="ready.reload"
  >
    <template #empty-action>
      <a
        class="ds-btn ds-btn--secondary ds-btn--sm"
        :href="href('/admin/drops')"
      >Ver drops</a>
    </template>

    <template v-if="event">
      <div class="ds-cluster ds-cluster--between">
        <div class="ds-cluster ds-cluster--2">
          <h1 class="ds-title ds-title--lg">
            {{ event.name }}
          </h1>
          <StatusBadge
            :id="event.dropEventStatusId"
            :table="DROP_EVENT_STATUS"
            :label="event.dropEventStatusId === 5 ? 'AO VIVO' : ''"
          />
          <span
            class="ds-text-xs ds-text-secondary"
            aria-live="off"
          >atualizado há {{ updatedAgo }}s</span>
        </div>
        <div class="ds-cluster ds-cluster--2">
          <label
            v-if="liveEvents.length > 1"
            class="ds-sr-only"
            for="live-event"
          >Drop</label>
          <select
            v-if="liveEvents.length > 1"
            id="live-event"
            class="ds-input ds-toolbar__filter"
            :value="event.id"
            @change="selectEvent"
          >
            <option
              v-for="e in liveEvents"
              :key="e.id"
              :value="e.id"
            >
              {{ e.name }}
            </option>
          </select>
          <button
            type="button"
            class="ds-btn ds-btn--secondary"
            disabled
            title="A fila ainda não tem campo de pausa no back-end"
          >
            Pausar fila
          </button>
          <button
            v-if="event.dropEventStatusId < 7"
            type="button"
            class="ds-btn ds-btn--danger"
            @click="showEndModal = true"
          >
            Encerrar drop
          </button>
        </div>
      </div>

      <section class="ds-grid ds-grid--kpi">
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Aguardando na fila</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ formatNumber(waiting.length) }}
            </div>
            <div class="ds-stat__label">
              +{{ formatNumber(joinedLastMinute) }} no último minuto
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Em checkout</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ formatNumber(reservations.length) }}
            </div>
            <div class="ds-stat__label">
              reservas ativas · 5 min cada
            </div>
          </div>
        </article>
        <article class="ds-card ds-stack--2">
          <span class="ds-label-caps">Conversão do chamado</span>
          <div class="ds-stat">
            <div class="ds-stat__value">
              {{ percent(completed, called) }}<span class="ds-stat__unit">%</span>
            </div>
            <div class="ds-stat__label">
              {{ formatNumber(completed) }} pedidos de {{ formatNumber(called) }} chamados
            </div>
          </div>
        </article>
        <article class="ds-card ds-card--inverse ds-stack--2">
          <span class="ds-label-caps">{{ endsIn > 0 ? 'Drop termina em' : 'Drop terminou' }}</span>
          <div
            class="ds-stat"
            role="timer"
          >
            <div class="ds-stat__value ds-numeric">
              {{ formatDuration(endsIn) }}
            </div>
            <div class="ds-stat__label">
              às {{ formatTime(event.dropEndsAt) }}
            </div>
          </div>
        </article>
      </section>

      <section class="ds-grid ds-grid--sidebar">
        <div class="ds-stack--6 ds-min-0">
          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Estoque
              </h2>
              <span
                v-if="stock.free <= stock.allocated * 0.1"
                class="ds-badge ds-badge--live"
              ><span
                class="ds-badge__dot"
                aria-hidden="true"
              />{{ stock.free ? 'Últimas unidades' : 'Sem unidades livres' }}</span>
            </header>
            <div
              class="ds-progress"
              role="img"
              :aria-label="`${stock.sold} vendidas, ${stock.reserved} reservadas, ${stock.free} livres de ${stock.allocated}`"
            >
              <span
                class="ds-progress__seg ds-progress__seg--1"
                :style="{ width: `${percent(stock.sold, stock.allocated)}%` }"
              />
              <span
                class="ds-progress__seg ds-progress__seg--3"
                :style="{ width: `${percent(stock.reserved, stock.allocated)}%` }"
              />
            </div>
            <div
              class="ds-stat-grid"
              aria-live="polite"
            >
              <div class="ds-stat">
                <div class="ds-stat__value">
                  {{ formatNumber(stock.sold) }}<span class="ds-stat__unit">un.</span>
                </div>
                <div class="ds-stat__label">
                  Vendido
                </div>
              </div>
              <div class="ds-stat">
                <div class="ds-stat__value">
                  {{ formatNumber(stock.reserved) }}<span class="ds-stat__unit">un.</span>
                </div>
                <div class="ds-stat__label">
                  Reservado
                </div>
              </div>
              <div :class="['ds-stat', { 'ds-stat--critical': stock.free === 0 }]">
                <div class="ds-stat__value">
                  {{ formatNumber(stock.free) }}<span class="ds-stat__unit">un.</span>
                </div>
                <div class="ds-stat__label">
                  Livre
                </div>
              </div>
              <div class="ds-stat">
                <div class="ds-stat__value">
                  {{ formatNumber(d.waitlist.filter((w) => w.waitlistEntryStatusId === 1).length) }}
                </div>
                <div class="ds-stat__label">
                  Na lista de espera
                </div>
              </div>
            </div>
          </article>

          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Funil da fila
              </h2>
              <span class="ds-text-xs ds-text-secondary">desde {{ formatTime(event.queueOpensAt) }}</span>
            </header>
            <div class="ds-funnel">
              <div
                v-for="row in funnel"
                :key="row.label"
                class="ds-funnel__row"
              >
                <span>{{ row.label }}</span>
                <div
                  :class="['ds-meter', { 'ds-meter--critical': row.critical }]"
                  aria-hidden="true"
                >
                  <div
                    class="ds-meter__fill"
                    :style="{ width: `${row.pct}%` }"
                  />
                </div>
                <span>{{ formatNumber(row.value) }}</span>
              </div>
            </div>
          </article>

          <article class="ds-card ds-card--flush">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Reservas ativas
              </h2>
              <span class="ds-text-xs ds-text-secondary">ordenadas por expiração</span>
            </header>
            <LoadState
              :is-empty="!reservations.length"
              empty-text="Nenhum checkout aberto agora."
            >
              <div class="ds-table-scroll">
                <table class="ds-table">
                  <caption class="ds-sr-only">
                    Reservas em checkout
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        Cliente
                      </th>
                      <th scope="col">
                        Variante
                      </th>
                      <th scope="col">
                        Status
                      </th>
                      <th
                        scope="col"
                        class="ds-table__th--numeric"
                      >
                        Expira em
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="r in reservations"
                      :key="r.id"
                    >
                      <td>{{ r.who }}</td>
                      <td>{{ r.variant }}</td>
                      <td>
                        <span :class="['ds-badge', r.expiring ? 'ds-badge--live' : 'ds-badge--waiting']"><span
                          class="ds-badge__dot"
                          aria-hidden="true"
                        />{{ r.remaining <= 0 ? 'Expirada' : r.expiring ? 'Expirando' : 'Ativa' }}</span>
                      </td>
                      <td :class="['ds-table__td--numeric', { 'ds-text-danger': r.expiring }]">
                        {{ formatDuration(r.remaining) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </LoadState>
          </article>
        </div>

        <aside class="ds-stack--6">
          <form
            class="ds-card ds-stack--4"
            @submit.prevent="callBatch.run()"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Ritmo de chamada
              </h2>
            </header>
            <div class="ds-field">
              <label
                class="ds-label"
                for="l-batch"
              >Lote (pessoas)</label>
              <input
                id="l-batch"
                v-model.number="batchSize"
                class="ds-input"
                type="number"
                min="1"
                max="500"
              >
            </div>
            <span class="ds-hint">
              {{ stock.free === 0
                ? 'Com 0 unidades livres, a fila só avança quando uma reserva expira.'
                : `${formatNumber(waiting.length)} aguardando. O intervalo automático ainda não tem campo no back-end: o lote é chamado agora.` }}
            </span>
            <p
              v-if="callBatch.error.value"
              class="ds-error"
              role="alert"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ callBatch.error.value.message }}
            </p>
            <p
              v-else-if="callBatch.done.value"
              class="ds-hint ds-text-success"
              role="status"
            >
              Lote chamado.
            </p>
            <button
              type="submit"
              class="ds-btn ds-btn--secondary ds-btn--block"
              :disabled="!waiting.length || callBatch.isPending.value"
            >
              <Megaphone
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              Chamar próximo lote
            </button>
          </form>

          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Sinais de fraude
              </h2>
              <a
                class="ds-text-sm ds-text-brand"
                :href="href('/admin/fraude')"
              >Revisar todos</a>
            </header>
            <p
              v-if="!openSignals.length"
              class="ds-text-sm ds-text-secondary"
            >
              Nenhum sinal aguardando revisão.
            </p>
            <div
              v-for="s in openSignals"
              :key="s.id"
              class="ds-cluster ds-cluster--between"
            >
              <span class="ds-stack--1 ds-min-0">
                <span class="ds-text-sm ds-text-medium">{{ labelOf(FRAUD_SIGNAL_TYPE, s.fraudSignalTypeId) }}</span>
                <span class="ds-text-xs ds-text-secondary">#{{ s.queueEntryId }} · {{ s.description }}</span>
              </span>
              <StatusBadge
                :id="s.fraudSeverityId"
                :table="FRAUD_SEVERITY"
                :dot="false"
              />
            </div>
          </article>

          <article class="ds-card ds-stack--3">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Eventos
              </h2>
            </header>
            <p
              v-if="!feed.length"
              class="ds-text-sm ds-text-secondary"
            >
              Nada registrado ainda.
            </p>
            <ul class="ds-feed">
              <li
                v-for="log in feed"
                :key="log.id"
                class="ds-feed__item"
              >
                <time
                  class="ds-feed__time"
                  :datetime="log.occurredAt"
                >{{ formatTimeSec(log.occurredAt) }}</time>
                <span>{{ log.action }} · {{ log.entityName }} #{{ log.entityId }}</span>
              </li>
            </ul>
            <a
              class="ds-text-sm ds-text-brand"
              :href="href('/admin/configuracoes/auditoria')"
            >Ver auditoria</a>
          </article>
        </aside>
      </section>
    </template>
  </LoadState>

  <ModalDialog
    v-if="showEndModal"
    title="Encerrar o drop agora?"
    @close="showEndModal = false"
  >
    <p class="ds-text-sm">
      A fila fecha para quem ainda aguarda ({{ formatNumber(waiting.length) }} pessoas) e o drop vai para "Encerrado".
      Reservas abertas continuam até expirar.
    </p>
    <p
      v-if="endDrop.error.value"
      class="ds-error"
      role="alert"
    >
      {{ endDrop.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="showEndModal = false"
      >
        Continuar o drop
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="endDrop.isPending.value"
        @click="endDrop.run()"
      >
        Encerrar drop
      </button>
    </template>
  </ModalDialog>
</template>
