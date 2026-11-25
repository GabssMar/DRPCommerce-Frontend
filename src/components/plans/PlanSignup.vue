<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, Check } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href, navigate } from '../../router';
import { IS_MOCK } from '../../services/config';
import { isSignedIn, REALMS } from '../../services/session';
import { loginEmployee, registerEmployee, selectEnterprise } from '../../services/auth';
import {
  FREE_PLAN_CODE, getContract, getPlanCatalog, listMyEnterprises, newIdempotencyKey, planHighlights,
  registerEnterprise, requestContractChange, SLUG_PATTERN, slugify, startCheckout,
} from '../../services/plans-api';
import { brl } from '../../services/format';
import { STATES } from '../../services/status';
import LoadState from '../ui/LoadState.vue';
import StepsBar from '../ui/StepsBar.vue';

// Cadastro de lojista vindo da landing page, com o plano escolhido:
//   1. Conta: POST auth/register + auth/login (ou login de quem já tem conta)
//   2. Loja:  POST enterprises/register → GET enterprises/mine → POST auth/select-enterprise
//   3. Plano: Gratuito termina aqui. Pago: GET contract → POST contract/requests →
//             POST billing/checkout → Mercado Pago (checkoutUrl). A volta cai em #/admin/plano,
//             que acompanha a confirmação.
// Quem já tem loja vai direto para #/admin/plano/:planId, onde a troca considera o contrato atual.
const props = defineProps({ params: { type: Object, default: () => ({}) } });
const emit = defineEmits(['signed-in']);

const planId = computed(() => Number(props.params.planId));
const catalog = useAsync(getPlanCatalog);
const plan = computed(() => catalog.data.value?.plans.find((p) => p.id === planId.value) ?? null);
const isFree = computed(() => plan.value && (plan.value.code === FREE_PLAN_CODE || plan.value.monthlyPrice === 0));

const STEPS = [{ label: 'Conta' }, { label: 'Loja' }, { label: 'Plano' }];
const step = ref(0);
const signedIn = computed(() => isSignedIn(REALMS.backoffice));

// Sessão de lojista já aberta: com loja, segue para a troca de plano no painel; sem loja, vai à etapa 2.
const routeExistingOwner = async () => {
  const stores = await listMyEnterprises();
  if (!stores.length) {
    step.value = 1;
    return;
  }
  emit('signed-in');
  navigate(`/admin/plano/${planId.value}`);
};
const checking = ref(signedIn.value);
onMounted(async () => {
  if (!signedIn.value) return;
  try {
    await routeExistingOwner();
  } finally {
    checking.value = false;
  }
});

// ------------------------------------------------------------- 1. CONTA ---
const hasAccount = ref(false);
const account = reactive({ fullName: '', email: '', password: '' });
const choices = ref([]);

const submitAccount = useAction(async () => {
  const result = hasAccount.value
    ? await loginEmployee({ email: account.email.trim(), password: account.password })
    : await registerEmployee({ fullName: account.fullName.trim(), email: account.email.trim(), password: account.password });
  account.password = '';
  // Sugestão para o e-mail da loja (etapa 2), editável.
  if (!storeForm.email) storeForm.email = account.email.trim();
  if (result?.requiresEnterpriseSelection && result.enterprises?.length > 1) {
    choices.value = result.enterprises;
    return;
  }
  await routeExistingOwner();
});

const chooseStore = useAction(async (membershipId) => {
  await selectEnterprise(membershipId);
  emit('signed-in');
  navigate(`/admin/plano/${planId.value}`);
});

// -------------------------------------------------------------- 2. LOJA ---
const storeForm = reactive({
  tradeName: '', legalName: '', email: '', phone: '', zipCode: '', addressLine: '', city: '', stateId: 25, country: 'Brasil', slug: '',
});
const slugEdited = ref(false);
watch(() => storeForm.tradeName, (name) => {
  if (!slugEdited.value) storeForm.slug = slugify(name);
});

const fieldError = (err, field) => {
  const entries = Object.entries(err?.fieldErrors ?? {});
  return entries.find(([key]) => key.toLowerCase() === field.toLowerCase())?.[1]?.[0] ?? '';
};

const submitStore = useAction(async () => {
  const created = await registerEnterprise({
    tradeName: storeForm.tradeName.trim(),
    legalName: storeForm.legalName.trim() || storeForm.tradeName.trim(),
    email: storeForm.email.trim(),
    phone: storeForm.phone.trim(),
    addressLine: storeForm.addressLine.trim(),
    city: storeForm.city.trim(),
    stateId: Number(storeForm.stateId),
    zipCode: storeForm.zipCode.trim(),
    country: storeForm.country.trim() || 'Brasil',
    slug: storeForm.slug.trim(),
  });
  // O token ainda é de usuário sem loja: seleciona a loja recém-criada.
  const stores = await listMyEnterprises();
  const mine = stores.find((s) => s.enterpriseId === created.id) ?? stores[0];
  await selectEnterprise(mine.membershipId);
  emit('signed-in');
  step.value = 2;
});

