import { onScopeDispose, ref, shallowRef } from 'vue';

// Carrega dados com os estados de patterns/states.md:
//   isLoading     só na primeira carga (a tela mostra esqueleto)
//   isRefreshing  recargas seguintes (a tela mantém o dado e troca só os números)
//   error         ApiError da última tentativa; o último `data` bom é mantido
export function useAsync(loader, { immediate = true, initial = null } = {}) {
  const data = shallowRef(initial);
  const error = shallowRef(null);
  const isLoading = ref(immediate);
  const isRefreshing = ref(false);
  let version = 0;
  let disposed = false;

  const run = async (...args) => {
    const current = ++version;
    const first = data.value === initial;
    if (first) isLoading.value = true;
    else isRefreshing.value = true;
    try {
      const result = await loader(...args);
      if (current === version && !disposed) {
        data.value = result;
        error.value = null;
      }
      return result;
    } catch (err) {
      if (current === version && !disposed) error.value = err;
      return undefined;
    } finally {
      if (current === version && !disposed) {
        isLoading.value = false;
        isRefreshing.value = false;
      }
    }
  };

  onScopeDispose(() => {
    disposed = true;
  });

  if (immediate) run();

  return { data, error, isLoading, isRefreshing, reload: run };
}

// Ação do usuário (salvar, aprovar…): estado de envio + mensagem de erro/sucesso.
export function useAction(action) {
  const isPending = ref(false);
  const error = shallowRef(null);
  const done = ref(false);

  const run = async (...args) => {
    isPending.value = true;
    error.value = null;
    done.value = false;
    try {
      const result = await action(...args);
      done.value = true;
      return result;
    } catch (err) {
      error.value = err;
      return undefined;
    } finally {
      isPending.value = false;
    }
  };

  return { run, isPending, error, done };
}
