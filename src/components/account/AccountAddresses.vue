<script setup>
import { computed, reactive, ref, shallowRef } from 'vue';
import { AlertCircle, MapPin, Pencil, Plus, Star, Trash2 } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import {
  addAddress, deleteAddress, listAddresses, MAX_ADDRESSES, setDefaultAddress, updateAddress,
} from '../../services/client-api';
import { STATES, ufOf } from '../../services/status';
import AccountNav from './AccountNav.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// Endereços de entrega (task 31). Rotas: GET/POST storefront/{slug}/me/addresses,
// PUT .../me/addresses/{id}, PUT .../me/addresses/{id}/default, DELETE .../me/addresses/{id}.
// Cada escrita devolve a lista inteira: a tela troca a lista pela resposta, e o
// novo padrão (ao excluir o padrão, o mais recente) aparece sem F5.
// Busca de CEP não existe no back: o cliente digita o endereço.
const signedIn = computed(() => isSignedIn(REALMS.storefront));

const page = useAsync(listAddresses, { immediate: signedIn.value });
const addresses = shallowRef(null);
const list = computed(() => addresses.value ?? page.data.value ?? []);
const atLimit = computed(() => list.value.length >= MAX_ADDRESSES);

// Mensagem para leitor de tela depois de cada ação.
const announcement = ref('');
const titleOf = (a) => a.label || 'Endereço';
const applyList = (next, message) => {
  addresses.value = next;
  const fallback = next.find((a) => a.isDefault);
  announcement.value = message + (fallback ? ` Padrão: ${titleOf(fallback)}.` : '');
};

// ---------------------------------------------------------- formulário ---
const LIMITS = { label: 50, recipientName: 200, addressLine: 200, city: 100 };
const emptyForm = () => ({ label: '', recipientName: '', addressLine: '', city: '', stateId: 25, zipCode: '', isDefault: false });

const editing = ref(null); // null = fechado; { id: null } = novo; endereço = edição
const form = reactive(emptyForm());
const touched = ref(false);

// CEP: só dígitos, no formato 00000-000.
const maskZip = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};
const onZipInput = (event) => {
  form.zipCode = maskZip(event.target.value);
};

const openForm = (address = null) => {
  Object.assign(form, emptyForm(), address ? {
    label: address.label, recipientName: address.recipientName, addressLine: address.addressLine,
    city: address.city, stateId: address.stateId, zipCode: maskZip(address.zipCode), isDefault: address.isDefault,
  } : { isDefault: list.value.length === 0 });
  touched.value = false;
  save.error.value = null;
  editing.value = address ?? { id: null };
};
const closeForm = () => {
  editing.value = null;
};

const isNew = computed(() => editing.value && editing.value.id == null);
// O primeiro endereço é sempre o padrão; o padrão atual não deixa de ser pelo formulário.
const defaultLocked = computed(() => (isNew.value ? list.value.length === 0 : Boolean(editing.value?.isDefault)));

// Validação no cliente (o back valida de novo); erro do servidor por campo vem junto.
const serverFieldError = (field) => {
  const entries = Object.entries(save.error.value?.fieldErrors ?? {});
  return entries.find(([key]) => key.toLowerCase().endsWith(field.toLowerCase()))?.[1]?.[0] ?? '';
};
const clientErrors = computed(() => {
  const errors = {};
  if (!form.addressLine.trim()) errors.addressLine = 'Informe rua, número e bairro.';
  if (!form.city.trim()) errors.city = 'Informe a cidade.';
  if (form.zipCode.replace(/\D/g, '').length !== 8) errors.zipCode = 'O CEP tem 8 dígitos.';
  Object.entries(LIMITS).forEach(([key, max]) => {
    if (form[key].trim().length > max) errors[key] = `Use no máximo ${max} caracteres.`;
  });
  return errors;
});
const errorOf = (field) => (touched.value ? clientErrors.value[field] : '') || serverFieldError(field);

const save = useAction(async () => {
  const id = editing.value.id;
  const next = id == null ? await addAddress(form) : await updateAddress(id, form);
  applyList(next, id == null ? 'Endereço adicionado.' : 'Endereço atualizado.');
  closeForm();
});
const submit = () => {
  touched.value = true;
  if (Object.keys(clientErrors.value).length) return;
  save.run();
};

// ------------------------------------------------------------- padrão ---
const makingDefault = ref(null);
const makeDefault = useAction(async (address) => {
  makingDefault.value = address.id;
  try {
    applyList(await setDefaultAddress(address.id), `${titleOf(address)} agora é o endereço padrão.`);
  } finally {
    makingDefault.value = null;
  }
});

