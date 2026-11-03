<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { admin } from '../../services/admin-api';
import {
  DOCUMENT_STATUS, DOCUMENT_TYPE, DROP_REGISTRATION_STATUS, FRAUD_SIGNAL_TYPE, ORDER_STATUS, QUEUE_ENTRY_STATUS,
  STATES, labelOf, ufOf,
} from '../../services/status';
import { brl, dropOrderCode, formatDate, formatDateYear, initials, storeOrderCode } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PaginationNav from '../ui/PaginationNav.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// E9 · Clientes. Rotas: GET customers/get-all · PUT customers/update (dados, bloquear);
// ficha: orders + drop-orders + drop-registrations + queue-entries + fraud-signals (get-all,
// filtrados pelo cliente); documentos: GET documents/get-all · PUT documents/update (3 Validado, 4 Rejeitado).
defineProps({ params: { type: Object, default: () => ({}) } });

const PAGE_SIZE = 20;
const DOC_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'pending', label: 'Documento pendente' },
  { id: 'valid', label: 'Validados' },
  { id: 'rejected', label: 'Rejeitados' },
  { id: 'none', label: 'Sem documento' },
];

const data = useAsync(async () => {
  const [customers, documents, orders, dropOrders, registrations, entries, signals, events] = await Promise.all([
    admin.customers.getAll(), admin.documents.getAll(), admin.orders.getAll(), admin.dropOrders.getAll(),
    admin.dropRegistrations.getAll(), admin.queueEntries.getAll(), admin.fraudSignals.getAll(), admin.dropEvents.getAll(),
  ]);
  return { customers: customers.filter((c) => !c.isDeleted), documents, orders, dropOrders, registrations, entries, signals, events };
});

const d = computed(() => data.data.value);
const documentOf = (customerId) => (d.value?.documents ?? [])
  .filter((doc) => doc.referenceType === 'Customer' && doc.referenceId === customerId)
  .sort((a, b) => b.id - a.id)[0] ?? null;
const orderCount = (id) => (d.value?.orders ?? []).filter((o) => o.customerId === id).length
  + (d.value?.dropOrders ?? []).filter((o) => o.customerId === id).length;
const openSignals = (id) => (d.value?.signals ?? []).filter((s) => s.customerId === id && !(s.reviewedAt && !s.isConfirmed));
const eventName = (id) => d.value?.events.find((e) => e.id === id)?.name ?? `Drop #${id}`;

const filters = reactive({ search: '', doc: '' });
const page = ref(1);
watch(filters, () => { page.value = 1; });

const rows = computed(() => (d.value?.customers ?? []).filter((c) => {
  const term = filters.search.trim().toLowerCase();
  if (term && !`${c.fullName} ${c.email} ${c.city}`.toLowerCase().includes(term)) return false;
  const doc = documentOf(c.id);
  switch (filters.doc) {
    case 'pending': return doc && [1, 2].includes(doc.documentStatusId);
    case 'valid': return doc?.documentStatusId === 3;
    case 'rejected': return doc?.documentStatusId === 4;
    case 'none': return !doc;
    default: return true;
  }
}).sort((a, b) => openSignals(b.id).length - openSignals(a.id).length || a.fullName.localeCompare(b.fullName)));
const pageRows = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

const openId = ref(null);
const open = computed(() => d.value?.customers.find((c) => c.id === openId.value) ?? null);
const openDocument = computed(() => (open.value ? documentOf(open.value.id) : null));

const activity = computed(() => {
  if (!open.value) return [];
  const id = open.value.id;
  return [
    ...d.value.registrations.filter((r) => r.customerId === id && !r.isDeleted)
      .map((r) => ({ key: `r${r.id}`, label: eventName(r.dropEventId), table: DROP_REGISTRATION_STATUS, statusId: r.dropRegistrationStatusId })),
    ...d.value.entries.filter((e) => e.customerId === id && e.queueEntryStatusId !== 4)
      .map((e) => ({ key: `q${e.id}`, label: `${eventName(e.dropEventId)} · fila`, table: QUEUE_ENTRY_STATUS, statusId: e.queueEntryStatusId })),
  ];
});
const signalsSummary = computed(() => (open.value
  ? [...new Set(openSignals(open.value.id).map((s) => labelOf(FRAUD_SIGNAL_TYPE, s.fraudSignalTypeId)))].join(', ')
  : ''));
