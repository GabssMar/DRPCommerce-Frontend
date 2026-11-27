<script setup>
import { reactive } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle } from '@lucide/vue';
import { href } from '../../router';
import { MOCK_HINTS } from '../../services/config';
import { useAction } from '../../composables/useAsync';
import { loginEmployee } from '../../services/auth';
import { authNotice } from '../../services/session';

// Login da equipe: POST /api/store/api/auth/login. Quem tem várias lojas (ou
// nenhuma) recebe um token sem loja e o painel abre a escolha (AdminEnterpriseChoice).
const emit = defineEmits(['signed-in']);

const credentials = reactive({ email: '', password: '' });

const login = useAction(async () => {
  await loginEmployee(credentials);
  authNotice.backoffice = '';
  emit('signed-in');
});
</script>

<template>
  <section class="ds-container--narrow ds-stack--6">
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
    <div class="ds-stack--1">
      <h1 class="ds-title ds-title--lg">
        Entrar no painel
      </h1>
      <p class="ds-text-secondary">
        Acesso da equipe da loja. O login de cliente é separado.
      </p>
      <p
        v-if="MOCK_HINTS"
        class="ds-hint"
      >
        {{ MOCK_HINTS.backoffice }}
      </p>
    </div>

    <p
      v-if="authNotice.backoffice"
      class="ds-hint ds-text-success"
      role="status"
    >
      <CheckCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      {{ authNotice.backoffice }}
    </p>

    <form
      class="ds-card ds-stack--5"
      @submit.prevent="login.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="adm-email"
        >E-mail</label>
        <input
          id="adm-email"
          v-model="credentials.email"
          class="ds-input"
          type="email"
          autocomplete="username"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="adm-pass"
        >Senha</label>
        <input
          id="adm-pass"
          v-model="credentials.password"
          class="ds-input"
          type="password"
          autocomplete="current-password"
          required
        >
      </div>
      <p
        v-if="login.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ login.error.value.message }}
      </p>
      <button
        type="submit"
        class="ds-btn ds-btn--primary ds-btn--block"
        :disabled="login.isPending.value"
        :aria-busy="login.isPending.value"
      >
        Entrar
      </button>
    </form>
  </section>
</template>