// ------------------------------------------------------------- 3. PLANO ---
// A chave é da escolha: repetir o clique depois de um erro reaproveita a mesma solicitação.
const idempotencyKey = newIdempotencyKey();
const pay = useAction(async () => {
  const contract = await getContract();
  const change = await requestContractChange({
    idempotencyKey,
    planId: planId.value,
    addOnId: null,
    expectedContractRevision: contract.revision,
    catalogVersion: contract.catalogVersion,
  });
  const billing = await startCheckout(change.id);
  if (billing.checkoutUrl) window.location.assign(billing.checkoutUrl);
  else navigate('/admin/plano');
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
      Ver todos os planos
    </a>

    <LoadState
      :is-loading="catalog.isLoading.value || checking"
      :error="catalog.error.value"
      :is-empty="!plan"
      empty-text="Esse plano não existe mais. Volte e escolha outro."
      :lines="5"
      @retry="catalog.reload"
    >
      <div class="ds-stack--2">
        <span class="ds-label-caps">Criar minha loja</span>
        <h1 class="ds-title ds-title--lg">
          Plano {{ plan.name }}
          <span class="ds-text-secondary">· {{ isFree ? 'grátis' : `${brl(plan.monthlyPrice)} por mês` }}</span>
        </h1>
        <StepsBar
          label="Etapas do cadastro"
          :steps="STEPS"
          :current="step"
        />
      </div>

      <!-- 1. Conta -->
      <article
        v-if="step === 0 && choices.length"
        class="ds-card ds-stack--4"
      >
        <h2 class="ds-card__title">
          Qual loja?
        </h2>
        <p class="ds-text-sm ds-text-secondary">
          Você já tem lojas. Escolha em qual quer usar o plano {{ plan.name }}.
        </p>
        <button
          v-for="choice in choices"
          :key="choice.membershipId"
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--block"
          :disabled="chooseStore.isPending.value"
          @click="chooseStore.run(choice.membershipId)"
        >
          {{ choice.tradeName }}
        </button>
        <p
          v-if="chooseStore.error.value"
          class="ds-error"
          role="alert"
        >
          {{ chooseStore.error.value.message }}
        </p>
      </article>

      <form
        v-else-if="step === 0"
        class="ds-card ds-stack--5"
        @submit.prevent="submitAccount.run()"
      >
        <header class="ds-stack--1">
          <h2 class="ds-card__title">
            {{ hasAccount ? 'Entrar na minha conta de lojista' : 'Sua conta de lojista' }}
          </h2>
          <p class="ds-text-sm ds-text-secondary">
            É com ela que você entra no painel da loja. É separada da conta de cliente.
          </p>
          <p
            v-if="IS_MOCK"
            class="ds-hint"
          >
            Modo de exemplo: os dados não saem do navegador.
          </p>
        </header>
        <div
          v-if="!hasAccount"
          class="ds-field"
        >
          <label
            class="ds-label"
            for="su-name"
          >Seu nome</label>
          <input
            id="su-name"
            v-model="account.fullName"
            class="ds-input"
            autocomplete="name"
            required
            autofocus
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-email"
          >E-mail</label>
          <input
            id="su-email"
            v-model="account.email"
            class="ds-input"
            type="email"
            autocomplete="username"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="su-pass"
          >Senha</label>
          <input
            id="su-pass"
            v-model="account.password"
            class="ds-input"
            type="password"
            :autocomplete="hasAccount ? 'current-password' : 'new-password'"
            :minlength="hasAccount ? undefined : 8"
            :placeholder="hasAccount ? '' : 'Mínimo 8 caracteres'"
            required
          >
          <span
            v-if="fieldError(submitAccount.error.value, 'password')"
            class="ds-error"
          >{{ fieldError(submitAccount.error.value, 'password') }}</span>
        </div>
        <p
          v-if="submitAccount.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ submitAccount.error.value.message }}
        </p>
        <button
          type="submit"
          class="ds-btn ds-btn--primary ds-btn--block"
          :disabled="submitAccount.isPending.value"
          :aria-busy="submitAccount.isPending.value"
        >
          {{ hasAccount ? 'Entrar e continuar' : 'Criar conta e continuar' }}
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--ghost ds-btn--block"
          @click="hasAccount = !hasAccount"
        >
          {{ hasAccount ? 'Ainda não tenho conta de lojista' : 'Já tenho conta de lojista' }}
        </button>
      </form>

      <!-- 2. Loja -->
      <form
        v-else-if="step === 1"
        class="ds-card ds-stack--5"
        @submit.prevent="submitStore.run()"
      >
        <header class="ds-stack--1">
          <h2 class="ds-card__title">
            Sua loja
          </h2>
          <p class="ds-text-sm ds-text-secondary">
            A loja começa no Gratuito. O plano escolhido entra depois do pagamento.
          </p>
        </header>
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-trade"
            >Nome da loja</label>
            <input
              id="st-trade"
              v-model="storeForm.tradeName"
              class="ds-input"
              autocomplete="organization"
              required
              autofocus
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-legal"
            >Razão social <span class="ds-text-secondary">(opcional)</span></label>
            <input
              id="st-legal"
              v-model="storeForm.legalName"
              class="ds-input"
            >
          </div>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="st-slug"
          >Endereço da loja</label>
          <input
            id="st-slug"
            v-model="storeForm.slug"
            class="ds-input ds-mono"
            :pattern="SLUG_PATTERN"
            maxlength="63"
            required
            aria-describedby="st-slug-hint"
            @input="slugEdited = true"
          >
          <span
            id="st-slug-hint"
            class="ds-hint"
          >Fica no link público: …/{{ storeForm.slug || 'minha-loja' }}. Letras minúsculas, números e hífen.</span>
          <span
            v-if="submitStore.error.value?.code === 'Enterprise.SlugUnavailable' || submitStore.error.value?.code === 'Enterprise.InvalidSlug'"
            class="ds-error"
          >{{ submitStore.error.value.message }}</span>
        </div>
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-email"
            >E-mail da loja</label>
            <input
              id="st-email"
              v-model="storeForm.email"
              class="ds-input"
              type="email"
              autocomplete="email"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-phone"
            >Telefone</label>
            <input
              id="st-phone"
              v-model="storeForm.phone"
              class="ds-input"
              type="tel"
              autocomplete="tel"
              placeholder="(11) 99999-9999"
              required
            >
          </div>
        </div>
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-zip"
            >CEP</label>
            <input
              id="st-zip"
              v-model="storeForm.zipCode"
              class="ds-input ds-mono"
              inputmode="numeric"
              autocomplete="postal-code"
              placeholder="00000-000"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-address"
            >Endereço</label>
            <input
              id="st-address"
              v-model="storeForm.addressLine"
              class="ds-input"
              autocomplete="street-address"
              required
            >
          </div>
        </div>
        <div class="ds-grid ds-grid--2">
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-city"
            >Cidade</label>
            <input
              id="st-city"
              v-model="storeForm.city"
              class="ds-input"
              autocomplete="address-level2"
              required
            >
          </div>
          <div class="ds-field">
            <label
              class="ds-label"
              for="st-uf"
            >Estado</label>
            <select
              id="st-uf"
              v-model.number="storeForm.stateId"
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
        <p
          v-if="submitStore.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ submitStore.error.value.message }}
        </p>
        <button
          type="submit"
          class="ds-btn ds-btn--primary ds-btn--block"
          :disabled="submitStore.isPending.value"
          :aria-busy="submitStore.isPending.value"
        >
          Criar loja
        </button>
      </form>

      <!-- 3. Plano -->
      <article
        v-else
        class="ds-card ds-stack--5"
      >
        <header class="ds-stack--1">
          <h2 class="ds-card__title">
            {{ isFree ? 'Sua loja está pronta' : `Assinar o ${plan.name}` }}
          </h2>
          <p class="ds-text-sm ds-text-secondary">
            {{ isFree
              ? 'Ela já está no Gratuito. Você pode assinar outro plano no painel quando quiser.'
              : 'A assinatura é mensal e renova sozinha. O plano é liberado assim que o Mercado Pago confirmar o pagamento.' }}
          </p>
        </header>
        <ul class="ds-list-reset ds-stack--2">
          <li
            v-for="item in planHighlights(plan.entitlements)"
            :key="item"
            class="ds-cluster ds-cluster--2 ds-cluster--nowrap ds-align-start ds-text-sm"
          >
            <Check
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            <span class="ds-min-0">{{ item }}</span>
          </li>
        </ul>
        <dl
          v-if="!isFree"
          class="ds-dl ds-text-sm"
        >
          <dt class="ds-dl__total">
            Por mês
          </dt>
          <dd class="ds-text-medium">
            {{ brl(plan.monthlyPrice) }}
          </dd>
        </dl>
        <p
          v-if="pay.error.value"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ pay.error.value.message }}
        </p>
        <a
          v-if="isFree"
          class="ds-btn ds-btn--primary ds-btn--block"
          :href="href('/admin/dashboard')"
        >
          Ir para o painel
        </a>
        <template v-else>
          <button
            type="button"
            class="ds-btn ds-btn--primary ds-btn--block"
            :disabled="pay.isPending.value"
            :aria-busy="pay.isPending.value"
            @click="pay.run()"
          >
            Ir para o pagamento
          </button>
          <a
            class="ds-btn ds-btn--ghost ds-btn--block"
            :href="href('/admin/dashboard')"
          >
            Começar no Gratuito e assinar depois
          </a>
        </template>
      </article>
    </LoadState>
  </section>
</template>
