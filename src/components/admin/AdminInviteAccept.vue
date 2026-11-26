<script setup>
import { reactive } from 'vue';
import { AlertCircle } from '@lucide/vue';
import { navigate } from '../../router';
import { useAction } from '../../composables/useAsync';
import { acceptInvitation, acceptOwnershipTransfer } from '../../services/team-api';

// Aceite (#/admin/convite): convite para a equipe ou transferência de propriedade.
// Rotas (/api/store): POST identity/invitations/accept { token } e
// POST identity/ownership-transfers/accept { token, currentPassword }. Vale com a
// conta logada sem loja escolhida; o e-mail precisa ser o do convite.
const form = reactive({ kind: 'invitation', token: '', currentPassword: '' });

const accept = useAction(async () => {
  if (form.kind === 'invitation') await acceptInvitation(form.token);
  else await acceptOwnershipTransfer(form);
  navigate('/admin/entrar/loja');
});
</script>

<template>
  <section class="ds-container--narrow ds-stack--6">
    <div class="ds-stack--1">
      <h1 class="ds-title ds-title--lg">
        Aceitar convite
      </h1>
      <p class="ds-text-secondary">
        Cole o código que o dono da loja enviou. Depois do aceite, a loja aparece na sua lista.
      </p>
    </div>

    <form
      class="ds-card ds-stack--5"
      @submit.prevent="accept.run()"
    >
      <fieldset class="ds-stack--1">
        <legend class="ds-label">
          O que você recebeu
        </legend>
        <label class="ds-check">
          <input
            v-model="form.kind"
            type="radio"
            name="accept-kind"
            value="invitation"
          >
          Convite para a equipe
        </label>
        <label class="ds-check">
          <input
            v-model="form.kind"
            type="radio"
            name="accept-kind"
            value="transfer"
          >
          Transferência de propriedade
        </label>
      </fieldset>
      <div class="ds-field">
        <label
          class="ds-label"
          for="accept-token"
        >Código</label>
        <input
          id="accept-token"
          v-model="form.token"
          class="ds-input"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          required
          autofocus
        >
      </div>
      <div
        v-if="form.kind === 'transfer'"
        class="ds-field"
      >
        <label
          class="ds-label"
          for="accept-password"
        >Sua senha atual</label>
        <input
          id="accept-password"
          v-model="form.currentPassword"
          class="ds-input"
          type="password"
          autocomplete="current-password"
          required
        >
      </div>
      <p
        v-if="accept.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ accept.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="navigate('/admin/entrar/loja')"
        >
          Voltar
        </button>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="accept.isPending.value"
          :aria-busy="accept.isPending.value"
        >
          <span
            v-if="accept.isPending.value"
            class="ds-spinner"
            aria-hidden="true"
          />
          Aceitar
        </button>
      </div>
    </form>
  </section>
</template>
