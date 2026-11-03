<script setup>
import { computed, nextTick, ref } from 'vue';
import { AlertCircle, Plus } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin } from '../../services/admin-api';
import { STATES, ufOf } from '../../services/status';
import { brl } from '../../services/format';
import CatalogTabs from './CatalogTabs.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// E11 · Fornecedores e serviços. Rotas (/api/store): suppliers get-all/add/update,
// services get-all/add/update, categories/get-all, products/get-all (contagem por fornecedor).
// E-mail e telefone do fornecedor são value objects no back ({ value }).
defineProps({ params: { type: Object, default: () => ({}) } });

const data = useAsync(async () => {
  const [suppliers, services, categories, products] = await Promise.all([
    admin.suppliers.getAll(), admin.services.getAll(), admin.categories.getAll(), admin.products.getAll(),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ ...s, productCount: products.filter((p) => p.supplierId === s.id && !p.isDeleted).length })),
    services: services.filter((s) => !s.isDeleted),
    categories,
  };
});

const categoryName = (id) => data.data.value?.categories.find((c) => c.id === id)?.name ?? '—';
const valueOf = (vo) => (vo && typeof vo === 'object' ? vo.value : vo ?? '');
const durationLabel = (minutes) => {
  if (!minutes) return 'no envio';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 1440);
  return `${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`;
};

// Fornecedor (formulário na página, como no design)
const blankSupplier = () => ({
  id: null, enterpriseId: 1, companyName: '', contactName: '', email: '', phone: '', addressLine: '', city: '',
  stateId: '', zipCode: '', country: 'Brasil', isActive: true,
});
const supplier = ref(blankSupplier());
const focusForm = () => nextTick(() => {
  const field = document.getElementById('su-company');
  field?.scrollIntoView({ block: 'center' });
  field?.focus({ preventScroll: true });
});
const editSupplier = (s) => {
  supplier.value = { ...s, email: valueOf(s.email), phone: valueOf(s.phone) };
  focusForm();
};
const newSupplier = () => {
  supplier.value = blankSupplier();
  focusForm();
};
const saveSupplier = useAction(async () => {
  const s = supplier.value;
  const payload = { ...s, email: { value: s.email.trim() }, phone: { value: s.phone.trim() }, stateId: Number(s.stateId) };
  delete payload.productCount;
  if (s.id) await admin.suppliers.update(payload);
  else await admin.suppliers.add(payload);
  supplier.value = blankSupplier();
  await data.reload();
});

// Serviço (modal)
const service = ref(null);
const openService = (s = null) => {
  service.value = s ? { ...s, durationDays: Math.round(s.durationMinutes / 1440) } : {
    id: null, enterpriseId: 1, categoryId: data.data.value?.categories[0]?.id ?? null, name: '', description: '',
    price: 0, durationDays: 1, isActive: true,
  };
};
const saveService = useAction(async () => {
  const s = service.value;
  const payload = { ...s, price: Number(s.price), durationMinutes: Math.round(Number(s.durationDays) * 1440) };
  delete payload.durationDays;
  if (s.id) await admin.services.update(payload);
  else await admin.services.add(payload);
  service.value = null;
  await data.reload();
});

