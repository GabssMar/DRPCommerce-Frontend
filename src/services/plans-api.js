import { STORE_BASE } from './config';
import { request } from './http';
import { REALMS } from './session';
import { admin } from './admin-api';

// Planos da plataforma, contrato da loja e assinatura mensal (Store).
// Respostas são DTO direto (sem envelope Result). Fluxo do back:
//   1. catálogo (público) + contrato atual  → IDs, preços, revisão e versão do catálogo
//   2. prévias de impacto (produtos, equipe, domínios)
//   3. solicitação da troca (202, preço congelado, ainda não concede nada)
//   4. checkout da assinatura → checkoutUrl do Mercado Pago (adesão ou diferença do upgrade)
//   5. situação e faturas; a conciliação confirma o pagamento e concede o plano
// Só o dono principal da loja pode solicitar troca e mexer na cobrança (403 para os outros).

const realm = REALMS.backoffice;
const opts = (body) => ({ realm, body });
const store = (path) => `${STORE_BASE}/${path}`;

// -------------------------------------------------------------- CATÁLOGO ---

/** Público: { catalogVersion, currency, maximumActiveAddOns, plans[], addOns[] }, planos ordenados por preço. */
export const getPlanCatalog = () => request('GET', store('enterprise-plans'), { realm: null });

export const FREE_PLAN_CODE = 'free';

/** Lista curta do que o plano inclui, a partir de `entitlements` (sem texto inventado sobre preço). */
export const planHighlights = (entitlements) => {
  const e = entitlements;
  const items = [];
  items.push(e.allowsStore ? `Vitrine com até ${count(e.storeProductLimit, 'produto', 'produtos')}` : 'Sem vitrine (só drops)');
  if (e.allowsDrop) items.push(`Drops com até ${count(e.dropProductLimit, 'produto', 'produtos')}`);
  items.push(e.employeeLimit ? `Equipe: você + ${count(e.employeeLimit, 'pessoa', 'pessoas')}` : 'Só o dono acessa o painel');
  const themes = [e.storeThemeLimit && `${e.storeThemeLimit} da vitrine`, e.dropThemeLimit && `${e.dropThemeLimit} de drops`].filter(Boolean);
  if (themes.length) items.push(`Temas: ${themes.join(' e ')}`);
  if (e.allowsFullCustomization) items.push('Personalização completa do tema');
  else if (e.allowsLogoCustomization) items.push('Logo próprio');
  // Ainda não funciona com a loja no caminho do site (aba Domínios escondida no painel).
  if (e.allowsCustomDomain) items.push('Domínio próprio (em breve)');
  return items;
};

const count = (n, one, many) => `${new Intl.NumberFormat('pt-BR').format(n)} ${n === 1 ? one : many}`;

/** Adicionais que podem acompanhar o plano (no máximo um por loja). */
export const addOnsFor = (catalog, planId) => (catalog?.addOns ?? []).filter((a) => a.eligiblePlanIds.includes(planId));

const RESOURCE_LABELS = {
  employees: ['pessoa a mais na equipe', 'pessoas a mais na equipe'],
  store_products: ['produto a mais na vitrine', 'produtos a mais na vitrine'],
  drop_products: ['produto a mais em drops', 'produtos a mais em drops'],
};
/** "+5 pessoas a mais na equipe"; recurso desconhecido usa o nome do catálogo. */
export const addOnLabel = (addOn) => {
  const labels = RESOURCE_LABELS[addOn.resourceCode];
  return labels ? `+${count(addOn.quantity, ...labels)}` : addOn.name;
};

// -------------------------------------------------------------- CONTRATO ---

/** { enterpriseId, revision, catalogVersion, currency, plan, addOn, entitlements } */
export const getContract = () => request('GET', store('enterprises/current/contract'), opts());

/** Consumo e limites da revisão atual: { usage, storeProductLimit, employeeLimit, dropProductLimit, ... } */
export const getContractUsage = () => request('GET', store('enterprises/current/contract/usage'), opts());

const offerOf = ({ planId, addOnId, expectedContractRevision, catalogVersion }) =>
  ({ planId, addOnId: addOnId ?? null, expectedContractRevision, catalogVersion });

/** Prévia sobre produtos: quantos ficam bloqueados e quais (amostra). */
export const previewProductImpact = (offer) =>
  request('POST', store('enterprises/current/contract/product-impact'), opts(offerOf(offer)));

