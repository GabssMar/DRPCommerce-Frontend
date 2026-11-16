<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Settings, RefreshCw, Terminal, ChevronDown, ChevronUp } from '@lucide/vue';
import { api, subscribeToApiLogs, subscribeToSimState, getVirtualTime } from '../services/api';

const props = defineProps({
  activeEventId: { type: Number, default: 1 },
  currentPage: { type: String, default: 'portal' },
});

const isOpen = ref(false);
const logs = ref([]);
const simState = ref(api.getSettings());
const activeTab = ref('controls');
const expandedLogId = ref(null);
const targetEventId = ref(props.activeEventId);

watch(() => [props.activeEventId, props.currentPage], () => {
  targetEventId.value = props.activeEventId;
});

let unsubscribeLogs = null;
let unsubscribeSim = null;

onMounted(() => {
  unsubscribeLogs = subscribeToApiLogs((newLogs) => {
    logs.value = newLogs;
  });

  unsubscribeSim = subscribeToSimState((newSim) => {
    simState.value = newSim;
  });
});

onUnmounted(() => {
  unsubscribeLogs?.();
  unsubscribeSim?.();
});

const currentEventSim = computed(() => simState.value.events[targetEventId.value] || {});

const shiftTime = (minutes) => {
  const msOffset = minutes * 60 * 1000;
  const currentOffset = simState.value.simulatedTimeOffset;
  api.updateSettings({ simulatedTimeOffset: currentOffset + msOffset });
};

const jumpToPhase = (phase) => {
  const now = Date.now();
  const queueTime = new Date(currentEventSim.value.dates.queueOpensAt).getTime();
  const startTime = new Date(currentEventSim.value.dates.dropStartsAt).getTime();
  const endTime = new Date(currentEventSim.value.dates.dropEndsAt).getTime();

  const targetTimes = {
    pre_queue: queueTime - 30 * 1000,
    in_waiting: queueTime + 10 * 1000,
    drop_start: startTime + 10 * 1000,
    drop_end: endTime + 10 * 1000,
  };

  const targetOffset = phase in targetTimes ? targetTimes[phase] - now : 0;
  api.updateSettings({ simulatedTimeOffset: targetOffset });
};

const changePosition = (pos) => {
  api.updateEventSettings(targetEventId.value, { currentPosition: pos });
};

const forceRelease = () => {
  api.updateEventSettings(targetEventId.value, { queueStatusId: 2, currentPosition: 0 });
};

const forceExpire = () => {
  api.updateEventSettings(targetEventId.value, { queueStatusId: 3 });
};

const changeSoldStock = (sold) => {
  api.updateEventSettings(targetEventId.value, { unitsSold: sold });
};

const handleReset = () => {
  if (window.confirm('Reiniciar simulação de banco de dados local? Todos os estados de fila e compras serão limpos.')) {
    api.resetSimulation();
    window.location.reload();
  }
};

const virtualClockString = () => {
  const vt = getVirtualTime();
  return vt.toLocaleTimeString('pt-BR') + ' ' + vt.toLocaleDateString('pt-BR');
};

const soldPercent = computed(() => Math.round(((currentEventSim.value.unitsSold || 0) / (currentEventSim.value.unitsAllocated || 1)) * 100));

// Cores do log por significado: método neutro, status verde (2xx) ou vermelho.
const statusClass = (log) => (log.status >= 200 && log.status < 300 ? 'ds-text-success' : 'ds-text-danger');

const toggleLog = (id) => {
  expandedLogId.value = expandedLogId.value === id ? null : id;
};

const timelineActions = [
  { phase: 'pre_queue', label: 'Fila indisponível' },
  { phase: 'in_waiting', label: 'Sala de espera aberta' },
  { phase: 'drop_start', label: 'Drop ao vivo' },
  { phase: 'drop_end', label: 'Drop encerrado' },
];
const timeShifts = [-5, -1, 1, 5];
const shiftLabel = (minutes) => `${minutes > 0 ? '+' : ''}${minutes} min`;
</script>

