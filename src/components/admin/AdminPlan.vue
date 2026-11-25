<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { AlertCircle, ExternalLink, RefreshCw } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { restoreSession } from '../../services/auth';
import { REALMS } from '../../services/session';
import {
  addOnLabel, addOnsFor, billingStatusOf, getBilling, getContract, getContractUsage, getPlanCatalog, invoiceStatusLabel,
  listInvoices, listTeamMembers, newIdempotencyKey, previewAccessImpact, previewProductImpact, reconcileBilling,
  requestContractChange, startCheckout,
} from '../../services/plans-api';
import { brl, formatDate, formatNumber, percent } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import PlanCards from '../plans/PlanCards.vue';

// Plano e assinatura da loja. Rotas (Store):
//   GET enterprise-plans · GET enterprises/current/contract · GET …/contract/usage
//   POST …/contract/product-impact | access-impact (prévias) · POST …/contract/requests (202)
//   GET …/billing · GET …/billing/invoices?beforeId= · POST …/billing/checkout | reconcile
// Contrato e consumo: qualquer pessoa da loja. Troca e cobrança: só o dono principal (403 para os outros).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const page = useAsync(async () => {
  const [catalog, contract, usage] = await Promise.all([getPlanCatalog(), getContract(), getContractUsage()]);
  // Cobrança é só do dono: para quem não é, a tela mostra contrato e consumo e esconde o resto.
  const billing = await getBilling().catch((err) => {
    if (err.kind === 'forbidden') return null;
    throw err;
  });
  return { catalog, contract, usage, billing, isOwner: billing !== null };
});

const catalog = computed(() => page.data.value?.catalog ?? null);
const contract = computed(() => page.data.value?.contract ?? null);
const usage = computed(() => page.data.value?.usage ?? null);
const billing = computed(() => page.data.value?.billing ?? null);
const isOwner = computed(() => page.data.value?.isOwner ?? false);
const billingStatus = computed(() => billingStatusOf(billing.value?.status));
const currentMonthly = computed(() => (contract.value ? contract.value.plan.monthlyPrice + (contract.value.addOn?.monthlyPrice ?? 0) : 0));
const planName = (id) => catalog.value?.plans.find((p) => p.id === id)?.name ?? `Plano #${id}`;

// ------------------------------------------------------------- CONSUMO ---
const meters = computed(() => {
  const u = usage.value;
  if (!u) return [];
  const e = contract.value.entitlements;
  const rows = [];
  if (e.allowsStore) {
    rows.push({ label: 'Produtos da vitrine', used: u.usage.totalStoreProducts, limit: u.storeProductLimit, excess: u.excessStoreProducts,
      hint: `${formatNumber(u.usage.publishedStoreProducts)} publicados, ${formatNumber(u.usage.inactiveStoreProducts)} inativos ou arquivados` });
  }
  rows.push({ label: 'Equipe (além de você)', used: u.usage.activeAdditionalMembers + u.usage.pendingInvitations, limit: u.employeeLimit,
    excess: u.excessAdditionalMembers, hint: u.usage.pendingInvitations ? `${formatNumber(u.usage.pendingInvitations)} convites pendentes ocupam vaga` : '' });
  if (e.allowsDrop) {
    rows.push({ label: 'Produtos em drops', used: u.usage.dropUsageAvailable ? u.usage.dropProducts : null, limit: u.dropProductLimit, excess: 0,
      hint: u.usage.dropUsageAvailable ? '' : 'O consumo dos drops ainda não é informado pelo servidor.' });
  }
  return rows;
});

