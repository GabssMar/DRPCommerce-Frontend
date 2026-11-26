<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, MonitorSmartphone } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { changePassword, listSessions, logoutAll, logoutCustomer, logoutEmployee, revokeSession } from '../../services/auth';
import { formatDateTime } from '../../services/format';
import { authNotice, REALMS } from '../../services/session';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// Segurança da conta (cliente e equipe). Rotas (/api/store): [storefront/]auth/sessions,
// sessions/{familyId}, logout-all e change-password. O back ainda não informa o
// aparelho de cada sessão.
const props = defineProps({
  realm: { type: String, required: true, validator: (value) => Object.values(REALMS).includes(value) },
});

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

// Sessões: a atual primeiro, depois as mais recentes.
const sessions = useAsync(() => listSessions(props.realm), { initial: [] });
const ordered = computed(() => [...(sessions.data.value ?? [])].sort((a, b) =>
  Number(b.isCurrent) - Number(a.isCurrent) || String(b.createdAt).localeCompare(String(a.createdAt))));
const others = computed(() => ordered.value.filter((s) => !s.isCurrent));

const leave = () => (props.realm === REALMS.storefront ? logoutCustomer() : logoutEmployee());

const confirming = ref(null);
const confirmAction = useAction(async () => {
  const target = confirming.value;
  if (target?.kind === 'revoke') {
    await revokeSession(props.realm, target.session.familyId);
    confirming.value = null;
    await sessions.reload();
    return;
  }
  if (target?.kind === 'all') await logoutAll(props.realm);
  if (target?.kind === 'current') await leave();
  confirming.value = null;
});

const openConfirm = (target) => {
  confirmAction.error.value = null;
  confirming.value = target;
};
const closeConfirm = () => {
  confirming.value = null;
};


const CONFIRM_TEXT = {
  revoke: {
    title: 'Encerrar sessão',
    body: 'O aparelho ou navegador dessa sessão vai precisar entrar de novo.',
    action: 'Encerrar sessão',
  },
  current: {
    title: 'Sair desta sessão',
    body: 'Você sai neste navegador. As outras sessões continuam abertas.',
    action: 'Sair',
  },
  all: {
    title: 'Sair de todas as sessões',
    body: 'Todas as sessões da conta são encerradas, inclusive esta. Você vai precisar entrar de novo em cada aparelho.',
    action: 'Sair de todas',
  },
};
const confirmText = computed(() => CONFIRM_TEXT[confirming.value?.kind] ?? CONFIRM_TEXT.all);

// Senha
const passwords = reactive({ currentPassword: '', newPassword: '', confirmation: '' });
const passwordError = ref('');

const validatePassword = () => {
  const { currentPassword, newPassword, confirmation } = passwords;
  if (!currentPassword) return 'Informe a senha atual.';
  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return `A nova senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`;
  }
  if (newPassword !== confirmation) return 'A confirmação não confere com a nova senha.';
  return '';
};

const savePassword = useAction(async () => {
  passwordError.value = validatePassword();
  if (passwordError.value) return;
  await changePassword(props.realm, {
    currentPassword: passwords.currentPassword,
    newPassword: passwords.newPassword,
  });
  // A troca encerra as sessões: o App volta ao login, que mostra este aviso.
  authNotice[props.realm] = 'Senha alterada. Entre de novo com a nova senha.';
  Object.assign(passwords, { currentPassword: '', newPassword: '', confirmation: '' });
});

const passwordMessage = computed(() => passwordError.value || savePassword.error.value?.message || '');
</script>

