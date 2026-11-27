import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import { DEFAULT_PAGE_SIZE } from '../services/paging';
import { useAsync } from './useAsync';

// Busca paginada no servidor (rotas `search`): filtros e página na tela, a
// consulta no back. Mudar um filtro volta à página 1; o termo digitado espera
// uma pausa antes de buscar.
const EMPTY_PAGE = { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, pages: 0 };
const TYPING_DELAY_MS = 350;

export function usePagedSearch(search, initialFilters = {}, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const filters = reactive({ ...initialFilters });
  // Busca com filtro diferente do inicial (a ordem não conta): o vazio vira "sem resultado".
  const isFiltered = computed(() => Object.keys(initialFilters).some((k) => k !== 'sort' && filters[k] !== initialFilters[k]));
  const clearFilters = () => Object.assign(filters, initialFilters);
  const page = ref(1);
  const result = useAsync(() => search({ ...filters, page: page.value, pageSize }), { initial: EMPTY_PAGE });

  let timer = null;
  watch(filters, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (page.value === 1) result.reload();
      else page.value = 1;
    }, TYPING_DELAY_MS);
  });
  watch(page, () => result.reload());
  onScopeDispose(() => clearTimeout(timer));

  return {
    filters,
    isFiltered,
    clearFilters,
    page,
    pageSize,
    items: computed(() => result.data.value?.items ?? []),
    total: computed(() => result.data.value?.total ?? 0),
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    reload: result.reload,
    clear: result.clear,
  };
}