// ---------------------------------------------------------- COBRANÇA ---
// Volta do Mercado Pago (ou pagamento pendente): pede a conciliação uma vez ao abrir.
const reconcile = useAction(async () => {
  const before = contract.value?.revision;
  await reconcileBilling();
  await page.reload();
  // Plano concedido: a revisão do contrato mudou e o token antigo deixa de valer.
  if (before != null && contract.value?.revision !== before) {
    await restoreSession(REALMS.backoffice);
    await page.reload();
  }
});
const awaitingProvider = computed(() => billing.value && (billing.value.status === 'awaiting_payment' || Boolean(billing.value.checkoutUrl)));
let autoReconciled = false;
watch(billing, (b) => {
  if (!b || autoReconciled || !awaitingProvider.value) return;
  autoReconciled = true;
  reconcile.run();
});

const invoices = ref([]);
const invoicesDone = ref(false);
const loadInvoices = useAction(async (more = false) => {
  const beforeId = more ? invoices.value.at(-1)?.id : null;
  const rows = await listInvoices(beforeId);
  invoices.value = more ? [...invoices.value, ...rows] : rows;
  invoicesDone.value = rows.length < 50;
});
watch(isOwner, (owner) => {
  if (owner) loadInvoices.run();
});

// ------------------------------------------------------------ TROCA ---
const choice = reactive({ planId: null, addOnId: null });
onMounted(() => {
  const fromRoute = Number(props.params.planId);
  if (fromRoute) choice.planId = fromRoute;
});
const selectPlan = (id) => {
  choice.planId = id;
  choice.addOnId = id === contract.value?.plan.id ? contract.value.addOn?.id ?? null : null;
};
const chosenPlan = computed(() => catalog.value?.plans.find((p) => p.id === choice.planId) ?? null);
const eligibleAddOns = computed(() => (chosenPlan.value ? addOnsFor(catalog.value, chosenPlan.value.id) : []));
const chosenAddOn = computed(() => eligibleAddOns.value.find((a) => a.id === choice.addOnId) ?? null);
const targetMonthly = computed(() => (chosenPlan.value ? chosenPlan.value.monthlyPrice + (chosenAddOn.value?.monthlyPrice ?? 0) : 0));
const isSameOffer = computed(() => contract.value && choice.planId === contract.value.plan.id
  && (choice.addOnId ?? null) === (contract.value.addOn?.id ?? null));

const offer = computed(() => ({
  planId: choice.planId,
  addOnId: choice.addOnId,
  expectedContractRevision: contract.value?.revision,
  catalogVersion: contract.value?.catalogVersion,
}));

// O que acontece com o dinheiro e a data, pelas regras da assinatura (Parte 5).
const changeKind = computed(() => {
  if (!chosenPlan.value || isSameOffer.value) return null;
  const hasPaidPeriod = Boolean(billing.value?.paidUntil) && billing.value.status !== 'free';
  if (!hasPaidPeriod) return targetMonthly.value > 0 ? 'subscribe' : 'free';
  if (targetMonthly.value > currentMonthly.value) return 'upgrade';
  return targetMonthly.value === 0 ? 'cancel' : 'downgrade';
});

// Prévia: produtos e equipe/domínios. Refaz quando a oferta muda.
const impact = ref(null);
const team = ref([]);
const retained = ref([]);
const preview = useAction(async () => {
  const [products, access] = await Promise.all([previewProductImpact(offer.value), previewAccessImpact(offer.value)]);
  impact.value = { products, access };
  retained.value = [];
  if (access.requiresMembershipSelection && !team.value.length) team.value = await listTeamMembers();
});
watch(() => [choice.planId, choice.addOnId], () => {
  impact.value = null;
  if (choice.planId && !isSameOffer.value && isOwner.value) preview.run();
});
watch(isOwner, (owner) => {
  if (owner && choice.planId && !isSameOffer.value && !impact.value) preview.run();
});

const memberName = (id) => team.value.find((m) => m.id === id)?.fullName ?? `Vínculo #${id}`;
const memberLimit = computed(() => impact.value?.access.additionalMemberLimit ?? 0);
const toggleRetained = (id) => {
  retained.value = retained.value.includes(id) ? retained.value.filter((x) => x !== id) : [...retained.value, id];
};
const needsTeamChoice = computed(() => Boolean(impact.value?.access.requiresMembershipSelection));
const teamChoiceValid = computed(() => !needsTeamChoice.value || retained.value.length <= memberLimit.value);

