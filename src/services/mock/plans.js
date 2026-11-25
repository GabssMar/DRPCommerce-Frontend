// Mock de planos, contrato e assinatura da plataforma, nas mesmas rotas e formatos
// do Store (EnterprisePlanController, EnterpriseContractController, PlatformBillingController).
// O "pagamento" do Mercado Pago é simulado: a conciliação (billing/reconcile) aprova
// o que estiver aguardando, como se o webhook tivesse chegado.

const DAY = 864e5;
const CATALOG_VERSION = 1;

// Catálogo da Parte 1 de Documentation/Shared/PlanosEContratos.md.
const PLANS = [
  { id: 1, code: 'free', name: 'Gratuito', monthlyPrice: 0, store: true, drop: false, storeProducts: 50, dropProducts: 0, team: 0, storeThemes: 1, dropThemes: 0, domain: false, logo: false, full: false },
  { id: 4, code: 'initial', name: 'Inicial', monthlyPrice: 49, store: true, drop: false, storeProducts: 100, dropProducts: 0, team: 1, storeThemes: 3, dropThemes: 0, domain: false, logo: true, full: false },
  { id: 2, code: 'pro', name: 'Pro', monthlyPrice: 99, store: true, drop: false, storeProducts: 500, dropProducts: 0, team: 3, storeThemes: 10, dropThemes: 0, domain: true, logo: true, full: true },
  { id: 5, code: 'drpdrop', name: 'DRPDrop', monthlyPrice: 149, store: false, drop: true, storeProducts: 0, dropProducts: 100, team: 5, storeThemes: 0, dropThemes: 10, domain: true, logo: true, full: true },
  { id: 3, code: 'drpcommerce', name: 'DRPCommerce', monthlyPrice: 199, store: true, drop: true, storeProducts: 2000, dropProducts: 100, team: 5, storeThemes: 20, dropThemes: 10, domain: true, logo: true, full: true },
];
const ADD_ONS = [
  { id: 1, code: 'team-small', name: 'Equipe pequena', resourceCode: 'employees', quantity: 1, monthlyPrice: 9.9, eligiblePlanIds: [4, 2, 3, 5] },
  { id: 2, code: 'team-large', name: 'Equipe ampliada', resourceCode: 'employees', quantity: 5, monthlyPrice: 29.9, eligiblePlanIds: [2, 3, 5] },
  { id: 3, code: 'catalog-small', name: 'Catálogo pequeno', resourceCode: 'store_products', quantity: 100, monthlyPrice: 9.9, eligiblePlanIds: [4, 2] },
  { id: 4, code: 'catalog-large', name: 'Catálogo ampliado', resourceCode: 'store_products', quantity: 500, monthlyPrice: 19.9, eligiblePlanIds: [2, 3] },
  { id: 5, code: 'launches', name: 'Lançamentos', resourceCode: 'drop_products', quantity: 25, monthlyPrice: 14.9, eligiblePlanIds: [3, 5] },
];

const planById = (id) => PLANS.find((p) => p.id === Number(id));
const addOnById = (id) => (id == null ? null : ADD_ONS.find((a) => a.id === Number(id)) ?? null);

const entitlements = (planId, addOnId) => {
  const p = planById(planId);
  const a = addOnById(addOnId);
  const extra = (code) => (a?.resourceCode === code ? a.quantity : 0);
  return {
    planId: p.id, addOnId: a?.id ?? null, allowsStore: p.store, allowsDrop: p.drop, allowsCustomDomain: p.domain,
    allowsLogoCustomization: p.logo, allowsFullCustomization: p.full,
    storeProductLimit: p.storeProducts + extra('store_products'), dropProductLimit: p.dropProducts + extra('drop_products'),
    employeeLimit: p.team + extra('employees'), storeThemeLimit: p.storeThemes, dropThemeLimit: p.dropThemes,
  };
};
const planResponse = (p) => ({ id: p.id, code: p.code, name: p.name, monthlyPrice: p.monthlyPrice, entitlements: entitlements(p.id, null) });
const monthlyOf = (planId, addOnId) => planById(planId).monthlyPrice + (addOnById(addOnId)?.monthlyPrice ?? 0);
const round2 = (n) => Math.round(n * 100) / 100;

