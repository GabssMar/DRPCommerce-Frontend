
const STORAGE_KEYS = {
  SIM_SETTINGS: 'veloce_sim_settings_v2',
  QUEUE_ENTRY_PREFIX: 'veloce_queue_entry_',
  ORDER_SUCCESS_PREFIX: 'veloce_order_success_',
};

const getInitialDatesForEvent = (offsetMinutes = 0) => {
  const now = new Date();
  
  const queueOpensAt = new Date(now.getTime() + (1 + offsetMinutes) * 60 * 1000);
  const dropStartsAt = new Date(now.getTime() + (5 + offsetMinutes) * 60 * 1000);
  const dropEndsAt = new Date(now.getTime() + (30 + offsetMinutes) * 60 * 1000);

  return {
    queueOpensAt: queueOpensAt.toISOString(),
    dropStartsAt: dropStartsAt.toISOString(),
    dropEndsAt: dropEndsAt.toISOString(),
  };
};

const defaultSimSettings = {
  isSimulationMode: true,
  simulatedTimeOffset: 0, 
  networkLatency: 350, 
  events: {
    1: {
      id: 1,
      name: "Veloce Cyber Edition S-X1",
      slug: "veloce-cyber-edition-s-x1",
      description: "Protótipo conceitual de alta costura com sola de carbono responsiva, detalhamento estético em polímero neon reativo e microchips de rastreabilidade na blockchain. Apenas 100 unidades produzidas.",
      coverImageUrl: "/drop_sneaker.jpg",
      price: 299.90,
      unitsAllocated: 100,
      unitsSold: 38,
      initialPosition: 145,
      currentPosition: 145,
      queueStatusId: 1, 
      dates: getInitialDatesForEvent(0),
    },
    2: {
      id: 2,
      name: "Veloce Hype Hoodie V2",
      slug: "veloce-hype-hoodie-v2",
      description: "Moletom oversized em algodão egípcio de alta gramatura, com capuz duplo estruturado e estamparia termocrômica reativa que muda de cor conforme a temperatura corporal.",
      coverImageUrl: "/drop_hoodie.jpg",
      price: 189.90,
      unitsAllocated: 50,
      unitsSold: 12,
      initialPosition: 82,
      currentPosition: 82,
      queueStatusId: 1,
      dates: getInitialDatesForEvent(3), 
    },
    3: {
      id: 3,
      name: "CyberBoard RGB Keyboard",
      slug: "cyberboard-rgb-keyboard",
      description: "Teclado mecânico hot-swappable em alumínio anodizado, com switches lineares lubrificados de fábrica, keycaps em policarbonato translúcido e iluminação RGB customizável.",
      coverImageUrl: "/drop_keyboard.jpg",
      price: 449.90,
      unitsAllocated: 30,
      unitsSold: 5,
      initialPosition: 24,
      currentPosition: 24,
      queueStatusId: 1,
      dates: getInitialDatesForEvent(6), 
    }
  }
};

let simSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIM_SETTINGS)) || defaultSimSettings;

if (!simSettings.events || !simSettings.events[1] || !simSettings.events[2]) {
  simSettings = defaultSimSettings;
}

// Dados de catálogo vêm sempre do código; do localStorage só o estado da simulação
// (tempo, fila, vendas). Assim, trocar imagem, nome ou preço aqui vale sem limpar o navegador.
const CATALOG_FIELDS = ['name', 'slug', 'description', 'coverImageUrl', 'price'];
Object.values(defaultSimSettings.events).forEach((defaults) => {
  const saved = simSettings.events[defaults.id];
  if (!saved) return;
  CATALOG_FIELDS.forEach((field) => { saved[field] = defaults[field]; });
});

let apiLogs = [];
const logListeners = new Set();

const addApiLog = (method, url, requestBody, responseStatus, responseBody) => {
  const log = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    method,
    url,
    request: requestBody ? JSON.stringify(requestBody, null, 2) : 'None',
    status: responseStatus,
    response: JSON.stringify(responseBody, null, 2)
  };
  apiLogs = [log, ...apiLogs].slice(0, 30); 
  logListeners.forEach(listener => listener(apiLogs));
};