/** Prévia sobre equipe e domínios. Com `retainedMembershipIds`, mostra quem seria bloqueado com essa escolha. */
export const previewAccessImpact = (offer, retainedMembershipIds = null) =>
  request('POST', store('enterprises/current/contract/access-impact'), opts({ ...offerOf(offer), retainedMembershipIds }));

/**
 * Registra a escolha (202). Repetir a mesma `idempotencyKey` com o mesmo conteúdo
 * devolve a mesma solicitação; outra escolha precisa de outra chave.
 * `retainedMembershipIds`: obrigatório quando a equipe não cabe no plano alvo
 * (para o Gratuito com equipe ativa, `[]` explícito). Senão, null.
 */
export const requestContractChange = ({ idempotencyKey, retainedMembershipIds = null, ...offer }) =>
  request('POST', store('enterprises/current/contract/requests'), opts({ idempotencyKey, ...offerOf(offer), retainedMembershipIds }));

export const newIdempotencyKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`);

// Pessoas da equipe para a escolha de quem fica no downgrade. O vínculo não tem
// nome: o nome vem do funcionário ligado a ele (Employee.enterpriseMembershipId).
export const listTeamMembers = async () => {
  const [memberships, employees] = await Promise.all([
    request('GET', store('enterprise-memberships/get-all'), opts()),
    admin.employees.getAll().catch(() => []),
  ]);
  return memberships.map((m) => ({
    ...m,
    fullName: employees.find((e) => e.enterpriseMembershipId === m.id)?.fullName ?? `Vínculo #${m.id}`,
  }));
};

// ------------------------------------------------------------- COBRANÇA ---

/** { subscriptionId, status, monthlyAmount, paidUntil, graceEndsAt, checkoutUrl, pendingChangeId, changeEffectiveAt, notices[] } */
export const getBilling = () => request('GET', store('enterprises/current/billing'), opts());

/** Até 50 faturas, da mais nova para a mais antiga; `beforeId` continua a lista. */
export const listInvoices = (beforeId = null) =>
  request('GET', store(`enterprises/current/billing/invoices${beforeId ? `?beforeId=${beforeId}` : ''}`), opts());

/** Inicia a adesão ou a troca (202) e devolve a situação, com `checkoutUrl` quando há pagamento a fazer. */
export const startCheckout = (contractChangeId) =>
  request('POST', store('enterprises/current/billing/checkout'), opts({ contractChangeId }));

/** Consulta o Mercado Pago e atualiza a situação. Não aceita status declarado pelo navegador. */
export const reconcileBilling = () => request('POST', store('enterprises/current/billing/reconcile'), opts());

// Situação da assinatura (PlatformBillingPolicy.Status) → rótulo e tom do .ds-badge.
export const BILLING_STATUS = {
  free: { label: 'Plano gratuito', tone: 'done' },
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'scheduled' },
  active: { label: 'Em dia', tone: 'success' },
  past_due: { label: 'Pagamento pendente', tone: 'live' },
  expired: { label: 'Carência encerrada', tone: 'live' },
  canceled: { label: 'Cancelada', tone: 'done' },
  review_required: { label: 'Em revisão', tone: 'waiting' },
};
export const billingStatusOf = (status) => BILLING_STATUS[status] ?? { label: status, tone: 'done' };

// Situação de uma fatura (texto livre do back) → rótulo legível.
const INVOICE_STATUS = {
  pending: 'Pendente', paid: 'Paga', approved: 'Paga', applied: 'Aplicada', rejected: 'Recusada',
  refunded: 'Estornada', canceled: 'Cancelada', cancelled: 'Cancelada', review_required: 'Em revisão',
};
export const invoiceStatusLabel = (status) => INVOICE_STATUS[status] ?? status;

// ------------------------------------------------- CADASTRO DE LOJA NOVA ---

/** Cria a loja do usuário logado (sem loja selecionada). O slug vira o endereço público. */
export const registerEnterprise = (payload) => request('POST', store('enterprises/register'), opts(payload));

/** Lojas do usuário: [{ membershipId, enterpriseId, tradeName, kindId, planId, contractRevision }] */
export const listMyEnterprises = () => request('GET', store('enterprises/mine'), opts());

/** Mesmo formato do back (StorefrontSlug.Normalize): 3–63 caracteres, a-z, 0-9 e hífen. */
export const slugify = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
export const SLUG_PATTERN = '[a-z0-9][a-z0-9\\-]{1,61}[a-z0-9]';