<template>
  <div class="ds-grid ds-grid--2">
    <section class="ds-card ds-card--flush">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Sessões ativas
        </h2>
        <button
          v-if="others.length"
          type="button"
          class="ds-btn ds-btn--ghost ds-btn--sm"
          @click="openConfirm({ kind: 'all' })"
        >
          Sair de todas
        </button>
      </header>
      <LoadState
        :is-loading="sessions.isLoading.value"
        :error="sessions.error.value"
        :is-empty="!ordered.length"
        empty-text="Nenhuma sessão ativa."
        :lines="3"
        flush
        @retry="sessions.reload"
      >
        <ul class="ds-list">
          <li
            v-for="item in ordered"
            :key="item.familyId"
            class="ds-list__item"
          >
            <span
              class="ds-icon-tile"
              aria-hidden="true"
            >
              <MonitorSmartphone
                :size="20"
                :stroke-width="1.5"
              />
            </span>
            <span class="ds-stack--1 ds-min-0">
              <strong class="ds-text-medium">{{ item.isCurrent ? 'Este navegador' : 'Outra sessão' }}</strong>
              <span class="ds-text-sm ds-text-secondary">
                Iniciada em {{ formatDateTime(item.createdAt) }} · expira em {{ formatDateTime(item.expiresAt) }}
              </span>
            </span>
            <span class="ds-list__meta">
              <span
                v-if="item.isCurrent"
                class="ds-badge ds-badge--success"
              >Esta sessão</span>
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                :aria-label="item.isCurrent ? 'Sair desta sessão' : `Encerrar sessão iniciada em ${formatDateTime(item.createdAt)}`"
                @click="openConfirm(item.isCurrent ? { kind: 'current' } : { kind: 'revoke', session: item })"
              >
                {{ item.isCurrent ? 'Sair' : 'Encerrar' }}
              </button>
            </span>
          </li>
        </ul>
      </LoadState>
    </section>

    <form
      class="ds-card ds-stack--4"
      novalidate
      @submit.prevent="savePassword.run()"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Trocar senha
        </h2>
      </header>
      <div class="ds-field">
        <label
          class="ds-label"
          :for="`${realm}-pass-current`"
        >Senha atual</label>
        <input
          :id="`${realm}-pass-current`"
          v-model="passwords.currentPassword"
          class="ds-input"
          type="password"
          autocomplete="current-password"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          :for="`${realm}-pass-new`"
        >Nova senha</label>
        <input
          :id="`${realm}-pass-new`"
          v-model="passwords.newPassword"
          class="ds-input"
          type="password"
          autocomplete="new-password"
          :minlength="PASSWORD_MIN"
          :maxlength="PASSWORD_MAX"
          :aria-describedby="`${realm}-pass-hint`"
          :aria-invalid="passwordError ? 'true' : undefined"
          required
        >
        <span
          :id="`${realm}-pass-hint`"
          class="ds-hint"
        >De {{ PASSWORD_MIN }} a {{ PASSWORD_MAX }} caracteres.</span>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          :for="`${realm}-pass-confirm`"
        >Confirme a nova senha</label>
        <input
          :id="`${realm}-pass-confirm`"
          v-model="passwords.confirmation"
          class="ds-input"
          type="password"
          autocomplete="new-password"
          :aria-invalid="passwordError ? 'true' : undefined"
          required
        >
      </div>
      <p
        v-if="passwordMessage"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ passwordMessage }}
      </p>
      <button
        type="submit"
        class="ds-btn ds-btn--primary ds-btn--block"
        :disabled="savePassword.isPending.value"
        :aria-busy="savePassword.isPending.value"
      >
        <span
          v-if="savePassword.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Alterar senha
      </button>
      <span class="ds-hint">Alterar a senha encerra todas as sessões, inclusive esta: você entra de novo com a nova senha.</span>
    </form>

    <ModalDialog
      v-if="confirming"
      :title="confirmText.title"
      @close="closeConfirm"
    >
      <p class="ds-text-sm">
        {{ confirmText.body }}
      </p>
      <p
        v-if="confirmAction.error.value"
        class="ds-error"
        role="alert"
      >
        {{ confirmAction.error.value.message }}
      </p>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="closeConfirm"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--danger"
          :disabled="confirmAction.isPending.value"
          @click="confirmAction.run()"
        >
          {{ confirmText.action }}
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
