<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, CheckCircle, FileText, LogOut } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { navigate } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import { changeCustomerPassword, loginCustomer, logoutCustomer, registerCustomer } from '../../services/auth';
import { deactivateMe, getMe, getMyDocuments, sendDocument, updateMe } from '../../services/client-api';
import { DOCUMENT_STATUS, STATES } from '../../services/status';
import { formatDate, formatDateYear, fromDateInput, toDateInput } from '../../services/format';
import AccountNav from './AccountNav.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// C11 · Cadastro e meus dados. Rotas (back-end atual):
//   GET/PUT/DELETE storefront/me · POST storefront/auth/register | login | change-password
//   GET documents/get-all + POST documents/add (CPF, referenceType "Customer")
const signedIn = computed(() => isSignedIn(REALMS.storefront));

const GENDERS = ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'];

const emptyProfile = () => ({
  fullName: '', email: '', phone: '', dateOfBirth: '', gender: GENDERS[3],
  zipCode: '', addressLine: '', city: '', stateId: 25, country: 'Brasil',
});

const form = reactive(emptyProfile());

const page = useAsync(async () => {
  if (!signedIn.value) return null;
  const me = await getMe();
  const documents = await getMyDocuments(me.id).catch(() => []);
  return { me, document: documents.sort((a, b) => b.id - a.id)[0] ?? null };
}, { immediate: false });

watch(signedIn, () => page.reload(), { immediate: true });

const me = computed(() => page.data.value?.me ?? null);
const document = computed(() => page.data.value?.document ?? null);

watch(me, (customer) => {
  if (!customer) return;
  Object.assign(form, {
    fullName: customer.fullName, email: customer.email, phone: customer.phone,
    dateOfBirth: toDateInput(customer.dateOfBirth), gender: customer.gender || GENDERS[3],
    zipCode: customer.zipCode, addressLine: customer.addressLine, city: customer.city,
    stateId: customer.stateId, country: customer.country || 'Brasil',
  });
}, { immediate: true });

// Erro de validação por campo: o back devolve o nome em PascalCase ou camelCase.
const fieldError = (err, field) => {
  const entries = Object.entries(err?.fieldErrors ?? {});
  return entries.find(([key]) => key.toLowerCase() === field.toLowerCase())?.[1]?.[0] ?? '';
};

const profilePayload = () => ({
  fullName: form.fullName.trim(),
  phone: form.phone.trim(),
  addressLine: form.addressLine.trim(),
  city: form.city.trim(),
  stateId: Number(form.stateId),
  zipCode: form.zipCode.trim(),
  country: form.country.trim() || 'Brasil',
  gender: form.gender,
  dateOfBirth: fromDateInput(form.dateOfBirth),
});

const save = useAction(async () => {
  await updateMe(profilePayload());
  await page.reload();
});

// Entrar / criar conta
const mode = ref('login');
const credentials = reactive({ email: '', password: '' });
const login = useAction(() => loginCustomer(credentials));
const register = useAction(() => registerCustomer({
  ...profilePayload(),
  email: form.email.trim(),
  password: credentials.password,
}));
const activeAuth = computed(() => (mode.value === 'login' ? login : register));

const logout = useAction(logoutCustomer);

// Senha
const passwords = reactive({ currentPassword: '', newPassword: '' });
const passwordChanged = ref(false);
const changePassword = useAction(async () => {
  await changeCustomerPassword(passwords);
  passwordChanged.value = true;
  Object.assign(passwords, { currentPassword: '', newPassword: '' });
});

// Documento
const showDocumentModal = ref(false);
const cpf = ref('');
const sendCpf = useAction(async () => {
  await sendDocument(me.value.id, { number: cpf.value.trim(), fileUrl: '' });
  showDocumentModal.value = false;
  cpf.value = '';
  await page.reload();
});

// Excluir conta
const showDeleteModal = ref(false);
const removeAccount = useAction(async () => {
  await deactivateMe();
  await logoutCustomer().catch(() => {});
  showDeleteModal.value = false;
  navigate('/');
});
</script>

