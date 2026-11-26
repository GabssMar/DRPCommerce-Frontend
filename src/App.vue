<script setup>
import { computed, ref, watch, watchEffect, onWatcherCleanup, defineAsyncComponent } from 'vue';
import { Layers, ArrowLeft, ShoppingBag, Bell, UserRound, ListPlus, ClipboardCheck } from '@lucide/vue';
import { IS_MOCK } from './services/config';
import { useDropQueue } from './composables/useDropQueue';
import { dropPhase, getDropEvent, listPublicDrops, QUEUE_STATUS } from './services/client-api';
import { useServerNow } from './composables/useNow';
import { ADMIN_ENABLED } from './services/config';
import { currentEnterpriseId, isSignedIn, REALMS } from './services/session';
import { getPublicStore, listMyEnterprises } from './services/admin-api';
import { focusMain, href, isAdminRoute, navigate, redirect, route } from './router';
import { findProductSlugById } from './services/storefront-api';
import { useBag } from './composables/useBag';
import Countdown from './components/Countdown.vue';
import QueueStatus from './components/QueueStatus.vue';
import StockProgress from './components/StockProgress.vue';
import ProductDetails from './components/ProductDetails.vue';
import DropPurchase from './components/drop/DropPurchase.vue';
import EventPortal from './components/EventPortal.vue';
import StoreShowcase from './components/StoreShowcase.vue';
import StoreProductDetail from './components/StoreProductDetail.vue';
import StoreCart from './components/StoreCart.vue';
import StoreCheckout from './components/StoreCheckout.vue';
import DropRegistration from './components/drop/DropRegistration.vue';
import DropWaitlist from './components/drop/DropWaitlist.vue';
import AccountProfile from './components/account/AccountProfile.vue';
import CustomerAuth from './components/account/CustomerAuth.vue';
import LandingPage from './components/LandingPage.vue';
import AccountOrders from './components/account/AccountOrders.vue';
import AccountNotifications from './components/account/AccountNotifications.vue';
import AccountAddresses from './components/account/AccountAddresses.vue';
import AdminApp from './components/admin/AdminApp.vue';

// (portal, detalhe do drop, vitrine, sacola) e as telas novas, que usam a
// camada src/services/ no formato do back-end.
// Simulador do drop: ferramenta de teste, só no servidor de desenvolvimento.
// Carregado sob demanda para não entrar no build de produção.
const SHOW_SIMULATION = import.meta.env.DEV;
const SimulationPanel = SHOW_SIMULATION ? defineAsyncComponent(() => import('./components/SimulationPanel.vue')) : null;
const PAGE_BY_ROUTE = { portal: 'portal', drop: 'detail', vitrine: 'vitrine', 'vitrine-category': 'vitrine', product: 'product', cart: 'cart' };
const currentPage = computed(() => PAGE_BY_ROUTE[route.value.name] ?? route.value.name);
const showAdmin = computed(() => ADMIN_ENABLED && isAdminRoute(route.value));
// Página inicial (#/) conforme a sessão:
//   cliente logado -> portal de drops (a sessão de cliente tem prioridade)
//   lojista logado -> dashboard do painel (#/admin)
//   ninguém logado -> página de visitas (LandingPage)
// Sem sessão de cliente, #/entrar e #/criar-conta mostram o formulário e
// qualquer outra rota da loja mostra o login; depois de entrar, a rota pedida
// aparece. Com sessão de cliente, #/entrar e #/criar-conta voltam ao portal.
const GUEST_ROUTES = ['login', 'register'];
const customerSignedIn = computed(() => isSignedIn(REALMS.storefront));
const employeeSignedIn = computed(() => ADMIN_ENABLED && isSignedIn(REALMS.backoffice));
const showGuest = computed(() => !customerSignedIn.value || GUEST_ROUTES.includes(route.value.name));
watch([customerSignedIn, employeeSignedIn, route], ([customer, employee, r]) => {
  if (customer && GUEST_ROUTES.includes(r.name)) navigate('/');
  else if (!customer && employee && r.name === 'portal' && r.path === '/') navigate('/admin');
}, { immediate: true });

