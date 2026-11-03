<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { useNow } from '../../composables/useNow';
import { href } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import {
  getDrop, getDropStock, getMe, getMyWaitlistEntry, getWaitlistStats, joinWaitlist, leaveWaitlist, listPublicDrops,
} from '../../services/client-api';
import { DROP_EVENT_STATUS, WAITLIST_STATUS } from '../../services/status';
import { brlCompact, formatDateTime, formatDuration, formatNumber, percent } from '../../services/format';
import StatusBadge from '../ui/StatusBadge.vue';
import LoadState from '../ui/LoadState.vue';

// C6 · Drop esgotado + lista de espera. Rotas: GET drop-events/get-by-id/{id},
// GET drop-products/get-all + drop-reservations/get-all (estoque, a cada 4s),
// GET storefront/drop/waitlist, POST waitlist-entries/add, DELETE waitlist-entries/delete/{id}.
const props = defineProps({
  eventId: { type: Number, required: true },
});

const STOCK_POLL_MS = 4000;
const signedIn = computed(() => isSignedIn(REALMS.storefront));
const now = useNow(1000);

const page = useAsync(async () => {
  const [event, drops] = await Promise.all([getDrop(props.eventId), listPublicDrops()]);
  const [entry, me] = signedIn.value ? await Promise.all([getMyWaitlistEntry(props.eventId), getMe()]) : [null, null];
  const stats = await getWaitlistStats(props.eventId, entry?.waitlistEntryStatusId === 1 ? entry.position : null);
  return { event, drops, entry, me, stats };
});

const stock = useAsync(() => getDropStock(props.eventId));
const timer = setInterval(() => stock.reload(), STOCK_POLL_MS);
onScopeDispose(() => clearInterval(timer));

const event = computed(() => page.data.value?.event ?? null);
const entry = computed(() => page.data.value?.entry ?? null);
const stats = computed(() => page.data.value?.stats ?? { waiting: 0, rank: null });
const price = computed(() => brlCompact(event.value?.price ?? 0));
const isSoldOut = computed(() => stock.data.value && stock.data.value.available === 0);

const variants = computed(() => stock.data.value?.variants ?? []);
const variantLabel = (dp) => dp.sku.split('-').pop();
const selectedVariant = ref(null);
watch(variants, (list) => {
  if (!selectedVariant.value && list.length) selectedVariant.value = entry.value?.dropProductId ?? list[0].id;
}, { immediate: true });

const soldPct = computed(() => percent(stock.data.value?.sold ?? 0, stock.data.value?.allocated ?? 0));
const reservedPct = computed(() => percent(stock.data.value?.reserved ?? 0, stock.data.value?.allocated ?? 0));

const otherDrops = computed(() => (page.data.value?.drops ?? [])
  .filter((d) => d.id !== props.eventId && Date.parse(d.dropEndsAt) > now.value)
  .slice(0, 4));

const notifiedRemaining = computed(() => (entry.value?.expiresAt ? Date.parse(entry.value.expiresAt) - now.value : 0));

const join = useAction(async () => {
  await joinWaitlist({
    eventId: props.eventId,
    dropProductId: selectedVariant.value,
    customerId: page.data.value.me.id,
    dropEndsAt: event.value.dropEndsAt,
  });
  await page.reload();
});

