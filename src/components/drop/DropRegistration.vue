<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { useNow } from '../../composables/useNow';
import { href } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import {
  cancelRegistration, getDrop, getDropCoupons, getDropStock, getMe, getMyRegistration,
  registerForDrop, scheduleRegistrationNotices,
} from '../../services/client-api';
import { DROP_EVENT_STATUS, DROP_REGISTRATION_STATUS } from '../../services/status';
import { brlCompact, durationParts, formatDate, formatDateTime, formatTime, formatWeekday, formatNumber } from '../../services/format';
import StatusBadge from '../ui/StatusBadge.vue';
import LoadState from '../ui/LoadState.vue';

// C3 · Drop com inscrição prévia. Rotas: GET drop-events/get-by-id/{id},
// GET storefront/drop/registrations, POST storefront/drop/events/{id}/register,
// POST drop-notifications/add-range (canais), DELETE drop-registrations/delete/{id}.
const props = defineProps({
  eventId: { type: Number, required: true },
});

const signedIn = computed(() => isSignedIn(REALMS.storefront));
const now = useNow(1000);

const page = useAsync(async () => {
  const [event, stock, coupons] = await Promise.all([getDrop(props.eventId), getDropStock(props.eventId), getDropCoupons(props.eventId)]);
  const [registration, me] = signedIn.value ? await Promise.all([getMyRegistration(props.eventId), getMe()]) : [null, null];
  return { event, stock, coupons, registration, me };
});

const event = computed(() => page.data.value?.event ?? null);
const registration = computed(() => page.data.value?.registration ?? null);
const stock = computed(() => page.data.value?.stock ?? null);
const exclusiveCoupons = computed(() => (page.data.value?.coupons ?? []).filter((c) => c.isExclusiveToRegistered));
const maxPerCustomer = computed(() => stock.value?.variants[0]?.maxPerCustomer ?? 1);

const price = computed(() => brlCompact(event.value?.price ?? 0));

const at = (field) => Date.parse(event.value?.[field]);
const phase = computed(() => {
  if (!event.value) return null;
  const t = now.value;
  if (t < at('registrationStartsAt')) return 'before';
  if (t <= at('registrationEndsAt')) return 'open';
  return 'closed';
});

// Etapa atual da linha do tempo "Como funciona".
const steps = computed(() => {
  if (!event.value) return [];
  const t = now.value;
  const current = t <= at('registrationEndsAt') ? 0 : t < at('queueOpensAt') ? 1 : t < at('dropStartsAt') ? 2 : 3;
  return [
    { title: 'Inscrição', when: `${formatDateTime(event.value.registrationStartsAt)} → ${formatDateTime(event.value.registrationEndsAt)}` },
    { title: 'Elegibilidade', when: `Resultado antes de ${formatDateTime(event.value.queueOpensAt)}` },
    { title: 'Fila abre', when: formatDateTime(event.value.queueOpensAt) },
    { title: 'Drop', when: `${formatDateTime(event.value.dropStartsAt)} → ${formatTime(event.value.dropEndsAt)}` },
  ].map((s, i) => ({ ...s, current: i === current, label: i === current ? `${i + 1} · Agora` : String(i + 1) }));
});

const countdownTarget = computed(() => (phase.value === 'before' ? at('registrationStartsAt') : at('registrationEndsAt')));
const countdown = computed(() => durationParts(countdownTarget.value - now.value));

const statusText = computed(() => {
  const r = registration.value;
  if (!r || !event.value) return '';
  switch (r.dropRegistrationStatusId) {
    case 1: return 'Inscrição recebida. Avisamos quando sair o resultado.';
    case 2: return `Você entra na fila em ${formatDate(event.value.queueOpensAt)} às ${formatTime(event.value.queueOpensAt)}.`;
    case 3: return r.eligibilityReason ? `Motivo: ${r.eligibilityReason}.` : 'Sua inscrição não foi aprovada para este drop.';
    case 4: return 'Vagas esgotadas: você entra se alguém desistir.';
    default: return '';
  }
});

const STATUS_HELP = [
  { id: 1, text: 'Inscrição recebida. Avisamos quando sair o resultado.' },
  { id: 2, text: 'Você entra na fila no horário de abertura.' },
  { id: 3, text: 'Mostramos o motivo e outros drops para você.' },
  { id: 4, text: 'Vagas esgotadas; entra se alguém desistir.' },
];

// Formulário de inscrição.
const CHANNELS = [
  { id: 1, label: 'E-mail' },
  { id: 3, label: 'Push no navegador' },
  { id: 2, label: 'SMS' },
];
const channels = ref([1, 3]);
const acceptedRules = ref(false);
const noticeWarning = ref('');