export function createPlansMock({ data, raw, problem, nowIso }) {
  let st = null;

  // Loja de exemplo: DRPCommerce em dia, com duas faturas pagas.
  const initial = () => {
    const now = Date.now();
    const periodStart = now - 18 * DAY;
    return {
      planId: 3, addOnId: null, revision: 3, changes: [],
      subscription: {
        id: 1, offerId: null, monthly: 199, paidUntil: new Date(periodStart + 30 * DAY).toISOString(), periodStart: new Date(periodStart).toISOString(),
        closedAt: null, reviewCode: null, checkoutUrl: null, pendingOfferId: null, changeEffectiveAt: null, isUpgrade: false,
      },
      invoices: [
        invoice(2, 199, 199, false, periodStart, periodStart + 30 * DAY),
        invoice(1, 199, 199, false, periodStart - 30 * DAY, periodStart),
      ],
    };
  };
  const invoice = (id, amount, monthlyAmount, isUpgrade, start, end, offerId = 0) => ({
    id, offerId, amount, monthlyAmount, currency: 'BRL', isUpgrade, periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(), status: 'applied', appliedAt: new Date(start).toISOString(), reviewCode: null,
  });
  const state = () => {
    if (!st) st = initial();
    return st;
  };

  const status = (s) => {
    if (s.closedAt) return 'canceled';
    if (!s.paidUntil) return s.reviewCode ? 'review_required' : 'awaiting_payment';
    const until = Date.parse(s.paidUntil);
    if (Date.now() >= until + 7 * DAY) return 'expired';
    if (Date.now() >= until) return 'past_due';
    return s.reviewCode ? 'review_required' : 'active';
  };
  const summary = () => {
    const s = state().subscription;
    if (!s) return { subscriptionId: null, status: 'free', monthlyAmount: 0, paidUntil: null, graceEndsAt: null, checkoutUrl: null, pendingChangeId: null, changeEffectiveAt: null, notices: [] };
    const current = status(s);
    const grace = s.paidUntil ? new Date(Date.parse(s.paidUntil) + 7 * DAY).toISOString() : null;
    const notices = [];
    if (current === 'past_due') notices.push({ code: 'Billing.PaymentDue', message: 'Pagamento pendente. Regularize até o fim da carência para manter os recursos do plano.', deadline: grace });
    if (current === 'expired') notices.push({ code: 'Billing.GraceExpired', message: 'A carência terminou. A loja utiliza os recursos do Gratuito até a regularização.', deadline: grace });
    return {
      subscriptionId: s.id, status: current, monthlyAmount: s.monthly, paidUntil: s.paidUntil, graceEndsAt: grace,
      checkoutUrl: s.checkoutUrl, pendingChangeId: s.pendingOfferId, changeEffectiveAt: s.changeEffectiveAt, notices,
    };
  };

  const contract = () => {
    const s = state();
    return {
      enterpriseId: data().enterprise.id, revision: s.revision, catalogVersion: CATALOG_VERSION, currency: 'BRL',
      plan: planResponse(planById(s.planId)), addOn: addOnById(s.addOnId), entitlements: entitlements(s.planId, s.addOnId),
    };
  };

  // Equipe adicional = vínculos ativos menos o dono (kindId 1).
  const team = () => data()['store/enterprise-memberships'].filter((m) => m.isActive && m.kindId !== 1);
  const products = () => data()['store/products'].filter((p) => !p.isDeleted);

  const usage = () => {
    const s = state();
    const e = entitlements(s.planId, s.addOnId);
    const all = products();
    const active = all.filter((p) => p.isActive);
    const members = team().length;
    const pending = data()['store/invitations'].filter((i) => !i.acceptedAt && !i.revokedAt && Date.parse(i.expiresAt) > Date.now()).length;
    return {
      enterpriseId: data().enterprise.id, contractRevision: s.revision,
      usage: {
        totalStoreProducts: all.length, activeStoreProducts: active.length, inactiveStoreProducts: all.length - active.length,
        activeAdditionalMembers: members, pendingInvitations: pending, dropProducts: null, dropUsageAvailable: false,
        blockedStoreProducts: 0, publishedStoreProducts: active.length, blockedAdditionalMembers: 0,
      },
      storeProductLimit: e.storeProductLimit, remainingStoreProducts: Math.max(0, e.storeProductLimit - all.length),
      excessStoreProducts: Math.max(0, all.length - e.storeProductLimit), employeeLimit: e.employeeLimit,
      remainingEmployeeSlots: Math.max(0, e.employeeLimit - members - pending), excessAdditionalMembers: Math.max(0, members - e.employeeLimit),
      dropProductLimit: e.dropProductLimit,
    };
  };

  // Oferta do corpo: valida catálogo, plano, adicional e revisão como o back.
  const checkOffer = (body) => {
    const s = state();
    if (!planById(body?.planId)) return problem(400, 'Contract.UnknownPlan', 'Plano desconhecido.');
    const addOn = addOnById(body.addOnId);
    if (body.addOnId != null && (!addOn || !addOn.eligiblePlanIds.includes(Number(body.planId)))) {
      return problem(400, 'Contract.IncompatibleAddOn', 'O adicional não está disponível para este plano.');
    }
    if (Number(body.catalogVersion) !== CATALOG_VERSION) return problem(409, 'Contract.CatalogChanged', 'O catálogo de planos mudou. Atualize a página.');
    if (Number(body.expectedContractRevision) !== s.revision) return problem(409, 'Contract.RevisionChanged', 'O contrato mudou. Atualize a escolha.');
    return null;
  };

  const productImpact = (body) => {
    const e = entitlements(body.planId, body.addOnId);
    const all = products();
    const active = all.filter((p) => p.isActive).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
    const keep = e.allowsStore ? e.storeProductLimit : 0;
    const blocked = active.slice(keep);
    return {
      enterpriseId: data().enterprise.id, contractRevision: state().revision, targetPlanId: Number(body.planId), targetAddOnId: body.addOnId ?? null,
      totalProducts: all.length, publicationLimit: keep, currentlyPublished: active.length, publishedAfterChange: Math.min(active.length, keep),
      productsToBlock: blocked.length, existingBlockedProducts: 0, excessTotalProducts: Math.max(0, all.length - keep),
      affectedProductsTruncated: blocked.length > 20,
      affectedProducts: blocked.slice(0, 20).map((p) => ({ id: p.id, name: p.name, sku: p.sku ?? '', createdAt: p.createdAt, blockReason: null })),
    };
  };

  const accessImpact = (body) => {
    const e = entitlements(body.planId, body.addOnId);
    const eligible = team().map((m) => m.id);
    const retained = Array.isArray(body.retainedMembershipIds) ? body.retainedMembershipIds.map(Number) : null;
    const requiresSelection = eligible.length > e.employeeLimit;
    if (retained && (retained.length > e.employeeLimit || retained.some((id) => !eligible.includes(id)))) {
      return problem(400, 'Contract.InvalidTeamSelection', `Escolha até ${e.employeeLimit} pessoas da equipe atual.`);
    }
    return raw({
      enterpriseId: data().enterprise.id, contractRevision: state().revision, targetPlanId: Number(body.planId), targetAddOnId: body.addOnId ?? null,
      additionalMemberLimit: e.employeeLimit, activeAdditionalMembers: eligible.length, blockedAdditionalMembers: 0,
      requiresMembershipSelection: requiresSelection, eligibleMembershipIds: eligible, retainedMembershipIds: retained,
      membershipIdsToBlock: requiresSelection && retained ? eligible.filter((id) => !retained.includes(id)) : [],
      allowsCustomDomain: e.allowsCustomDomain, domainIdsToBlock: [],
    });
  };

  const requestChange = (body) => {
    const s = state();
    const same = s.changes.find((c) => c.idempotencyKey === body.idempotencyKey);
    if (same) {
      const sameContent = same.planId === Number(body.planId) && same.addOnId === (body.addOnId ?? null);
      return sameContent ? raw(changeResponse(same), 202) : problem(409, 'Contract.IdempotencyConflict', 'Chave já usada para outra escolha.');
    }
    const invalid = checkOffer(body);
    if (invalid) return invalid;
    if (team().length > entitlements(body.planId, body.addOnId).employeeLimit && !Array.isArray(body.retainedMembershipIds)) {
      return problem(409, 'Contract.TeamSelectionRequired', 'Escolha quem da equipe continua com acesso no novo plano.');
    }
    s.changes.filter((c) => c.status === 'pending').forEach((c) => Object.assign(c, { status: 'superseded', supersededAt: nowIso() }));
    const change = {
      id: s.changes.length + 101, idempotencyKey: body.idempotencyKey, status: 'pending', planId: Number(body.planId),
      addOnId: body.addOnId ?? null, expectedContractRevision: s.revision, requestedAt: nowIso(), supersededAt: null,
      retainedMembershipIds: body.retainedMembershipIds ?? null,
    };
    s.changes.push(change);
    return raw(changeResponse(change), 202);
  };
  const changeResponse = (c) => {
    const plan = planById(c.planId).monthlyPrice;
    const addOn = addOnById(c.addOnId)?.monthlyPrice ?? 0;
    return {
      id: c.id, enterpriseId: data().enterprise.id, status: c.status, planId: c.planId, addOnId: c.addOnId,
      expectedContractRevision: c.expectedContractRevision, catalogVersion: CATALOG_VERSION, currency: 'BRL',
      planMonthlyPrice: plan, addOnMonthlyPrice: addOn, totalMonthlyPrice: round2(plan + addOn), requestedAt: c.requestedAt,
      supersededAt: c.supersededAt, grantsAccess: false, retainedMembershipIds: c.retainedMembershipIds,
    };
  };

  const MOCK_CHECKOUT = '#/admin/plano';
  const apply = (change) => {
    const s = state();
    Object.assign(s, { planId: change.planId, addOnId: change.addOnId, revision: s.revision + 1 });
    change.status = 'applied';
  };

  const checkout = (body) => {
    const s = state();
    const change = s.changes.find((c) => c.id === Number(body?.contractChangeId));
    if (!change) return problem(404, 'Billing.OfferNotFound', 'Escolha não encontrada.');
    if (change.expectedContractRevision !== s.revision) return problem(409, 'Contract.RevisionChanged', 'Atualize a escolha e o contrato antes de contratar.');
    const target = monthlyOf(change.planId, change.addOnId);
    const sub = s.subscription;
    if (!sub || sub.closedAt) {
      if (target === 0) return problem(409, 'Billing.PaidOfferRequired', 'A loja já utiliza o plano gratuito.');
      s.subscription = {
        id: (sub?.id ?? 0) + 1, offerId: change.id, monthly: target, paidUntil: null, periodStart: null, closedAt: null, reviewCode: null,
        checkoutUrl: MOCK_CHECKOUT, pendingOfferId: change.id, changeEffectiveAt: null, isUpgrade: false,
      };
      return raw(summary(), 202);
    }
    if (!sub.paidUntil) {
      // Adesão ainda não paga: o Gratuito cancela a autorização; outra oferta paga precisa esperar.
      if (target !== 0) return problem(409, 'Billing.ChangeUnavailable', 'Conclua ou cancele a autorização anterior antes de contratar outra oferta.');
      Object.assign(sub, { closedAt: nowIso(), checkoutUrl: null, pendingOfferId: null });
      apply(change);
      return raw(summary(), 202);
    }
    if (target > sub.monthly) {
      Object.assign(sub, { pendingOfferId: change.id, isUpgrade: true, checkoutUrl: MOCK_CHECKOUT, changeEffectiveAt: nowIso() });
    } else {
      Object.assign(sub, { pendingOfferId: change.id, isUpgrade: false, checkoutUrl: null, changeEffectiveAt: sub.paidUntil });
    }
    return raw(summary(), 202);
  };

  // "Webhook" simulado: aprova a adesão ou a diferença do upgrade pendente.
  const reconcile = () => {
    const s = state();
    const sub = s.subscription;
    if (!sub || sub.closedAt) return raw(summary());
    const change = s.changes.find((c) => c.id === sub.pendingOfferId);
    const now = Date.now();
    if (!sub.paidUntil && change) {
      const until = now + 30 * DAY;
      Object.assign(sub, { paidUntil: new Date(until).toISOString(), periodStart: new Date(now).toISOString(), checkoutUrl: null, pendingOfferId: null });
      s.invoices.unshift(invoice(s.invoices.length + 1, sub.monthly, sub.monthly, false, now, until, change.id));
      apply(change);
    } else if (sub.isUpgrade && change) {
      const target = monthlyOf(change.planId, change.addOnId);
      const left = Math.max(0, Date.parse(sub.paidUntil) - now) / (30 * DAY);
      s.invoices.unshift(invoice(s.invoices.length + 1, round2((target - sub.monthly) * left), target, true, now, Date.parse(sub.paidUntil), change.id));
      Object.assign(sub, { monthly: target, isUpgrade: false, checkoutUrl: null, pendingOfferId: null, changeEffectiveAt: null });
      apply(change);
    }
    return raw(summary());
  };

  return {
    state,
    forget: () => {
      st = null;
    },
    reset: () => {
      st = { planId: 1, addOnId: null, revision: 1, changes: [], subscription: null, invoices: [] };
    },
    catalog: () => ({ catalogVersion: CATALOG_VERSION, currency: 'BRL', maximumActiveAddOns: 1, plans: PLANS.map(planResponse), addOns: ADD_ONS }),
    route(method, path, body) {
      const base = 'enterprises/current/';
      if (!path.startsWith(base)) return null;
      const rest = path.slice(base.length);
      if (rest === 'contract' && method === 'GET') return raw(contract());
      if (rest === 'contract/usage' && method === 'GET') return raw(usage());
      if (rest === 'contract/product-impact' && method === 'POST') return checkOffer(body) ?? raw(productImpact(body));
      if (rest === 'contract/access-impact' && method === 'POST') return checkOffer(body) ?? accessImpact(body);
      if (rest === 'contract/requests' && method === 'POST') return requestChange(body);
      const one = rest.match(/^contract\/requests\/(\d+)$/);
      if (one && method === 'GET') {
        const c = state().changes.find((x) => x.id === Number(one[1]));
        return c ? raw(changeResponse(c)) : problem(404, 'Contract.RequestNotFound', 'Solicitação não encontrada.');
      }
      if (rest === 'billing' && method === 'GET') return raw(summary());
      if (rest.startsWith('billing/invoices') && method === 'GET') return raw(state().invoices.slice(0, 50));
      if (rest === 'billing/checkout' && method === 'POST') return checkout(body);
      if (rest === 'billing/reconcile' && method === 'POST') return reconcile();
      return null;
    },
  };
}