// Título da aba: o nome da plataforma até alguém entrar; depois, o nome da loja.
//   loja do cliente: GET storefront/{slug}/store (tradeName)
//   painel: a loja da sessão da equipe (enterprises/mine + EnterpriseId do token)
const PLATFORM_NAME = 'DRP Commerce';
const storeName = ref('');
watch([showAdmin, customerSignedIn, employeeSignedIn], async ([admin, customer, employee], _, onCleanup) => {
  let stale = false;
  onCleanup(() => {
    stale = true;
  });
  let name = '';
  try {
    if (admin && employee) {
      const mine = await listMyEnterprises();
      const id = currentEnterpriseId();
      name = (mine.find((e) => e.enterpriseId === id) ?? mine[0])?.tradeName ?? '';
    } else if (!admin && customer) {
      name = (await getPublicStore())?.tradeName ?? '';
    }
  } catch {
    name = '';
  }
  if (!stale) storeName.value = name;
}, { immediate: true });
watchEffect(() => {
  const base = storeName.value || PLATFORM_NAME;
  document.title = showAdmin.value ? `${base} · Painel` : base;
});

const selectedEventId = ref(1);
watch(route, (r) => {
  if (r.name === 'drop') selectedEventId.value = Number(r.params.id) || 1;
  // Link antigo #/vitrine/:id: vai para #/vitrine/p/:slug se o id existir.
  if (r.name === 'product-legacy') {
    findProductSlugById(r.params.id)
      .catch(() => null)
      .then((slug) => redirect(slug ? `/vitrine/p/${encodeURIComponent(slug)}` : '/vitrine'));
  }
  // Em produção sem a flag, #/admin cai no portal, sem mensagem.
  if (isAdminRoute(r) && !ADMIN_ENABLED) navigate('/');
}, { immediate: true });

// Portal e detalhe do drop (task 16): rotas públicas storefront/{slug}/drop/events(/{id}).
// Fila (task 17) e compra (task 18): storefront/{slug}/drop/events/{id}/queue e /reservations.
const eventsList = ref([]);
const dropEvent = ref(null);
const dropNotFound = ref(false);
const dropError = ref('');
const isStockRefreshing = ref(false);
const now = useServerNow();
const virtualTime = computed(() => new Date(now.value));
const isCheckoutOpen = ref(false);
const isPortalLoading = ref(true);
const portalError = ref('');

// Vitrine: as telas carregam o próprio catálogo (task 29); aqui só o contador da sacola.
const { bagCount } = useBag();

const PORTAL_ERROR_MESSAGE = 'Não conseguimos carregar os drops. Verifique sua conexão e tente de novo.';

const loadPortalData = async () => {
  isPortalLoading.value = true;
  try {
    eventsList.value = await listPublicDrops();
    portalError.value = '';
  } catch {
    portalError.value = PORTAL_ERROR_MESSAGE;
  } finally {
    isPortalLoading.value = false;
  }
};

const DETAIL_ERROR_MESSAGE = 'Não conseguimos carregar este drop. Verifique sua conexão e tente de novo.';

const loadEventDetailData = async (eventId) => {
  isCheckoutOpen.value = false;
  dropEvent.value = null;
  dropNotFound.value = false;
  dropError.value = '';

  try {
    dropEvent.value = await getDropEvent(eventId);
  } catch (err) {
    if (err?.kind === 'not-found') dropNotFound.value = true;
    else dropError.value = DETAIL_ERROR_MESSAGE;
  }

};

watch([selectedEventId, currentPage], ([eventId, page]) => {
  if (page === 'detail') {
    loadEventDetailData(eventId);
  } else if (page === 'portal') {
    loadPortalData();
  }
}, { immediate: true });

const phase = computed(() => dropPhase(dropEvent.value, now.value));

// Fila (task 17): storefront/{slug}/drop/events/{id}/queue, só no detalhe do drop.
const queueEventId = computed(() => (currentPage.value === 'detail' ? selectedEventId.value : null));
const queue = useDropQueue(queueEventId, now);
const queueStatusId = computed(() => queue.entry.value?.queueEntryStatusId ?? null);

