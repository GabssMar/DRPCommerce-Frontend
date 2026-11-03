<script setup>
import { computed, ref, watch, onMounted, onUnmounted, onWatcherCleanup } from 'vue';
import { ShieldCheck, Layers, ArrowLeft, ShoppingBag, Bell, UserRound, ListPlus, ClipboardCheck } from '@lucide/vue';
import { api, getVirtualTime, subscribeToSimState } from './services/api';
import { ADMIN_ENABLED } from './services/config';
import { focusMain, href, isAdminRoute, navigate, route } from './router';
import { useBag } from './composables/useBag';
import Countdown from './components/Countdown.vue';
import QueueStatus from './components/QueueStatus.vue';
import StockProgress from './components/StockProgress.vue';
import ProductDetails from './components/ProductDetails.vue';
import CheckoutModal from './components/CheckoutModal.vue';
import SimulationPanel from './components/SimulationPanel.vue';
import EventPortal from './components/EventPortal.vue';
import StoreShowcase from './components/StoreShowcase.vue';
import StoreProductDetail from './components/StoreProductDetail.vue';
import StoreCart from './components/StoreCart.vue';
import StoreCheckout from './components/StoreCheckout.vue';
import DropRegistration from './components/drop/DropRegistration.vue';
import DropWaitlist from './components/drop/DropWaitlist.vue';
import AccountProfile from './components/account/AccountProfile.vue';
import AccountOrders from './components/account/AccountOrders.vue';
import AccountNotifications from './components/account/AccountNotifications.vue';
import AdminApp from './components/admin/AdminApp.vue';

// Telas da loja que ainda rodam sobre o simulador de src/services/api.js
// (portal, detalhe do drop, vitrine, sacola) e as telas novas, que usam a
// camada src/services/ no formato do back-end.
const PAGE_BY_ROUTE = { portal: 'portal', drop: 'detail', vitrine: 'vitrine', product: 'product', cart: 'cart' };
const currentPage = computed(() => PAGE_BY_ROUTE[route.value.name] ?? route.value.name);
const showAdmin = computed(() => ADMIN_ENABLED && isAdminRoute(route.value));

const selectedEventId = ref(1);
const selectedProductId = ref(null);
watch(route, (r) => {
  if (r.name === 'drop') selectedEventId.value = Number(r.params.id) || 1;
  if (r.name === 'product') selectedProductId.value = Number(r.params.id);
  // Em produção sem a flag, #/admin cai no portal, sem mensagem.
  if (isAdminRoute(r) && !ADMIN_ENABLED) navigate('/');
}, { immediate: true });

const eventsList = ref([]);
const eventData = ref(null);
const productData = ref(null);
const queueEntry = ref(null);
const virtualTime = ref(getVirtualTime());
const isCheckoutOpen = ref(false);
const isSubmittingOrder = ref(false);
const successOrder = ref(null);
const isLoading = ref(false);
const secondsToExpiry = ref(600);
const checkoutError = ref('');
const isPortalLoading = ref(true);
const portalError = ref('');

// Vitrine (cliente casual): catálogo regular e sacola local.
const storeProducts = ref([]);
const isStoreLoading = ref(true);
const storeError = ref('');
const { bag, bagCount, addToBag, updateBagQuantity, removeFromBag } = useBag();

const bagItemIds = computed(() => bag.value.map((i) => i.productId));
const productById = (id) => storeProducts.value.find((p) => p.id === id);
const selectedProduct = computed(() => productById(selectedProductId.value) ?? null);
const bagLines = computed(() => bag.value
  .map((i) => ({ product: productById(i.productId), quantity: i.quantity }))
  .filter((l) => l.product));
const quantityInBag = computed(() => bag.value.find((i) => i.productId === selectedProductId.value)?.quantity ?? 0);

const PORTAL_ERROR_MESSAGE = 'Não conseguimos carregar os drops. Verifique sua conexão e tente de novo.';

const loadPortalData = async () => {
  isPortalLoading.value = true;
  try {
    const response = await api.getAllDropEvents();
    if (response.isSuccess) {
      eventsList.value = response.content;
      portalError.value = '';
    } else {
      portalError.value = PORTAL_ERROR_MESSAGE;
    }
  } catch (err) {
    console.error('Portal fetch failed', err);
    portalError.value = PORTAL_ERROR_MESSAGE;
  } finally {
    isPortalLoading.value = false;
  }
};