<template>
  <div class="ds-stack--6">
    <!-- Sem sessão: entrar ou criar conta com o mesmo formulário -->
    <template v-if="!signedIn">
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
            @click="mode = 'login'"
          >
            Entrar
          </button>
          <button
            type="button"
            :class="['ds-nav__item', { 'ds-nav__item--active': mode === 'register' }]"
            :aria-pressed="mode === 'register'"
            @click="mode = 'register'"
          >
            Criar conta
          </button>
        </div>
      </div>

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
                  :minlength="mode === 'register' ? 8 : undefined"
                  required
                >
                <span
                  v-if="mode === 'register'"
                  class="ds-hint"
                >Mínimo de 8 caracteres.</span>
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
    </template>

    <!-- Com sessão -->
    <template v-else>
      <div class="ds-cluster ds-cluster--between">
        <div class="ds-stack--1">
          <h1 class="ds-title ds-title--lg">
            Minha conta
          </h1>
          <p
            v-if="me"
            class="ds-text-secondary"
          >
            Cliente desde {{ formatDateYear(me.createdAt) }}
          </p>
        </div>
        <div class="ds-cluster ds-cluster--2">
          <AccountNav />
          <button
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm"
            :disabled="logout.isPending.value"
            @click="logout.run()"
          >
            <LogOut
              class="ds-btn__icon"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Sair
          </button>
        </div>
      </div>

      <LoadState
        :is-loading="page.isLoading.value"
        :error="page.error.value"
        :lines="8"
        @retry="page.reload"
      >
        <section
          v-if="me"
          class="ds-grid ds-grid--sidebar"
        >
          <form
            class="ds-stack--6"
            @submit.prevent="save.run()"
          >
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
                    for="ac-name"
                  >Nome completo</label>
                  <input
                    id="ac-name"
                    v-model="form.fullName"
                    class="ds-input"
                    autocomplete="name"
                    required
                    :aria-invalid="fieldError(save.error.value, 'fullName') ? 'true' : undefined"
                  >
                  <span
                    v-if="fieldError(save.error.value, 'fullName')"
                    class="ds-error"
                  >{{ fieldError(save.error.value, 'fullName') }}</span>
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-email"
                  >E-mail</label>
                  <input
                    id="ac-email"
                    :value="form.email"
                    class="ds-input"
                    type="email"
                    readonly
                    aria-describedby="ac-email-hint"
                  >
                  <span
                    id="ac-email-hint"
                    class="ds-hint"
                  >O e-mail é o seu login e não muda por aqui.</span>
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-phone"
                  >Celular</label>
                  <input
                    id="ac-phone"
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
                    for="ac-birth"
                  >Data de nascimento</label>
                  <input
                    id="ac-birth"
                    v-model="form.dateOfBirth"
                    class="ds-input"
                    type="date"
                    required
                  >
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-gender"
                  >Gênero</label>
                  <select
                    id="ac-gender"
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
                <span class="ds-text-xs ds-text-secondary">Usado no checkout de drops e da vitrine</span>
              </header>
              <div class="ds-grid ds-grid--2">
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-zip"
                  >CEP</label>
                  <input
                    id="ac-zip"
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
                    for="ac-addr"
                  >Endereço</label>
                  <input
                    id="ac-addr"
                    v-model="form.addressLine"
                    class="ds-input"
                    autocomplete="street-address"
                    required
                  >
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-city"
                  >Cidade</label>
                  <input
                    id="ac-city"
                    v-model="form.city"
                    class="ds-input"
                    autocomplete="address-level2"
                    required
                  >
                </div>
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-uf"
                  >UF</label>
                  <select
                    id="ac-uf"
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
            <div class="ds-cluster ds-cluster--between">
              <button
                type="button"
                class="ds-btn ds-btn--ghost-danger"
                @click="showDeleteModal = true"
              >
                Excluir minha conta
              </button>
              <span class="ds-cluster ds-cluster--2">
                <span
                  v-if="save.done.value"
                  class="ds-hint ds-text-success"
                  role="status"
                >Alterações salvas.</span>
                <button
                  type="submit"
                  class="ds-btn ds-btn--primary"
                  :disabled="save.isPending.value"
                  :aria-busy="save.isPending.value"
                >
                  Salvar alterações
                </button>
              </span>
            </div>
          </form>

          <aside class="ds-stack--6">
            <article class="ds-card ds-stack--4">
              <header class="ds-card__header">
                <h2 class="ds-card__title">
                  Verificação
                </h2>
                <StatusBadge
                  v-if="document"
                  :id="document.documentStatusId"
                  :table="DOCUMENT_STATUS"
                />
                <span
                  v-else
                  class="ds-badge ds-badge--done"
                >Sem documento</span>
              </header>
              <p class="ds-text-sm ds-text-secondary">
                Drops com inscrição prévia exigem CPF validado: é o que garante 1 unidade por pessoa.
              </p>
              <template v-if="document">
                <div class="ds-field">
                  <label
                    class="ds-label"
                    for="ac-cpf"
                  >CPF</label>
                  <input
                    id="ac-cpf"
                    class="ds-input ds-mono"
                    :value="document.number"
                    readonly
                  >
                </div>
                <div class="ds-card ds-card--sunken ds-card--tight ds-cluster ds-cluster--between">
                  <span class="ds-cluster ds-cluster--2 ds-text-sm">
                    <FileText
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    {{ document.fileUrl ? document.fileUrl.split('/').pop() : 'sem arquivo' }}
                  </span>
                  <span class="ds-text-xs ds-text-secondary">enviado {{ formatDate(document.createdAt) }}</span>
                </div>
              </template>
              <button
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--block"
                @click="showDocumentModal = true"
              >
                {{ document ? 'Enviar outro documento' : 'Enviar CPF' }}
              </button>
            </article>

            <form
              class="ds-card ds-stack--4"
              @submit.prevent="changePassword.run()"
            >
              <header class="ds-card__header">
                <h2 class="ds-card__title">
                  Senha
                </h2>
              </header>
              <!-- Usuário oculto: o gerenciador de senhas sabe de qual conta é a senha. -->
              <input
                class="ds-sr-only"
                type="email"
                autocomplete="username"
                :value="form.email"
                tabindex="-1"
                aria-hidden="true"
                readonly
              >
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="ac-pass-current"
                >Senha atual</label>
                <input
                  id="ac-pass-current"
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
                  for="ac-pass"
                >Nova senha</label>
                <input
                  id="ac-pass"
                  v-model="passwords.newPassword"
                  class="ds-input"
                  type="password"
                  autocomplete="new-password"
                  minlength="8"
                  placeholder="Mínimo 8 caracteres"
                  required
                >
              </div>
              <p
                v-if="changePassword.error.value"
                class="ds-error"
                role="alert"
              >
                {{ changePassword.error.value.message }}
              </p>
              <button
                type="submit"
                class="ds-btn ds-btn--secondary ds-btn--block"
                :disabled="changePassword.isPending.value"
              >
                Alterar senha
              </button>
              <span class="ds-hint">Alterar a senha encerra suas sessões: você entra de novo com a nova senha.</span>
            </form>
          </aside>
        </section>
      </LoadState>
    </template>

    <p
      v-if="passwordChanged && !signedIn"
      class="ds-hint ds-text-success"
      role="status"
    >
      <CheckCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Senha alterada. Entre de novo com a nova senha.
    </p>

    <ModalDialog
      v-if="showDocumentModal"
      title="Enviar CPF"
      @close="showDocumentModal = false"
    >
      <form
        id="cpf-form"
        class="ds-stack--4"
        @submit.prevent="sendCpf.run()"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="doc-cpf"
          >Número do CPF</label>
          <input
            id="doc-cpf"
            v-model="cpf"
            class="ds-input ds-mono"
            inputmode="numeric"
            placeholder="000.000.000-00"
            pattern="\d{3}\.?\d{3}\.?\d{3}-?\d{2}"
            required
            autofocus
          >
          <span class="ds-hint">A equipe valida o número antes do próximo drop. O envio do arquivo ainda não tem endpoint no back-end.</span>
        </div>
        <p
          v-if="sendCpf.error.value"
          class="ds-error"
          role="alert"
        >
          {{ sendCpf.error.value.message }}
        </p>
      </form>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="showDocumentModal = false"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="cpf-form"
          class="ds-btn ds-btn--primary"
          :disabled="sendCpf.isPending.value"
        >
          Enviar para validação
        </button>
      </template>
    </ModalDialog>

    <ModalDialog
      v-if="showDeleteModal"
      title="Excluir minha conta"
      @close="showDeleteModal = false"
    >
      <p class="ds-text-sm">
        Sua conta é desativada nesta loja: você sai das filas e listas de espera e não consegue mais entrar com este e-mail.
        Pedidos já feitos continuam sendo entregues.
      </p>
      <p
        v-if="removeAccount.error.value"
        class="ds-error"
        role="alert"
      >
        {{ removeAccount.error.value.message }}
      </p>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="showDeleteModal = false"
        >
          Manter conta
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--danger"
          :disabled="removeAccount.isPending.value"
          @click="removeAccount.run()"
        >
          Excluir conta
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
