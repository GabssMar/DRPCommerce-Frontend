import { onScopeDispose, shallowRef } from 'vue';
import { serverNow } from '../services/clock';

// Relógio reativo para contagens regressivas. Um intervalo por tela.
export function useNow(intervalMs = 1000) {
  const now = shallowRef(Date.now());
  const timer = setInterval(() => {
    now.value = Date.now();
  }, intervalMs);
  onScopeDispose(() => clearInterval(timer));
  return now;
}

// Hora do servidor (services/clock.js), para fases do drop e contagens regressivas.
export function useServerNow(intervalMs = 1000) {
  const now = shallowRef(serverNow());
  const timer = setInterval(() => {
    now.value = serverNow();
  }, intervalMs);
  onScopeDispose(() => clearInterval(timer));
  return now;
}