// ------------------------------------------------------------ excluir ---
const removing = ref(null);
const askRemove = (address) => {
  remove.error.value = null;
  removing.value = address;
};
const remove = useAction(async () => {
  const address = removing.value;
  applyList(await deleteAddress(address.id), `${titleOf(address)} excluído.`);
  removing.value = null;
});

const actionError = computed(() => makeDefault.error.value);
</script>

<template>
  <div class="ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <h1 class="ds-title ds-title--lg">
          Endereços
        </h1>
        <p
          v-if="signedIn && !page.isLoading.value"
          class="ds-text-secondary"
        >
          {{ list.length }} de {{ MAX_ADDRESSES }} endereços de entrega
        </p>
      </div>
      <div class="ds-cluster ds-cluster--2">
        <AccountNav />
        <button
          v-if="signedIn"
          type="button"
          class="ds-btn ds-btn--primary ds-btn--sm ds-tap"
          :disabled="atLimit || page.isLoading.value"
          :title="atLimit ? `Limite de ${MAX_ADDRESSES} endereços` : undefined"
          @click="openForm()"
        >
          <Plus
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Novo endereço
        </button>
      </div>
    </div>

    <article
      v-if="!signedIn"
      class="ds-card ds-empty"
    >
      <MapPin
        :size="24"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p>Entre na sua conta para ver seus endereços.</p>
      <a
        class="ds-btn ds-btn--primary ds-btn--sm ds-tap"
        :href="href('/conta')"
      >Entrar</a>
    </article>

    <LoadState
      v-else
      :is-loading="page.isLoading.value"
      :error="page.error.value"
      :is-empty="!list.length"
      empty-text="Nenhum endereço salvo. Cadastre um para usar no checkout sem redigitar."
      :lines="6"
      @retry="page.reload()"
    >
      <template #empty-action>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm ds-tap"
          @click="openForm()"
        >
          Cadastrar endereço
        </button>
      </template>

      <div class="ds-stack--4">
        <p
          v-if="atLimit"
          class="ds-hint"
        >
          Você chegou ao limite de {{ MAX_ADDRESSES }} endereços. Exclua um para cadastrar outro.
        </p>
        <p
          v-if="actionError"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ actionError.message }}
        </p>

        <ul
          class="ds-grid ds-grid--2"
          role="list"
        >
          <li
            v-for="address in list"
            :key="address.id"
            class="ds-card ds-stack--4"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                {{ titleOf(address) }}
              </h2>
              <span
                v-if="address.isDefault"
                class="ds-badge ds-badge--success"
              >Padrão</span>
            </header>
            <div class="ds-stack--1 ds-text-sm">
              <span v-if="address.recipientName">{{ address.recipientName }}</span>
              <span>{{ address.addressLine }}</span>
              <span>{{ address.city }} · {{ ufOf(address.stateId) }}</span>
              <span class="ds-numeric ds-text-secondary">CEP {{ maskZip(address.zipCode) }}</span>
            </div>
            <footer class="ds-card__footer ds-cluster ds-cluster--2">
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm ds-tap"
                :aria-label="`Editar ${titleOf(address)}`"
                @click="openForm(address)"
              >
                <Pencil
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Editar
              </button>
              <button
                v-if="!address.isDefault"
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm ds-tap"
                :disabled="makingDefault !== null"
                :aria-busy="makingDefault === address.id"
                :aria-label="`Tornar ${titleOf(address)} o endereço padrão`"
                @click="makeDefault.run(address)"
              >
                <Star
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Tornar padrão
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm ds-tap"
                :aria-label="`Excluir ${titleOf(address)}`"
                @click="askRemove(address)"
              >
                <Trash2
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Excluir
              </button>
            </footer>
          </li>
        </ul>
      </div>
    </LoadState>

    <p
      class="ds-sr-only"
      aria-live="polite"
    >
      {{ announcement }}
    </p>

    <ModalDialog
      v-if="editing"
      :title="isNew ? 'Novo endereço' : 'Editar endereço'"
      @close="closeForm"
    >
      <form
        id="address-form"
        class="ds-stack--4"
        novalidate
        @submit.prevent="submit"
      >
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="addr-label"
            >Nome do endereço <span class="ds-text-secondary">(opcional)</span></label>
            <input
              id="addr-label"
              v-model="form.label"
              class="ds-input"
              placeholder="Casa, Trabalho…"
              :maxlength="LIMITS.label"
              autofocus
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="addr-recipient"
            >Quem recebe <span class="ds-text-secondary">(opcional)</span></label>
            <input
              id="addr-recipient"
              v-model="form.recipientName"
              class="ds-input"
              autocomplete="name"
              :maxlength="LIMITS.recipientName"
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="addr-zip"
            >CEP</label>
            <input
              id="addr-zip"
              :value="form.zipCode"
              class="ds-input ds-numeric"
              inputmode="numeric"
              autocomplete="postal-code"
              placeholder="00000-000"
              required
              :aria-invalid="errorOf('zipCode') ? 'true' : undefined"
              :aria-describedby="errorOf('zipCode') ? 'addr-zip-error' : undefined"
              @input="onZipInput"
            >
            <span
              v-if="errorOf('zipCode')"
              id="addr-zip-error"
              class="ds-error"
            >{{ errorOf('zipCode') }}</span>
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="addr-uf"
            >UF</label>
            <select
              id="addr-uf"
              v-model.number="form.stateId"
              class="ds-input"
              autocomplete="address-level1"
            >
              <option
                v-for="state in STATES"
                :key="state.id"
                :value="state.id"
              >
                {{ state.uf }} · {{ state.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="addr-line"
          >Endereço</label>
          <input
            id="addr-line"
            v-model="form.addressLine"
            class="ds-input"
            autocomplete="street-address"
            placeholder="Rua, número, complemento e bairro"
            required
            :maxlength="LIMITS.addressLine"
            :aria-invalid="errorOf('addressLine') ? 'true' : undefined"
            :aria-describedby="errorOf('addressLine') ? 'addr-line-error' : undefined"
          >
          <span
            v-if="errorOf('addressLine')"
            id="addr-line-error"
            class="ds-error"
          >{{ errorOf('addressLine') }}</span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="addr-city"
          >Cidade</label>
          <input
            id="addr-city"
            v-model="form.city"
            class="ds-input"
            autocomplete="address-level2"
            required
            :maxlength="LIMITS.city"
            :aria-invalid="errorOf('city') ? 'true' : undefined"
            :aria-describedby="errorOf('city') ? 'addr-city-error' : undefined"
          >
          <span
            v-if="errorOf('city')"
            id="addr-city-error"
            class="ds-error"
          >{{ errorOf('city') }}</span>
        </div>

        <label class="ds-check">
          <input
            v-model="form.isDefault"
            type="checkbox"
            :disabled="defaultLocked"
          >
          <span>Usar como endereço padrão no checkout</span>
        </label>
        <span
          v-if="defaultLocked"
          class="ds-hint"
        >
          {{ isNew ? 'O primeiro endereço é sempre o padrão.' : 'Este já é o padrão. Para trocar, torne outro endereço padrão.' }}
        </span>
        <span
          v-if="!isNew"
          class="ds-hint"
        >Alterar este endereço não muda pedidos já feitos: cada pedido guarda o endereço da compra.</span>

        <p
          v-if="save.error.value && !Object.keys(save.error.value.fieldErrors ?? {}).length"
          class="ds-error"
          role="alert"
        >
          {{ save.error.value.message }}
        </p>
      </form>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="address-form"
          class="ds-btn ds-btn--primary"
          :disabled="save.isPending.value"
          :aria-busy="save.isPending.value"
        >
          {{ isNew ? 'Salvar endereço' : 'Salvar alterações' }}
        </button>
      </template>
    </ModalDialog>

    <ModalDialog
      v-if="removing"
      title="Excluir endereço?"
      @close="removing = null"
    >
      <p>
        <strong>{{ titleOf(removing) }}</strong>: {{ removing.addressLine }}, {{ removing.city }} · {{ ufOf(removing.stateId) }}.
      </p>
      <p
        v-if="removing.isDefault && list.length > 1"
        class="ds-text-secondary"
      >
        Este é o endereço padrão. O endereço cadastrado mais recentemente passa a ser o padrão.
      </p>
      <p class="ds-text-secondary">
        Pedidos já feitos não mudam.
      </p>
      <p
        v-if="remove.error.value"
        class="ds-error"
        role="alert"
      >
        {{ remove.error.value.message }}
      </p>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          autofocus
          @click="removing = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--danger"
          :disabled="remove.isPending.value"
          :aria-busy="remove.isPending.value"
          @click="remove.run()"
        >
          Excluir
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