// Uma chave por escolha: repetir depois de um erro reaproveita a solicitação; mudar a escolha gera outra.
const idempotencyKey = ref(newIdempotencyKey());
watch(() => [choice.planId, choice.addOnId, [...retained.value].sort().join(',')], () => {
  idempotencyKey.value = newIdempotencyKey();
});

const result = ref(null);
const confirm = useAction(async () => {
  try {
    const change = await requestContractChange({
      idempotencyKey: idempotencyKey.value,
      ...offer.value,
      retainedMembershipIds: needsTeamChoice.value ? [...retained.value] : null,
    });
    const summary = await startCheckout(change.id);
    if (summary.checkoutUrl) {
      window.location.assign(summary.checkoutUrl);
      // No Mercado Pago a página sai daqui. Se o link for para esta mesma tela (mock), recarrega e concilia.
      autoReconciled = false;
      choice.planId = null;
      await page.reload();
      return;
    }
    result.value = { planId: change.planId, effectiveAt: summary.changeEffectiveAt, kind: changeKind.value };
    choice.planId = null;
    await page.reload();
  } catch (err) {
    // Contrato mudou no meio (outra aba, renovação): recarrega para a prévia valer de novo.
    if (err.code === 'Contract.RevisionChanged' || err.code === 'Contract.CatalogChanged') await page.reload();
    throw err;
  }
});
const canConfirm = computed(() => impact.value && changeKind.value && changeKind.value !== 'free' && teamChoiceValid.value);
</script>

