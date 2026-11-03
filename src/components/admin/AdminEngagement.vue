<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, Send } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import {
  admin, decideRegistrations, listEventVariants, notifyWaitlistEntries, scheduleNotifications,
} from '../../services/admin-api';
import {
  DOCUMENT_STATUS, DROP_EVENT_STATUS, DROP_REGISTRATION_STATUS, NOTIFICATION_CHANNEL, NOTIFICATION_STATUS,
  NOTIFICATION_TYPE, WAITLIST_STATUS, labelOf, options,
} from '../../services/status';
import { formatDateTime, formatNumber, fromLocalInput, shortName, toLocalInput } from '../../services/format';
import DropTabs from './DropTabs.vue';
import LoadState from '../ui/LoadState.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E4 · Inscrições, lista de espera e avisos de um drop. Rotas:
//   GET drop-registrations/get-all · PUT drop-registrations/update-range (aprovar/reprovar)
//   GET waitlist-entries/get-all · PUT waitlist-entries/update-range (avisar)
//   GET/POST drop-notifications get-all / add-range (um registro por destinatário × canal)
//   POST customers/get-list-by-list-id · GET documents/get-all (situação do CPF)
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const eventId = computed(() => Number(props.params.id));
const tab = computed(() => props.params.tab ?? 'inscricoes');
const PAGE_SIZE = 20;

const data = useAsync(async () => {
  const id = eventId.value;
  const [event, registrations, waitlist, notifications, documents, variants] = await Promise.all([
    admin.dropEvents.getById(id),
    admin.dropRegistrations.getAll(),
    admin.waitlist.getAll(),
    admin.dropNotifications.getAll(),
    admin.documents.getAll(),
    listEventVariants(id),
  ]);
  const own = {
    registrations: registrations.filter((r) => r.dropEventId === id && !r.isDeleted),
    waitlist: waitlist.filter((w) => w.dropEventId === id),
    notifications: notifications.filter((n) => n.dropEventId === id && !n.isDeleted),
  };
  const customers = await admin.customers.getByIds([...own.registrations, ...own.waitlist].map((r) => r.customerId));
  return { event, ...own, customers, documents, variants };
});

const event = computed(() => data.data.value?.event ?? null);
const customerOf = (id) => data.data.value?.customers.find((c) => c.id === id) ?? null;
const nameOf = (id) => shortName(customerOf(id)?.fullName ?? `Cliente #${id}`);
const documentOf = (customerId) => (data.data.value?.documents ?? [])
  .filter((d) => d.referenceType === 'Customer' && d.referenceId === customerId)
  .sort((a, b) => b.id - a.id)[0] ?? null;
const variantOf = (id) => data.data.value?.variants.find((v) => v.id === id)?.sku.split('-').pop() ?? '—';

// ------------------------------------------------------------- inscrições ---
const registrations = computed(() => data.data.value?.registrations ?? []);
const waitlist = computed(() => data.data.value?.waitlist ?? []);

const tiles = computed(() => (tab.value === 'lista-de-espera'
  ? options(WAITLIST_STATUS).map((s) => ({ ...s, count: waitlist.value.filter((w) => w.waitlistEntryStatusId === s.id).length }))
  : options(DROP_REGISTRATION_STATUS).map((s) => ({ ...s, count: registrations.value.filter((r) => r.dropRegistrationStatusId === s.id).length }))));

const search = ref('');
const page = ref(1);
watch([search, tab], () => { page.value = 1; selected.value = new Set(); });

const matches = (customerId) => {
  const term = search.value.trim().toLowerCase();
  if (!term) return true;
  const c = customerOf(customerId);
  return `${c?.fullName ?? ''} ${c?.email ?? ''}`.toLowerCase().includes(term);
};

const filteredRegistrations = computed(() => registrations.value
  .filter((r) => matches(r.customerId))
  .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt)));
const filteredWaitlist = computed(() => waitlist.value
  .filter((w) => matches(w.customerId))
  .sort((a, b) => a.position - b.position));
const rows = computed(() => (tab.value === 'lista-de-espera' ? filteredWaitlist.value : filteredRegistrations.value));
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const selected = ref(new Set());
const toggle = (id) => {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
};
const allOnPage = computed(() => pageRows.value.length > 0 && pageRows.value.every((r) => selected.value.has(r.id)));
const toggleAll = () => {
  const next = new Set(selected.value);
  pageRows.value.forEach((r) => (allOnPage.value ? next.delete(r.id) : next.add(r.id)));
  selected.value = next;
};
const selectedRows = computed(() => rows.value.filter((r) => selected.value.has(r.id)));