const loadEventDetailData = async (eventId) => {
  isLoading.value = true;
  successOrder.value = null;
  queueEntry.value = null;
  eventData.value = null;
  productData.value = null;
  secondsToExpiry.value = 600;

  try {
    const eventRes = await api.getDropEvent(eventId);
    if (eventRes.isSuccess) {
      eventData.value = eventRes.content;
    }

    const productRes = await api.getDropProduct(eventId);
    if (productRes.isSuccess && productRes.content?.[0]) {
      productData.value = productRes.content[0];
    }

    const savedQueue = localStorage.getItem(`veloce_queue_entry_${eventId}`);
    if (savedQueue) {
      queueEntry.value = JSON.parse(savedQueue);
    }

    const savedOrder = localStorage.getItem(`veloce_order_success_${eventId}`);
    if (savedOrder) {
      successOrder.value = JSON.parse(savedOrder);
    }
  } catch (err) {
    console.error('Failed to load details for event', eventId, err);
  } finally {
    isLoading.value = false;
  }
};

const loadStoreData = async () => {
  isStoreLoading.value = true;
  try {
    const response = await api.getStoreProducts();
    if (response.isSuccess) {
      storeProducts.value = response.content;
      storeError.value = '';
    } else {
      storeError.value = 'Não conseguimos carregar a vitrine. Verifique sua conexão e tente de novo.';
    }
  } catch (err) {
    console.error('Store fetch failed', err);
    storeError.value = 'Não conseguimos carregar a vitrine. Verifique sua conexão e tente de novo.';
  } finally {
    isStoreLoading.value = false;
  }
};

// Sincroniza a tela com o estado do simulador; reassina ao trocar de evento.
watch(selectedEventId, (eventId) => {
  loadPortalData();

  const unsubscribeSim = subscribeToSimState((newSim) => {
    virtualTime.value = new Date(Date.now() + newSim.simulatedTimeOffset);

    eventsList.value = Object.values(newSim.events).map(ev => ({
      id: ev.id,
      name: ev.name,
      slug: ev.slug,
      description: ev.description,
      coverImageUrl: ev.coverImageUrl,
      price: ev.price,
      totalUnitsAvailable: ev.unitsAllocated,
      unitsSold: ev.unitsSold,
      queueOpensAt: ev.dates.queueOpensAt,
      dropStartsAt: ev.dates.dropStartsAt,
      dropEndsAt: ev.dates.dropEndsAt
    }));

    const evSettings = newSim.events[eventId];
    if (!evSettings) return;

    if (eventData.value) {
      eventData.value = {
        ...eventData.value,
        totalUnitsAvailable: evSettings.unitsAllocated,
        unitsSold: evSettings.unitsSold,
        registrationStartsAt: evSettings.dates.queueOpensAt,
        registrationEndsAt: evSettings.dates.dropStartsAt,
        queueOpensAt: evSettings.dates.queueOpensAt,
        dropStartsAt: evSettings.dates.dropStartsAt,
        dropEndsAt: evSettings.dates.dropEndsAt
      };
    }

    if (productData.value) {
      productData.value = {
        ...productData.value,
        unitsAllocated: evSettings.unitsAllocated,
        unitsSold: evSettings.unitsSold
      };
    }

    if (queueEntry.value) {
      const localSaved = JSON.parse(localStorage.getItem(`veloce_queue_entry_${eventId}`));
      if (!localSaved) {
        queueEntry.value = null;
      } else {
        const updated = {
          ...localSaved,
          position: evSettings.currentPosition,
          statusId: evSettings.queueStatusId
        };
        localStorage.setItem(`veloce_queue_entry_${eventId}`, JSON.stringify(updated));
        queueEntry.value = updated;
      }
    }

    const savedOrder = localStorage.getItem(`veloce_order_success_${eventId}`);
    successOrder.value = savedOrder ? JSON.parse(savedOrder) : null;
  });

  onWatcherCleanup(unsubscribeSim);
}, { immediate: true });

watch([selectedEventId, currentPage], ([eventId, page]) => {
  if (page === 'detail') {
    loadEventDetailData(eventId);
  } else if (page === 'vitrine' || ((page === 'product' || page === 'cart') && !storeProducts.value.length)) {
    loadStoreData();
  } else if (page === 'portal') {
    loadPortalData();
  }
}, { immediate: true });

let clockInterval = null;
onMounted(() => {
  clockInterval = setInterval(() => {
    virtualTime.value = getVirtualTime();
  }, 1000);
});
onUnmounted(() => clearInterval(clockInterval));

// Janela de checkout: conta 600s a partir do momento em que o cliente é chamado.
watch([queueEntry, selectedEventId], ([entry, eventId]) => {
  if (!entry || entry.statusId !== 2) {
    secondsToExpiry.value = 600;
    return;
  }

  const timerId = setInterval(() => {
    if (secondsToExpiry.value <= 1) {
      clearInterval(timerId);
      const expiredEntry = {
        ...entry,
        statusId: 3,
        expiredAt: new Date().toISOString()
      };
      queueEntry.value = expiredEntry;
      localStorage.setItem(`veloce_queue_entry_${eventId}`, JSON.stringify(expiredEntry));
      api.updateEventSettings(eventId, { queueStatusId: 3 });
      isCheckoutOpen.value = false;
      secondsToExpiry.value = 0;
      return;
    }
    secondsToExpiry.value -= 1;
  }, 1000);

  onWatcherCleanup(() => clearInterval(timerId));
}, { immediate: true });