<template>
  <div class="ds-dock">
    <button
      type="button"
      class="ds-btn ds-btn--secondary ds-btn--pill ds-btn--sm ds-dock__trigger"
      :aria-expanded="isOpen"
      aria-controls="sim-panel"
      @click="isOpen = !isOpen"
    >
      <Settings
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      {{ isOpen ? 'Fechar simulação' : 'Simulação (dev)' }}
    </button>

    <section
      v-if="isOpen"
      id="sim-panel"
      class="ds-dock__panel ds-animate-in"
      aria-label="Painel de simulação"
    >
      <div class="ds-dock__bar">
        <span class="ds-label-caps">Simulação · multi-evento</span>
        <button
          type="button"
          class="ds-icon-btn ds-icon-btn--ghost"
          aria-label="Reiniciar simulação"
          title="Reiniciar simulação"
          @click="handleReset"
        >
          <RefreshCw
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </button>
      </div>

      <div class="ds-dock__bar ds-text-sm">
        <span class="ds-text-secondary">Hora virtual</span>
        <strong class="ds-numeric ds-text-medium">{{ virtualClockString() }}</strong>
      </div>

      <div class="ds-dock__bar ds-text-sm">
        <template v-if="currentPage === 'detail'">
          <span class="ds-text-secondary">Evento</span>
          <strong class="ds-text-medium">{{ currentEventSim.name }} (ID {{ targetEventId }})</strong>
        </template>
        <template v-else>
          <label
            class="ds-text-secondary"
            for="sim-target"
          >Evento</label>
          <select
            id="sim-target"
            v-model.number="targetEventId"
            class="ds-input ds-dock__select"
          >
            <option :value="1">
              Sneaker (ID 1)
            </option>
            <option :value="2">
              Hoodie (ID 2)
            </option>
            <option :value="3">
              Keyboard (ID 3)
            </option>
          </select>
        </template>
      </div>

      <div
        class="ds-dock__bar ds-dock__tabs"
        role="tablist"
        aria-label="Seções da simulação"
      >
        <button
          id="sim-tab-controls"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'controls'"
          aria-controls="sim-body"
          :class="['ds-nav__item', { 'ds-nav__item--active': activeTab === 'controls' }]"
          @click="activeTab = 'controls'"
        >
          Controles
        </button>
        <button
          id="sim-tab-logs"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'logs'"
          aria-controls="sim-body"
          :class="['ds-nav__item', { 'ds-nav__item--active': activeTab === 'logs' }]"
          @click="activeTab = 'logs'"
        >
          <Terminal
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Rede ({{ logs.length }})
        </button>
      </div>

      <div
        id="sim-body"
        class="ds-dock__body"
        role="tabpanel"
        :aria-labelledby="activeTab === 'controls' ? 'sim-tab-controls' : 'sim-tab-logs'"
      >
        <div
          v-if="activeTab === 'controls'"
          class="ds-stack--6"
        >
          <section class="ds-stack--3">
            <h3 class="ds-label-caps">
              1. Linha do tempo
            </h3>
            <div class="ds-dock__actions">
              <button
                v-for="action in timelineActions"
                :key="action.phase"
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                @click="jumpToPhase(action.phase)"
              >
                {{ action.label }}
              </button>
            </div>
            <div class="ds-dock__actions ds-dock__actions--fill">
              <button
                v-for="minutes in timeShifts"
                :key="minutes"
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="shiftTime(minutes)"
              >
                {{ shiftLabel(minutes) }}
              </button>
            </div>
          </section>

          <section class="ds-stack--3">
            <h3 class="ds-label-caps">
              2. Fila de espera
            </h3>
            <div class="ds-field">
              <label
                class="ds-label ds-cluster ds-cluster--between"
                for="sim-position"
              >
                <span>Posição na fila</span>
                <strong class="ds-numeric">#{{ currentEventSim.currentPosition }}</strong>
              </label>
              <input
                id="sim-position"
                type="range"
                min="0"
                max="200"
                class="ds-dock__range"
                :value="currentEventSim.currentPosition || 0"
                @input="(e) => changePosition(parseInt(e.target.value))"
              >
            </div>
            <div class="ds-dock__actions">
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                @click="forceRelease"
              >
                Liberar checkout
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                @click="forceExpire"
              >
                Expirar sessão
              </button>
            </div>
          </section>

          <section class="ds-stack--3">
            <h3 class="ds-label-caps">
              3. Estoque do drop
            </h3>
            <div class="ds-field">
              <label
                class="ds-label ds-cluster ds-cluster--between"
                for="sim-sold"
              >
                <span>Unidades vendidas</span>
                <strong class="ds-numeric">
                  {{ currentEventSim.unitsSold }} / {{ currentEventSim.unitsAllocated }} ({{ soldPercent }}%)
                </strong>
              </label>
              <input
                id="sim-sold"
                type="range"
                min="0"
                class="ds-dock__range"
                :max="currentEventSim.unitsAllocated || 100"
                :value="currentEventSim.unitsSold || 0"
                @input="(e) => changeSoldStock(parseInt(e.target.value))"
              >
            </div>
            <div class="ds-dock__actions ds-dock__actions--fill">
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="changeSoldStock(0)"
              >
                Limpar vendas
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="changeSoldStock((currentEventSim.unitsAllocated || 10) - 5)"
              >
                Últimas 5
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                @click="changeSoldStock(currentEventSim.unitsAllocated || 10)"
              >
                Esgotar
              </button>
            </div>
          </section>
        </div>

        <div
          v-if="activeTab === 'logs'"
          class="ds-stack--2"
        >
          <p
            v-if="logs.length === 0"
            class="ds-empty ds-text-sm"
          >
            Nenhuma requisição interceptada ainda.
          </p>
          <div
            v-for="log in logs"
            v-else
            :key="log.id"
            class="ds-stack--2"
          >
            <button
              type="button"
              class="ds-dock__row ds-text-sm"
              :aria-expanded="expandedLogId === log.id"
              @click="toggleLog(log.id)"
            >
              <span class="ds-dock__row-main">
                <span class="ds-mono ds-text-xs ds-text-medium">{{ log.method }}</span>
                <span class="ds-mono ds-text-xs ds-dock__truncate">{{ log.url }}</span>
              </span>
              <span class="ds-cluster ds-cluster--2">
                <span :class="['ds-numeric ds-text-medium', statusClass(log)]">{{ log.status }}</span>
                <ChevronUp
                  v-if="expandedLogId === log.id"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                <ChevronDown
                  v-else
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </span>
            </button>
            <div
              v-if="expandedLogId === log.id"
              class="ds-stack--2"
            >
              <span class="ds-label-caps">Requisição</span>
              <pre class="ds-code">{{ log.request }}</pre>
              <span class="ds-label-caps">Resposta</span>
              <pre class="ds-code">{{ log.response }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

