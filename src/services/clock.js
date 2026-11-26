import { shallowRef } from 'vue';
import { IS_MOCK } from './config';

// Hora do servidor (task 16). Fases do drop e contagens regressivas usam esta hora,
// nunca a do computador: mudar o relógio da máquina não muda nada no modo http.
//   http: Date.now() corrigido pelo cabeçalho Date das respostas do Gateway.
//   mock: Date.now() + o deslocamento do painel de simulação (avança/volta o relógio),
//         guardado no navegador para sobreviver ao F5.
// O cabeçalho Date tem precisão de segundos; só corrige diferenças maiores que 1 s.

const MOCK_OFFSET_KEY = 'veloce_mock_time_offset';

let offsetMs = 0;

const readMockOffset = () => {
  try {
    return Number(localStorage.getItem(MOCK_OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
};

/** Deslocamento do relógio do mock, em ms (reativo para o painel de simulação). */
export const mockTimeOffset = shallowRef(IS_MOCK ? readMockOffset() : 0);

export const setMockTimeOffset = (ms) => {
  mockTimeOffset.value = Math.round(ms);
  try {
    if (mockTimeOffset.value) localStorage.setItem(MOCK_OFFSET_KEY, String(mockTimeOffset.value));
    else localStorage.removeItem(MOCK_OFFSET_KEY);
  } catch {
    /* sem storage: o deslocamento vale só até o F5 */
  }
};

/** http.js chama a cada resposta com o cabeçalho Date. */
export const syncServerClock = (dateHeader) => {
  const serverTime = Date.parse(dateHeader ?? '');
  if (Number.isNaN(serverTime)) return;
  const diff = serverTime - Date.now();
  if (Math.abs(diff - offsetMs) > 1000) offsetMs = diff;
};

/** @returns {number} milissegundos desde a época, na hora do servidor */
export const serverNow = () => Date.now() + (IS_MOCK ? mockTimeOffset.value : offsetMs);
