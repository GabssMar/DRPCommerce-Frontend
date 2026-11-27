<script setup>
import { computed, ref, watch } from 'vue';
import { AlertCircle, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { usePagedSearch } from '../../composables/usePagedSearch';
import { usePermissions } from '../../composables/usePermissions';
import { href } from '../../router';
import { admin, listCustomerAddresses, searchCustomers, searchOrders } from '../../services/admin-api';
import { toPage } from '../../services/paging';
import {
  DOCUMENT_STATUS, DOCUMENT_TYPE, DROP_REGISTRATION_STATUS, FRAUD_SIGNAL_TYPE, ORDER_STATUS, QUEUE_ENTRY_STATUS,
  STATES, labelOf, ufOf,
} from '../../services/status';
import { brl, formatDate, formatDateYear, fromDateInput, initials } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E9 · Clientes (task 38): busca paginada com métricas do back (GET customers/search),
// endereços (GET customers/{id}/addresses) e pedidos (GET orders/search?customerId).
// Ficha: customers/get-by-id · PUT customers/update (dados, bloquear); atividade em drops:
// drop-registrations + queue-entries + fraud-signals; documentos: documents/get-all · PUT documents/update.
defineProps({ params: { type: Object, default: () => ({}) } });

const { can, denied } = usePermissions();

const SORTS = [
  { id: 'newest', label: 'Mais recentes' },
  { id: 'oldest', label: 'Mais antigos' },
  { id: 'name', label: 'Nome' },
  { id: 'total_spent_desc', label: 'Maior gasto' },
  { id: 'last_order_desc', label: 'Compra mais recente' },
];

const search = usePagedSearch(
  ({ createdFromDate, createdToDate, ...rest }) => searchCustomers({
    ...rest,
    createdFrom: createdFromDate ? fromDateInput(createdFromDate) : null,
    createdTo: createdToDate ? fromDateInput(createdToDate, true) : null,
  }),
  { term: '', isActive: null, isVerified: null, stateId: null, hasOrders: null, createdFromDate: '', createdToDate: '', sort: 'newest' },
);
const { filters } = search;

// ---------------------------------------------------------------- ficha ---
const openId = ref(null);
const customer = useAsync(() => (openId.value ? admin.customers.getById(openId.value) : null), { immediate: false });
const addresses = useAsync(() => (openId.value ? listCustomerAddresses(openId.value) : []), { immediate: false, initial: [] });
const orders = usePagedSearch(
  (f) => (f.customerId ? searchOrders({ ...f, sort: 'newest' }) : toPage([])),
  { customerId: null },
  { pageSize: 5 },
);
watch(openId, (id) => {
  customer.clear();
  addresses.clear();
  orders.clear();
  orders.page.value = 1;
  orders.filters.customerId = id;
  customer.reload();
  addresses.reload();
  orders.reload();
});
const open = computed(() => customer.data.value);
const summary = computed(() => search.items.value.find((c) => c.id === openId.value) ?? null);

// Documentos e atividade em drops (não têm busca no back): carregam uma vez.
const extras = useAsync(async () => {
  const [documents, registrations, entries, signals, events] = await Promise.all([
    admin.documents.getAll(), admin.dropRegistrations.getAll(), admin.queueEntries.getAll(), admin.fraudSignals.getAll(), admin.dropEvents.getAll(),
  ]);
  return { documents, registrations, entries, signals, events };
});
const x = computed(() => extras.data.value);
const openDocument = computed(() => (open.value
  ? (x.value?.documents ?? []).filter((doc) => doc.referenceType === 'Customer' && doc.referenceId === open.value.id).sort((a, b) => b.id - a.id)[0] ?? null
  : null));
const openSignals = computed(() => (x.value?.signals ?? []).filter((s) => s.customerId === openId.value && !(s.reviewedAt && !s.isConfirmed)));
const eventName = (id) => x.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;
const activity = computed(() => {
  if (!x.value || !openId.value) return [];
  const id = openId.value;
  return [
    ...x.value.registrations.filter((r) => r.customerId === id && !r.isDeleted)
      .map((r) => ({ key: `r${r.id}`, label: eventName(r.dropEventId), table: DROP_REGISTRATION_STATUS, statusId: r.dropRegistrationStatusId })),
    ...x.value.entries.filter((e) => e.customerId === id && e.queueEntryStatusId !== 4)
      .map((e) => ({ key: `q${e.id}`, label: `${eventName(e.dropEventId)} · fila`, table: QUEUE_ENTRY_STATUS, statusId: e.queueEntryStatusId })),
  ];
});
const signalsSummary = computed(() => [...new Set(openSignals.value.map((s) => labelOf(FRAUD_SIGNAL_TYPE, s.fraudSignalTypeId)))].join(', '));

const setDocument = useAction(async (statusId) => {
  await admin.documents.patch(openDocument.value, { documentStatusId: statusId });
  await extras.reload();
});
const toggleBlock = useAction(async () => {
  await admin.customers.patch(open.value, { isActive: !open.value.isActive });
  await Promise.all([customer.reload(), search.reload()]);
});

const editing = ref(null);
const saveCustomer = useAction(async () => {
  await admin.customers.update({ ...editing.value, stateId: Number(editing.value.stateId) });
  editing.value = null;
  await Promise.all([customer.reload(), search.reload()]);
});
</script>

<template>
  <h1 class="ds-title ds-title--lg">
    Clientes
  </h1>

  <div class="ds-toolbar">
    <div class="ds-toolbar__search">
      <label
        class="ds-sr-only"
        for="cu-search"
      >Buscar clientes</label>
      <input
        id="cu-search"
        v-model="filters.term"
        class="ds-input"
        type="search"
        placeholder="Nome, e-mail ou telefone"
      >
    </div>
    <select
      v-model="filters.isActive"
      class="ds-input ds-toolbar__filter"
      aria-label="Situação"
    >
      <option :value="null">
        Ativos e bloqueados
      </option>
      <option :value="true">
        Só ativos
      </option>
      <option :value="false">
        Só bloqueados
      </option>
    </select>
    <select
      v-model="filters.isVerified"
      class="ds-input ds-toolbar__filter"
      aria-label="Verificação"
    >
      <option :value="null">
        Verificados ou não
      </option>
      <option :value="true">
        Só verificados
      </option>
      <option :value="false">
        Não verificados
      </option>
    </select>
    <select
      v-model="filters.hasOrders"
      class="ds-input ds-toolbar__filter"
      aria-label="Compras"
    >
      <option :value="null">
        Com ou sem compras
      </option>
      <option :value="true">
        Já compraram
      </option>
      <option :value="false">
        Nunca compraram
      </option>
    </select>
    <select
      v-model="filters.stateId"
      class="ds-input ds-toolbar__filter"
      aria-label="UF"
    >
      <option :value="null">
        Todas as UFs
      </option>
      <option
        v-for="s in STATES"
        :key="s.id"
        :value="s.id"
      >
        {{ s.uf }}
      </option>
    </select>
    <label
      class="ds-sr-only"
      for="cu-from"
    >Cadastrado a partir de</label>
    <input
      id="cu-from"
      v-model="filters.createdFromDate"
      class="ds-input ds-toolbar__filter"
      type="date"
    >
    <label
      class="ds-sr-only"
      for="cu-to"
    >Cadastrado até</label>
    <input
      id="cu-to"
      v-model="filters.createdToDate"
      class="ds-input ds-toolbar__filter"
      type="date"
    >
    <select
      v-model="filters.sort"
      class="ds-input ds-toolbar__filter"
      aria-label="Ordenar por"
    >
      <option
        v-for="s in SORTS"
        :key="s.id"
        :value="s.id"
      >
        {{ s.label }}
      </option>
    </select>
  </div>

  <section class="ds-grid ds-grid--split">
    <div class="ds-card ds-card--flush ds-min-0">
      <LoadState
        :is-loading="search.isLoading.value"
        :error="search.error.value"
        :is-empty="!search.items.value.length"
        :empty-text="search.isFiltered.value ? 'Nenhum cliente com estes filtros.' : 'Nenhum cliente ainda. Quem se cadastra na vitrine aparece aqui.'"
        :lines="8"
        flush
        @retry="search.reload"
      >
        <template #empty-action>
          <button
            v-if="search.isFiltered.value"
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="search.clearFilters()"
          >
            Limpar filtros
          </button>
          <a
            v-else
            class="ds-btn ds-btn--secondary ds-btn--sm"
            :href="href('/admin/pedidos')"
          >
            Ver pedidos
          </a>
        </template>
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Clientes cadastrados
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Cliente
                </th>
                <th scope="col">
                  Cidade
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Compras
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Total gasto
                </th>
                <th scope="col">
                  Última compra
                </th>
                <th scope="col">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in search.items.value"
                :key="c.id"
                :aria-selected="openId === c.id ? 'true' : undefined"
              >
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-cluster ds-cluster--2"
                    @click="openId = c.id"
                  >
                    <span
                      class="ds-avatar ds-avatar--sm"
                      aria-hidden="true"
                    >{{ initials(c.fullName) }}</span>
                    <span class="ds-stack--1 ds-min-0">
                      <span>{{ c.fullName }}</span>
                      <span class="ds-text-xs ds-text-secondary">{{ c.email }} · {{ c.phone }}</span>
                    </span>
                  </button>
                </td>
                <td class="ds-nowrap">
                  {{ c.city }} · {{ ufOf(c.stateId) }}
                </td>
                <td class="ds-table__td--numeric">
                  {{ c.completedOrders }}
                </td>
                <td class="ds-table__td--numeric">
                  {{ brl(c.totalSpent) }}
                </td>
                <td class="ds-text-sm ds-nowrap">
                  {{ c.lastOrderAt ? formatDate(c.lastOrderAt) : '—' }}
                </td>
                <td>
                  <span
                    v-if="!c.isActive"
                    class="ds-badge ds-badge--done"
                  >Bloqueado</span>
                  <span
                    v-else-if="!c.isVerified"
                    class="ds-badge ds-badge--waiting"
                  >Não verificado</span>
                  <span
                    v-else
                    class="ds-badge ds-badge--success"
                  >Ativo</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ds-table-footer">
          <span class="ds-hint">Compras e total contam só pedidos concluídos (confirmados em diante).</span>
          <PaginationNav
            v-model:page="search.page.value"
            :page-size="search.pageSize"
            :total="search.total.value"
          />
        </div>
      </LoadState>
    </div>

    <article
      v-if="openId"
      class="ds-card ds-stack--5"
      aria-live="polite"
    >
      <LoadState
        :is-loading="customer.isLoading.value"
        :error="customer.error.value"
        :lines="8"
        @retry="customer.reload"
      >
        <template v-if="open">
          <header class="ds-cluster ds-cluster--between">
            <span class="ds-cluster ds-cluster--2">
              <span
                class="ds-avatar ds-avatar--lg"
                aria-hidden="true"
              >{{ initials(open.fullName) }}</span>
              <span class="ds-stack--1">
                <strong class="ds-text-medium ds-text-lg">{{ open.fullName }}</strong>
                <span class="ds-text-xs ds-text-secondary">cliente #{{ open.id }} · desde {{ formatDateYear(open.createdAt) }}</span>
              </span>
            </span>
            <button
              type="button"
              class="ds-icon-btn ds-icon-btn--ghost"
              aria-label="Fechar ficha"
              @click="openId = null"
            >
              <X
                :size="20"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
          </header>

          <dl class="ds-dl ds-dl--labels ds-text-sm">
            <dt>E-mail</dt>
            <dd>{{ open.email }}</dd>
            <dt>Celular</dt>
            <dd>{{ open.phone }}</dd>
            <template v-if="summary">
              <dt>Compras</dt>
              <dd>{{ summary.completedOrders }} · {{ brl(summary.totalSpent) }}</dd>
              <dt>Última compra</dt>
              <dd>{{ summary.lastOrderAt ? formatDate(summary.lastOrderAt) : '—' }}</dd>
            </template>
          </dl>

          <div class="ds-stack--2">
            <span class="ds-label-caps">Endereços</span>
            <LoadState
              :is-loading="addresses.isLoading.value"
              :error="addresses.error.value"
              :is-empty="!(addresses.data.value ?? []).length"
              empty-text="Nenhum endereço salvo."
              :lines="2"
              @retry="addresses.reload"
            >
              <div
                v-for="a in addresses.data.value"
                :key="a.id"
                class="ds-stack--1 ds-text-sm"
              >
                <span class="ds-cluster ds-cluster--2">
                  <span class="ds-text-medium">{{ a.label }}</span>
                  <span
                    v-if="a.isDefault"
                    class="ds-badge ds-badge--done"
                  >Padrão</span>
                </span>
                <span class="ds-text-secondary">{{ a.recipientName }} · {{ a.addressLine }} · {{ a.city }}, {{ a.state || ufOf(a.stateId) }} · {{ a.zipCode }}</span>
              </div>
            </LoadState>
          </div>

          <div class="ds-card ds-card--sunken ds-stack--3">
            <div class="ds-cluster ds-cluster--between">
              <span class="ds-label-caps">Documento</span>
              <StatusBadge
                v-if="openDocument"
                :id="openDocument.documentStatusId"
                :table="DOCUMENT_STATUS"
                :dot="false"
              />
              <span
                v-else
                class="ds-badge ds-badge--done"
              >Sem documento</span>
            </div>
            <template v-if="openDocument">
              <span class="ds-text-sm">
                {{ labelOf(DOCUMENT_TYPE, openDocument.documentTypeId) }} · <span class="ds-mono">{{ openDocument.number }}</span> · enviado {{ formatDate(openDocument.createdAt) }}
              </span>
              <div
                v-if="[1, 2].includes(openDocument.documentStatusId)"
                class="ds-cluster ds-cluster--2"
              >
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="setDocument.isPending.value || !can('customers.manage')"
                  :title="denied('customers.manage', 'gerenciar clientes')"
                  @click="setDocument.run(4)"
                >
                  Rejeitar
                </button>
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="setDocument.isPending.value || !can('customers.manage')"
                  :title="denied('customers.manage', 'gerenciar clientes')"
                  @click="setDocument.run(3)"
                >
                  Validar
                </button>
              </div>
            </template>
            <p
              v-else
              class="ds-text-sm ds-text-secondary"
            >
              O cliente ainda não enviou CPF. Drops com inscrição exigem documento validado.
            </p>
          </div>

          <div class="ds-stack--2">
            <span class="ds-label-caps">Atividade em drops</span>
            <p
              v-if="!activity.length && !signalsSummary"
              class="ds-text-sm ds-text-secondary"
            >
              Sem inscrições nem filas.
            </p>
            <div
              v-for="a in activity"
              :key="a.key"
              class="ds-cluster ds-cluster--between ds-text-sm"
            >
              <span>{{ a.label }}</span>
              <StatusBadge
                :id="a.statusId"
                :table="a.table"
                :dot="false"
              />
            </div>
            <div
              v-if="signalsSummary"
              class="ds-cluster ds-cluster--between ds-text-sm"
            >
              <span>Sinais: {{ signalsSummary }}</span>
              <a
                class="ds-text-brand"
                :href="href('/admin/fraude')"
              >Ver</a>
            </div>
          </div>

          <div class="ds-stack--2">
            <span class="ds-label-caps">Pedidos da vitrine</span>
            <LoadState
              :is-loading="orders.isLoading.value"
              :error="orders.error.value"
              :is-empty="!orders.items.value.length"
              empty-text="Nenhum pedido."
              :lines="2"
              @retry="orders.reload"
            >
              <a
                v-for="o in orders.items.value"
                :key="o.id"
                class="ds-cluster ds-cluster--between ds-text-sm"
                :href="href(`/admin/pedidos/${o.id}`)"
                :aria-label="`Abrir pedido ${o.number}`"
              >
                <span class="ds-mono">#{{ o.number }}</span>
                <span class="ds-cluster ds-cluster--2">
                  <span class="ds-numeric">{{ brl(o.totalAmount) }}</span>
                  <StatusBadge
                    :id="o.statusId"
                    :table="ORDER_STATUS"
                    :dot="false"
                  />
                </span>
              </a>
              <PaginationNav
                v-model:page="orders.page.value"
                :page-size="orders.pageSize"
                :total="orders.total.value"
              />
            </LoadState>
          </div>

          <p
            v-if="setDocument.error.value || toggleBlock.error.value"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ (setDocument.error.value || toggleBlock.error.value).message }}
          </p>

          <div class="ds-cluster ds-cluster--2">
            <button
              type="button"
              class="ds-btn ds-btn--ghost"
              :disabled="!can('customers.manage')"
              :title="denied('customers.manage', 'gerenciar clientes')"
              @click="saveCustomer.error.value = null; editing = { ...open }"
            >
              Editar dados
            </button>
            <button
              type="button"
              :class="['ds-btn', 'ds-grow', open.isActive ? 'ds-btn--danger' : 'ds-btn--secondary']"
              :disabled="toggleBlock.isPending.value || !can('customers.manage')"
              :title="denied('customers.manage', 'gerenciar clientes')"
              @click="toggleBlock.run()"
            >
              {{ open.isActive ? 'Bloquear cliente' : 'Desbloquear cliente' }}
            </button>
          </div>
        </template>
      </LoadState>
    </article>

    <article
      v-else
      class="ds-card ds-card--sunken ds-empty"
    >
      <p>Abra um cliente para ver endereços, pedidos, documento e histórico.</p>
    </article>
  </section>

  <ModalDialog
    v-if="editing"
    title="Editar dados do cliente"
    @close="editing = null"
  >
    <form
      id="customer-form"
      class="ds-grid ds-grid--2"
      @submit.prevent="saveCustomer.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-name"
        >Nome</label>
        <input
          id="ce-name"
          v-model="editing.fullName"
          class="ds-input"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-email"
        >E-mail</label>
        <input
          id="ce-email"
          v-model="editing.email"
          class="ds-input"
          type="email"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-phone"
        >Celular</label>
        <input
          id="ce-phone"
          v-model="editing.phone"
          class="ds-input"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-zip"
        >CEP</label>
        <input
          id="ce-zip"
          v-model="editing.zipCode"
          class="ds-input"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-addr"
        >Endereço</label>
        <input
          id="ce-addr"
          v-model="editing.addressLine"
          class="ds-input"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-city"
        >Cidade</label>
        <input
          id="ce-city"
          v-model="editing.city"
          class="ds-input"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ce-uf"
        >UF</label>
        <select
          id="ce-uf"
          v-model.number="editing.stateId"
          class="ds-input"
        >
          <option
            v-for="s in STATES"
            :key="s.id"
            :value="s.id"
          >
            {{ s.uf }} · {{ s.name }}
          </option>
        </select>
      </div>
      <label class="ds-check">
        <input
          v-model="editing.isVerified"
          type="checkbox"
        >
        Cadastro verificado
      </label>
    </form>
    <p
      v-if="saveCustomer.error.value"
      class="ds-error"
      role="alert"
    >
      {{ saveCustomer.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="editing = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="customer-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveCustomer.isPending.value"
      >
        Salvar
      </button>
    </template>
  </ModalDialog>
</template>
