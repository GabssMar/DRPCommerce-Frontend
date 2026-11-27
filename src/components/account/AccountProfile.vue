<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, FileText, LogOut } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href, navigate } from '../../router';
import { isSignedIn, REALMS } from '../../services/session';
import { deleteCustomerAccount, logoutCustomer } from '../../services/auth';
import { getDeletionEligibility, getMe, getMyDocuments, sendDocument, updateMe } from '../../services/client-api';
import { DOCUMENT_STATUS, STATES } from '../../services/status';
import { formatDate, formatDateYear, fromCalendarInput, toCalendarInput } from '../../services/format';
import AccountNav from './AccountNav.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import StatusBadge from '../ui/StatusBadge.vue';

// C11 · Cadastro e meus dados. Rotas (back-end atual):
//   GET/PUT storefront/me · POST storefront/auth/logout
//   GET storefront/me/deletion + DELETE storefront/me { currentPassword } (com CSRF)
//   (senha e sessões ficam em AccountSecurity.vue, #/conta/seguranca)
//   (entrar e criar conta ficam em CustomerAuth.vue)
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
    dateOfBirth: toCalendarInput(customer.dateOfBirth), gender: customer.gender || GENDERS[3],
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
  dateOfBirth: fromCalendarInput(form.dateOfBirth),
});

const save = useAction(async () => {
  await updateMe(profilePayload());
  await page.reload();
});

const logout = useAction(logoutCustomer);

// Documento
const showDocumentModal = ref(false);
const cpf = ref('');
const sendCpf = useAction(async () => {
  await sendDocument(me.value.id, { number: cpf.value.trim(), fileUrl: '' });
  showDocumentModal.value = false;
  cpf.value = '';
  await page.reload();
});

// Excluir conta: primeiro a prévia dos impedimentos, depois a senha atual.
const showDeleteModal = ref(false);
const deletePassword = ref('');
const eligibility = useAsync(getDeletionEligibility, { immediate: false });
const blockers = computed(() => eligibility.data.value?.blockers ?? []);
const canDelete = computed(() => eligibility.data.value?.canDelete === true);

const openDeleteModal = () => {
  deletePassword.value = '';
  showDeleteModal.value = true;
  eligibility.reload();
};

const removeAccount = useAction(async () => {
  try {
    await deleteCustomerAccount(deletePassword.value);
  } catch (err) {
    // 401 aqui é senha errada (a sessão em si foi aceita pela prévia).
    if (err.kind === 'auth') err.message = 'Senha incorreta.';
    // 409: surgiu um impedimento entre a prévia e o pedido; mostra a lista atual.
    if (err.kind === 'conflict') eligibility.reload();
    throw err;
  } finally {
    deletePassword.value = '';
  }
  showDeleteModal.value = false;
  navigate('/');
});
</script>

<template>
  <div class="ds-stack--6">
    <!-- O App só mostra esta tela com sessão; sem ela, mostra o login. -->
    <template v-if="signedIn">
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
                @click="openDeleteModal"
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

            <article class="ds-card ds-stack--3">
              <header class="ds-card__header">
                <h2 class="ds-card__title">
                  Senha e sessões
                </h2>
              </header>
              <p class="ds-text-sm ds-text-secondary">
                Troque a senha e veja onde sua conta está aberta.
              </p>
              <a
                class="ds-btn ds-btn--secondary ds-btn--block"
                :href="href('/conta/seguranca')"
              >
                Abrir segurança
              </a>
            </article>
          </aside>
        </section>
      </LoadState>
    </template>

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
      <div class="ds-stack--4">
        <p class="ds-text-sm">
          Seus dados pessoais são apagados nesta loja: telefone, endereços, carrinho e documentos. Suas sessões são
          encerradas e este e-mail deixa de entrar aqui. Pedidos, pagamentos e notas continuam registrados, com o nome e
          o contato usados na compra, porque a loja precisa deles para entrega, garantia e obrigações fiscais.
        </p>
        <LoadState
          :is-loading="eligibility.isLoading.value"
          :error="eligibility.error.value"
          :lines="2"
          @retry="eligibility.reload"
        >
          <div
            v-if="!canDelete"
            class="ds-card ds-card--sunken ds-stack--2"
            role="status"
          >
            <span class="ds-label-caps">Ainda não dá para excluir</span>
            <ul class="ds-list">
              <li
                v-for="b in blockers"
                :key="b.code"
                class="ds-list__item ds-text-sm"
              >
                {{ b.message }}<template v-if="b.count > 1">
                  ({{ b.count }})
                </template>
              </li>
            </ul>
            <span class="ds-hint">Conclua ou cancele esses itens e tente de novo. Se precisar de ajuda, fale com a loja.</span>
          </div>
          <form
            v-else
            id="delete-account-form"
            class="ds-stack--3"
            @submit.prevent="removeAccount.run()"
          >
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
                for="del-pass"
              >Confirme com sua senha atual</label>
              <input
                id="del-pass"
                v-model="deletePassword"
                class="ds-input"
                type="password"
                autocomplete="current-password"
                maxlength="128"
                required
                autofocus
              >
            </div>
          </form>
        </LoadState>
        <p
          v-if="removeAccount.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ removeAccount.error.value.message }}
        </p>
      </div>
      <template #footer>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="showDeleteModal = false"
        >
          Manter conta
        </button>
        <button
          type="submit"
          form="delete-account-form"
          class="ds-btn ds-btn--danger"
          :disabled="!canDelete || !deletePassword || removeAccount.isPending.value"
          :aria-busy="removeAccount.isPending.value"
        >
          Excluir conta
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
