<script setup>
import { computed, reactive, ref } from 'vue';
import { Bell, ClipboardCheck, Clock, ListPlus, PackageCheck, Timer, Trash2, Zap } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import { deleteNotification, listMyNotifications } from '../../services/client-api';
import { NOTIFICATION_TYPE } from '../../services/status';
import { formatDate, formatTime } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// C13 · Notificações. Rotas: GET storefront/drop/notifications (lista do cliente),
// POST drop-notifications/get-list-by-list-id (tipo, canal e status),
// DELETE drop-notifications/delete/{id}.
// "Lida" e "preferências" não existem no back: ficam neste navegador.
const READ_KEY = 'drp_notifications_read';
const PREFS_KEY = 'drp_notification_prefs';
const RECENT_MS = 24 * 60 * 60 * 1000;

const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const signedIn = computed(() => isSignedIn(REALMS.storefront));
const list = useAsync(() => (signedIn.value ? listMyNotifications() : Promise.resolve([])));

const readIds = ref(new Set(readStorage(READ_KEY, [])));
const isRead = (n) => readIds.value.has(n.id);

// Só o que já foi enviado; o mais novo primeiro.
const sent = computed(() => (list.data.value ?? [])
  .filter((n) => Date.parse(n.scheduledAt) <= Date.now())
  .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt)));
const recent = computed(() => sent.value.filter((n) => Date.now() - Date.parse(n.scheduledAt) < RECENT_MS));
const older = computed(() => sent.value.filter((n) => Date.now() - Date.parse(n.scheduledAt) >= RECENT_MS));
const unreadCount = computed(() => sent.value.filter((n) => !isRead(n)).length);

// Chamado na fila há pouco: card em destaque com a ação.
const urgentId = computed(() => recent.value.find((n) => n.dropNotificationTypeId === 3 && Date.now() - Date.parse(n.scheduledAt) < 10 * 60 * 1000)?.id ?? null);

const markAllRead = () => {
  readIds.value = new Set(sent.value.map((n) => n.id));
  writeStorage(READ_KEY, [...readIds.value]);
};

const ICONS = { 1: ClipboardCheck, 2: Clock, 3: Zap, 4: Timer, 5: PackageCheck, 6: ListPlus };
const iconOf = (n) => ICONS[n.dropNotificationTypeId] ?? Bell;
const toneOf = (n) => NOTIFICATION_TYPE[n.dropNotificationTypeId]?.tone ?? 'done';
const whenOf = (n) => (Date.now() - Date.parse(n.scheduledAt) < RECENT_MS ? formatTime(n.scheduledAt) : formatDate(n.scheduledAt));

const remove = useAction(async (n) => {
  await deleteNotification(n.id);
  await list.reload();
});

// Preferências: tipo × canal, salvas só neste navegador.
const PREF_ROWS = [
  { key: 'queue-open', label: 'Abertura da fila' },
  { key: 'called', label: 'Chamado na fila' },
  { key: 'expiring', label: 'Reserva expirando' },
  { key: 'waitlist', label: 'Lista de espera' },
  { key: 'order', label: 'Pedido e entrega' },
];
const PREF_CHANNELS = [
  { key: 'email', label: 'E-mail' },
  { key: 'push', label: 'Push' },
  { key: 'sms', label: 'SMS' },
];
const DEFAULT_PREFS = {
  'queue-open': { email: true, push: true, sms: false },
  called: { email: true, push: true, sms: true },
  expiring: { email: false, push: true, sms: false },
  waitlist: { email: true, push: true, sms: true },
  order: { email: true, push: false, sms: false },
};
const prefs = reactive(structuredClone({ ...DEFAULT_PREFS, ...readStorage(PREFS_KEY, {}) }));
const prefsSaved = ref(false);
const calledChannels = computed(() => Object.values(prefs.called).filter(Boolean).length);
const savePrefs = () => {
  prefsSaved.value = writeStorage(PREFS_KEY, prefs);
};
</script>

