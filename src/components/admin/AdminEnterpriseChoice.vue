<script setup>
import { computed, reactive } from 'vue';
import { AlertCircle, Store } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { listMyEnterprises, registerEnterprise } from '../../services/admin-api';
import { logoutEmployee, selectEnterprise } from '../../services/auth';
import { currentEnterpriseId, hasSelectedEnterprise } from '../../services/session';
import { labelOf, MEMBERSHIP_KIND, STATES } from '../../services/status';
import LoadState from '../ui/LoadState.vue';

// Escolha da loja (#/admin/entrar/loja). Rotas (/api/store): GET enterprises/mine,
// POST auth/select-enterprise e, sem loja, POST enterprises/register. O back ainda não informa se a loja está pausada.
const emit = defineEmits(['selected']);

const list = useAsync(listMyEnterprises, { initial: [] });
const choices = computed(() => list.data.value ?? []);

const currentId = computed(() => {
  if (!hasSelectedEnterprise()) return null;
  try {
    return currentEnterpriseId();
  } catch {
    return null;
  }
});

const choose = useAction(async (membershipId) => {
  await selectEnterprise(membershipId);
  emit('selected');
});

// Primeira loja
const form = reactive({
  tradeName: '', legalName: '', email: '', phone: '', addressLine: '', city: '', stateId: 25, zipCode: '', country: 'Brasil', slug: '',
});

const create = useAction(async () => {
  const created = await registerEnterprise({
    ...form,
    slug: form.slug.trim().toLowerCase(),
    stateId: Number(form.stateId),
  });
  const mine = await listMyEnterprises();
  const membership = mine.find((m) => m.enterpriseId === created?.id);
  if (!membership) throw new Error('A loja foi criada, mas ainda não aparece na sua conta. Recarregue a página para abri-la.');
  await selectEnterprise(membership.membershipId);
  emit('selected');
});

const leave = useAction(logoutEmployee);
</script>

<template>
  <section class="ds-container--narrow ds-stack--6">
    <div class="ds-stack--1">
      <h1 class="ds-title ds-title--lg">
        {{ choices.length || list.isLoading.value ? 'Qual loja abrir?' : 'Crie sua primeira loja' }}
      </h1>
      <p class="ds-text-secondary">
        {{ choices.length || list.isLoading.value
          ? 'Sua conta tem acesso a mais de uma loja. O painel abre na loja escolhida.'
          : 'Sua conta ainda não tem loja. Cadastre a primeira para usar o painel.' }}
      </p>
    </div>

    <LoadState
      :is-loading="list.isLoading.value"
      :error="list.error.value"
      :lines="3"
      @retry="list.reload"
    >
      <div
        v-if="choices.length"
        class="ds-stack--3"
      >
        <div class="ds-card ds-card--flush">
          <ul class="ds-list">
            <li
              v-for="choice in choices"
              :key="choice.membershipId"
              class="ds-list__item"
            >
              <span
                class="ds-icon-tile"
                aria-hidden="true"
              >
                <Store
                  :size="20"
                  :stroke-width="1.5"
                />
              </span>
              <span class="ds-stack--1 ds-min-0">
                <strong class="ds-text-medium">{{ choice.tradeName }}</strong>
                <span class="ds-text-sm ds-text-secondary">{{ labelOf(MEMBERSHIP_KIND, choice.kindId) }}</span>
              </span>
              <span class="ds-list__meta">
                <span
                  v-if="choice.enterpriseId === currentId"
                  class="ds-badge ds-badge--success"
                >Atual</span>
                <button
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="choose.isPending.value"
                  :aria-label="`Abrir ${choice.tradeName}`"
                  @click="choose.run(choice.membershipId)"
                >
                  Abrir
                </button>
              </span>
            </li>
          </ul>
        </div>
        <p
          v-if="choose.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ choose.error.value.message }}
        </p>
      </div>

      <form
        v-else
        class="ds-card ds-stack--5"
        @submit.prevent="create.run()"
      >
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            Dados da loja
          </h2>
        </header>
        <div class="ds-grid ds-grid--form">
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-trade"
            >Nome fantasia</label>
            <input
              id="ec-trade"
              v-model="form.tradeName"
              class="ds-input"
              required
              autofocus
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-legal"
            >Razão social</label>
            <input
              id="ec-legal"
              v-model="form.legalName"
              class="ds-input"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-slug"
            >Subdomínio</label>
            <input
              id="ec-slug"
              v-model="form.slug"
              class="ds-input"
              autocapitalize="none"
              spellcheck="false"
              pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
              aria-describedby="ec-slug-hint"
              required
            >
            <span
              id="ec-slug-hint"
              class="ds-hint"
            >Endereço da vitrine, ex.: minha-loja. Letras minúsculas, números e hífens.</span>
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-email"
            >E-mail da loja</label>
            <input
              id="ec-email"
              v-model="form.email"
              class="ds-input"
              type="email"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-phone"
            >Telefone</label>
            <input
              id="ec-phone"
              v-model="form.phone"
              class="ds-input"
              inputmode="tel"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-addr"
            >Endereço</label>
            <input
              id="ec-addr"
              v-model="form.addressLine"
              class="ds-input"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-city"
            >Cidade</label>
            <input
              id="ec-city"
              v-model="form.city"
              class="ds-input"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-uf"
            >UF</label>
            <select
              id="ec-uf"
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
              for="ec-zip"
            >CEP</label>
            <input
              id="ec-zip"
              v-model="form.zipCode"
              class="ds-input"
              inputmode="numeric"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="ec-country"
            >País</label>
            <input
              id="ec-country"
              v-model="form.country"
              class="ds-input"
              required
            >
          </div>
        </div>
        <p
          v-if="create.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ create.error.value.message }}
        </p>
        <div class="ds-cluster ds-cluster--end">
          <button
            type="submit"
            class="ds-btn ds-btn--primary"
            :disabled="create.isPending.value"
            :aria-busy="create.isPending.value"
          >
            <span
              v-if="create.isPending.value"
              class="ds-spinner"
              aria-hidden="true"
            />
            Criar loja
          </button>
        </div>
      </form>
    </LoadState>

    <button
      type="button"
      class="ds-btn ds-btn--ghost ds-self-start"
      :disabled="leave.isPending.value"
      @click="leave.run()"
    >
      Sair e entrar com outra conta
    </button>
  </section>
</template>