const lastOrders = computed(() => {
  if (!open.value) return [];
  const id = open.value.id;
  return [
    ...d.value.orders.filter((o) => o.customerId === id).map((o) => ({ key: `s${o.id}`, code: storeOrderCode(o.id), total: o.totalAmount, statusId: o.orderStatusId, at: o.createdAt })),
    ...d.value.dropOrders.filter((o) => o.customerId === id).map((o) => ({ key: `d${o.id}`, code: dropOrderCode(o.id), total: o.totalAmount, statusId: o.dropOrderStatusId, at: o.createdAt })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 3);
});

const setDocument = useAction(async (statusId) => {
  await admin.documents.patch(openDocument.value, { documentStatusId: statusId });
  await data.reload();
});
const toggleBlock = useAction(async () => {
  await admin.customers.patch(open.value, { isActive: !open.value.isActive });
  await data.reload();
});

const editing = ref(null);
const saveCustomer = useAction(async () => {
  await admin.customers.update({ ...editing.value, stateId: Number(editing.value.stateId) });
  editing.value = null;
  await data.reload();
});
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
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
          v-model="filters.search"
          class="ds-input"
          type="search"
          placeholder="Nome, e-mail ou cidade"
        >
      </div>
      <label
        class="ds-sr-only"
        for="cu-doc"
      >Documento</label>
      <select
        id="cu-doc"
        v-model="filters.doc"
        class="ds-input ds-toolbar__filter"
      >
        <option
          v-for="f in DOC_FILTERS"
          :key="f.id"
          :value="f.id"
        >
          {{ f.label }}
        </option>
      </select>
    </div>
  </div>

  <section class="ds-grid ds-grid--split">
    <div class="ds-card ds-card--flush">
      <LoadState
        :is-loading="data.isLoading.value"
        :error="data.error.value"
        :is-empty="!rows.length"
        empty-text="Nenhum cliente encontrado."
        :lines="8"
        flush
        @retry="data.reload"
      >
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
                <th scope="col">
                  Documento
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Pedidos
                </th>
                <th scope="col">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in pageRows"
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
                      <span class="ds-text-xs ds-text-secondary">{{ c.email }}</span>
                    </span>
                  </button>
                </td>
                <td class="ds-nowrap">
                  {{ c.city }} · {{ ufOf(c.stateId) }}
                </td>
                <td>
                  <StatusBadge
                    v-if="documentOf(c.id)"
                    :id="documentOf(c.id).documentStatusId"
                    :table="DOCUMENT_STATUS"
                    :dot="false"
                    :label="documentOf(c.id).documentStatusId === 2 ? 'Aguardando' : ''"
                  />
                  <span
                    v-else
                    class="ds-badge ds-badge--done"
                  >Sem documento</span>
                </td>
                <td class="ds-table__td--numeric">
                  {{ orderCount(c.id) }}
                </td>
                <td>
                  <span
                    v-if="!c.isActive"
                    class="ds-badge ds-badge--done"
                  >Bloqueado</span>
                  <span
                    v-else-if="openSignals(c.id).length"
                    class="ds-badge ds-badge--live"
                  >{{ openSignals(c.id).length }} {{ openSignals(c.id).length === 1 ? 'sinal' : 'sinais' }} de fraude</span>
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
          <span class="ds-hint">Clientes com sinal de fraude aparecem primeiro.</span>
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
      class="ds-card ds-stack--5"
      aria-live="polite"
    >
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
        <dt>Endereço</dt>
        <dd>{{ open.addressLine }} · {{ open.city }}, {{ ufOf(open.stateId) }} · {{ open.zipCode }}</dd>
      </dl>

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
              :disabled="setDocument.isPending.value"
              @click="setDocument.run(4)"
            >
              Rejeitar
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--primary ds-btn--sm"
              :disabled="setDocument.isPending.value"
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
        <span class="ds-label-caps">Últimos pedidos</span>
        <p
          v-if="!lastOrders.length"
          class="ds-text-sm ds-text-secondary"
        >
          Nenhum pedido.
        </p>
        <div
          v-for="o in lastOrders"
          :key="o.key"
          class="ds-cluster ds-cluster--between ds-text-sm"
        >
          <span class="ds-mono">{{ o.code }}</span>
          <span class="ds-cluster ds-cluster--2">
            <span class="ds-numeric">{{ brl(o.total) }}</span>
            <StatusBadge
              :id="o.statusId"
              :table="ORDER_STATUS"
              :dot="false"
            />
          </span>
        </div>
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
          @click="editing = { ...open }"
        >
          Editar dados
        </button>
        <button
          type="button"
          :class="['ds-btn', 'ds-grow', open.isActive ? 'ds-btn--danger' : 'ds-btn--secondary']"
          :disabled="toggleBlock.isPending.value"
          @click="toggleBlock.run()"
        >
          {{ open.isActive ? 'Bloquear cliente' : 'Desbloquear cliente' }}
        </button>
      </div>
    </article>

    <article
      v-else
      class="ds-card ds-card--sunken ds-empty"
    >
      <p>Abra um cliente para ver a ficha, validar o documento e o histórico.</p>
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