// A compra abre com a vez liberada. Se a vez expira ou a entrada é removida, o modal
// fecha; compra concluída (4) mantém o modal aberto para mostrar a confirmação.
watch(queueStatusId, (statusId) => {
  if ([QUEUE_STATUS.EXPIRED, QUEUE_STATUS.REMOVED].includes(statusId)) isCheckoutOpen.value = false;
});

// Estoque: relê o detalhe a cada 4 s com a fila aberta ou o drop em andamento; uma
// leitura só nas outras fases. Erro mantém o último saldo na tela. Aba oculta pausa.
const STOCK_POLL_MS = 4000;
const pollingActive = computed(() => currentPage.value === 'detail' && Boolean(dropEvent.value) && ['queue', 'live'].includes(phase.value));
watch([pollingActive, selectedEventId], ([active, eventId]) => {
  if (!active) return;
  const timer = setInterval(async () => {
    if (document.visibilityState === 'hidden' || isStockRefreshing.value) return;
    isStockRefreshing.value = true;
    try {
      const fresh = await getDropEvent(eventId);
      if (selectedEventId.value === eventId) dropEvent.value = fresh;
    } catch {
      /* mantém o último saldo; a próxima volta tenta de novo */
    } finally {
      isStockRefreshing.value = false;
    }
  }, STOCK_POLL_MS);
  onWatcherCleanup(() => clearInterval(timer));
}, { immediate: true });

const handleSelectEvent = (eventId) => {
  navigate(`/drops/${eventId}`);
};

const goToPortal = () => navigate('/');
const goToVitrine = () => navigate('/vitrine');
const goToProduct = (slug) => navigate(`/vitrine/p/${encodeURIComponent(slug)}`);
const goToCart = () => navigate('/sacola');

const STORE_PAGES = ['vitrine', 'product', 'product-legacy', 'cart', 'checkout'];
const ACCOUNT_PAGES = ['account', 'account-orders', 'account-order', 'account-notifications', 'account-addresses'];
const isStorePage = computed(() => STORE_PAGES.includes(currentPage.value));
const isOrdersPage = computed(() => ['account-orders', 'account-order'].includes(currentPage.value));
const isDropsPage = computed(() => !isStorePage.value && !ACCOUNT_PAGES.includes(currentPage.value));

// Voltar: detalhe do drop → portal; detalhe do produto e sacola → vitrine.
const backTarget = computed(() => {
  if (currentPage.value === 'detail') return { label: 'Voltar ao portal', go: goToPortal };
  if (currentPage.value === 'product' || currentPage.value === 'cart') return { label: 'Voltar à vitrine', go: goToVitrine };
  return null;
});

// Informação de sistema (não é status do drop): de onde vêm os dados e a hora virtual.
const environmentLabel = computed(() => {
  if (!IS_MOCK) return 'Produção';
  return `Simulação · ${virtualTime.value.toLocaleTimeString('pt-BR')}`;
});

const isDropSoldOut = computed(() => Boolean(dropEvent.value?.soldOut));

// Badge ao lado do h1, conforme o mapa de estados de design-system/components/badge.md.
const dropBadge = computed(() => {
  const ev = dropEvent.value;
  if (!ev) return null;
  if (phase.value === 'ended') return { variant: 'ds-badge--done', label: 'Encerrado' };
  if (isDropSoldOut.value) return { variant: 'ds-badge--done', label: 'Esgotado' };
  if (phase.value === 'upcoming') {
    const opens = new Date(ev.queueOpensAt ?? ev.dropStartsAt);
    const time = opens.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const sameDay = opens.toDateString() === new Date(now.value).toDateString();
    const day = opens.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return { variant: 'ds-badge--scheduled', label: sameDay ? `Fila abre às ${time}` : `Fila abre ${day} às ${time}` };
  }
  return { variant: 'ds-badge--live', label: 'AO VIVO', live: true };
});
</script>