<template>
  <div class="ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <h1 class="ds-title ds-title--lg">
          Notificações
        </h1>
        <p
          class="ds-text-secondary"
          aria-live="polite"
        >
          {{ unreadCount === 0 ? 'Tudo lido' : unreadCount === 1 ? '1 não lida' : `${unreadCount} não lidas` }}
        </p>
      </div>
      <div class="ds-cluster ds-cluster--2">
        <button
          type="button"
          class="ds-btn ds-btn--secondary"
          :disabled="!unreadCount"
          @click="markAllRead"
        >
          Marcar todas como lidas
        </button>
      </div>
    </div>

    <article
      v-if="!signedIn"
      class="ds-card ds-empty"
    >
      <Bell
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Entre na sua conta para ver seus avisos.</p>
      <a
        class="ds-btn ds-btn--primary ds-btn--sm"
        :href="href('/conta')"
      >Entrar</a>
    </article>

    <section
      v-else
      class="ds-grid ds-grid--sidebar"
    >
      <div class="ds-stack--6">
        <LoadState
          :is-loading="list.isLoading.value"
          :error="list.error.value"
          :is-empty="!sent.length"
          empty-text="Nenhum aviso ainda. Avisamos aqui a abertura das filas e o andamento dos pedidos."
          :lines="6"
          @retry="list.reload"
        >
          <div
            v-if="recent.length"
            class="ds-stack--3"
          >
            <h2 class="ds-label-caps">
              Últimas 24 horas
            </h2>
            <article
              v-for="n in recent"
              :key="n.id"
              :class="['ds-card', 'ds-card--row', { 'ds-card--inverse': n.id === urgentId }]"
            >
              <span
                :class="['ds-icon-tile', 'ds-icon-tile--lg', `ds-icon-tile--${toneOf(n)}`]"
                aria-hidden="true"
              >
                <component
                  :is="iconOf(n)"
                  :size="20"
                  :stroke-width="1.5"
                />
              </span>
              <div class="ds-stack--1 ds-min-0">
                <span class="ds-cluster ds-cluster--2">
                  <strong class="ds-text-medium">{{ n.subject }}</strong>
                  <StatusBadge
                    v-if="n.dropNotificationTypeId"
                    :id="n.dropNotificationTypeId"
                    :table="NOTIFICATION_TYPE"
                  />
                </span>
                <span :class="['ds-text-sm', n.id === urgentId ? '' : 'ds-text-secondary']">{{ n.body }}</span>
              </div>
              <div class="ds-list__meta">
                <a
                  v-if="n.id === urgentId && n.dropEventId"
                  class="ds-btn ds-btn--on-inverse"
                  :href="href(`/drops/${n.dropEventId}`)"
                >Finalizar compra</a>
                <template v-else>
                  <span>{{ whenOf(n) }}</span>
                  <span
                    v-if="!isRead(n)"
                    class="ds-dot"
                  ><span class="ds-sr-only">Não lida</span></span>
                  <button
                    type="button"
                    class="ds-icon-btn ds-icon-btn--ghost"
                    :aria-label="`Excluir aviso: ${n.subject}`"
                    :disabled="remove.isPending.value"
                    @click="remove.run(n)"
                  >
                    <Trash2
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                  </button>
                </template>
              </div>
            </article>
          </div>

          <div
            v-if="older.length"
            class="ds-stack--3"
          >
            <h2 class="ds-label-caps">
              Anteriores
            </h2>
            <div class="ds-card ds-card--flush">
              <ul class="ds-list">
                <li
                  v-for="n in older"
                  :key="n.id"
                  class="ds-list__item"
                >
                  <span
                    :class="['ds-icon-tile', `ds-icon-tile--${toneOf(n)}`]"
                    aria-hidden="true"
                  >
                    <component
                      :is="iconOf(n)"
                      :size="20"
                      :stroke-width="1.5"
                    />
                  </span>
                  <span class="ds-stack--1 ds-min-0">
                    <strong class="ds-text-medium">{{ n.subject }}</strong>
                    <span class="ds-text-sm ds-text-secondary">{{ n.body }}</span>
                  </span>
                  <span class="ds-list__meta">
                    {{ whenOf(n) }}
                    <span
                      v-if="!isRead(n)"
                      class="ds-dot"
                    ><span class="ds-sr-only">Não lida</span></span>
                    <button
                      type="button"
                      class="ds-icon-btn ds-icon-btn--ghost"
                      :aria-label="`Excluir aviso: ${n.subject}`"
                      :disabled="remove.isPending.value"
                      @click="remove.run(n)"
                    >
                      <Trash2
                        :size="16"
                        :stroke-width="1.5"
                        aria-hidden="true"
                      />
                    </button>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <p
            v-if="remove.error.value"
            class="ds-error"
            role="alert"
          >
            {{ remove.error.value.message }}
          </p>
        </LoadState>
      </div>

      <aside class="ds-stack--6">
        <form
          class="ds-card ds-stack--5"
          @submit.prevent="savePrefs"
        >
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Preferências
            </h2>
          </header>
          <div class="ds-table-scroll">
            <table class="ds-table ds-text-sm">
              <caption class="ds-sr-only">
                Canais por tipo de aviso
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Aviso
                  </th>
                  <th
                    v-for="channel in PREF_CHANNELS"
                    :key="channel.key"
                    scope="col"
                  >
                    {{ channel.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in PREF_ROWS"
                  :key="row.key"
                >
                  <th
                    scope="row"
                    class="ds-text-medium"
                  >
                    {{ row.label }}
                  </th>
                  <td
                    v-for="channel in PREF_CHANNELS"
                    :key="channel.key"
                  >
                    <input
                      v-model="prefs[row.key][channel.key]"
                      class="ds-checkbox"
                      type="checkbox"
                      :aria-label="`${row.label} por ${channel.label}`"
                      @change="prefsSaved = false"
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <span :class="['ds-hint', { 'ds-text-danger': calledChannels < 2 }]">
            "Chamado na fila" é o aviso mais importante: recomendamos manter ao menos dois canais.
          </span>
          <button
            type="submit"
            class="ds-btn ds-btn--primary ds-btn--block"
          >
            Salvar preferências
          </button>
          <span
            v-if="prefsSaved"
            class="ds-hint ds-text-success"
            role="status"
          >Preferências salvas neste navegador. O back-end ainda não guarda preferências de aviso.</span>
        </form>
      </aside>
    </section>
  </div>
</template>
