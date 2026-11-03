<script setup>
import { computed, ref, watch } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin, removeQueueEntries, writeAudit } from '../../services/admin-api';
import { FRAUD_SEVERITY, FRAUD_SIGNAL_TYPE, QUEUE_ENTRY_STATUS, labelOf, options } from '../../services/status';
import { formatDateTime, formatNumber, formatTimeSec } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E10 · Sinais de fraude. Rotas: GET fraud-signals/get-all · PUT fraud-signals/update
// (isConfirmed, wasBlocked, reviewedAt) · PUT queue-entries/update-range (statusId 6
// Removido) · POST drop-audit-logs/add (registro da revisão).
defineProps({ params: { type: Object, default: () => ({}) } });

const data = useAsync(async () => {
  const [signals, entries, events] = await Promise.all([admin.fraudSignals.getAll(), admin.queueEntries.getAll(), admin.dropEvents.getAll()]);
  return { signals, entries, events };
});

const eventsWithSignals = computed(() => {
  const ids = new Set((data.data.value?.signals ?? []).map((s) => s.dropEventId));
  return (data.data.value?.events ?? []).filter((e) => ids.has(e.id));
});
const eventId = ref('');
watch(eventsWithSignals, (list) => {
  if (eventId.value === '' && list.length) {
    eventId.value = String((list.find((e) => e.dropEventStatusId === 5) ?? list[0]).id);
  }
}, { immediate: true });
const eventLabel = (e) => `${e.name}${e.dropEventStatusId === 5 ? ' (ao vivo)' : ''}`;

const signals = computed(() => (data.data.value?.signals ?? [])
  .filter((s) => eventId.value === 'all' || s.dropEventId === Number(eventId.value))
  .sort((a, b) => Number(Boolean(a.reviewedAt)) - Number(Boolean(b.reviewedAt))
    || b.fraudSeverityId - a.fraudSeverityId
    || Date.parse(b.detectedAt) - Date.parse(a.detectedAt)));
const pending = computed(() => signals.value.filter((s) => !s.reviewedAt));
const bySeverity = computed(() => [...options(FRAUD_SEVERITY)].reverse()
  .map((sev) => ({ ...sev, count: pending.value.filter((s) => s.fraudSeverityId === sev.id).length })));

const situation = (s) => {
  if (!s.reviewedAt) return { label: 'Novo', tone: 'scheduled' };
  if (s.wasBlocked) return { label: 'Bloqueado', tone: 'done' };
  if (s.isConfirmed) return { label: 'Confirmado', tone: 'live' };
  return { label: 'Liberado', tone: 'success' };
};

const openId = ref(null);
watch(signals, (list) => {
  if (!list.some((s) => s.id === openId.value)) openId.value = list[0]?.id ?? null;
}, { immediate: true });
const open = computed(() => signals.value.find((s) => s.id === openId.value) ?? null);

// Entradas da fila ligadas ao sinal: mesmo dispositivo ou mesmo IP no mesmo drop.
const linked = computed(() => {
  const s = open.value;
  if (!s) return [];
  return (data.data.value?.entries ?? [])
    .filter((e) => e.dropEventId === s.dropEventId
      && (e.id === s.queueEntryId || e.deviceFingerprint === s.deviceFingerprint || e.ipAddress === s.ipAddress))
    .sort((a, b) => a.position - b.position);
});
const removable = computed(() => linked.value.filter((e) => [1, 2].includes(e.queueEntryStatusId)));

const note = ref('');
watch(openId, () => { note.value = ''; });

