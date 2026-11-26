<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle } from '@lucide/vue';
import { href, navigate } from '../../router';
import { useAction } from '../../composables/useAsync';
import { IS_MOCK, MOCK_CUSTOMER_EMAIL } from '../../services/config';
import { authNotice } from '../../services/session';
import { loginCustomer, registerCustomer } from '../../services/auth';
import { STATES } from '../../services/status';
import { fromCalendarInput } from '../../services/format';

// Entrar ou criar conta (cliente) com o mesmo formulário. Aparece em #/entrar,
// #/criar-conta e no lugar de qualquer rota da loja aberta sem sessão.
// Rotas (back-end atual): POST storefront/auth/login | register
const props = defineProps({
  // 'login' ou 'register': em qual aba o formulário abre.
  initialMode: { type: String, default: 'login' },
});
const GENDERS = ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'];

const form = reactive({
  fullName: '', email: '', phone: '', dateOfBirth: '', gender: GENDERS[3],
  zipCode: '', addressLine: '', city: '', stateId: 25, country: 'Brasil',
});

// Erro de validação por campo: o back devolve o nome em PascalCase ou camelCase.
const fieldError = (err, field) => {
  const entries = Object.entries(err?.fieldErrors ?? {});
  return entries.find(([key]) => key.toLowerCase() === field.toLowerCase())?.[1]?.[0] ?? '';
};

const mode = ref(props.initialMode);
watch(() => props.initialMode, (value) => {
  mode.value = value;
});

// Em #/entrar e #/criar-conta, as abas também trocam a rota (link compartilhável).
const switchMode = (value) => {
  mode.value = value;
  if (props.initialMode !== value) navigate(value === 'login' ? '/entrar' : '/criar-conta');
};
const credentials = reactive({ email: '', password: '' });

// Aviso de quem saiu sem querer (senha alterada): some no próximo login.
const clearNotice = () => {
  authNotice.storefront = '';
};

const login = useAction(async () => {
  await loginCustomer(credentials);
  clearNotice();
});
const register = useAction(async () => {
  await registerCustomer({
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    password: credentials.password,
    phone: form.phone.trim(),
    addressLine: form.addressLine.trim(),
    city: form.city.trim(),
    stateId: Number(form.stateId),
    zipCode: form.zipCode.trim(),
    country: form.country.trim() || 'Brasil',
    gender: form.gender,
    dateOfBirth: fromCalendarInput(form.dateOfBirth),
  });
  clearNotice();
});
const activeAuth = computed(() => (mode.value === 'login' ? login : register));
</script>

