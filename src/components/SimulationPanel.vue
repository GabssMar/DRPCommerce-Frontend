<script setup>
import { computed, ref, watch } from 'vue';
import { Settings, RefreshCw, Terminal, ChevronDown, ChevronUp } from '@lucide/vue';
import { mockTimeOffset, serverNow, setMockTimeOffset } from '../services/clock';
import { mockDropControl } from '../services/mock/server';
import { requestLog } from '../services/request-log';
import { getDropEvent } from '../services/client-api';
import { useServerNow } from '../composables/useNow';

// Ferramenta de desenvolvimento (só no servidor do Vite, modo mock). Mexe no relógio do
// mock (services/clock.js) e, pelos atalhos de mock/server.js, na fila e no pagamento do
// cliente logado e no estoque do drop. A aba Rede mostra as requisições que a camada de
// dados faria ao Gateway (services/request-log.js).
const props = defineProps({
  activeEventId: { type: Number, default: 1 },
  currentPage: { type: String, default: 'portal' },
  // Drop aberto no detalhe: os atalhos de fase usam as datas dele.
  eventDates: { type: Object, default: null },
});

const EVENT_IDS = [1, 2, 3, 4];

const isOpen = ref(false);
const activeTab = ref('controls');
const expandedLogId = ref(null);
const targetEventId = ref(props.activeEventId);
const queuePosition = ref(20);
const now = useServerNow();

watch(() => [props.activeEventId, props.currentPage], () => {
  targetEventId.value = props.activeEventId;
});

const logs = computed(() => requestLog.value);

const shiftTime = (minutes) => {
  setMockTimeOffset(mockTimeOffset.value + minutes * 60 * 1000);
};

const jumpToPhase = async (phase) => {
  const dates = props.eventDates?.id === targetEventId.value
    ? props.eventDates
    : await getDropEvent(targetEventId.value).catch(() => null);
  if (!dates) return;
  const queueTime = Date.parse(dates.queueOpensAt ?? dates.dropStartsAt);
  const targetTimes = {
    pre_queue: queueTime - 30 * 1000,
    in_waiting: queueTime + 10 * 1000,
    drop_start: Date.parse(dates.dropStartsAt) + 10 * 1000,
    drop_end: Date.parse(dates.dropEndsAt) + 10 * 1000,
  };
  // Novo deslocamento = alvo − hora real (serverNow já inclui o deslocamento atual).
  setMockTimeOffset(targetTimes[phase] - (serverNow() - mockTimeOffset.value));
};

// Fila e pagamento: agem no cliente logado; a tela vê a mudança na próxima leitura.
const changePosition = () => mockDropControl.setPosition(targetEventId.value, Number(queuePosition.value) || 1);
const forceRelease = () => mockDropControl.admit(targetEventId.value);
const forceExpire = () => mockDropControl.expire(targetEventId.value);
const approvePayment = () => mockDropControl.approvePayment(targetEventId.value);
const failPayment = () => mockDropControl.failPayment(targetEventId.value);
const setStock = (mode) => mockDropControl.setStock(targetEventId.value, mode);

// Os dados do mock vivem na memória da aba: recarregar volta ao seed.
const handleReset = () => {
  if (window.confirm('Reiniciar a simulação? O relógio volta ao normal e os dados do mock voltam ao início.')) {
    setMockTimeOffset(0);
    window.location.reload();
  }
};

const virtualClock = computed(() => new Date(now.value).toLocaleString('pt-BR'));

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
        <strong class="ds-numeric ds-text-medium">{{ virtualClock }}</strong>
      </div>

      <div class="ds-dock__bar ds-text-sm">
        <template v-if="currentPage === 'detail'">
          <span class="ds-text-secondary">Evento</span>
          <strong class="ds-text-medium">{{ eventDates?.name ?? 'Drop' }} (ID {{ targetEventId }})</strong>
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
            <option
              v-for="id in EVENT_IDS"
              :key="id"
              :value="id"
            >
              Drop {{ id }}
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
                class="ds-label"
                for="sim-position"
              >Mover para a posição</label>
              <div class="ds-input-group">
                <input
                  id="sim-position"
                  v-model.number="queuePosition"
                  type="number"
                  min="1"
                  class="ds-input"
                >
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  @click="changePosition"
                >
                  Mover
                </button>
              </div>
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
            <div class="ds-dock__actions ds-dock__actions--fill">
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="setStock('clear')"
              >
                Limpar vendas
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="setStock('last')"
              >
                Últimas 5
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                @click="setStock('soldout')"
              >
                Esgotar
              </button>
            </div>
          </section>

          <section class="ds-stack--3">
            <h3 class="ds-label-caps">
              4. Pagamento do drop
            </h3>
            <p class="ds-hint">
              No mock não há Mercado Pago: aprove ou recuse o último pedido pendente deste drop, como o webhook faria.
            </p>
            <div class="ds-dock__actions">
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                @click="approvePayment"
              >
                Aprovar pagamento
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                @click="failPayment"
              >
                Recusar pagamento
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
            Nenhuma requisição ainda.
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
              <span class="ds-label-caps">Corpo enviado · {{ log.at.toLocaleTimeString('pt-BR') }}</span>
              <pre class="ds-code">{{ log.body || '(sem corpo)' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