const isEditing = computed(() => Boolean(supplier.value.id));
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Fornecedores e serviços
    </h1>
    <CatalogTabs />
  </div>

  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="8"
    @retry="data.reload"
  >
    <section
      v-if="data.data.value"
      class="ds-grid ds-grid--2 ds-align-start"
    >
      <article class="ds-card ds-card--flush">
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            Fornecedores
          </h2>
          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--sm"
            @click="newSupplier"
          >
            <Plus
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Fornecedor
          </button>
        </header>
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Fornecedores
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Empresa
                </th>
                <th scope="col">
                  Contato
                </th>
                <th scope="col">
                  UF
                </th>
                <th scope="col">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in data.data.value.suppliers"
                :key="s.id"
                :aria-selected="supplier.id === s.id ? 'true' : undefined"
              >
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-stack--1"
                    @click="editSupplier(s)"
                  >
                    <span>{{ s.companyName }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ s.productCount }} {{ s.productCount === 1 ? 'produto' : 'produtos' }}</span>
                  </button>
                </td>
                <td>
                  <span class="ds-stack--1">
                    <span>{{ s.contactName }}</span>
                    <span class="ds-text-xs ds-text-secondary">{{ valueOf(s.email) }}</span>
                  </span>
                </td>
                <td>{{ ufOf(s.stateId) }}</td>
                <td>
                  <span :class="['ds-badge', s.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ s.isActive ? 'Ativo' : 'Inativo' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="ds-card ds-card--flush">
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            Serviços
          </h2>
          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--sm"
            @click="openService()"
          >
            <Plus
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Serviço
          </button>
        </header>
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Serviços oferecidos na vitrine
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Serviço
                </th>
                <th scope="col">
                  Categoria
                </th>
                <th scope="col">
                  Prazo
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Preço
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in data.data.value.services"
                :key="s.id"
              >
                <td>
                  <button
                    type="button"
                    class="ds-table__open ds-stack--1"
                    @click="openService(s)"
                  >
                    <span>{{ s.name }}</span>
                    <span :class="['ds-badge', 'ds-self-start', s.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ s.isActive ? 'Ativo' : 'Inativo' }}</span>
                  </button>
                </td>
                <td>{{ categoryName(s.categoryId) }}</td>
                <td>{{ durationLabel(s.durationMinutes) }}</td>
                <td class="ds-table__td--numeric">
                  {{ brl(s.price) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <form
      id="supplier-form"
      class="ds-card ds-stack--5"
      @submit.prevent="saveSupplier.run()"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          {{ isEditing ? `Editar ${supplier.companyName}` : 'Novo fornecedor' }}
        </h2>
        <label
          v-if="isEditing"
          class="ds-check"
        >
          <input
            v-model="supplier.isActive"
            type="checkbox"
          >
          Ativo
        </label>
      </header>
      <div class="ds-grid ds-grid--form">
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-company"
          >Razão social</label>
          <input
            id="su-company"
            v-model="supplier.companyName"
            class="ds-input"
            placeholder="Nome da empresa"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-contact"
          >Contato</label>
          <input
            id="su-contact"
            v-model="supplier.contactName"
            class="ds-input"
            placeholder="Nome da pessoa"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-email"
          >E-mail</label>
          <input
            id="su-email"
            v-model="supplier.email"
            class="ds-input"
            type="email"
            placeholder="compras@empresa.com"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-phone"
          >Telefone</label>
          <input
            id="su-phone"
            v-model="supplier.phone"
            class="ds-input"
            inputmode="tel"
            placeholder="(00) 0000-0000"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-addr"
          >Endereço</label>
          <input
            id="su-addr"
            v-model="supplier.addressLine"
            class="ds-input"
            placeholder="Rua, número"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-city"
          >Cidade</label>
          <input
            id="su-city"
            v-model="supplier.city"
            class="ds-input"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-uf"
          >UF</label>
          <select
            id="su-uf"
            v-model="supplier.stateId"
            class="ds-input"
            required
          >
            <option
              value=""
              disabled
            >
              Selecione
            </option>
            <option
              v-for="s in STATES"
              :key="s.id"
              :value="s.id"
            >
              {{ s.uf }} · {{ s.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-zip"
          >CEP</label>
          <input
            id="su-zip"
            v-model="supplier.zipCode"
            class="ds-input"
            inputmode="numeric"
            placeholder="00000-000"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-country"
          >País</label>
          <input
            id="su-country"
            v-model="supplier.country"
            class="ds-input"
            required
          >
        </div>
      </div>
      <p
        v-if="saveSupplier.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ saveSupplier.error.value.message }}
      </p>
      <p
        v-else-if="saveSupplier.done.value"
        class="ds-hint ds-text-success"
        role="status"
      >
        Fornecedor salvo.
      </p>
      <div class="ds-cluster ds-cluster--end ds-cluster--2">
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="supplier = blankSupplier()"
        >
          {{ isEditing ? 'Cancelar edição' : 'Limpar' }}
        </button>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="saveSupplier.isPending.value"
        >
          Salvar fornecedor
        </button>
      </div>
    </form>
  </LoadState>

  <ModalDialog
    v-if="service"
    :title="service.id ? 'Editar serviço' : 'Novo serviço'"
    @close="service = null"
  >
    <form
      id="service-form"
      class="ds-stack--4"
      @submit.prevent="saveService.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="sv-name"
        >Nome</label>
        <input
          id="sv-name"
          v-model="service.name"
          class="ds-input"
          required
          autofocus
        >
      </div>
      <div class="ds-grid ds-grid--2">
        <div class="ds-field">
          <label
            class="ds-label"
            for="sv-cat"
          >Categoria</label>
          <select
            id="sv-cat"
            v-model.number="service.categoryId"
            class="ds-input"
            required
          >
            <option
              v-for="c in data.data.value?.categories ?? []"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="sv-price"
          >Preço (R$)</label>
          <input
            id="sv-price"
            v-model="service.price"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="sv-days"
          >Prazo (dias úteis)</label>
          <input
            id="sv-days"
            v-model="service.durationDays"
            class="ds-input"
            type="number"
            min="0"
            step="0.5"
          >
          <span class="ds-hint">0 = feito no envio</span>
        </div>
      </div>
      <label class="ds-check">
        <input
          v-model="service.isActive"
          type="checkbox"
        >
        Ativo na vitrine
      </label>
      <p
        v-if="saveService.error.value"
        class="ds-error"
        role="alert"
      >
        {{ saveService.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="service = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="service-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveService.isPending.value"
      >
        Salvar serviço
      </button>
    </template>
  </ModalDialog>
</template>