watch([selectedEventId, currentPage], ([eventId, page]) => {
  if (page !== 'detail') return;

  const stockInterval = setInterval(async () => {
    try {
      const res = await api.getDropProduct(eventId);
      if (res.isSuccess && res.content?.[0]) {
        productData.value = {
          ...productData.value,
          unitsSold: res.content[0].unitsSold,
          unitsAllocated: res.content[0].unitsAllocated
        };
      }
    } catch (err) {
      console.error('Stock sync failed', err);
    }
  }, 4000);

  onWatcherCleanup(() => clearInterval(stockInterval));
}, { immediate: true });

const handleSelectEvent = (eventId) => {
  navigate(`/drops/${eventId}`);
};

const handleJoinQueue = async (alreadyUpdatedEntry = null) => {
  if (alreadyUpdatedEntry) {
    queueEntry.value = alreadyUpdatedEntry;
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.joinQueue(selectedEventId.value);
    if (response.isSuccess) {
      queueEntry.value = response.content;
      api.updateEventSettings(selectedEventId.value, {
        currentPosition: response.content.position,
        initialPosition: response.content.position,
        queueStatusId: response.content.statusId
      });
    }
  } catch (err) {
    console.error('Join queue failed', err);
  } finally {
    isLoading.value = false;
  }
};

const handleCheckoutSubmit = async (payload) => {
  isSubmittingOrder.value = true;
  checkoutError.value = '';
  try {
    const response = await api.createDropOrder(payload);
    if (response.isSuccess) {
      successOrder.value = response.content;
      isCheckoutOpen.value = false;
      queueEntry.value = null;
    } else {
      checkoutError.value = response.listMessageErrors?.[0] || 'Erro desconhecido ao processar pedido.';
    }
  } catch (err) {
    console.error('Order submission failed', err);
    checkoutError.value = 'Erro ao conectar com o serviço de pagamento.';
  } finally {
    isSubmittingOrder.value = false;
  }
};

const formatBRL = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const goToPortal = () => navigate('/');
const goToVitrine = () => navigate('/vitrine');
const goToProduct = (productId) => navigate(`/vitrine/${productId}`);
const goToCart = () => navigate('/sacola');

const STORE_PAGES = ['vitrine', 'product', 'cart', 'checkout'];
const ACCOUNT_PAGES = ['account', 'account-orders', 'account-order', 'account-notifications'];
const isStorePage = computed(() => STORE_PAGES.includes(currentPage.value));
const isOrdersPage = computed(() => ['account-orders', 'account-order'].includes(currentPage.value));
const isDropsPage = computed(() => !isStorePage.value && !ACCOUNT_PAGES.includes(currentPage.value));

// Voltar: detalhe do drop → portal; detalhe do produto e sacola → vitrine.
const backTarget = computed(() => {
  if (currentPage.value === 'detail') return { label: 'Voltar ao portal', go: goToPortal };
  if (currentPage.value === 'product' || currentPage.value === 'cart') return { label: 'Voltar à vitrine', go: goToVitrine };
  return null;
});

// Sair da fila: por ora só no simulador; na integração vira POST /queue-entries/leave (task 17).
const handleLeaveQueue = () => {
  const eventId = selectedEventId.value;
  localStorage.removeItem(`veloce_queue_entry_${eventId}`);
  const initial = api.getSettings().events[eventId]?.initialPosition;
  api.updateEventSettings(eventId, { currentPosition: initial, queueStatusId: 1 });
  queueEntry.value = null;
};

// Informação de sistema (não é status do drop): de onde vêm os dados e a hora virtual.
const environmentLabel = computed(() => {
  if (!api.getSettings().isSimulationMode) return 'Produção';
  return `Simulação · ${virtualTime.value.toLocaleTimeString('pt-BR')}`;
});

const isDropSoldOut = computed(() => Boolean(productData.value) && productData.value.unitsSold >= productData.value.unitsAllocated);