const rejectReason = ref('CPF não validado');
const decide = useAction(async (approve) => {
  await decideRegistrations(selectedRows.value, approve, rejectReason.value);
  selected.value = new Set();
  await data.reload();
});
const notify = useAction(async () => {
  await notifyWaitlistEntries(selectedRows.value.filter((w) => w.waitlistEntryStatusId === 1));
  selected.value = new Set();
  await data.reload();
});

// ------------------------------------------------------------------ avisos ---
const AUDIENCES = computed(() => [
  { id: 'eligible', label: 'Elegíveis deste drop', ids: registrations.value.filter((r) => r.dropRegistrationStatusId === 2).map((r) => r.customerId) },
  { id: 'waitlist', label: 'Lista de espera', ids: waitlist.value.filter((w) => w.waitlistEntryStatusId === 1).map((w) => w.customerId) },
  { id: 'registered', label: 'Todos os inscritos', ids: registrations.value.map((r) => r.customerId) },
]);
const notice = reactive({
  audience: 'eligible', typeId: 2, channels: [1, 3], subject: '', body: '', scheduledAt: '',
});
watch(event, (e) => {
  if (!e) return;
  if (!notice.subject) notice.subject = `A fila do ${e.name} abre em 15 min`;
  if (!notice.body) notice.body = 'Deixe a página aberta no horário. Sua inscrição está elegível.';
  if (!notice.scheduledAt) notice.scheduledAt = toLocalInput(Date.parse(e.queueOpensAt) - 15 * 60e3);
}, { immediate: true });

const audience = computed(() => AUDIENCES.value.find((a) => a.id === notice.audience));
const recipients = computed(() => [...new Set(audience.value?.ids ?? [])]);
const totalNotices = computed(() => recipients.value.length * notice.channels.length);

const schedule = useAction(async () => {
  await scheduleNotifications({
    eventId: eventId.value,
    customerIds: recipients.value,
    channelIds: notice.channels,
    typeId: notice.typeId,
    subject: notice.subject.trim(),
    body: notice.body.trim(),
    scheduledAt: fromLocalInput(notice.scheduledAt),
  });
  await data.reload();
});

