import { onScopeDispose, shallowRef } from 'vue';

// Relógio reativo para contagens regressivas. Um intervalo por tela.
export function useNow(intervalMs = 1000) {
  const now = shallowRef(Date.now());
  const timer = setInterval(() => {
    now.value = Date.now();
  }, intervalMs);
  onScopeDispose(() => clearInterval(timer));
  return now;
}
