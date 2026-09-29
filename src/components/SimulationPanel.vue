<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Settings, RefreshCw, Sliders, Terminal, ChevronDown, ChevronUp } from '@lucide/vue';
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

const logColors = (log) => ({
  method: log.method === 'GET' ? '#00E5FF' : '#FF1744',
  status: log.status >= 200 && log.status < 300 ? '#4CAF50' : '#FF5252',
});

const toggleLog = (id) => {
  expandedLogId.value = expandedLogId.value === id ? null : id;
};

const actionBtnStyle = {
  background: '#1F242F',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  padding: '6px 8px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 'bold',
  transition: 'all 0.2s',
  textAlign: 'center',
};

const smallBtnStyle = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.6)',
  padding: '4px 6px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  flex: 1,
  textAlign: 'center',
  transition: 'all 0.2s',
};

const sectionTitleStyle = { color: '#fff', fontSize: '0.8rem', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' };

const tabStyle = (tab) => ({
  flex: 1,
  padding: '10px',
  background: activeTab.value === tab ? 'transparent' : '#161B22',
  border: 'none',
  color: activeTab.value === tab ? '#fff' : 'rgba(255,255,255,0.6)',
  borderBottom: activeTab.value === tab ? '2px solid hsl(var(--color-primary))' : 'none',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 'bold',
});

const preStyle = { margin: 0, padding: '6px', background: '#161B22', overflowX: 'auto', borderRadius: '4px', color: '#A0AEC0' };
const preLabelStyle = { color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '4px' };
</script>

<template>
  <div
    :style="{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      fontFamily: 'monospace',
    }"
  >
    <button
      :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        borderRadius: '9999px',
        background: isOpen ? '#1D212A' : 'linear-gradient(135deg, #FF1744, #7C4DFF)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }"
      @click="isOpen = !isOpen"
    >
      <Settings :size="16" />
      {{ isOpen ? 'Fechar Simulador' : 'Abrir Painel de Simulação (Dev)' }}
    </button>

    <div
      v-if="isOpen"
      :style="{
        width: '400px',
        maxHeight: '580px',
        background: '#0D1017',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 20px rgba(124, 77, 255, 0.15)',
        marginTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#E2E8F0',
        animation: 'slideUp 0.3s ease-out forwards',
      }"
    >
      <div
        :style="{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#161B22',
        }"
      >
        <span :style="{ fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#FF5252' }">
          <Sliders :size="14" /> SIMULADOR // MULTI-EVENTO
        </span>
        <div :style="{ display: 'flex', gap: '8px' }">
          <button
            title="Reset Database"
            :style="{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: '2px',
            }"
            @click="handleReset"
            @mouseover="(e) => e.currentTarget.style.color = '#fff'"
            @mouseout="(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'"
          >
            <RefreshCw :size="14" />
          </button>
        </div>
      </div>

      <div
        :style="{
          background: 'rgba(124, 77, 255, 0.08)',
          padding: '8px 16px',
          fontSize: '0.75rem',
          borderBottom: '1px solid rgba(124, 77, 255, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
        }"
      >
        <span>🕒 Hora Virtual:</span>
        <span :style="{ color: 'hsl(var(--color-secondary))', fontWeight: 'bold' }">{{ virtualClockString() }}</span>
      </div>

      <div
        :style="{
          background: '#161B22',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          gap: '10px'
        }"
      >
        <span :style="{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }">Alvo do Simulador:</span>
        <span
          v-if="currentPage === 'detail'"
          :style="{ fontSize: '0.75rem', fontWeight: 'bold', color: 'hsl(var(--color-primary))' }"
        >
          {{ currentEventSim.name }} (ID: {{ targetEventId }})
        </span>
        <select
          v-else
          v-model.number="targetEventId"
          :style="{
            background: '#0D1017',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            cursor: 'pointer'
          }"
        >
          <option :value="1">
            Sneaker (ID: 1)
          </option>
          <option :value="2">
            Hoodie (ID: 2)
          </option>
          <option :value="3">
            Keyboard (ID: 3)
          </option>
        </select>
      </div>

      <div :style="{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)' }">
        <button
          :style="tabStyle('controls')"
          @click="activeTab = 'controls'"
        >
          CONTROLES DE ESTADO
        </button>
        <button
          :style="{ ...tabStyle('logs'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }"
          @click="activeTab = 'logs'"
        >
          <Terminal :size="12" />
          REDE ({{ logs.length }})
        </button>
      </div>

      <div :style="{ overflowY: 'auto', padding: '16px', flex: 1, fontSize: '0.8rem' }">
        <div
          v-if="activeTab === 'controls'"
          :style="{ display: 'flex', flexDirection: 'column', gap: '20px' }"
        >
          <div>
            <h4 :style="sectionTitleStyle">
              1. Linha do Tempo (Do Alvo Escolhido)
            </h4>
            <div :style="{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }">
              <button
                :style="actionBtnStyle"
                @click="jumpToPhase('pre_queue')"
              >
                Fila Indisponível
              </button>
              <button
                :style="actionBtnStyle"
                @click="jumpToPhase('in_waiting')"
              >
                Sala de Espera Aberta
              </button>
              <button
                :style="actionBtnStyle"
                @click="jumpToPhase('drop_start')"
              >
                Drop Ao Vivo (LIVE)
              </button>
              <button
                :style="actionBtnStyle"
                @click="jumpToPhase('drop_end')"
              >
                Drop Encerrado
              </button>
            </div>
            <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '6px' }">
              <button
                :style="smallBtnStyle"
                @click="shiftTime(-5)"
              >
                -5 min
              </button>
              <button
                :style="smallBtnStyle"
                @click="shiftTime(-1)"
              >
                -1 min
              </button>
              <button
                :style="smallBtnStyle"
                @click="shiftTime(1)"
              >
                +1 min
              </button>
              <button
                :style="smallBtnStyle"
                @click="shiftTime(5)"
              >
                +5 min
              </button>
            </div>
          </div>

          <div>
            <h4 :style="sectionTitleStyle">
              2. Fila de Espera (Do Alvo Escolhido)
            </h4>
            <div :style="{ marginBottom: '10px' }">
              <div :style="{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }">
                <span>Posição atual na fila:</span>
                <span :style="{ color: 'hsl(var(--color-warning))', fontWeight: 'bold' }">#{{ currentEventSim.currentPosition }}</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                :value="currentEventSim.currentPosition || 0"
                :style="{ width: '100%', accentColor: 'hsl(var(--color-warning))' }"
                @input="(e) => changePosition(parseInt(e.target.value))"
              >
            </div>
            <div :style="{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }">
              <button
                :style="{ ...actionBtnStyle, color: '#4CAF50', borderColor: 'rgba(76,175,80,0.3)' }"
                @click="forceRelease"
              >
                Liberar Checkout
              </button>
              <button
                :style="{ ...actionBtnStyle, color: '#FF5252', borderColor: 'rgba(255,23,68,0.3)' }"
                @click="forceExpire"
              >
                Expirar Sessão
              </button>
            </div>
          </div>

          <div>
            <h4 :style="sectionTitleStyle">
              3. Estoque do Drop (Do Alvo Escolhido)
            </h4>
            <div :style="{ marginBottom: '10px' }">
              <div :style="{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }">
                <span>Unidades vendidas:</span>
                <span :style="{ color: 'hsl(var(--color-secondary))', fontWeight: 'bold' }">
                  {{ currentEventSim.unitsSold }} / {{ currentEventSim.unitsAllocated }} ({{ soldPercent }}%)
                </span>
              </div>
              <input
                type="range"
                min="0"
                :max="currentEventSim.unitsAllocated || 100"
                :value="currentEventSim.unitsSold || 0"
                :style="{ width: '100%', accentColor: 'hsl(var(--color-secondary))' }"
                @input="(e) => changeSoldStock(parseInt(e.target.value))"
              >
            </div>
            <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '8px' }">
              <button
                :style="smallBtnStyle"
                @click="changeSoldStock(0)"
              >
                Limpar Vendas
              </button>
              <button
                :style="smallBtnStyle"
                @click="changeSoldStock((currentEventSim.unitsAllocated || 10) - 5)"
              >
                Últimas 5 Unidades
              </button>
              <button
                :style="{ ...smallBtnStyle, color: '#FF5252' }"
                @click="changeSoldStock(currentEventSim.unitsAllocated || 10)"
              >
                Esgotar Estoque
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="activeTab === 'logs'"
          :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }"
        >
          <div
            v-if="logs.length === 0"
            :style="{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px 0' }"
          >
            Nenhuma requisição de rede interceptada ainda.
          </div>
          <template v-else>
            <div
              v-for="log in logs"
              :key="log.id"
              :style="{
                background: '#161B22',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '6px',
                overflow: 'hidden',
              }"
            >
              <div
                :style="{
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }"
                @click="toggleLog(log.id)"
                @mouseover="(e) => e.currentTarget.style.background = '#21262d'"
                @mouseout="(e) => e.currentTarget.style.background = '#161B22'"
              >
                <div :style="{ display: 'flex', gap: '8px', alignItems: 'center' }">
                  <span :style="{ color: logColors(log).method, fontWeight: 'bold', fontSize: '0.7rem' }">{{ log.method }}</span>
                  <span :style="{ color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }">
                    {{ log.url }}
                  </span>
                </div>
                <div :style="{ display: 'flex', gap: '8px', alignItems: 'center' }">
                  <span :style="{ color: logColors(log).status, fontWeight: 'bold' }">{{ log.status }}</span>
                  <ChevronUp
                    v-if="expandedLogId === log.id"
                    :size="12"
                  />
                  <ChevronDown
                    v-else
                    :size="12"
                  />
                </div>
              </div>

              <div
                v-if="expandedLogId === log.id"
                :style="{
                  padding: '12px',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  background: '#0B0C10',
                  fontSize: '0.7rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }"
              >
                <div>
                  <div :style="preLabelStyle">
                    Request Body:
                  </div>
                  <pre :style="preStyle">{{ log.request }}</pre>
                </div>
                <div>
                  <div :style="preLabelStyle">
                    Response Content:
                  </div>
                  <pre :style="preStyle">{{ log.response }}</pre>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
