<script setup>
import { reactive, ref } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { useAction } from '../../composables/useAsync';
import { loginEmployee, selectEnterprise } from '../../services/auth';

// Login da equipe: POST /api/store/auth/login e, com mais de uma loja,
// POST /api/store/auth/select-enterprise.
const emit = defineEmits(['signed-in']);

const credentials = reactive({ email: '', password: '' });
const choices = ref([]);

const login = useAction(async () => {
  const result = await loginEmployee(credentials);
  if (result?.requiresEnterpriseSelection && result.enterprises?.length > 1) {
    choices.value = result.enterprises;
    return;
  }
  emit('signed-in');
});

const choose = useAction(async (membershipId) => {
  await selectEnterprise(membershipId);
  emit('signed-in');
});
</script>

<template>
  <section class="ds-container--narrow ds-stack--6">
    <div class="ds-stack--1">
      <h1 class="ds-title ds-title--lg">
        Entrar no painel
      </h1>
      <p class="ds-text-secondary">
        Acesso da equipe da loja.
      </p>
    </div>

    <article
      v-if="choices.length"
      class="ds-card ds-stack--4"
    >
      <h2 class="ds-card__title">
        Qual loja?
      </h2>
      <button
        v-for="choice in choices"
        :key="choice.membershipId"
        type="button"
        class="ds-btn ds-btn--secondary ds-btn--block"
        :disabled="choose.isPending.value"
        @click="choose.run(choice.membershipId)"
      >
        {{ choice.tradeName }}
      </button>
      <p
        v-if="choose.error.value"
        class="ds-error"
        role="alert"
      >
        {{ choose.error.value.message }}
      </p>
    </article>

    <form
      v-else
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