<template>
  <AdminApp v-if="showAdmin" />

  <div
    v-else-if="showGuest"
    class="ds-app"
  >
    <a
      href="#main"
      class="ds-skip-link"
      @click.prevent="focusMain"
    >Pular para o conteúdo</a>
    <header class="ds-topbar ds-container">
      <a
        class="ds-topbar__brand"
        :href="href('/')"
      >
        <Layers
          :size="24"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        DRP Commerce
      </a>
      <div class="ds-cluster ds-cluster--2">
        <a
          v-if="ADMIN_ENABLED"
          class="ds-btn ds-btn--ghost ds-btn--sm"
          :href="href('/admin')"
        >Sou lojista</a>
        <a
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :href="href('/entrar')"
          :aria-current="route.name === 'login' ? 'page' : undefined"
        >Entrar</a>
        <a
          class="ds-btn ds-btn--primary ds-btn--sm"
          :href="href('/criar-conta')"
          :aria-current="route.name === 'register' ? 'page' : undefined"
        >Criar conta</a>
      </div>
    </header>
    <main
      id="main"
      tabindex="-1"
      class="ds-container ds-page"
    >
      <LandingPage v-if="route.name === 'portal'" />
      <CustomerAuth
        v-else
        :initial-mode="route.name === 'register' ? 'register' : 'login'"
      />
    </main>
  </div>

  <div
    v-else
    class="ds-app"
  >
    <a
      href="#main"
      class="ds-skip-link"
      @click.prevent="focusMain"
    >Pular para o conteúdo</a>

    <header class="ds-topbar ds-container">
      <div class="ds-cluster">
        <button
          v-if="backTarget"
          type="button"
          class="ds-icon-btn ds-tap"
          :aria-label="backTarget.label"
          @click="backTarget.go"
        >
          <ArrowLeft
            :size="20"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="ds-topbar__brand"
          @click="goToPortal"
        >
          <Layers
            :size="24"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ storeName || 'Loja' }}
        </button>
      </div>

      <nav
        class="ds-nav"
        aria-label="Principal"
      >
        <a
          class="ds-nav__item"
          :href="href('/')"
          :aria-current="isDropsPage ? 'page' : undefined"
        >Drops</a>
        <a
          class="ds-nav__item"
          :href="href('/vitrine')"
          :aria-current="isStorePage ? 'page' : undefined"
        >Vitrine</a>
        <a
          class="ds-nav__item"
          :href="href('/conta/pedidos')"
          :aria-current="isOrdersPage ? 'page' : undefined"
        >Meus pedidos</a>
      </nav>

      <div class="ds-cluster ds-cluster--2">
        <a
          class="ds-icon-btn"
          :href="href('/conta/notificacoes')"
          aria-label="Notificações"
          :aria-current="currentPage === 'account-notifications' ? 'page' : undefined"
        >
          <Bell
            :size="20"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </a>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm ds-btn--pill"
          :aria-label="`Abrir sacola: ${bagCount} ${bagCount === 1 ? 'item' : 'itens'}`"
          :aria-current="currentPage === 'cart' ? 'page' : undefined"
          @click="goToCart"
        >
          <ShoppingBag
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ bagCount }}
        </button>
        <a
          class="ds-icon-btn"
          :href="href('/conta')"
          aria-label="Minha conta"
          :aria-current="currentPage === 'account' ? 'page' : undefined"
        >
          <UserRound
            :size="20"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </a>
        <span class="ds-badge ds-badge--inverse">{{ environmentLabel }}</span>
      </div>
    </header>

    <main
      id="main"
      tabindex="-1"
      class="ds-container ds-page ds-stack--8"
    >
      <EventPortal
        v-if="currentPage === 'portal'"
        :events="eventsList"
        :now="now"
        :is-loading="isPortalLoading"
        :error="portalError"
        @select-event="handleSelectEvent"
        @retry="loadPortalData"
      />

      <StoreShowcase
        v-else-if="currentPage === 'vitrine'"
        :category-slug="route.name === 'vitrine-category' ? route.params.slug : ''"
        :query="route.query"
        @select-product="goToProduct"
      />

      <StoreProductDetail
        v-else-if="currentPage === 'product'"
        :slug="route.params.slug"
        @open-bag="goToCart"
      />

      <StoreCart
        v-else-if="currentPage === 'cart'"
        @checkout="navigate('/checkout')"
        @continue-shopping="goToVitrine"
      />

      <StoreCheckout v-else-if="currentPage === 'checkout'" />

      <DropRegistration
        v-else-if="currentPage === 'drop-registration'"
        :event-id="Number(route.params.id)"
      />

      <DropWaitlist
        v-else-if="currentPage === 'drop-waitlist'"
        :event-id="Number(route.params.id)"
      />

      <AccountProfile v-else-if="currentPage === 'account'" />

      <AccountOrders
        v-else-if="isOrdersPage"
        :selected-source="route.params.source ?? null"
        :selected-id="route.params.id ? Number(route.params.id) : null"
      />

      <AccountNotifications v-else-if="currentPage === 'account-notifications'" />
      <AccountAddresses v-else-if="currentPage === 'account-addresses'" />

      <article
        v-else-if="currentPage === 'detail' && dropNotFound"
        class="ds-card ds-empty"
      >
        <p>Drop não encontrado. Ele pode ter sido encerrado ou ainda não foi publicado.</p>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="goToPortal"
        >
          Voltar ao portal
        </button>
      </article>

      <article
        v-else-if="currentPage === 'detail' && dropError"
        class="ds-card ds-empty"
      >
        <p class="ds-text-danger">
          {{ dropError }}
        </p>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="loadEventDetailData(selectedEventId)"
        >
          Tentar de novo
        </button>
      </article>

      <template v-else>
        <div class="ds-cluster ds-cluster--between">
          <h1 class="ds-title">
            {{ dropEvent?.name ?? 'Carregando drop…' }}
          </h1>
          <div aria-live="polite">
            <span
              v-if="dropBadge"
              :class="['ds-badge', dropBadge.variant]"
            >
              <span
                v-if="dropBadge.live"
                class="ds-badge__dot"
                aria-hidden="true"
              />
              {{ dropBadge.label }}
            </span>
          </div>
        </div>

        <section class="ds-grid ds-grid--sidebar">
          <div class="ds-stack--6">
            <ProductDetails :event="dropEvent" />
          </div>

          <div class="ds-stack--6">
            <Countdown
              :event-data="dropEvent"
              :virtual-time="virtualTime"
            />

            <QueueStatus
              :event="dropEvent"
              :now="now"
              :entry="queue.entry.value"
              :seconds-left="queue.secondsLeft.value"
              :eta-minutes="queue.etaMinutes.value"
              :is-loading="queue.isLoading.value"
              :is-joining="queue.isJoining.value"
              :join-error="queue.joinError.value"
              :reconnecting="queue.reconnecting.value"
              @join="queue.join"
              @checkout="isCheckoutOpen = true"
            />

            <StockProgress
              :available="dropEvent?.available ?? null"
              :is-refreshing="isStockRefreshing"
            />

            <nav
              class="ds-card ds-card--sunken ds-stack--3"
              aria-label="Inscrição e lista de espera"
            >
              <span class="ds-label-caps">Antes e depois da fila</span>
              <a
                class="ds-btn ds-btn--secondary ds-btn--block"
                :href="href(`/drops/${selectedEventId}/inscricao`)"
              >
                <ClipboardCheck
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Inscrição prévia
              </a>
              <a
                class="ds-btn ds-btn--secondary ds-btn--block"
                :href="href(`/drops/${selectedEventId}/lista-de-espera`)"
              >
                <ListPlus
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                {{ isDropSoldOut ? 'Entrar na lista de espera' : 'Lista de espera' }}
              </a>
            </nav>
          </div>
        </section>
      </template>
    </main>

    <DropPurchase
      v-if="isCheckoutOpen && dropEvent"
      :event="dropEvent"
      :session="queue.entry.value?.session ?? null"
      :now="now"
      @close="isCheckoutOpen = false; queue.reload()"
      @session-ended="queue.reload()"
      @paid="queue.reload()"
    />

    <SimulationPanel
      v-if="SHOW_SIMULATION && ['portal', 'detail', 'vitrine', 'product', 'cart'].includes(currentPage)"
      :active-event-id="selectedEventId"
      :current-page="currentPage"
      :event-dates="currentPage === 'detail' ? dropEvent : null"
    />
  </div>
</template>
