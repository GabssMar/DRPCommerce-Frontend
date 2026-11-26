import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { getDropQueueStatus, joinDropQueue, QUEUE_STATUS } from '../services/client-api';

// Fila do drop (task 17). O estado é sempre o último DropQueueStatusResponse do back;
// F5 ou outra aba retomam pela consulta (nada de localStorage). Polling de 3 s
// enquanto aguarda, foi chamado ou está finalizando (o worker do back admite e
// expira a cada 10 s); para nos estados finais e pausa com a aba oculta.
const POLL_MS = 3000;
const ACTIVE = [QUEUE_STATUS.WAITING, QUEUE_STATUS.CALLED, QUEUE_STATUS.CHECKING_OUT];
// Amostras de posição para estimar a espera; sem histórico, só a posição.
const MAX_SAMPLES = 10;
const MIN_SAMPLES = 3;

/**
 * @param {import('vue').Ref<number|null>} eventId
 * @param {import('vue').Ref<number>} now serverNow() em ms
 */
export function useDropQueue(eventId, now) {
  const entry = shallowRef(null);
  const isLoading = ref(false);
  const loadError = shallowRef(null);
  const isJoining = ref(false);
  const joinError = shallowRef(null);
  const reconnecting = ref(false);
  const samples = ref([]);
  let version = 0;

  const record = (status) => {
    if (status?.queueEntryStatusId !== QUEUE_STATUS.WAITING) {
      samples.value = [];
      return;
    }
    const last = samples.value.at(-1);
    if (last && last.position === status.position) return;
    samples.value = [...samples.value, { at: now.value, position: status.position }].slice(-MAX_SAMPLES);
  };

  const apply = (status) => {
    entry.value = status;
    record(status);
  };

  const load = async () => {
    const id = eventId.value;
    const current = ++version;
    if (!id) return;
    isLoading.value = true;
    loadError.value = null;
    try {
      const status = await getDropQueueStatus(id);
      if (current === version) apply(status);
    } catch (err) {
      if (current === version) loadError.value = err;
    } finally {
      if (current === version) isLoading.value = false;
    }
  };

  watch(eventId, () => {
    entry.value = null;
    samples.value = [];
    joinError.value = null;
    load();
  }, { immediate: true });

  // Entrar (ou voltar depois de expirar). O botão fica em loading: clique duplo não duplica.
  const join = async (cpf) => {
    if (isJoining.value) return;
    isJoining.value = true;
    joinError.value = null;
    try {
      apply(await joinDropQueue(eventId.value, cpf));
    } catch (err) {
      joinError.value = err;
    } finally {
      isJoining.value = false;
    }
  };

  let timer = null;
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const poll = async () => {
    if (document.visibilityState === 'hidden') return;
    const id = eventId.value;
    try {
      const status = await getDropQueueStatus(id);
      if (id !== eventId.value) return;
      reconnecting.value = false;
      apply(status);
    } catch (err) {
      // Rede caiu: mantém a posição na tela e segue tentando.
      if (err?.kind === 'network' || err?.kind === 'timeout') reconnecting.value = true;
    }
  };
  watch(() => entry.value?.queueEntryStatusId, (statusId) => {
    stop();
    if (ACTIVE.includes(statusId)) timer = setInterval(poll, POLL_MS);
  }, { immediate: true });
  onScopeDispose(stop);

  const secondsLeft = computed(() => {
    const expiresAt = entry.value?.session?.expiresAt;
    if (!expiresAt) return null;
    return Math.max(0, Math.floor((Date.parse(expiresAt) - now.value) / 1000));
  });

  // Espera estimada pela velocidade real da fila (posições por minuto nas últimas leituras).
  const etaMinutes = computed(() => {
    const list = samples.value;
    if (list.length < MIN_SAMPLES || !entry.value) return null;
    const first = list[0];
    const last = list.at(-1);
    const moved = first.position - last.position;
    const minutes = (last.at - first.at) / 60_000;
    if (moved <= 0 || minutes <= 0) return null;
    return Math.max(1, Math.ceil(entry.value.position / (moved / minutes)));
  });

  return { entry, isLoading, loadError, isJoining, joinError, reconnecting, secondsLeft, etaMinutes, join, reload: load };
}