// Avisos já criados, agrupados por envio (mesmo assunto e horário).
const sentGroups = computed(() => {
  const groups = new Map();
  (data.data.value?.notifications ?? []).forEach((n) => {
    const key = `${n.subject}|${n.scheduledAt}`;
    const g = groups.get(key) ?? { key, subject: n.subject, typeId: n.dropNotificationTypeId, scheduledAt: n.scheduledAt, channels: new Set(), customers: new Set(), statuses: {} };
    g.channels.add(n.dropNotificationChannelId);
    g.customers.add(n.customerId);
    g.statuses[n.dropNotificationStatusId] = (g.statuses[n.dropNotificationStatusId] ?? 0) + 1;
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
});
const mainStatus = (g) => Number(Object.entries(g.statuses).sort((a, b) => b[1] - a[1])[0][0]);
</script>

<template>
  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="10"
    @retry="data.reload"
  >
    <template v-if="event">
      <div class="ds-stack--3">
        <a
          class="ds-back-link"
          :href="href('/admin/drops')"
        >
          <ArrowLeft
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Drops
        </a>
        <div class="ds-cluster ds-cluster--between">
          <div class="ds-cluster ds-cluster--2">
            <h1 class="ds-title ds-title--lg">
              {{ event.name }}
            </h1>
            <StatusBadge
              :id="event.dropEventStatusId"
              :table="DROP_EVENT_STATUS"
            />
          </div>
          <DropTabs
            :event-id="event.id"
            :current="tab"
          />
        </div>
      </div>

      <section
        v-if="tab !== 'avisos'"
        class="ds-grid ds-grid--kpi"
      >
        <article
          v-for="t in tiles"
          :key="t.id"
          class="ds-card ds-card--tight ds-stack--1"
        >
          <span class="ds-text-xs ds-text-secondary">{{ t.label }}</span>
          <span :class="['ds-tile__value', { 'ds-text-success': t.tone === 'success' }]">{{ formatNumber(t.count) }}</span>
        </article>
      </section>

      <section class="ds-grid ds-grid--split">
        <!-- Avisos já criados -->
        <div
          v-if="tab === 'avisos'"
          class="ds-card ds-card--flush"
        >
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Avisos deste drop
            </h2>
          </header>
          <LoadState
            :is-empty="!sentGroups.length"
            empty-text="Nenhum aviso criado para este drop."
          >
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Avisos agrupados por envio
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Assunto
                    </th>
                    <th scope="col">
                      Canais
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Clientes
                    </th>
                    <th scope="col">
                      Envio
                    </th>
                    <th scope="col">
                      Situação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="g in sentGroups"
                    :key="g.key"
                  >
                    <td>
                      <span class="ds-stack--1">
                        <span>{{ g.subject }}</span>
                        <span class="ds-text-xs ds-text-secondary">{{ labelOf(NOTIFICATION_TYPE, g.typeId) }}</span>
                      </span>
                    </td>
                    <td class="ds-text-sm">
                      {{ [...g.channels].map((c) => labelOf(NOTIFICATION_CHANNEL, c)).join(', ') }}
                    </td>
                    <td class="ds-table__td--numeric">
                      {{ formatNumber(g.customers.size) }}
                    </td>
                    <td class="ds-numeric ds-nowrap">
                      {{ formatDateTime(g.scheduledAt) }}
                    </td>
                    <td>
                      <StatusBadge
                        :id="mainStatus(g)"
                        :table="NOTIFICATION_STATUS"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </LoadState>
        </div>

        <!-- Inscrições / lista de espera -->
        <div
          v-else
          class="ds-card ds-card--flush"
        >
          <div class="ds-table-header">
            <div class="ds-toolbar__search">
              <label
                class="ds-sr-only"
                for="eng-search"
              >Buscar cliente</label>
              <input
                id="eng-search"
                v-model="search"
                class="ds-input"
                type="search"
                placeholder="Buscar cliente"
              >
            </div>
            <span
              v-if="selected.size"
              class="ds-cluster ds-cluster--2"
            >
              <span
                class="ds-text-sm"
                aria-live="polite"
              >{{ selected.size }} {{ selected.size === 1 ? 'selecionada' : 'selecionadas' }}</span>
              <template v-if="tab === 'inscricoes'">
                <label
                  class="ds-sr-only"
                  for="eng-reason"
                >Motivo da reprovação</label>
                <select
                  id="eng-reason"
                  v-model="rejectReason"
                  class="ds-input ds-toolbar__filter"
                >
                  <option>CPF não validado</option>
                  <option>Cadastro incompleto</option>
                  <option>Conta com sinal de fraude</option>
                  <option>Limite de participantes atingido</option>
                </select>
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="decide.isPending.value"
                  @click="decide.run(false)"
                >Reprovar</button>
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="decide.isPending.value"
                  @click="decide.run(true)"
                >Aprovar</button>
              </template>
              <button
                v-else
                type="button"
                class="ds-btn ds-btn--primary ds-btn--sm"
                :disabled="notify.isPending.value"
                @click="notify.run()"
              >
                Avisar (10 min para comprar)
              </button>
            </span>
          </div>
          <p
            v-if="decide.error.value || notify.error.value"
            class="ds-error ds-card__note"
            role="alert"
          >
            {{ (decide.error.value || notify.error.value).message }}
          </p>
          <LoadState
            :is-empty="!rows.length"
            :empty-text="tab === 'lista-de-espera' ? 'Ninguém na lista de espera.' : 'Nenhuma inscrição ainda.'"
          >
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  {{ tab === 'lista-de-espera' ? 'Lista de espera do drop' : 'Inscrições do drop' }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        class="ds-checkbox"
                        type="checkbox"
                        :checked="allOnPage"
                        aria-label="Selecionar todos desta página"
                        @change="toggleAll"
                      >
                    </th>
                    <th
                      v-if="tab === 'lista-de-espera'"
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Posição
                    </th>
                    <th scope="col">
                      Cliente
                    </th>
                    <th
                      v-if="tab === 'inscricoes'"
                      scope="col"
                    >
                      CPF
                    </th>
                    <th
                      v-else
                      scope="col"
                    >
                      Tamanho
                    </th>
                    <th scope="col">
                      {{ tab === 'lista-de-espera' ? 'Entrou em' : 'Inscrita em' }}
                    </th>
                    <th scope="col">
                      Situação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in pageRows"
                    :key="r.id"
                    :aria-selected="selected.has(r.id) ? 'true' : undefined"
                  >
                    <td>
                      <input
                        class="ds-checkbox"
                        type="checkbox"
                        :checked="selected.has(r.id)"
                        :aria-label="`Selecionar ${nameOf(r.customerId)}`"
                        @change="toggle(r.id)"
                      >
                    </td>
                    <td
                      v-if="tab === 'lista-de-espera'"
                      class="ds-table__td--numeric"
                    >
                      {{ r.position }}º
                    </td>
                    <td>
                      <span class="ds-stack--1">
                        <span>{{ nameOf(r.customerId) }}</span>
                        <span class="ds-text-xs ds-text-secondary">#{{ r.customerId }}</span>
                      </span>
                    </td>
                    <td v-if="tab === 'inscricoes'">
                      <StatusBadge
                        v-if="documentOf(r.customerId)"
                        :id="documentOf(r.customerId).documentStatusId"
                        :table="DOCUMENT_STATUS"
                        :dot="false"
                      />
                      <span
                        v-else
                        class="ds-badge ds-badge--done"
                      >Sem documento</span>
                    </td>
                    <td v-else>
                      {{ variantOf(r.dropProductId) }}
                    </td>
                    <td class="ds-numeric ds-nowrap">
                      {{ formatDateTime(r.registeredAt ?? r.joinedAt) }}
                    </td>
                    <td>
                      <span class="ds-stack--1">
                        <StatusBadge
                          :id="tab === 'lista-de-espera' ? r.waitlistEntryStatusId : r.dropRegistrationStatusId"
                          :table="tab === 'lista-de-espera' ? WAITLIST_STATUS : DROP_REGISTRATION_STATUS"
                        />
                        <span
                          v-if="r.dropRegistrationStatusId === 3 && r.eligibilityReason"
                          class="ds-text-xs ds-text-secondary"
                        >{{ r.eligibilityReason }}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="ds-table-footer">
              <span class="ds-hint">
                {{ tab === 'lista-de-espera' ? 'Avisar dá 10 minutos para o cliente comprar.' : 'Aprovar marca a inscrição como elegível para entrar na fila.' }}
              </span>
              <PaginationNav
                v-model:page="page"
                :page-size="PAGE_SIZE"
                :total="rows.length"
              />
            </div>
          </LoadState>
        </div>

        <!-- Novo aviso -->
        <form
          class="ds-card ds-stack--5"
          @submit.prevent="schedule.run()"
        >
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Novo aviso
            </h2>
          </header>
          <div class="ds-field">
            <label
              class="ds-label"
              for="en-aud"
            >Para</label>
            <select
              id="en-aud"
              v-model="notice.audience"
              class="ds-input"
            >
              <option
                v-for="a in AUDIENCES"
                :key="a.id"
                :value="a.id"
              >
                {{ a.label }} ({{ formatNumber(new Set(a.ids).size) }})
              </option>
            </select>
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="en-type"
            >Tipo</label>
            <select
              id="en-type"
              v-model.number="notice.typeId"
              class="ds-input"
            >
              <option
                v-for="t in options(NOTIFICATION_TYPE)"
                :key="t.id"
                :value="t.id"
              >
                {{ t.label }}
              </option>
            </select>
          </div>
          <fieldset class="ds-stack--1">
            <legend class="ds-label">
              Canais
            </legend>
            <div class="ds-cluster ds-cluster--2">
              <label
                v-for="c in options(NOTIFICATION_CHANNEL)"
                :key="c.id"
                class="ds-check"
              >
                <input
                  v-model="notice.channels"
                  type="checkbox"
                  :value="c.id"
                >
                {{ c.label }}
              </label>
            </div>
          </fieldset>
          <div class="ds-field">
            <label
              class="ds-label"
              for="en-subj"
            >Assunto</label>
            <input
              id="en-subj"
              v-model="notice.subject"
              class="ds-input"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="en-body"
            >Mensagem</label>
            <textarea
              id="en-body"
              v-model="notice.body"
              class="ds-input"
              rows="3"
              required
            />
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="en-when"
            >Enviar em</label>
            <input
              id="en-when"
              v-model="notice.scheduledAt"
              class="ds-input"
              type="datetime-local"
              required
            >
          </div>
          <p
            v-if="schedule.error.value"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ schedule.error.value.message }}
          </p>
          <p
            v-else-if="schedule.done.value"
            class="ds-hint ds-text-success"
            role="status"
          >
            Avisos agendados.
          </p>
          <button
            type="submit"
            class="ds-btn ds-btn--primary ds-btn--block"
            :disabled="!totalNotices || schedule.isPending.value"
            :aria-busy="schedule.isPending.value"
          >
            <Send
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Agendar {{ formatNumber(totalNotices) }} {{ totalNotices === 1 ? 'aviso' : 'avisos' }}
          </button>
          <span class="ds-hint">
            {{ formatNumber(recipients.length) }} {{ recipients.length === 1 ? 'cliente' : 'clientes' }} × {{ notice.channels.length }}
            {{ notice.channels.length === 1 ? 'canal' : 'canais' }}. Cada aviso vira um registro com status "Agendado".
          </span>
        </form>
      </section>
    </template>
  </LoadState>
</template>