<template>
  <div class="ds-stack--1">
    <h1 class="ds-title ds-title--lg">
      Plano e assinatura
    </h1>
    <p class="ds-text-secondary">
      O que a loja pode usar, quanto já usa e como está a mensalidade.
    </p>
  </div>

  <LoadState
    :is-loading="page.isLoading.value"
    :error="page.error.value"
    :lines="8"
    @retry="page.reload"
  >
    <section class="ds-grid ds-grid--2">
      <!-- Situação da assinatura -->
      <article
        class="ds-card ds-stack--4"
        aria-live="polite"
      >
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            {{ contract.plan.name }}<template v-if="contract.addOn">
              · {{ addOnLabel(contract.addOn) }}
            </template>
          </h2>
          <span
            v-if="billing"
            :class="['ds-badge', `ds-badge--${billingStatus.tone}`]"
          >{{ billingStatus.label }}</span>
        </header>
        <dl class="ds-dl ds-text-sm">
          <dt>Mensalidade</dt>
          <dd>{{ currentMonthly ? brl(currentMonthly) : 'Grátis' }}</dd>
          <template v-if="billing?.paidUntil">
            <dt>{{ billing.status === 'canceled' ? 'Vale até' : 'Pago até' }}</dt>
            <dd>{{ formatDate(billing.paidUntil) }}</dd>
          </template>
          <template v-if="billing && ['past_due', 'expired'].includes(billing.status) && billing.graceEndsAt">
            <dt>Fim da carência</dt>
            <dd class="ds-text-danger">
              {{ formatDate(billing.graceEndsAt) }}
            </dd>
          </template>
          <template v-if="billing?.pendingChangeId && billing.changeEffectiveAt && !billing.checkoutUrl">
            <dt>Troca agendada</dt>
            <dd>{{ formatDate(billing.changeEffectiveAt) }}</dd>
          </template>
        </dl>
        <ul
          v-if="billing?.notices.length"
          class="ds-list-reset ds-stack--2"
        >
          <li
            v-for="notice in billing.notices"
            :key="notice.code"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ notice.message }}
          </li>
        </ul>
        <p
          v-if="!isOwner"
          class="ds-hint"
        >
          Só o dono da loja vê a cobrança e troca de plano.
        </p>
        <template v-else>
          <p
            v-if="awaitingProvider"
            class="ds-hint"
          >
            O plano é liberado quando o Mercado Pago confirmar o pagamento. Se você já pagou, atualize a situação.
          </p>
          <div class="ds-cluster ds-cluster--2">
            <a
              v-if="billing.checkoutUrl"
              class="ds-btn ds-btn--primary"
              :href="billing.checkoutUrl"
            >
              Concluir pagamento
              <ExternalLink
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </a>
            <button
              v-if="billing.status !== 'free'"
              type="button"
              class="ds-btn ds-btn--secondary"
              :disabled="reconcile.isPending.value"
              :aria-busy="reconcile.isPending.value"
              @click="reconcile.run()"
            >
              <RefreshCw
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              Atualizar situação
            </button>
          </div>
          <p
            v-if="reconcile.error.value"
            class="ds-error"
            role="alert"
          >
            {{ reconcile.error.value.message }}
          </p>
        </template>
      </article>

      <!-- Consumo -->
      <article class="ds-card ds-stack--4">
        <header class="ds-card__header">
          <h2 class="ds-card__title">
            Consumo
          </h2>
        </header>
        <div
          v-for="m in meters"
          :key="m.label"
          class="ds-stack--2"
        >
          <div class="ds-cluster ds-cluster--between ds-text-sm">
            <span>{{ m.label }}</span>
            <span class="ds-numeric">
              <template v-if="m.used === null">— de {{ formatNumber(m.limit) }}</template>
              <template v-else>{{ formatNumber(m.used) }} de {{ formatNumber(m.limit) }}</template>
            </span>
          </div>
          <div
            v-if="m.used !== null"
            :class="['ds-meter', { 'ds-meter--critical': m.excess > 0 }]"
            role="progressbar"
            :aria-label="m.label"
            :aria-valuenow="m.used"
            aria-valuemin="0"
            :aria-valuemax="m.limit"
          >
            <div
              class="ds-meter__fill"
              :style="{ width: `${Math.min(100, m.limit ? percent(m.used, m.limit) : 100)}%` }"
            />
          </div>
          <span
            v-if="m.excess > 0"
            class="ds-error"
          >{{ formatNumber(m.excess) }} acima do limite do plano.</span>
          <span
            v-else-if="m.hint"
            class="ds-hint"
          >{{ m.hint }}</span>
        </div>
      </article>
    </section>

    <!-- Troca de plano -->
    <section
      v-if="isOwner"
      class="ds-stack--5"
      aria-labelledby="plan-change"
    >
      <div class="ds-stack--1">
        <h2
          id="plan-change"
          class="ds-title"
        >
          Mudar de plano
        </h2>
        <p class="ds-text-sm ds-text-secondary">
          Plano maior vale na hora: você paga só a diferença até o próximo vencimento. Plano menor vale no próximo vencimento.
        </p>
      </div>

      <p
        v-if="result"
        class="ds-hint ds-text-success"
        role="status"
      >
        <template v-if="result.kind === 'cancel'">
          Renovação cancelada. A loja mantém o plano atual até {{ formatDate(result.effectiveAt) }} e depois passa ao Gratuito.
        </template>
        <template v-else-if="result.effectiveAt">
          Troca para o {{ planName(result.planId) }} agendada para {{ formatDate(result.effectiveAt) }}.
        </template>
        <template v-else>
          Troca para o {{ planName(result.planId) }} registrada.
        </template>
      </p>

      <PlanCards
        :plans="catalog.plans"
        mode="select"
        :current-plan-id="contract.plan.id"
        :selected-plan-id="choice.planId"
        @select="selectPlan"
      />

      <article
        v-if="chosenPlan"
        class="ds-card ds-stack--5"
        aria-live="polite"
      >
        <header class="ds-card__header">
          <h3 class="ds-card__title">
            Revisar: {{ chosenPlan.name }}
          </h3>
          <button
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm"
            @click="choice.planId = null"
          >
            Cancelar
          </button>
        </header>

        <div
          v-if="eligibleAddOns.length"
          class="ds-field"
        >
          <label
            class="ds-label"
            for="pl-addon"
          >Adicional <span class="ds-text-secondary">(opcional, um por loja)</span></label>
          <select
            id="pl-addon"
            v-model="choice.addOnId"
            class="ds-input"
          >
            <option :value="null">
              Sem adicional
            </option>
            <option
              v-for="a in eligibleAddOns"
              :key="a.id"
              :value="a.id"
            >
              {{ addOnLabel(a) }} · {{ brl(a.monthlyPrice) }}/mês
            </option>
          </select>
        </div>

        <p
          v-if="isSameOffer"
          class="ds-hint"
        >
          Esse já é o seu plano{{ eligibleAddOns.length ? '. Escolha outro adicional para mudar.' : '.' }}
        </p>
        <p
          v-else-if="changeKind === 'free'"
          class="ds-hint"
        >
          A loja já está no Gratuito.
        </p>

        <template v-else>
          <dl class="ds-dl ds-text-sm">
            <dt>Mensalidade atual</dt>
            <dd>{{ currentMonthly ? brl(currentMonthly) : 'Grátis' }}</dd>
            <dt class="ds-dl__total">
              Nova mensalidade
            </dt>
            <dd class="ds-text-medium">
              {{ targetMonthly ? brl(targetMonthly) : 'Grátis' }}
            </dd>
          </dl>
          <p class="ds-text-sm">
            <template v-if="changeKind === 'subscribe'">
              Você assina pelo Mercado Pago e o plano é liberado quando o pagamento for confirmado.
            </template>
            <template v-else-if="changeKind === 'upgrade'">
              Vale assim que o pagamento da diferença proporcional até {{ formatDate(billing.paidUntil) }} for confirmado.
              Depois, a mensalidade passa a {{ brl(targetMonthly) }}.
            </template>
            <template v-else-if="changeKind === 'downgrade'">
              Vale a partir de {{ formatDate(billing.paidUntil) }}. Até lá a loja mantém o plano atual.
            </template>
            <template v-else-if="changeKind === 'cancel'">
              A renovação é cancelada. A loja mantém o plano atual até {{ formatDate(billing.paidUntil) }} e depois passa ao Gratuito.
            </template>
          </p>

          <LoadState
            :is-loading="preview.isPending.value && !impact"
            :error="preview.error.value"
            :lines="3"
            @retry="preview.run()"
          >
            <template v-if="impact">
              <div
                v-if="impact.products.productsToBlock > 0"
                class="ds-card ds-card--sunken ds-stack--2"
              >
                <span class="ds-label-caps">Produtos</span>
                <p class="ds-text-sm">
                  O plano publica até {{ formatNumber(impact.products.publicationLimit) }} produtos.
                  {{ formatNumber(impact.products.productsToBlock) }}
                  {{ impact.products.productsToBlock === 1 ? 'produto sai' : 'produtos saem' }} da vitrine (os mais recentes).
                  Nada é apagado: eles voltam se a loja tiver vaga de novo.
                </p>
                <ul class="ds-list">
                  <li
                    v-for="p in impact.products.affectedProducts"
                    :key="p.id"
                    class="ds-list__item ds-text-sm"
                  >
                    {{ p.name }} <span class="ds-mono ds-text-secondary">{{ p.sku }}</span>
                  </li>
                </ul>
                <span
                  v-if="impact.products.affectedProductsTruncated"
                  class="ds-hint"
                >Mostrando parte da lista.</span>
              </div>

              <div
                v-if="needsTeamChoice"
                class="ds-card ds-card--sunken ds-stack--3"
                role="group"
                aria-labelledby="plan-team-label"
              >
                <span
                  id="plan-team-label"
                  class="ds-label-caps"
                >Equipe</span>
                <p class="ds-text-sm">
                  O novo plano permite {{ memberLimit === 0 ? 'só você no painel' : `você e mais ${memberLimit}` }}.
                  {{ memberLimit === 0 ? 'Quem está na equipe perde o acesso.' : `Escolha até ${memberLimit} para continuar com acesso; os outros ficam bloqueados.` }}
                </p>
                <label
                  v-for="id in impact.access.eligibleMembershipIds"
                  :key="id"
                  class="ds-check ds-check--card"
                >
                  <span>{{ memberName(id) }}</span>
                  <input
                    type="checkbox"
                    :checked="retained.includes(id)"
                    :disabled="memberLimit === 0 || (!retained.includes(id) && retained.length >= memberLimit)"
                    @change="toggleRetained(id)"
                  >
                </label>
                <span class="ds-hint">{{ retained.length }} de {{ memberLimit }} escolhidos.</span>
              </div>

              <p
                v-if="impact.access.domainIdsToBlock.length"
                class="ds-text-sm"
              >
                O novo plano não inclui domínio próprio: {{ impact.access.domainIdsToBlock.length === 1 ? 'o domínio deixa' : 'os domínios deixam' }}
                de apontar para a loja.
              </p>
              <p
                v-if="!impact.products.productsToBlock && !needsTeamChoice && !impact.access.domainIdsToBlock.length"
                class="ds-hint"
              >
                Nada da loja é bloqueado com essa troca.
              </p>
            </template>
          </LoadState>

          <p
            v-if="confirm.error.value"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ confirm.error.value.message }}
          </p>
          <button
            type="button"
            :class="['ds-btn ds-btn--block', changeKind === 'cancel' ? 'ds-btn--danger' : 'ds-btn--primary']"
            :disabled="!canConfirm || confirm.isPending.value"
            :aria-busy="confirm.isPending.value"
            @click="confirm.run()"
          >
            {{ {
              subscribe: 'Assinar pelo Mercado Pago',
              upgrade: 'Pagar a diferença e mudar agora',
              downgrade: 'Agendar a troca',
              cancel: 'Cancelar a renovação',
            }[changeKind] }}
          </button>
        </template>
      </article>
    </section>

    <!-- Faturas -->
    <section
      v-if="isOwner"
      class="ds-card ds-card--flush"
      aria-labelledby="plan-invoices"
    >
      <header class="ds-card__header">
        <h2
          id="plan-invoices"
          class="ds-card__title"
        >
          Faturas
        </h2>
      </header>
      <LoadState
        :is-loading="loadInvoices.isPending.value && !invoices.length"
        :error="loadInvoices.error.value"
        :is-empty="!invoices.length"
        empty-text="Nenhuma fatura ainda. Elas aparecem aqui depois do primeiro pagamento."
        :lines="3"
        flush
        @retry="loadInvoices.run()"
      >
        <div class="ds-table-scroll">
          <table class="ds-table">
            <caption class="ds-sr-only">
              Faturas da assinatura
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Período
                </th>
                <th scope="col">
                  Tipo
                </th>
                <th scope="col">
                  Situação
                </th>
                <th
                  scope="col"
                  class="ds-table__th--numeric"
                >
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in invoices"
                :key="inv.id"
              >
                <td class="ds-nowrap">
                  {{ formatDate(inv.periodStart) }} a {{ formatDate(inv.periodEnd) }}
                </td>
                <td>{{ inv.isUpgrade ? 'Diferença de upgrade' : 'Mensalidade' }}</td>
                <td>{{ invoiceStatusLabel(inv.status) }}</td>
                <td class="ds-table__td--numeric">
                  {{ brl(inv.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="!invoicesDone"
          class="ds-table-footer"
        >
          <button
            type="button"
            class="ds-btn ds-btn--ghost ds-btn--sm"
            :disabled="loadInvoices.isPending.value"
            @click="loadInvoices.run(true)"
          >
            Carregar mais
          </button>
        </div>
      </LoadState>
    </section>
  </LoadState>
</template>
