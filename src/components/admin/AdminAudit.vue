<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useAsync } from '../../composables/useAsync';
import { admin } from '../../services/admin-api';
import { formatDate, formatDateTime, formatTimeSec, initials, localDayKey } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import PaginationNav from '../ui/PaginationNav.vue';

// E13 · Auditoria. Rotas: GET drop-audit-logs/get-all (detalhe já vem com oldValues e
// newValues), POST employees/get-list-by-list-id (autor), POST customers/get-list-by-list-id.
// Somente leitura: o painel não edita nem exclui registros.
const PAGE_SIZE = 25;

const data = useAsync(async () => {
  const [logs, events] = await Promise.all([admin.dropAuditLogs.getAll(), admin.dropEvents.getAll()]);
  const [employees, customers] = await Promise.all([
    admin.employees.getByIds(logs.map((l) => l.employeeId)),
    admin.customers.getByIds(logs.map((l) => l.customerId)),
  ]);
  return { logs: [...logs].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)), events, employees, customers };
});

const d = computed(() => data.data.value);
const employeeOf = (id) => d.value?.employees.find((e) => e.id === id) ?? null;
const customerOf = (id) => d.value?.customers.find((c) => c.id === id) ?? null;

const filters = reactive({ eventId: '', author: '', entity: '', date: '' });
const page = ref(1);
watch(filters, () => { page.value = 1; });

const entities = computed(() => [...new Set((d.value?.logs ?? []).map((l) => l.entityName))].sort());
const eventsWithLogs = computed(() => {
  const ids = new Set((d.value?.logs ?? []).map((l) => l.dropEventId));
  return (d.value?.events ?? []).filter((e) => ids.has(e.id));
});

const rows = computed(() => (d.value?.logs ?? []).filter((l) => {
  if (filters.eventId && l.dropEventId !== Number(filters.eventId)) return false;
  if (filters.author === 'system' && l.employeeId) return false;
  if (filters.author && filters.author !== 'system' && l.employeeId !== Number(filters.author)) return false;
  if (filters.entity && l.entityName !== filters.entity) return false;
  return !filters.date || localDayKey(l.occurredAt) === filters.date;
}));
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const openId = ref(null);
watch(rows, (list) => {
  if (!list.some((l) => l.id === openId.value)) openId.value = list[0]?.id ?? null;
}, { immediate: true });
const open = computed(() => rows.value.find((l) => l.id === openId.value) ?? null);

const when = (iso) => (localDayKey(iso) === localDayKey(Date.now()) ? formatTimeSec(iso) : `${formatDate(iso)} ${formatTimeSec(iso)}`);
const pretty = (json) => {
  if (!json) return '—';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
};
</script>

<template>
  <div class="ds-toolbar">
    <label
      class="ds-sr-only"
      for="au-event"
    >Drop</label>
    <select
      id="au-event"
      v-model="filters.eventId"
      class="ds-input ds-toolbar__filter"
    >
      <option value="">
        Todos os drops
      </option>
      <option
        v-for="e in eventsWithLogs"
        :key="e.id"
        :value="e.id"
      >
        {{ e.name }}
      </option>
    </select>
    <label
      class="ds-sr-only"
      for="au-author"
    >Autor</label>
    <select
      id="au-author"
      v-model="filters.author"
      class="ds-input ds-toolbar__filter"
    >
      <option value="">
        Qualquer autor
      </option>
      <option
        v-for="e in d?.employees ?? []"
        :key="e.id"
        :value="e.id"
      >
        {{ e.fullName }}
      </option>
      <option value="system">
        Sistema
      </option>
    </select>
    <label
      class="ds-sr-only"
      for="au-entity"
    >Entidade</label>
    <select
      id="au-entity"
      v-model="filters.entity"
      class="ds-input ds-toolbar__filter"
    >
      <option value="">
        Todas as entidades
      </option>
      <option
        v-for="name in entities"
        :key="name"
      >
        {{ name }}
      </option>
    </select>
    <label
      class="ds-sr-only"
      for="au-date"
    >Data</label>
    <input
      id="au-date"
      v-model="filters.date"
      class="ds-input ds-toolbar__filter"
      type="date"
    >
  </div>

  <section class="ds-grid ds-grid--split">
    <div class="ds-card ds-card--flush">
      <LoadState
        :is-loading="data.isLoading.value"
        :error="data.error.value"
        :is-empty="!rows.length"
        empty-text="Nenhum registro com esses filtros."
        :lines="8"
        flush
        @retry="data.reload"
      >
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Registro de auditoria
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Quando
                </th>
                <th scope="col">
                  Quem
                </th>
                <th scope="col">
                  Ação
                </th>
                <th scope="col">
                  Entidade
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="l in pageRows"
                :key="l.id"
                :aria-selected="openId === l.id ? 'true' : undefined"
              >
                <td class="ds-numeric ds-text-sm ds-nowrap">
                  <button
                    type="button"
                    class="ds-table__open"
                    @click="openId = l.id"
                  >
                    {{ when(l.occurredAt) }}
                  </button>
                </td>
                <td>
                  <span
                    v-if="l.employeeId"
                    class="ds-cluster ds-cluster--2"
                  >
                    <span
                      class="ds-avatar ds-avatar--sm"
                      aria-hidden="true"
                    >{{ initials(employeeOf(l.employeeId)?.fullName) }}</span>
                    {{ employeeOf(l.employeeId)?.fullName ?? `Funcionário #${l.employeeId}` }}
                  </span>
                  <span
                    v-else
                    class="ds-badge ds-badge--done"
                  >Sistema</span>
                </td>
                <td>{{ l.action }}</td>
                <td class="ds-mono ds-text-sm">
                  {{ l.entityName }} #{{ l.entityId }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ds-table-footer">
          <span class="ds-hint">Do mais recente para o mais antigo.</span>
          <PaginationNav
            v-model:page="page"
            :page-size="PAGE_SIZE"
            :total="rows.length"
          />
        </div>
      </LoadState>
    </div>

    <article
      v-if="open"
      class="ds-card ds-stack--4"
      aria-live="polite"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          {{ open.action }}
        </h2>
        <span class="ds-text-xs ds-text-secondary">{{ formatDateTime(open.occurredAt) }}</span>
      </header>
      <dl class="ds-dl ds-dl--labels ds-text-sm">
        <dt>Autor</dt>
        <dd>{{ open.employeeId ? `${employeeOf(open.employeeId)?.fullName ?? '—'} · funcionário #${open.employeeId}` : 'Sistema' }}</dd>
        <template v-if="open.customerId">
          <dt>Cliente</dt>
          <dd>#{{ open.customerId }} · {{ customerOf(open.customerId)?.fullName ?? '—' }}</dd>
        </template>
        <dt>Registro</dt>
        <dd class="ds-mono">
          {{ open.entityName }} #{{ open.entityId }}
        </dd>
        <dt>Origem</dt>
        <dd class="ds-mono">
          {{ [open.ipAddress, open.userAgent].filter(Boolean).join(' · ') || '—' }}
        </dd>
      </dl>
      <div class="ds-stack--2">
        <span class="ds-label-caps">Antes</span>
        <pre class="ds-code">{{ pretty(open.oldValues) }}</pre>
      </div>
      <div class="ds-stack--2">
        <span class="ds-label-caps">Depois</span>
        <pre class="ds-code ds-code--changed">{{ pretty(open.newValues) }}</pre>
      </div>
      <span class="ds-hint">Registro somente leitura. Não pode ser editado nem excluído pelo painel.</span>
    </article>
  </section>
</template>
