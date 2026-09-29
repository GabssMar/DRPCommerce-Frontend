<script setup>
import { computed, ref, watch, onMounted, onUnmounted, onWatcherCleanup } from 'vue';
import { ShieldCheck, Layers, ArrowLeft, ShoppingBag } from '@lucide/vue';
import { api, getVirtualTime, subscribeToSimState } from './services/api';
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

const currentPage = ref('portal');
const selectedEventId = ref(1);
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
// Sacola: [{ productId, quantity }], guardada no navegador por conveniência (sobrevive ao F5).
const BAG_KEY = 'veloce_store_bag';
const readBag = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(BAG_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
const bag = ref(readBag());
watch(bag, (items) => {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(items));
  } catch {
    /* storage bloqueado: a sacola vale só nesta sessão */
  }
}, { deep: true });

const selectedProductId = ref(null);
const storeOrder = ref(null);
const isPlacingOrder = ref(false);
const storeOrderError = ref('');

const bagItemIds = computed(() => bag.value.map((i) => i.productId));
const bagCount = computed(() => bag.value.reduce((sum, i) => sum + i.quantity, 0));
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

// A vitrine envia só o id (1 unidade); o detalhe envia { productId, quantity }.
const addToBag = (payload) => {
  const { productId, quantity } = typeof payload === 'number' ? { productId: payload, quantity: 1 } : payload;
  const existing = bag.value.find((i) => i.productId === productId);
  if (existing) existing.quantity += quantity;
  else bag.value = [...bag.value, { productId, quantity }];
  storeOrder.value = null;
};

const updateBagQuantity = ({ productId, quantity }) => {
  const item = bag.value.find((i) => i.productId === productId);
  if (item) item.quantity = quantity;
};

const removeFromBag = (productId) => {
  bag.value = bag.value.filter((i) => i.productId !== productId);
};

const placeStoreOrder = async () => {
  isPlacingOrder.value = true;
  storeOrderError.value = '';
  try {
    const response = await api.createStoreOrder(bag.value.map(({ productId, quantity }) => ({ productId, quantity })));
    if (response.isSuccess) {
      storeOrder.value = response.content;
      bag.value = [];
      loadStoreData(); // estoque mudou
    } else {
      storeOrderError.value = response.listMessageErrors?.[0] || 'Não foi possível finalizar o pedido.';
    }
  } catch (err) {
    console.error('Store order failed', err);
    storeOrderError.value = 'Não conseguimos finalizar o pedido. Verifique sua conexão e tente de novo.';
  } finally {
    isPlacingOrder.value = false;
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
  } else if (page === 'product' || page === 'cart') {
    // catálogo já carregado
  } else {
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
  selectedEventId.value = eventId;
  currentPage.value = 'detail';
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

const goToPortal = () => {
  currentPage.value = 'portal';
};

const goToVitrine = () => {
  currentPage.value = 'vitrine';
  storeOrder.value = null;
};

const goToProduct = (productId) => {
  selectedProductId.value = productId;
  currentPage.value = 'product';
};

const goToCart = () => {
  currentPage.value = 'cart';
};

const STORE_PAGES = ['vitrine', 'product', 'cart'];
const isStorePage = computed(() => STORE_PAGES.includes(currentPage.value));

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

// Badge ao lado do h1, conforme o mapa de estados de design-system/components/badge.md.
const dropBadge = computed(() => {
  const ev = eventData.value;
  if (!ev) return null;
  if (successOrder.value) return { variant: 'ds-badge--success', label: 'Pedido confirmado' };

  const now = virtualTime.value;
  if (now >= new Date(ev.dropEndsAt)) return { variant: 'ds-badge--done', label: 'Encerrado' };

  const product = productData.value;
  if (product && product.unitsSold >= product.unitsAllocated) return { variant: 'ds-badge--done', label: 'Esgotado' };

  const queueOpens = new Date(ev.queueOpensAt);
  if (now < queueOpens) {
    const time = queueOpens.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { variant: 'ds-badge--scheduled', label: `Abre em ${time}` };
  }
  return { variant: 'ds-badge--live', label: 'AO VIVO', live: true };
});
</script>

<template>
  <div class="ds-app">
    <a
      href="#main"
      class="ds-skip-link"
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
        aria-label="Tipo de compra"
      >
        <button
          type="button"
          class="ds-nav__item"
          :aria-current="!isStorePage ? 'page' : undefined"
          @click="goToPortal"
        >
          Drops
        </button>
        <button
          type="button"
          class="ds-nav__item"
          :aria-current="isStorePage ? 'page' : undefined"
          @click="goToVitrine"
        >
          Vitrine
        </button>
      </nav>

      <div class="ds-cluster ds-cluster--2">
        <button
          v-if="isStorePage"
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
        :is-submitting="isPlacingOrder"
        :error="storeOrderError"
        :order="storeOrder"
        @update-quantity="updateBagQuantity"
        @remove="removeFromBag"
        @checkout="placeStoreOrder"
        @select-product="goToProduct"
        @continue-shopping="goToVitrine"
      />

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
      :active-event-id="selectedEventId"
      :current-page="currentPage"
    />
  </div>
</template>
