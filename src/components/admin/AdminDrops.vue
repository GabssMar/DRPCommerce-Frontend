<script setup>
import { computed, ref } from 'vue';
import { Plus } from '@lucide/vue';
import { useAsync } from '../../composables/useAsync';
import { href } from '../../router';
import { admin } from '../../services/admin-api';
import { DROP_EVENT_STATUS, options } from '../../services/status';
import { brl, formatDateTime, formatNumber, percent } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// Lista de drops (porta de entrada do editor). Rotas: GET drop-events/get-all,
// GET drop-products/get-all (estoque por evento).
defineProps({ params: { type: Object, default: () => ({}) } });

const search = ref('');
const statusId = ref('');

const data = useAsync(async () => {
  const [events, variants] = await Promise.all([admin.dropEvents.getAll(), admin.dropProducts.getAll()]);
  return events.filter((e) => !e.isDeleted).map((e) => {
    const own = variants.filter((v) => v.dropEventId === e.id && !v.isDeleted);
    const allocated = own.reduce((s, v) => s + v.unitsAllocated, 0);
    const sold = own.reduce((s, v) => s + v.unitsSold, 0);
    return { ...e, allocated, sold };
  }).sort((a, b) => Date.parse(b.dropStartsAt) - Date.parse(a.dropStartsAt));
});

const rows = computed(() => (data.data.value ?? []).filter((e) => {
  const term = search.value.trim().toLowerCase();
  if (term && !`${e.name} ${e.slug}`.toLowerCase().includes(term)) return false;
  return !statusId.value || e.dropEventStatusId === Number(statusId.value);
}));
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Drops
    </h1>
    <a
      class="ds-btn ds-btn--primary"
      :href="href('/admin/drops/novo')"
    >
      <Plus
        class="ds-btn__icon"
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Novo drop
    </a>
  </div>

  <div class="ds-toolbar">
    <div class="ds-toolbar__search">
      <label
        class="ds-sr-only"
        for="drops-search"
      >Buscar drop</label>
      <input
        id="drops-search"
        v-model="search"
        class="ds-input"
        type="search"
        placeholder="Nome ou slug"
      >
    </div>
    <label
      class="ds-sr-only"
      for="drops-status"
    >Fase</label>
    <select
      id="drops-status"
      v-model="statusId"
      class="ds-input ds-toolbar__filter"
    >
      <option value="">
        Todas as fases
      </option>
      <option
        v-for="s in options(DROP_EVENT_STATUS)"
        :key="s.id"
        :value="s.id"
      >
        {{ s.label }}
      </option>
    </select>
  </div>

  <div class="ds-card ds-card--flush">
    <LoadState
      :is-loading="data.isLoading.value"
      :error="data.error.value"
      :is-empty="!rows.length"
      empty-text="Nenhum drop encontrado."
      flush
      @retry="data.reload"
    >
      <div class="ds-table-scroll">
        <table class="ds-table">
          <caption class="ds-sr-only">
            Drops da loja
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Drop
              </th>
              <th scope="col">
                Fase
              </th>
              <th scope="col">
                Começa
              </th>
              <th scope="col">
                Vendido
              </th>
              <th
                scope="col"
                class="ds-table__th--numeric"
              >
                Preço
              </th>
              <th scope="col">
                <span class="ds-sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in rows"
              :key="e.id"
            >
              <td>
                <a
                  class="ds-cluster ds-cluster--2"
                  :href="href(`/admin/drops/${e.id}`)"
                >
                  <img
                    class="ds-card__media ds-card__media--thumb ds-card__media--product ds-card__media--sm"
                    :src="e.coverImageUrl"
                    alt=""
                  >
                  <span class="ds-stack--1">
                    <span class="ds-text-medium">{{ e.name }}</span>
                    <span class="ds-text-xs ds-text-secondary ds-mono">{{ e.slug }}</span>
                  </span>
                </a>
              </td>
              <td>
                <StatusBadge
                  :id="e.dropEventStatusId"
                  :table="DROP_EVENT_STATUS"
                  :label="e.dropEventStatusId === 5 ? 'AO VIVO' : ''"
                />
              </td>
              <td class="ds-numeric ds-nowrap">
                {{ formatDateTime(e.dropStartsAt) }}
              </td>
              <td>
                <span class="ds-stack--1">
                  <span class="ds-numeric ds-text-sm">{{ formatNumber(e.sold) }} / {{ formatNumber(e.allocated) }}</span>
                  <span
                    class="ds-meter"
                    role="img"
                    :aria-label="`${percent(e.sold, e.allocated)}% vendido`"
                  ><span
                    class="ds-meter__fill"
                    :style="{ width: `${percent(e.sold, e.allocated)}%` }"
                  /></span>
                </span>
              </td>
              <td class="ds-table__td--numeric">
                {{ brl(e.price) }}
              </td>
              <td>
                <span class="ds-cluster ds-cluster--2 ds-nowrap">
                  <a
                    class="ds-btn ds-btn--ghost ds-btn--sm"
                    :href="href(`/admin/drops/${e.id}/inscricoes`)"
                  >Inscrições</a>
                  <a
                    v-if="[4, 5, 6].includes(e.dropEventStatusId)"
                    class="ds-btn ds-btn--secondary ds-btn--sm"
                    :href="href(`/admin/ao-vivo/${e.id}`)"
                  >Ao vivo</a>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </LoadState>
  </div>
</template>