export const subscribeToApiLogs = (callback) => {
  logListeners.add(callback);
  callback(apiLogs);
  return () => logListeners.delete(callback);
};

const simStateListeners = new Set();
export const subscribeToSimState = (callback) => {
  simStateListeners.add(callback);
  callback(simSettings);
  return () => simStateListeners.delete(callback);
};

const notifySimState = () => {
  localStorage.setItem(STORAGE_KEYS.SIM_SETTINGS, JSON.stringify(simSettings));
  simStateListeners.forEach(listener => listener({ ...simSettings }));
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createEnvelope = (isSuccess, content, errors = []) => ({
  isSuccess,
  content,
  listMessageErrors: errors
});

export const getVirtualTime = () => {
  return new Date(Date.now() + simSettings.simulatedTimeOffset);
};

// Catálogo regular da vitrine (cliente casual, sem fila). Formato do produto do
// StoreCommerce; imageUrl é opcional: sem imagem, o card mostra um placeholder.
// Imagens em public/vitrine_*.jpg.
const storeCatalog = [
  { id: 101, name: "Tênis Canvas Hi", sku: "VLC-TEN-101", category: "Tênis", description: "Cano alto em lona, biqueira de borracha e solado vulcanizado. Ilhoses metálicos e cadarço de algodão.", price: 349.90, stockQuantity: 42, imageUrl: "/vitrine_cano_alto.jpg", isActive: true },
  { id: 102, name: "Tênis Court Low", sku: "VLC-TEN-102", category: "Tênis", description: "Cano baixo em camurça e couro, palmilha acolchoada e solado de borracha em contraste.", price: 279.90, stockQuantity: 4, imageUrl: "/vitrine_cano_baixo.jpg", isActive: true },
  { id: 103, name: "Moletom Zip Hoodie", sku: "VLC-MOL-103", category: "Vestuário", description: "Moletom flanelado com zíper frontal, capuz com cordão e bolsos laterais.", price: 219.90, stockQuantity: 18, imageUrl: "/vitrine_moletom.jpg", isActive: true },
  { id: 104, name: "Camiseta Oversized Stonewashed", sku: "VLC-CAM-104", category: "Vestuário", description: "Algodão de gramatura alta com lavagem estonada, modelagem ampla e gola canelada.", price: 99.90, stockQuantity: 60, imageUrl: "/vitrine_oversized.jpg", isActive: true },
  { id: 105, name: "Calça Cargo Jeans Wide", sku: "VLC-CAL-105", category: "Vestuário", description: "Jeans com lavagem estonada, cós com elástico, perna ampla e bolsos cargo laterais.", price: 259.90, stockQuantity: 0, imageUrl: "/vitrine_cargo.jpg", isActive: true },
  { id: 106, name: "Boné Destroyed Star", sku: "VLC-BON-106", category: "Acessórios", description: "Sarja estonada com estrelas aplicadas, costuras aparentes e aba com acabamento puído.", price: 89.90, stockQuantity: 25, imageUrl: "/vitrine_bone.jpg", isActive: true },
  { id: 107, name: "Mochila Classic", sku: "VLC-MOC-107", category: "Acessórios", description: "Poliéster resistente, compartimento principal amplo e bolso frontal com zíper.", price: 229.90, stockQuantity: 9, imageUrl: "/vitrine_mochila.jpg", isActive: true },
  { id: 108, name: "Mousepad XL Art", sku: "VLC-MPD-108", category: "Periféricos", description: "Estampa ilustrada em tecido de deslize suave, base emborrachada antiderrapante e bordas costuradas.", price: 129.90, stockQuantity: 33, imageUrl: "/vitrine_mousepad.jpg", isActive: true },
];

export const api = {
  
  getSettings() {
    return simSettings;
  },

  resetSimulation() {
    simSettings = {
      ...defaultSimSettings,
      events: {
        1: { ...defaultSimSettings.events[1], dates: getInitialDatesForEvent(0) },
        2: { ...defaultSimSettings.events[2], dates: getInitialDatesForEvent(3) },
        3: { ...defaultSimSettings.events[3], dates: getInitialDatesForEvent(6) }
      }
    };
    
    [1, 2, 3].forEach(id => {
      localStorage.removeItem(`${STORAGE_KEYS.QUEUE_ENTRY_PREFIX}${id}`);
      localStorage.removeItem(`${STORAGE_KEYS.ORDER_SUCCESS_PREFIX}${id}`);
    });
    
    notifySimState();
    apiLogs = [];
    logListeners.forEach(listener => listener(apiLogs));
  },

  updateSettings(newSettings) {
    
    if (newSettings.isSimulationMode !== undefined) simSettings.isSimulationMode = newSettings.isSimulationMode;
    if (newSettings.simulatedTimeOffset !== undefined) simSettings.simulatedTimeOffset = newSettings.simulatedTimeOffset;
    if (newSettings.networkLatency !== undefined) simSettings.networkLatency = newSettings.networkLatency;

    if (newSettings.events !== undefined) {
      simSettings.events = { ...simSettings.events, ...newSettings.events };
    }

    notifySimState();
  },

  updateEventSettings(eventId, eventSettings) {
    if (!simSettings.events[eventId]) return;
    simSettings.events[eventId] = {
      ...simSettings.events[eventId],
      ...eventSettings
    };

    if (simSettings.events[eventId].currentPosition <= 0 && simSettings.events[eventId].queueStatusId === 1) {
      simSettings.events[eventId].queueStatusId = 2; 
    }

    notifySimState();
  },

  async getAllDropEvents() {
    const url = `/api/drop-event/GetAll`;

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency);

      const eventsArray = Object.values(simSettings.events).map(ev => ({
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

      const response = createEnvelope(true, eventsArray);
      addApiLog('GET', url, null, 200, response);
      return response;
    } else {
      try {
        const res = await fetch(url);
        const data = await res.json();
        addApiLog('GET', url, null, res.status, data);
        return data;
      } catch (err) {
        addApiLog('GET', url, null, 500, { message: err.message });
        throw err;
      }
    }
  },

  async getDropEvent(id) {
    const url = `/api/drop-event/GetById/${id}`;
    
    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency);
      
      const ev = simSettings.events[id];
      if (!ev) {
        const errResponse = createEnvelope(false, null, ["Evento de drop não encontrado."]);
        addApiLog('GET', url, null, 404, errResponse);
        return errResponse;
      }

      const response = createEnvelope(true, {
        id: ev.id,
        enterpriseId: 1,
        productId: ev.id,
        name: ev.name,
        slug: ev.slug,
        description: ev.description,
        coverImageUrl: ev.coverImageUrl,
        bannerImageUrl: ev.coverImageUrl,
        statusId: 1,
        totalUnitsAvailable: ev.unitsAllocated,
        unitsReserved: 0,
        unitsSold: ev.unitsSold,
        price: ev.price,
        requiresRegistration: true,
        isPublic: true,
        registrationStartsAt: ev.dates.queueOpensAt,
        registrationEndsAt: ev.dates.dropStartsAt,
        queueOpensAt: ev.dates.queueOpensAt,
        dropStartsAt: ev.dates.dropStartsAt,
        dropEndsAt: ev.dates.dropEndsAt
      });
      
      addApiLog('GET', url, null, 200, response);
      return response;
    } else {
      try {
        const res = await fetch(url);
        const data = await res.json();
        addApiLog('GET', url, null, res.status, data);
        return data;
      } catch (err) {
        addApiLog('GET', url, null, 500, { message: err.message });
        throw err;
      }
    }
  },

  async joinQueue(dropEventId, customerId = 1) {
    const url = `/api/queue-entry/Add`;
    const payload = {
      dropEventId,
      customerId,
      deviceFingerprint: "fingerprint_md5_77f48",
      ipAddress: "189.122.35.4",
      userAgent: window.navigator.userAgent,
      enteredAt: new Date().toISOString()
    };

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency);

      if (localStorage.getItem(`${STORAGE_KEYS.ORDER_SUCCESS_PREFIX}${dropEventId}`)) {
        const errorRes = createEnvelope(false, null, ["Você já adquiriu uma unidade deste drop. Limite de 1 por cliente."]);
        addApiLog('POST', url, payload, 400, errorRes);
        return errorRes;
      }
      
      const ev = simSettings.events[dropEventId];
      const newQueueEntry = {
        id: 4000 + dropEventId * 100 + Math.floor(Math.random()*90),
        dropEventId,
        customerId,
        sessionToken: `session_jwt_${dropEventId}_` + Math.random().toString(36).substr(2, 9),
        position: ev.initialPosition,
        statusId: 1, 
        deviceFingerprint: payload.deviceFingerprint,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
        enteredAt: payload.enteredAt,
        calledAt: null,
        expiredAt: null,
        checkedOutAt: null
      };

      localStorage.setItem(`${STORAGE_KEYS.QUEUE_ENTRY_PREFIX}${dropEventId}`, JSON.stringify(newQueueEntry));
      
      const response = createEnvelope(true, newQueueEntry);
      addApiLog('POST', url, payload, 201, response);
      return response;
    } else {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        addApiLog('POST', url, payload, res.status, data);
        return data;
      } catch (err) {
        addApiLog('POST', url, payload, 500, { message: err.message });
        throw err;
      }
    }
  },

  async getQueueStatus(queueEntryId, dropEventId) {
    const url = `/api/queue-entry/GetById/${queueEntryId}`;

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency / 2);
      
      const ev = simSettings.events[dropEventId];
      if (!ev) {
        return createEnvelope(false, null, ["Evento correspondente não encontrado no simulador."]);
      }

      if (ev.queueStatusId === 1 && ev.currentPosition > 0) {
        const reduction = Math.floor(Math.random() * 3) + 1;
        ev.currentPosition = Math.max(0, ev.currentPosition - reduction);
        if (ev.currentPosition === 0) {
          ev.queueStatusId = 2; 
        }
        notifySimState();
      }

      const localEntry = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.QUEUE_ENTRY_PREFIX}${dropEventId}`)) || { id: queueEntryId };
      const calledAtDate = ev.queueStatusId === 2 ? new Date().toISOString() : null;
      
      const response = createEnvelope(true, {
        ...localEntry,
        position: ev.currentPosition,
        statusId: ev.queueStatusId,
        calledAt: calledAtDate,
        expiredAt: ev.queueStatusId === 3 ? new Date().toISOString() : null
      });

      addApiLog('GET', url, null, 200, response);
      return response;
    } else {
      try {
        const res = await fetch(url);
        const data = await res.json();
        addApiLog('GET', url, null, res.status, data);
        return data;
      } catch (err) {
        addApiLog('GET', url, null, 500, { message: err.message });
        throw err;
      }
    }
  },

  async getDropProduct(dropEventId) {
    const url = `/api/drop-product?dropEventId=${dropEventId}`;

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency);

      const ev = simSettings.events[dropEventId];
      if (!ev) {
        return createEnvelope(false, null, ["Produto não cadastrado para este evento."]);
      }

      const virtualNow = getVirtualTime();
      const dropStart = new Date(ev.dates.dropStartsAt);
      const dropEnd = new Date(ev.dates.dropEndsAt);

      if (virtualNow >= dropStart && virtualNow <= dropEnd && ev.unitsSold < ev.unitsAllocated) {
        if (Math.random() < 0.12) {
          const addedSold = Math.floor(Math.random() * 2) + 1;
          ev.unitsSold = Math.min(ev.unitsAllocated, ev.unitsSold + addedSold);
          notifySimState();
        }
      }

      const response = createEnvelope(true, [
        {
          id: dropEventId,
          dropEventId,
          productId: dropEventId,
          sku: `DROP-SKU-00${dropEventId}`,
          unitsAllocated: ev.unitsAllocated,
          unitsSold: ev.unitsSold,
          maxPerCustomer: 1,
          price: ev.price,
          isActive: true
        }
      ]);

      addApiLog('GET', url, null, 200, response);
      return response;
    } else {
      try {
        const res = await fetch(url);
        const data = await res.json();
        addApiLog('GET', url, null, res.status, data);
        return data;
      } catch (err) {
        addApiLog('GET', url, null, 500, { message: err.message });
        throw err;
      }
    }
  },

  async createDropOrder(orderData) {
    const url = `/api/drop-order/Add`;
    const eventId = orderData.dropEventId;

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency * 1.5);

      const ev = simSettings.events[eventId];
      if (!ev) {
        return createEnvelope(false, null, ["Dados de drop inválidos."]);
      }

      if (ev.unitsSold >= ev.unitsAllocated) {
        const errorRes = createEnvelope(false, null, ["Estoque esgotado para este produto!"]);
        addApiLog('POST', url, orderData, 400, errorRes);
        return errorRes;
      }

      if (ev.queueStatusId !== 2) {
        const errorRes = createEnvelope(false, null, ["Sessão de fila expirada ou token de reserva inválido."]);
        addApiLog('POST', url, orderData, 403, errorRes);
        return errorRes;
      }

      ev.unitsSold = Math.min(ev.unitsAllocated, ev.unitsSold + 1);
      ev.queueStatusId = 3; 
      notifySimState();

      const orderContent = {
        id: Math.floor(Math.random() * 900000) + 100000,
        dropEventId: eventId,
        customerId: orderData.customerId || 1,
        reservationId: 9000 + eventId,
        couponId: orderData.couponCode === 'DROP10' ? 10 : null,
        statusId: 1,
        paymentStatusId: 1,
        subTotal: ev.price,
        discountAmount: orderData.couponCode === 'DROP10' ? ev.price * 0.10 : 0.00,
        shippingCost: 20.00,
        taxAmount: 0.00,
        totalAmount: orderData.couponCode === 'DROP10' ? ev.price * 0.90 + 20 : ev.price + 20,
        shippingAddressLine: orderData.addressLine,
        shippingCity: orderData.city,
        shippingState: orderData.state,
        shippingZipCode: orderData.zipCode,
        notes: `Priority Checkout Event #${eventId}`,
        createdAt: new Date().toISOString()
      };

      localStorage.setItem(`${STORAGE_KEYS.ORDER_SUCCESS_PREFIX}${eventId}`, JSON.stringify(orderContent));
      localStorage.removeItem(`${STORAGE_KEYS.QUEUE_ENTRY_PREFIX}${eventId}`);

      const response = createEnvelope(true, orderContent);
      addApiLog('POST', url, orderData, 201, response);
      return response;
    } else {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData)
        });
        const data = await res.json();
        addApiLog('POST', url, orderData, res.status, data);
        return data;
      } catch (err) {
        addApiLog('POST', url, orderData, 500, { message: err.message });
        throw err;
      }
    }
  },

  async getStoreProducts() {
    const url = `/api/store/products/get-all`;

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency);
      const response = createEnvelope(true, storeCatalog.filter((p) => p.isActive));
      addApiLog('GET', url, null, 200, response);
      return response;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      addApiLog('GET', url, null, res.status, data);
      return data;
    } catch (err) {
      addApiLog('GET', url, null, 500, { message: err.message });
      throw err;
    }
  },
  // Pedido da vitrine (sem fila): valida estoque, baixa as unidades e devolve o pedido.
  async createStoreOrder(items) {
    const url = `/api/store/orders/add`;
    const payload = { items };

    if (simSettings.isSimulationMode) {
      await delay(simSettings.networkLatency * 1.5);
      const lines = items.map(({ productId, quantity }) => ({ product: storeCatalog.find((p) => p.id === productId), quantity }));
      const unavailable = lines.find(({ product, quantity }) => !product || product.stockQuantity < quantity);
      if (unavailable) {
        const errorRes = createEnvelope(false, null, [`Estoque insuficiente para ${unavailable.product?.name ?? 'um dos itens'}.`]);
        addApiLog('POST', url, payload, 409, errorRes);
        return errorRes;
      }
      lines.forEach(({ product, quantity }) => { product.stockQuantity -= quantity; });
      const subTotal = lines.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
      const shippingCost = 20.00;
      const order = {
        id: Math.floor(Math.random() * 900000) + 100000,
        items: lines.map(({ product, quantity }) => ({ productId: product.id, name: product.name, quantity, unitPrice: product.price })),
        subTotal,
        shippingCost,
        totalAmount: subTotal + shippingCost,
        createdAt: new Date().toISOString(),
      };
      const response = createEnvelope(true, order);
      addApiLog('POST', url, payload, 201, response);
      return response;
    }

    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      addApiLog('POST', url, payload, res.status, data);
      return data;
    } catch (err) {
      addApiLog('POST', url, payload, 500, { message: err.message });
      throw err;
    }
  }
};