<template>
  <div class="ds-stack--6">
    <a
      class="ds-back-link ds-self-start"
      :href="href('/')"
    >
      <ArrowLeft
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Início
    </a>
    <div class="ds-cluster ds-cluster--between">
      <div class="ds-stack--1">
        <h1 class="ds-title ds-title--lg">
          {{ mode === 'login' ? 'Entrar' : 'Criar conta' }}
        </h1>
        <p class="ds-text-secondary">
          {{ mode === 'login' ? 'Use o e-mail e a senha da sua conta.' : 'Você usa a conta nos drops e na vitrine.' }}
        </p>
      </div>
      <div
        class="ds-nav"
        role="group"
        aria-label="Entrar ou criar conta"
      >
        <button
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': mode === 'login' }]"
          :aria-pressed="mode === 'login'"
          @click="switchMode('login')"
        >
          Entrar
        </button>
        <button
          type="button"
          :class="['ds-nav__item', { 'ds-nav__item--active': mode === 'register' }]"
          :aria-pressed="mode === 'register'"
          @click="switchMode('register')"
        >
          Criar conta
        </button>
      </div>
    </div>

    <p
      v-if="authNotice.storefront"
      class="ds-hint ds-text-success"
      role="status"
    >
      <CheckCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      {{ authNotice.storefront }}
    </p>
    <p
      v-if="IS_MOCK && mode === 'login'"
      class="ds-hint"
    >
      Modo de exemplo: entre com <span class="ds-mono">{{ MOCK_CUSTOMER_EMAIL }}</span> e qualquer senha.
      <span class="ds-mono">bloqueado@exemplo.com</span> simula o bloqueio por tentativas.
    </p>

    <form
      class="ds-grid ds-grid--sidebar"
      @submit.prevent="activeAuth.run()"
    >
      <div class="ds-stack--6">
        <article class="ds-card ds-stack--5">
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Acesso
            </h2>
          </header>
          <div class="ds-grid ds-grid--2">
            <div class="ds-field">
              <label
                class="ds-label"
                for="au-email"
              >E-mail</label>
              <input
                v-if="mode === 'login'"
                id="au-email"
                v-model="credentials.email"
                class="ds-input"
                type="email"
                autocomplete="email"
                required
              >
              <input
                v-else
                id="au-email"
                v-model="form.email"
                class="ds-input"
                type="email"
                autocomplete="email"
                required
                :aria-invalid="fieldError(register.error.value, 'email') ? 'true' : undefined"
              >
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="au-pass"
              >Senha</label>
              <input
                id="au-pass"
                v-model="credentials.password"
                class="ds-input"
                type="password"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                :minlength="mode === 'register' ? 12 : undefined"
                :maxlength="mode === 'register' ? 128 : undefined"
                required
              >
              <span
                v-if="mode === 'register'"
                class="ds-hint"
              >De 12 a 128 caracteres.</span>
            </div>
          </div>
        </article>

        <template v-if="mode === 'register'">
          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Dados pessoais
              </h2>
            </header>
            <div class="ds-grid ds-grid--2">
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-name"
                >Nome completo</label>
                <input
                  id="rg-name"
                  v-model="form.fullName"
                  class="ds-input"
                  autocomplete="name"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-phone"
                >Celular</label>
                <input
                  id="rg-phone"
                  v-model="form.phone"
                  class="ds-input"
                  inputmode="tel"
                  autocomplete="tel"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-birth"
                >Data de nascimento</label>
                <input
                  id="rg-birth"
                  v-model="form.dateOfBirth"
                  class="ds-input"
                  type="date"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-gender"
                >Gênero</label>
                <select
                  id="rg-gender"
                  v-model="form.gender"
                  class="ds-input"
                >
                  <option
                    v-for="g in GENDERS"
                    :key="g"
                  >
                    {{ g }}
                  </option>
                </select>
              </div>
            </div>
          </article>
          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Endereço de entrega
              </h2>
            </header>
            <div class="ds-grid ds-grid--2">
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-zip"
                >CEP</label>
                <input
                  id="rg-zip"
                  v-model="form.zipCode"
                  class="ds-input"
                  inputmode="numeric"
                  autocomplete="postal-code"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-addr"
                >Endereço</label>
                <input
                  id="rg-addr"
                  v-model="form.addressLine"
                  class="ds-input"
                  autocomplete="street-address"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-city"
                >Cidade</label>
                <input
                  id="rg-city"
                  v-model="form.city"
                  class="ds-input"
                  autocomplete="address-level2"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="rg-uf"
                >UF</label>
                <select
                  id="rg-uf"
                  v-model.number="form.stateId"
                  class="ds-input"
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
          </article>
        </template>

        <p
          v-if="activeAuth.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ activeAuth.error.value.message }}
        </p>
        <div class="ds-cluster ds-cluster--end">
          <button
            type="submit"
            class="ds-btn ds-btn--primary"
            :disabled="activeAuth.isPending.value"
            :aria-busy="activeAuth.isPending.value"
          >
            <span
              v-if="activeAuth.isPending.value"
              class="ds-spinner"
              aria-hidden="true"
            />
            {{ mode === 'login' ? 'Entrar' : 'Criar conta' }}
          </button>
        </div>
      </div>

      <aside class="ds-stack--6">
        <article class="ds-card ds-card--inverse ds-stack--3">
          <span class="ds-label-caps">{{ mode === 'login' ? 'Primeiro acesso?' : 'Depois do cadastro' }}</span>
          <p class="ds-text-sm">
            {{ mode === 'login'
              ? 'Crie sua conta para se inscrever em drops, entrar na fila e comprar na vitrine.'
              : 'Envie seu CPF em Minha conta: drops com inscrição prévia exigem documento validado.' }}
          </p>
        </article>
      </aside>
    </form>
  </div>
</template>
