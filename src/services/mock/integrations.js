// Integrações do painel no mock (task 43), nas rotas do Store:
//   GET    integrations/mercado-pago · POST .../oauth/start · POST .../sandbox/connect
//   PUT    integrations/mercado-pago/selection · GET .../notifications
//   POST   integrations/melhor-envio/oauth/start
//   GET    provider-connections · DELETE provider-connections/{provider}/{Sandbox|Production}
// No mock não há provedor: o "OAuth" conecta na hora e devolve uma authorizationUrl que
// volta para o painel com ?mercadoPago=connected (ou melhorEnvio), como o callback do back.
// Produção fica bloqueada (productionAllowed: false), como no back recém-instalado.
const PROVIDERS = { mp: 'mercado-pago', me: 'melhor-envio', manual: 'manual' };
const ENV = { Sandbox: 1, Production: 2 };
const SCOPES = { 'mercado-pago': 'offline_access read write', 'melhor-envio': 'users-read shipping-calculate' };
// O OAuth recarrega a página na volta; o resto do mock vive só na memória da aba. Por isso
// as integrações ficam na sessionStorage (como a sessão de login do mock).
const STORAGE_KEY = 'mock-integrations';
const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};
const save = (value) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* sem storage: vale até o F5 */
  }
};

export function createIntegrationsMock({ data, raw, problem, now }) {
  const state = () => {
    const d = data();
    if (!d['store/integrations']) {
      d['store/integrations'] = load() ?? {
        enabled: true, productionAllowed: false, applicationId: '1280353562761045',
        selection: { provider: PROVIDERS.manual, environment: null },
        connections: [],
        notifications: [],
      };
    }
    return d['store/integrations'];
  };
  const iso = (ms) => new Date(ms).toISOString();

  const active = (provider, environment) => state().connections
    .find((c) => c.provider === provider && c.environment === environment && c.isConnected);

  const connect = (provider, environment, account) => {
    const s = state();
    const t = now();
    const existing = active(provider, environment);
    if (existing) Object.assign(existing, { accessTokenExpiresAt: iso(t + 3600_000) });
    else {
      s.connections.push({
        id: s.connections.reduce((max, c) => Math.max(max, c.id), 0) + 1, provider, environment,
        externalAccountId: account, scopes: SCOPES[provider], isConnected: true,
        accessTokenExpiresAt: iso(t + 3600_000), refreshTokenExpiresAt: provider === PROVIDERS.mp ? null : iso(t + 30 * 864e5),
        connectedAt: iso(t), disconnectedAt: null,
      });
    }
    // Conectar o Mercado Pago pelo OAuth seleciona o provedor no ambiente, como o back.
    if (provider === PROVIDERS.mp) s.selection = { provider, environment };
  };

  const backTo = (flag) => `${globalThis.location?.origin ?? ''}/?${flag}=connected#/admin/integracoes`;

  const summary = () => {
    const s = state();
    return {
      enabled: s.enabled, productionAllowed: s.productionAllowed, applicationId: s.applicationId,
      selectedProvider: s.selection.provider, selectedEnvironment: s.selection.environment,
      connections: s.connections.filter((c) => c.provider === PROVIDERS.mp).map((c) => ({
        id: c.id, environment: c.environment, externalAccountId: c.externalAccountId, isConnected: c.isConnected,
        accessTokenExpiresAt: c.accessTokenExpiresAt, connectedAt: c.connectedAt, disconnectedAt: c.disconnectedAt,
        webhookUrl: `https://api.exemplo.com/api/store/api/integrations/mercado-pago/webhooks/${c.id}`,
      })),
    };
  };

  const environmentOf = (body) => {
    const env = Number(body?.environment);
    if (![1, 2].includes(env)) return { error: problem(400, 'Validation', 'Ambiente inválido.') };
    if (env === 2 && !state().productionAllowed) return { error: problem(409, 'Integration.ProductionDisabled', 'Produção não está habilitada neste servidor.') };
    return { env };
  };

  /** @returns resposta ou null se a rota não é de integrações */
  function route(method, path, body) {
    if (!path.startsWith('integrations/') && !path.startsWith('provider-connections')) return null;
    const result = handle(method, path, body);
    if (method !== 'GET') save(state());
    return result;
  }

  function handle(method, path, body) {
    const s = state();
    const t = now();

    if (path === 'integrations/mercado-pago' && method === 'GET') return raw(summary());
    if (path === 'integrations/mercado-pago/notifications' && method === 'GET') return raw(s.notifications);
    if (path === 'integrations/mercado-pago/sandbox/connect' && method === 'POST') {
      if (!s.enabled) return problem(409, 'MercadoPago.Disabled', 'A integração com o Mercado Pago está desabilitada.');
      connect(PROVIDERS.mp, ENV.Sandbox, 'TESTUSER1234567');
      return { status: 204, data: null };
    }
    if (path === 'integrations/mercado-pago/oauth/start' && method === 'POST') {
      const { env, error } = environmentOf(body);
      if (error) return error;
      connect(PROVIDERS.mp, env, env === 1 ? 'TESTUSER1234567' : '998877665');
      return raw({ authorizationUrl: backTo('mercadoPago'), expiresAt: iso(t + 600_000) });
    }
    if (path === 'integrations/melhor-envio/oauth/start' && method === 'POST') {
      const { env, error } = environmentOf(body);
      if (error) return error;
      connect(PROVIDERS.me, env, 'loja.exemplo@melhorenvio');
      return raw({ authorizationUrl: backTo('melhorEnvio'), expiresAt: iso(t + 600_000) });
    }
    if (path === 'integrations/mercado-pago/selection' && method === 'PUT') {
      const provider = String(body?.provider ?? '');
      const env = Number(body?.environment);
      if (![PROVIDERS.mp, PROVIDERS.manual].includes(provider) || ![1, 2].includes(env)) {
        return problem(400, 'Validation', 'Provedor ou ambiente inválido.');
      }
      if (provider === PROVIDERS.mp && !active(PROVIDERS.mp, env)) {
        return problem(409, 'MercadoPago.NotConnected', 'Conecte uma conta do Mercado Pago neste ambiente antes de selecioná-lo.');
      }
      s.selection = { provider, environment: env };
      return { status: 204, data: null };
    }
    if (path === 'provider-connections' && method === 'GET') return raw(s.connections);
    const del = path.match(/^provider-connections\/([a-z-]+)\/(Sandbox|Production|1|2)$/);
    if (del && method === 'DELETE') {
      const env = ENV[del[2]] ?? Number(del[2]);
      const connection = active(del[1], env);
      if (!connection) return problem(404, 'ProviderConnection.NotFound', 'Conexão não encontrada.');
      Object.assign(connection, { isConnected: false, disconnectedAt: iso(t) });
      // Como no back: desconectar não muda a seleção sozinho (o checkout passa a recusar).
      return { status: 204, data: null };
    }
    return null;
  }

  // Provedor de pagamento dos novos checkouts: Mercado Pago só com conexão ativa.
  const paymentGateway = () => {
    const { provider, environment } = state().selection;
    return { provider, environment, connected: provider === PROVIDERS.mp ? Boolean(active(provider, environment)) : true };
  };

  return { route, paymentGateway };
}