const leave = useAction(async () => {
  await leaveWaitlist(entry.value.id);
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
          :href="href(`/drops/${event.id}`)"
        >
          <ArrowLeft
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Voltar ao drop
        </a>
        <div class="ds-cluster ds-cluster--between ds-align-end">
          <div class="ds-stack--2">
            <span
              v-if="isSoldOut"
              class="ds-badge ds-badge--done ds-self-start"
            >Esgotado</span>
            <StatusBadge
              v-else
              :id="event.dropEventStatusId"
              class="ds-self-start"
              :table="DROP_EVENT_STATUS"
            />
            <h1 class="ds-title ds-title--lg">
              {{ event.name }}
            </h1>
            <p
              v-if="isSoldOut"
              class="ds-text-secondary"
            >
              Todas as {{ formatNumber(stock.data.value.allocated) }} unidades foram vendidas ou estão reservadas em checkouts abertos.
            </p>
          </div>
          <div class="ds-stat ds-text-right">
            <div class="ds-stat__value">
              {{ price.value }}<span class="ds-stat__unit">{{ price.unit }}</span>
            </div>
            <div class="ds-stat__label">
              preço do drop
            </div>
          </div>
        </div>
      </div>

      <section class="ds-grid ds-grid--sidebar">
        <div class="ds-stack--6">
          <article class="ds-card">
            <div class="ds-grid ds-grid--media">
              <img
                :class="['ds-card__media', 'ds-card__media--product', { 'ds-card__media--muted': isSoldOut }]"
                :src="event.coverImageUrl"
                :alt="`Produto do ${event.name}`"
              >
              <div class="ds-stack--4">
                <header class="ds-card__header">
                  <h2 class="ds-card__title">
                    Estoque do drop
                  </h2>
                  <span class="ds-text-xs ds-text-secondary">atualiza a cada 4s</span>
                </header>
                <LoadState
                  :is-loading="stock.isLoading.value"
                  :error="stock.error.value && !stock.data.value ? stock.error.value : null"
                  :lines="3"
                  @retry="stock.reload"
                >
                  <template v-if="stock.data.value">
                    <div
                      class="ds-progress"
                      role="img"
                      :aria-label="`${stock.data.value.sold} vendidas, ${stock.data.value.reserved} reservadas, ${stock.data.value.available} disponíveis`"
                    >
                      <span
                        class="ds-progress__seg ds-progress__seg--1"
                        :style="{ width: `${soldPct}%` }"
                      />
                      <span
                        class="ds-progress__seg ds-progress__seg--3"
                        :style="{ width: `${reservedPct}%` }"
                      />
                    </div>
                    <div
                      class="ds-stat-grid"
                      aria-live="polite"
                    >
                      <div :class="['ds-stat', { 'ds-stat--critical': stock.data.value.available === 0 }]">
                        <div class="ds-stat__value">
                          {{ formatNumber(stock.data.value.available) }}<span class="ds-stat__unit">un.</span>
                        </div>
                        <div class="ds-stat__label">
                          Disponível
                        </div>
                      </div>
                      <div class="ds-stat">
                        <div class="ds-stat__value">
                          {{ formatNumber(stock.data.value.reserved) }}<span class="ds-stat__unit">un.</span>
                        </div>
                        <div class="ds-stat__label">
                          Em checkouts abertos
                        </div>
                      </div>
                      <div class="ds-stat">
                        <div class="ds-stat__value">
                          {{ formatNumber(stock.data.value.sold) }}<span class="ds-stat__unit">un.</span>
                        </div>
                        <div class="ds-stat__label">
                          Vendido
                        </div>
                      </div>
                    </div>
                  </template>
                </LoadState>
              </div>
            </div>
          </article>

          <article class="ds-card ds-stack--4">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Por que ainda dá para conseguir
              </h2>
            </header>
            <p class="ds-text-secondary ds-prose">
              Cada checkout reserva a unidade por 5 minutos. Se a pessoa não finalizar, a unidade volta e vai para o
              primeiro da lista de espera, que recebe um aviso e tem 10 minutos para comprar.
            </p>
            <ol class="ds-grid ds-grid--tiles ds-list-reset">
              <li class="ds-tile">
                <span class="ds-label-caps">1</span>
                <strong class="ds-text-medium">Reserva expira</strong>
                <span class="ds-text-xs ds-text-secondary">alguém não pagou a tempo</span>
              </li>
              <li class="ds-tile">
                <span class="ds-label-caps">2</span>
                <strong class="ds-text-medium">Você é avisado</strong>
                <span class="ds-text-xs ds-text-secondary">pelo canal que escolheu</span>
              </li>
              <li class="ds-tile">
                <span class="ds-label-caps">3</span>
                <strong class="ds-text-medium">10 min para comprar</strong>
                <span class="ds-text-xs ds-text-secondary">depois passa para o próximo</span>
              </li>
            </ol>
          </article>

          <article
            v-if="otherDrops.length"
            class="ds-card ds-stack--4"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Próximos drops
              </h2>
              <a
                class="ds-text-sm ds-text-brand"
                :href="href('/')"
              >Ver todos</a>
            </header>
            <div class="ds-grid ds-grid--2">
              <a
                v-for="drop in otherDrops"
                :key="drop.id"
                class="ds-card ds-card--outlined ds-card--tight ds-card--interactive ds-cluster ds-cluster--2"
                :href="href(drop.requiresRegistration ? `/drops/${drop.id}/inscricao` : `/drops/${drop.id}`)"
              >
                <img
                  class="ds-card__media ds-card__media--thumb ds-card__media--product"
                  :src="drop.coverImageUrl"
                  alt=""
                >
                <span class="ds-stack--1 ds-min-0">
                  <strong class="ds-text-medium">{{ drop.name }}</strong>
                  <span
                    v-if="Date.parse(drop.dropStartsAt) <= now"
                    class="ds-badge ds-badge--live ds-self-start"
                  ><span
                    class="ds-badge__dot"
                    aria-hidden="true"
                  />AO VIVO</span>
                  <span
                    v-else
                    class="ds-badge ds-badge--scheduled ds-self-start"
                  >
                    {{ drop.requiresRegistration ? 'Inscrições abertas' : formatDateTime(drop.dropStartsAt) }}
                  </span>
                </span>
              </a>
            </div>
          </article>
        </div>

        <aside class="ds-stack--6">
          <!-- Notificado: a unidade é sua por 10 minutos -->
          <article
            v-if="entry?.waitlistEntryStatusId === 2"
            class="ds-card ds-card--inverse ds-stack--4"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Uma unidade é sua
              </h2>
              <StatusBadge
                :id="2"
                :table="WAITLIST_STATUS"
              />
            </header>
            <div
              class="ds-stat ds-stat--lg"
              role="timer"
            >
              <div class="ds-stat__value ds-numeric">
                {{ formatDuration(notifiedRemaining) }}
              </div>
              <div class="ds-stat__label">
                para finalizar antes de passar ao próximo
              </div>
            </div>
            <button
              type="button"
              class="ds-btn ds-btn--on-inverse ds-btn--lg ds-btn--block"
              disabled
              aria-describedby="wl-checkout-hint"
            >
              Ir para o checkout
            </button>
            <span
              id="wl-checkout-hint"
              class="ds-hint"
            >O checkout pela lista de espera depende de uma reserva sem fila, que o back-end ainda não oferece.</span>
          </article>

          <article
            v-else
            class="ds-card ds-stack--5"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Lista de espera
              </h2>
              <StatusBadge
                v-if="entry"
                :id="entry.waitlistEntryStatusId"
                :table="WAITLIST_STATUS"
              />
            </header>

            <template v-if="!signedIn">
              <p class="ds-text-sm ds-text-secondary">
                Entre na sua conta para entrar na lista de espera.
              </p>
              <a
                class="ds-btn ds-btn--primary ds-btn--block"
                :href="href('/conta')"
              >Entrar ou criar conta</a>
            </template>

            <template v-else-if="entry?.waitlistEntryStatusId === 1">
              <div class="ds-stat ds-stat--lg">
                <div class="ds-stat__value">
                  {{ stats.rank ?? entry.position }}<span class="ds-stat__unit">º</span>
                </div>
                <div class="ds-stat__label">
                  na lista · {{ formatNumber(stock.data.value?.reserved ?? 0) }} unidades ainda em checkouts abertos
                </div>
              </div>
              <p class="ds-text-sm">
                Tamanho: <strong class="ds-text-medium">{{ variantLabel(variants.find((v) => v.id === entry.dropProductId) ?? { sku: '—' }) }}</strong>
              </p>
              <span class="ds-hint">Você está na lista e será avisado pelos canais da sua conta. Pode fechar esta página.</span>
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--block"
                :disabled="leave.isPending.value"
                @click="leave.run()"
              >
                Sair da lista
              </button>
            </template>

            <template v-else-if="entry?.waitlistEntryStatusId === 3">
              <p class="ds-text-sm">
                O prazo para comprar a unidade terminou e ela passou para o próximo da lista.
              </p>
              <a
                class="ds-btn ds-btn--secondary ds-btn--block"
                :href="href('/')"
              >Ver outros drops</a>
            </template>

            <template v-else-if="entry?.waitlistEntryStatusId === 4">
              <p class="ds-text-sm">
                Você conseguiu uma unidade pela lista de espera.
              </p>
              <a
                class="ds-btn ds-btn--primary ds-btn--block"
                :href="href('/conta/pedidos')"
              >Ver meu pedido</a>
            </template>

            <form
              v-else
              class="ds-stack--4"
              @submit.prevent="join.run()"
            >
              <p class="ds-text-sm ds-text-secondary">
                {{ formatNumber(stats.waiting) }} {{ stats.waiting === 1 ? 'pessoa aguarda' : 'pessoas aguardam' }}.
                Entre na lista: se uma reserva expirar, avisamos você na ordem de chegada.
              </p>
              <div
                v-if="variants.length > 1"
                class="ds-field"
              >
                <label
                  class="ds-label"
                  for="wl-size"
                >Tamanho</label>
                <select
                  id="wl-size"
                  v-model="selectedVariant"
                  class="ds-input"
                >
                  <option
                    v-for="dp in variants"
                    :key="dp.id"
                    :value="dp.id"
                  >
                    {{ variantLabel(dp) }}
                  </option>
                </select>
              </div>
              <p
                v-if="join.error.value"
                class="ds-error"
                role="alert"
              >
                <AlertCircle
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                {{ join.error.value.message }}
              </p>
              <button
                type="submit"
                class="ds-btn ds-btn--primary ds-btn--block"
                :disabled="join.isPending.value"
                :aria-busy="join.isPending.value"
              >
                Entrar na lista de espera
              </button>
            </form>

            <p
              v-if="leave.error.value"
              class="ds-error"
              role="alert"
            >
              {{ leave.error.value.message }}
            </p>
          </article>
        </aside>
      </section>
    </template>
  </LoadState>
</template>