const register = useAction(async () => {
  noticeWarning.value = '';
  await registerForDrop(props.eventId);
  try {
    await scheduleRegistrationNotices(props.eventId, page.data.value.me.id, channels.value, event.value.name);
  } catch {
    noticeWarning.value = 'Inscrição feita, mas não conseguimos salvar os canais de aviso agora.';
  }
  await page.reload();
});

const cancel = useAction(async () => {
  await cancelRegistration(registration.value.id);
  await page.reload();
});
</script>

<template>
  <LoadState
    :is-loading="page.isLoading.value"
    :error="page.error.value"
    :lines="8"
    @retry="page.reload"
  >
    <template v-if="event">
      <div class="ds-stack--2">
        <a
          class="ds-back-link"
          :href="href('/')"
        >
          <ArrowLeft
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Todos os drops
        </a>
        <div class="ds-cluster ds-cluster--between ds-align-end">
          <div class="ds-stack--2">
            <StatusBadge
              :id="event.dropEventStatusId"
              class="ds-self-start"
              :table="DROP_EVENT_STATUS"
            />
            <h1 class="ds-title ds-title--lg">
              {{ event.name }}
            </h1>
          </div>
          <div class="ds-stat ds-text-right">
            <div class="ds-stat__value">
              {{ price.value }}<span class="ds-stat__unit">{{ price.unit }}</span>
            </div>
            <div class="ds-stat__label">
              {{ maxPerCustomer === 1 ? '1 unidade por cliente' : `até ${maxPerCustomer} por cliente` }}
            </div>
          </div>
        </div>
      </div>

      <section class="ds-grid ds-grid--sidebar">
        <div class="ds-stack--6">
          <article class="ds-card ds-card--flush">
            <img
              class="ds-card__media"
              :src="event.bannerImageUrl || event.coverImageUrl"
              :alt="`Produto do ${event.name}`"
            >
            <div class="ds-stack--3 ds-card__note">
              <span class="ds-label-caps">Edição limitada · {{ formatNumber(stock?.allocated ?? event.totalUnitsAvailable) }} unidades</span>
              <p class="ds-text-secondary ds-prose">
                {{ event.description }}
                <template v-if="event.requiresRegistration">
                  Só clientes elegíveis entram na fila no dia: a inscrição não garante a compra, garante o acesso.
                </template>
              </p>
            </div>
          </article>

          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Como funciona este drop
              </h2>
              <span class="ds-text-xs ds-text-secondary">Horário de Brasília</span>
            </header>
            <ol class="ds-grid ds-grid--tiles ds-list-reset">
              <li
                v-for="step in steps"
                :key="step.title"
                :class="['ds-tile', { 'ds-tile--inverse': step.current }]"
                :aria-current="step.current ? 'step' : undefined"
              >
                <span class="ds-label-caps">{{ step.label }}</span>
                <strong class="ds-text-medium">{{ step.title }}</strong>
                <span class="ds-text-xs ds-text-secondary">{{ step.when }}</span>
              </li>
            </ol>
          </article>

          <article
            v-if="event.requiresRegistration"
            class="ds-card ds-stack--4"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                O que cada situação significa
              </h2>
            </header>
            <div>
              <div
                v-for="item in STATUS_HELP"
                :key="item.id"
                class="ds-row-divided"
              >
                <StatusBadge
                  :id="item.id"
                  :table="DROP_REGISTRATION_STATUS"
                />
                <span class="ds-text-sm ds-text-secondary">{{ item.text }}</span>
              </div>
            </div>
          </article>
        </div>

        <aside class="ds-stack--6">
          <!-- Drop sem inscrição prévia -->
          <article
            v-if="!event.requiresRegistration"
            class="ds-card ds-stack--4"
          >
            <h2 class="ds-card__title">
              Este drop não exige inscrição
            </h2>
            <p class="ds-text-sm ds-text-secondary">
              Basta entrar na fila no horário de abertura: {{ formatDateTime(event.queueOpensAt) }}.
            </p>
            <a
              class="ds-btn ds-btn--primary ds-btn--block"
              :href="href(`/drops/${event.id}`)"
            >Ver o drop</a>
          </article>

          <template v-else>
            <article
              v-if="phase !== 'closed'"
              class="ds-card ds-card--inverse ds-stack--5"
            >
              <h2 class="ds-card__title">
                {{ phase === 'before' ? 'Inscrições abrem em' : 'Inscrições encerram em' }}
              </h2>
              <div
                class="ds-stat ds-stat--lg"
                role="timer"
                aria-live="off"
              >
                <div class="ds-stat__value ds-numeric">
                  {{ countdown.days }}<span class="ds-stat__unit">d</span>
                  {{ String(countdown.hours).padStart(2, '0') }}<span class="ds-stat__unit">h</span>
                  {{ String(countdown.minutes).padStart(2, '0') }}<span class="ds-stat__unit">min</span>
                </div>
                <div class="ds-stat__label">
                  até {{ formatWeekday(countdownTarget) }}, {{ formatDate(countdownTarget) }} às {{ formatTime(countdownTarget) }}
                </div>
              </div>
            </article>

            <article class="ds-card ds-stack--5">
              <header class="ds-card__header">
                <h2 class="ds-card__title">
                  Sua inscrição
                </h2>
                <StatusBadge
                  v-if="registration"
                  :id="registration.dropRegistrationStatusId"
                  :table="DROP_REGISTRATION_STATUS"
                />
                <span
                  v-else
                  class="ds-badge ds-badge--done"
                >Não inscrito</span>
              </header>

              <!-- Sem login -->
              <template v-if="!signedIn">
                <p class="ds-text-sm ds-text-secondary">
                  Entre na sua conta para se inscrever. Drops com inscrição exigem CPF validado.
                </p>
                <a
                  class="ds-btn ds-btn--primary ds-btn--block"
                  :href="href('/conta')"
                >Entrar ou criar conta</a>
              </template>

              <!-- Já inscrito -->
              <template v-else-if="registration">
                <p
                  class="ds-text-sm"
                  aria-live="polite"
                >
                  {{ statusText }}
                </p>
                <p
                  v-if="noticeWarning"
                  class="ds-error"
                  role="status"
                >
                  <AlertCircle
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  {{ noticeWarning }}
                </p>
                <a
                  v-if="registration.dropRegistrationStatusId === 3"
                  class="ds-btn ds-btn--secondary ds-btn--block"
                  :href="href('/')"
                >Ver outros drops</a>
                <button
                  v-if="phase === 'open' && registration.dropRegistrationStatusId === 1"
                  type="button"
                  class="ds-btn ds-btn--ghost-danger ds-btn--block"
                  :disabled="cancel.isPending.value"
                  @click="cancel.run()"
                >
                  Cancelar inscrição
                </button>
                <p
                  v-if="cancel.error.value"
                  class="ds-error"
                  role="alert"
                >
                  {{ cancel.error.value.message }}
                </p>
              </template>

              <!-- Fora da janela -->
              <p
                v-else-if="phase !== 'open'"
                class="ds-text-sm ds-text-secondary"
              >
                {{ phase === 'before' ? `As inscrições abrem em ${formatDateTime(event.registrationStartsAt)}.` : 'As inscrições deste drop já foram encerradas.' }}
              </p>

              <!-- Formulário -->
              <form
                v-else
                class="ds-stack--5"
                @submit.prevent="register.run()"
              >
                <fieldset class="ds-stack--1">
                  <legend class="ds-label">
                    Como quer ser avisado?
                  </legend>
                  <label
                    v-for="channel in CHANNELS"
                    :key="channel.id"
                    class="ds-check"
                  >
                    <input
                      v-model="channels"
                      type="checkbox"
                      :value="channel.id"
                    >
                    <span>{{ channel.label }}</span>
                  </label>
                  <span class="ds-hint">Avisamos o resultado, a abertura da fila e quando for a sua vez.</span>
                </fieldset>
                <label class="ds-check ds-check--top">
                  <input
                    v-model="acceptedRules"
                    type="checkbox"
                    required
                  >
                  <span class="ds-text-sm ds-text-secondary">
                    Li as regras do drop: {{ maxPerCustomer }} unidade por CPF, um dispositivo por pessoa e compra em até 5 min depois de ser chamado.
                  </span>
                </label>
                <p
                  v-if="register.error.value"
                  class="ds-error"
                  role="alert"
                >
                  <AlertCircle
                    :size="16"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  {{ register.error.value.message }}
                </p>
                <button
                  type="submit"
                  class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
                  :disabled="!acceptedRules || register.isPending.value"
                  :aria-busy="register.isPending.value"
                >
                  <span
                    v-if="register.isPending.value"
                    class="ds-spinner"
                    aria-hidden="true"
                  />
                  Quero participar
                </button>
              </form>

              <p
                v-if="register.done.value && registration"
                class="ds-hint ds-text-success"
                role="status"
              >
                <CheckCircle
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Inscrição registrada.
              </p>
            </article>

            <article
              v-if="exclusiveCoupons.length"
              class="ds-card ds-card--sunken ds-stack--3"
            >
              <span class="ds-label-caps">Inscrito tem vantagem</span>
              <p class="ds-text-sm">
                {{ exclusiveCoupons.length === 1 ? 'Um cupom exclusivo' : `${exclusiveCoupons.length} cupons exclusivos` }}
                para inscritos é liberado no checkout deste drop.
              </p>
            </article>
          </template>
        </aside>
      </section>
    </template>
  </LoadState>
</template>