// Badge ao lado do h1, conforme o mapa de estados de design-system/components/badge.md.
const dropBadge = computed(() => {
  const ev = eventData.value;
  if (!ev) return null;
  if (successOrder.value) return { variant: 'ds-badge--success', label: 'Pedido confirmado' };

  const now = virtualTime.value;
  if (now >= new Date(ev.dropEndsAt)) return { variant: 'ds-badge--done', label: 'Encerrado' };

  if (isDropSoldOut.value) return { variant: 'ds-badge--done', label: 'Esgotado' };

  const queueOpens = new Date(ev.queueOpensAt);
  if (now < queueOpens) {
    const time = queueOpens.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { variant: 'ds-badge--scheduled', label: `Abre em ${time}` };
  }
  return { variant: 'ds-badge--live', label: 'AO VIVO', live: true };
});
</script>

<template>
  <AdminApp v-if="showAdmin" />

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
          VELOCE // LABS
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
        :virtual-time="virtualTime"
        :is-loading="isPortalLoading"
        :error="portalError"
        @select-event="handleSelectEvent"
        @retry="loadPortalData"
      />

      <StoreShowcase
        v-else-if="currentPage === 'vitrine'"
        :products="storeProducts"
        :is-loading="isStoreLoading"
        :error="storeError"
        :bag-item-ids="bagItemIds"
        @add-to-bag="addToBag"
        @select-product="goToProduct"
        @retry="loadStoreData"
      />

      <StoreProductDetail
        v-else-if="currentPage === 'product'"
        :product="selectedProduct"
        :quantity-in-bag="quantityInBag"
        @add-to-bag="addToBag"
        @open-bag="goToCart"
        @back="goToVitrine"
      />

      <StoreCart
        v-else-if="currentPage === 'cart'"
        :lines="bagLines"
        @update-quantity="updateBagQuantity"
        @remove="removeFromBag"
        @checkout="navigate('/checkout')"
        @select-product="goToProduct"
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

      <template v-else>
        <div class="ds-cluster ds-cluster--between">
          <h1 class="ds-title">
            {{ eventData?.name ?? 'Carregando drop…' }}
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
            <ProductDetails :product-data="eventData ? { ...eventData, price: productData?.price } : null" />
          </div>

          <div class="ds-stack--6">
            <article
              v-if="successOrder"
              class="ds-card ds-animate-in ds-stack--6"
            >
              <header class="ds-card__header">
                <div>
                  <h2 class="ds-card__title">
                    Pedido confirmado
                  </h2>
                  <p class="ds-card__subtitle">
                    Sua vaga prioritária garantiu a reserva com sucesso.
                  </p>
                </div>
                <ShieldCheck
                  class="ds-text-success"
                  :size="24"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </header>

              <dl class="ds-stack--3">
                <div class="ds-cluster ds-cluster--between">
                  <dt class="ds-text-secondary">
                    Pedido
                  </dt>
                  <dd><code>#{{ successOrder.id }}</code></dd>
                </div>
                <div class="ds-cluster ds-cluster--between">
                  <dt class="ds-text-secondary">
                    Reserva
                  </dt>
                  <dd>LockToken confirmado</dd>
                </div>
                <div class="ds-cluster ds-cluster--between">
                  <dt class="ds-text-secondary">
                    Envio para
                  </dt>
                  <dd>{{ successOrder.shippingCity }} - {{ successOrder.shippingState }}</dd>
                </div>
                <div class="ds-cluster ds-cluster--between">
                  <dt class="ds-text-secondary">
                    Valor total
                  </dt>
                  <dd class="ds-numeric">
                    {{ formatBRL(successOrder.totalAmount) }}
                  </dd>
                </div>
              </dl>

              <footer class="ds-card__footer">
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--block"
                  @click="goToPortal"
                >
                  Voltar ao portal
                </button>
              </footer>
            </article>

            <template v-else>
              <Countdown
                :event-data="eventData"
                :virtual-time="virtualTime"
              />

              <QueueStatus
                :event-data="eventData"
                :virtual-time="virtualTime"
                :queue-entry="queueEntry"
                :is-loading="isLoading"
                :seconds-to-expiry="secondsToExpiry"
                @join-queue="handleJoinQueue"
                @leave-queue="handleLeaveQueue"
                @checkout="isCheckoutOpen = true"
              />

              <StockProgress
                :units-allocated="productData?.unitsAllocated"
                :units-sold="productData?.unitsSold"
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
            </template>
          </div>
        </section>
      </template>
    </main>

    <CheckoutModal
      v-if="productData"
      :is-open="isCheckoutOpen"
      :product-data="{ ...productData, name: eventData?.name, dropEventId: selectedEventId }"
      :is-loading="isSubmittingOrder"
      :seconds-to-expiry="secondsToExpiry"
      :error-message="checkoutError"
      @close="isCheckoutOpen = false"
      @submit="handleCheckoutSubmit"
    />

    <SimulationPanel
      v-if="['portal', 'detail', 'vitrine', 'product', 'cart'].includes(currentPage)"
      :active-event-id="selectedEventId"
      :current-page="currentPage"
    />
  </div>
</template>