const review = useAction(async (confirm) => {
  const s = open.value;
  const now = new Date().toISOString();
  await admin.fraudSignals.patch(s, { isConfirmed: confirm, wasBlocked: confirm && removable.value.length > 0, reviewedAt: now });
  if (confirm && removable.value.length) await removeQueueEntries(removable.value);
  await writeAudit({
    eventId: s.dropEventId,
    customerId: s.customerId,
    action: confirm ? `Confirmou fraude e removeu ${removable.value.length} da fila` : 'Marcou sinal como falso positivo',
    entityName: 'FraudSignal',
    entityId: s.id,
    oldValues: { isConfirmed: s.isConfirmed, wasBlocked: s.wasBlocked },
    newValues: { isConfirmed: confirm, wasBlocked: confirm && removable.value.length > 0, note: note.value.trim() || undefined },
  }).catch(() => {});
  await data.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <div class="ds-stack--1">
      <h1 class="ds-title ds-title--lg">
        Sinais de fraude
      </h1>
      <p
        class="ds-text-secondary"
        aria-live="polite"
      >
        {{ formatNumber(pending.length) }} {{ pending.length === 1 ? 'sinal aguardando' : 'sinais aguardando' }} revisão
      </p>
    </div>
    <div>
      <label
        class="ds-sr-only"
        for="fr-event"
      >Drop</label>
      <select
        id="fr-event"
        v-model="eventId"
        class="ds-input ds-toolbar__filter"
      >
        <option
          v-for="e in eventsWithSignals"
          :key="e.id"
          :value="String(e.id)"
        >
          {{ eventLabel(e) }}
        </option>
        <option value="all">
          Todos os drops
        </option>
      </select>
    </div>
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="8"
    @retry="data.reload"
  >
    <section class="ds-grid ds-grid--kpi">
      <article
        v-for="sev in bySeverity"
        :key="sev.id"
        class="ds-card ds-card--tight ds-stack--1"
      >
        <span class="ds-cluster ds-cluster--between">
          <span class="ds-text-xs ds-text-secondary">{{ sev.label }}</span>
          <StatusBadge
            :id="sev.id"
            :table="FRAUD_SEVERITY"
            :dot="false"
          />
        </span>
        <span class="ds-tile__value">{{ formatNumber(sev.count) }}</span>
      </article>
    </section>

    <section class="ds-grid ds-grid--split">
      <div class="ds-card ds-card--flush">
        <LoadState
          :is-empty="!signals.length"
          empty-text="Nenhum sinal para este drop."
        >
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Sinais de fraude detectados
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Sinal
                  </th>
                  <th scope="col">
                    Severidade
                  </th>
                  <th scope="col">
                    Entrada
                  </th>
                  <th scope="col">
                    Detectado
                  </th>
                  <th scope="col">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="s in signals"
                  :key="s.id"
                  :aria-selected="openId === s.id ? 'true' : undefined"
                >
                  <td>
                    <button
                      type="button"
                      class="ds-table__open ds-stack--1"
                      @click="openId = s.id"
                    >
                      <span class="ds-text-medium">{{ labelOf(FRAUD_SIGNAL_TYPE, s.fraudSignalTypeId) }}</span>
                      <span class="ds-text-xs ds-text-secondary">{{ s.description }}</span>
                    </button>
                  </td>
                  <td>
                    <StatusBadge
                      :id="s.fraudSeverityId"
                      :table="FRAUD_SEVERITY"
                      :dot="false"
                    />
                  </td>
                  <td class="ds-mono">
                    #{{ s.queueEntryId }}
                  </td>
                  <td class="ds-numeric">
                    {{ formatTimeSec(s.detectedAt) }}
                  </td>
                  <td>
                    <span :class="['ds-badge', `ds-badge--${situation(s).tone}`]">{{ situation(s).label }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </LoadState>
      </div>

      <article
        v-if="open"
        class="ds-card ds-stack--5"
        aria-live="polite"
      >
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            {{ labelOf(FRAUD_SIGNAL_TYPE, open.fraudSignalTypeId) }}
          </h2>
          <StatusBadge
            :id="open.fraudSeverityId"
            :table="FRAUD_SEVERITY"
            :dot="false"
          />
        </header>
        <p class="ds-text-sm ds-text-secondary">
          {{ open.description }}
        </p>
        <dl class="ds-dl ds-dl--labels ds-text-sm">
          <dt>Fingerprint</dt>
          <dd class="ds-mono">
            {{ open.deviceFingerprint }}
          </dd>
          <dt>IP</dt>
          <dd class="ds-mono">
            {{ open.ipAddress }}
          </dd>
          <dt>Detectado</dt>
          <dd>{{ formatDateTime(open.detectedAt) }}</dd>
          <template v-if="open.reviewedAt">
            <dt>Revisado</dt>
            <dd>{{ formatDateTime(open.reviewedAt) }} · {{ situation(open).label }}</dd>
          </template>
        </dl>

        <div class="ds-stack--2">
          <span class="ds-label-caps">Entradas ligadas</span>
          <div
            v-for="e in linked"
            :key="e.id"
            class="ds-row-sunken"
          >
            <span>#{{ e.id }} · posição {{ e.position }}{{ e.id === open.queueEntryId ? ' · origem do sinal' : '' }}</span>
            <StatusBadge
              :id="e.queueEntryStatusId"
              :table="QUEUE_ENTRY_STATUS"
            />
          </div>
        </div>

        <template v-if="!open.reviewedAt">
          <div class="ds-field">
            <label
              class="ds-label"
              for="fr-note"
            >Observação da revisão</label>
            <textarea
              id="fr-note"
              v-model="note"
              class="ds-input"
              rows="2"
              placeholder="Opcional · entra no log de auditoria"
            />
          </div>
          <p
            v-if="review.error.value"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ review.error.value.message }}
          </p>
          <div class="ds-cluster ds-cluster--2">
            <button
              type="button"
              class="ds-btn ds-btn--secondary ds-grow"
              :disabled="review.isPending.value"
              @click="review.run(false)"
            >
              Falso positivo
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--danger ds-grow"
              :disabled="review.isPending.value"
              @click="review.run(true)"
            >
              {{ removable.length ? `Confirmar e remover ${removable.length}` : 'Confirmar fraude' }}
            </button>
          </div>
          <span class="ds-hint">Remover tira as entradas da fila (status Removido) e libera as posições.</span>
        </template>
      </article>
    </section>
  </LoadState>
</template>
