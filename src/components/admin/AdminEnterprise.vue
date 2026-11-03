<script setup>
import { reactive, watch } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { getPublicStore, listMyEnterprises, updateEnterprise } from '../../services/admin-api';
import { STATES } from '../../services/status';
import LoadState from '../ui/LoadState.vue';

// E12 · Dados da empresa. Rotas (/api/store): GET enterprises/mine (nome),
// GET storefront/store (e-mail e telefone públicos), PUT enterprises/current (só o dono
// principal). O back ainda não tem GET dos dados completos: razão social e endereço
// precisam ser informados de novo ao salvar.
const data = useAsync(async () => {
  const [mine, store] = await Promise.all([listMyEnterprises(), getPublicStore().catch(() => null)]);
  return { enterprise: mine[0] ?? null, store };
});

const form = reactive({
  tradeName: '', legalName: '', email: '', phone: '', addressLine: '', city: '', stateId: 25, zipCode: '', country: 'Brasil',
});
const valueOf = (vo) => (vo && typeof vo === 'object' ? vo.value : vo ?? '');

watch(() => data.data.value, (value) => {
  if (!value) return;
  form.tradeName = value.enterprise?.tradeName ?? value.store?.tradeName ?? '';
  form.email = valueOf(value.store?.email);
  form.phone = valueOf(value.store?.phone);
}, { immediate: true });

const save = useAction(() => updateEnterprise({ ...form, stateId: Number(form.stateId) }));
</script>

<template>
  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="6"
    @retry="data.reload"
  >
    <form
      class="ds-card ds-stack--5"
      @submit.prevent="save.run()"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Dados da empresa
        </h2>
        <span class="ds-badge ds-badge--success">Ativa</span>
      </header>
      <div class="ds-grid ds-grid--form">
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-trade"
          >Nome fantasia</label>
          <input
            id="tm-trade"
            v-model="form.tradeName"
            class="ds-input"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-legal"
          >Razão social</label>
          <input
            id="tm-legal"
            v-model="form.legalName"
            class="ds-input"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-email"
          >E-mail</label>
          <input
            id="tm-email"
            v-model="form.email"
            class="ds-input"
            type="email"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-phone"
          >Telefone</label>
          <input
            id="tm-phone"
            v-model="form.phone"
            class="ds-input"
            inputmode="tel"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-addr"
          >Endereço</label>
          <input
            id="tm-addr"
            v-model="form.addressLine"
            class="ds-input"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-city"
          >Cidade</label>
          <input
            id="tm-city"
            v-model="form.city"
            class="ds-input"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-uf"
          >UF</label>
          <select
            id="tm-uf"
            v-model.number="form.stateId"
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
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-zip"
          >CEP</label>
          <input
            id="tm-zip"
            v-model="form.zipCode"
            class="ds-input"
            inputmode="numeric"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="tm-country"
          >País</label>
          <input
            id="tm-country"
            v-model="form.country"
            class="ds-input"
            required
          >
        </div>
      </div>
      <span class="ds-hint">
        O back-end ainda não devolve razão social e endereço: preencha todos os campos ao salvar. Só o dono principal pode alterar.
      </span>
      <p
        v-if="save.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ save.error.value.message }}
      </p>
      <p
        v-else-if="save.done.value"
        class="ds-hint ds-text-success"
        role="status"
      >
        Dados da empresa salvos.
      </p>
      <div class="ds-cluster ds-cluster--end">
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="save.isPending.value"
        >
          Salvar empresa
        </button>
      </div>
    </form>
  </LoadState>
</template>
