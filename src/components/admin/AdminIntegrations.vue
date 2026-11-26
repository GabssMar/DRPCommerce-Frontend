<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, CheckCircle, Copy, CreditCard, Truck } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import {
  connectMercadoPagoSandbox, disconnectProvider, envId, getMercadoPagoIntegration, INTEGRATION_ENV,
  listMercadoPagoNotifications, listProviderConnections, selectPaymentProvider, startMelhorEnvioOAuth, startMercadoPagoOAuth,
} from '../../services/admin-api';
import { formatDateTime } from '../../services/format';
import LoadState from '../ui/LoadState.vue';

// Integrações da loja (task 43): Mercado Pago (pagamento do checkout) e Melhor Envio
// (cotação de frete). A conexão é OAuth feita pelo back: o painel pede a URL de
// autorização, navega para ela e o callback do back volta para cá com ?mercadoPago=connected
// (ou melhorEnvio). O resultado vale pelo status autenticado, nunca pela URL.
// Nenhum token chega ao navegador. Exige a permissão settings.manage.
const ENVIRONMENTS = [
  { id: INTEGRATION_ENV.SANDBOX, label: 'Teste (sandbox)' },
  { id: INTEGRATION_ENV.PRODUCTION, label: 'Produção' },
];
const MP = 'mercado-pago';
const ME = 'melhor-envio';

const page = useAsync(async () => {
  const [mercadoPago, connections, notifications] = await Promise.all([
    getMercadoPagoIntegration(),
    listProviderConnections(),
    listMercadoPagoNotifications().catch(() => []),
  ]);
  return { mercadoPago, connections, notifications };
});

const mp = computed(() => page.data.value?.mercadoPago ?? null);
const connections = computed(() => page.data.value?.connections ?? []);
const notifications = computed(() => page.data.value?.notifications ?? []);

// Volta do OAuth: ?mercadoPago=connected ou ?melhorEnvio=connected antes do #. Mostra o aviso
// e limpa a URL (o status abaixo, relido do back, é que confirma a conexão).
const params = new URLSearchParams(window.location.search);
const returned = ref(params.get('mercadoPago') === 'connected' ? 'Mercado Pago' : params.get('melhorEnvio') === 'connected' ? 'Melhor Envio' : '');
if (returned.value) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);

const mpConnection = (environment) => (mp.value?.connections ?? [])
  .find((c) => envId(c.environment) === environment && c.isConnected) ?? null;
const meConnection = (environment) => connections.value
  .find((c) => c.provider === ME && envId(c.environment) === environment && c.isConnected) ?? null;

const selectedEnv = computed(() => (mp.value?.selectedEnvironment == null ? null : envId(mp.value.selectedEnvironment)));
const usesMercadoPago = computed(() => mp.value?.selectedProvider === MP);
const selectionBroken = computed(() => usesMercadoPago.value && !mpConnection(selectedEnv.value));
const envLabel = (id) => ENVIRONMENTS.find((e) => e.id === id)?.label ?? '';

// Uma ação por vez; o erro aparece no cartão do provedor.
const errors = ref({ [MP]: '', [ME]: '' });
const confirming = ref(null); // `${provider}:${env}` aguardando confirmação de desconexão
const run = (provider, action) => useAction(async (...args) => {
  errors.value = { ...errors.value, [provider]: '' };
  try {
    await action(...args);
  } catch (err) {
    errors.value = { ...errors.value, [provider]: err?.message ?? 'Não foi possível concluir.' };
    throw err;
  }
});

const goTo = (url) => window.location.assign(url);
const connectMp = run(MP, async (environment) => goTo((await startMercadoPagoOAuth(environment)).authorizationUrl));
const connectMpTestSeller = run(MP, async () => {
  await connectMercadoPagoSandbox();
  await page.reload();
});
const select = run(MP, async (provider, environment) => {
  await selectPaymentProvider(provider, environment);
  await page.reload();
});
const connectMe = run(ME, async (environment) => goTo((await startMelhorEnvioOAuth(environment)).authorizationUrl));
const disconnect = run(MP, async (provider, environment) => {
  await disconnectProvider(provider, environment);
  confirming.value = null;
  await page.reload();
});
const disconnectMe = run(ME, async (environment) => {
  await disconnectProvider(ME, environment);
  confirming.value = null;
  await page.reload();
});
const busy = computed(() => [connectMp, connectMpTestSeller, select, connectMe, disconnect, disconnectMe].some((a) => a.isPending.value));

const copied = ref('');
const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
    setTimeout(() => { copied.value = ''; }, 2000);
  } catch {
    copied.value = '';
  }
};

const NOTIFICATION_STATUS = {
  1: { label: 'Pendente', tone: 'scheduled' },
  2: { label: 'Processando', tone: 'waiting' },
  3: { label: 'Concluída', tone: 'success' },
  4: { label: 'Em revisão', tone: 'live' },
};
const notificationStatus = (value) => NOTIFICATION_STATUS[typeof value === 'number' ? value : { Pending: 1, Processing: 2, Completed: 3, ReviewRequired: 4 }[value]] ?? { label: String(value), tone: 'done' };
</script>

<template>
  <div class="ds-stack--1">
    <h1 class="ds-title ds-title--lg">
      Integrações
    </h1>
    <p class="ds-text-secondary">
      Contas que a loja usa para cobrar no checkout e cotar o frete. As credenciais ficam só no servidor.
    </p>
  </div>

  <p
    v-if="returned"
    class="ds-hint ds-text-success"
    role="status"
  >
    <CheckCircle
      :size="16"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    Voltamos do {{ returned }}. Confira abaixo se a conta aparece como conectada.
  </p>

  <LoadState
    :is-loading="page.isLoading.value"
    :error="page.error.value"
    :lines="8"
    @retry="page.reload"
  >
    <section class="ds-grid ds-grid--2">
      <!-- Mercado Pago -->
      <article class="ds-card ds-stack--5">
        <header class="ds-card__header">
          <h2 class="ds-card__title ds-cluster ds-cluster--2">
            <CreditCard
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Mercado Pago
          </h2>
          <span
            v-if="!mp?.enabled"
            class="ds-badge ds-badge--done"
          >Desabilitado no servidor</span>
          <span
            v-else
            :class="['ds-badge', usesMercadoPago ? 'ds-badge--success' : 'ds-badge--scheduled']"
          >{{ usesMercadoPago ? `Checkout: Mercado Pago · ${envLabel(selectedEnv)}` : 'Checkout: pagamento manual' }}</span>
        </header>
        <p class="ds-text-sm ds-text-secondary">
          Com uma conta conectada e escolhida, o checkout cria a cobrança no Mercado Pago (Pix, cartão, boleto) e o pedido é confirmado pelo aviso do Mercado Pago. Sem ela, a loja confirma o pagamento manualmente.
        </p>

        <p
          v-if="selectionBroken"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          O checkout está configurado para o Mercado Pago, mas a conta foi desconectada. Novos pedidos vão falhar até você reconectar ou voltar para o pagamento manual.
        </p>

        <ul
          class="ds-stack--4 ds-list-reset"
          aria-label="Ambientes do Mercado Pago"
        >
          <li
            v-for="env in ENVIRONMENTS"
            :key="env.id"
            class="ds-card ds-card--sunken ds-stack--3"
          >
            <div class="ds-cluster ds-cluster--between">
              <strong class="ds-text-medium">{{ env.label }}</strong>
              <span :class="['ds-badge', mpConnection(env.id) ? 'ds-badge--success' : 'ds-badge--done']">
                {{ mpConnection(env.id) ? 'Conectado' : 'Não conectado' }}
              </span>
            </div>

            <template v-if="mpConnection(env.id)">
              <dl class="ds-dl ds-text-sm">
                <dt>Conta</dt>
                <dd class="ds-mono">
                  {{ mpConnection(env.id).externalAccountId }}
                </dd>
                <dt>Conectada em</dt>
                <dd>{{ formatDateTime(mpConnection(env.id).connectedAt) }}</dd>
                <dt>Acesso vale até</dt>
                <dd>{{ formatDateTime(mpConnection(env.id).accessTokenExpiresAt) }}</dd>
              </dl>
              <div
                v-if="mpConnection(env.id).webhookUrl"
                class="ds-field"
              >
                <label
                  class="ds-label"
                  :for="`mp-webhook-${env.id}`"
                >URL de notificações (configure no Mercado Pago, tópico "payment")</label>
                <div class="ds-input-group">
                  <input
                    :id="`mp-webhook-${env.id}`"
                    class="ds-input ds-mono"
                    :value="mpConnection(env.id).webhookUrl"
                    readonly
                  >
                  <button
                    type="button"
                    class="ds-btn ds-btn--secondary"
                    @click="copy(mpConnection(env.id).webhookUrl)"
                  >
                    <Copy
                      class="ds-btn__icon"
                      :size="16"
                      :stroke-width="1.5"
                      aria-hidden="true"
                    />
                    {{ copied === mpConnection(env.id).webhookUrl ? 'Copiado' : 'Copiar' }}
                  </button>
                </div>
              </div>
            </template>
            <p
              v-else-if="env.id === INTEGRATION_ENV.PRODUCTION && !mp?.productionAllowed"
              class="ds-hint"
            >
              Produção ainda não está liberada neste servidor.
            </p>

            <div class="ds-cluster ds-cluster--2">
              <template v-if="!mpConnection(env.id)">
                <button
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="busy || !mp?.enabled || (env.id === INTEGRATION_ENV.PRODUCTION && !mp?.productionAllowed)"
                  @click="connectMp.run(env.id)"
                >
                  Conectar conta
                </button>
                <button
                  v-if="env.id === INTEGRATION_ENV.SANDBOX"
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="busy || !mp?.enabled"
                  @click="connectMpTestSeller.run()"
                >
                  Usar vendedor de teste do servidor
                </button>
              </template>
              <template v-else>
                <button
                  v-if="!usesMercadoPago || selectedEnv !== env.id"
                  type="button"
                  class="ds-btn ds-btn--primary ds-btn--sm"
                  :disabled="busy"
                  @click="select.run(MP, env.id)"
                >
                  Usar no checkout
                </button>
                <template v-if="confirming === `${MP}:${env.id}`">
                  <span class="ds-text-sm">Desconectar apaga o acesso desta conta.</span>
                  <button
                    type="button"
                    class="ds-btn ds-btn--ghost ds-btn--sm"
                    @click="confirming = null"
                  >
                    Manter
                  </button>
                  <button
                    type="button"
                    class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                    :disabled="busy"
                    @click="disconnect.run(MP, env.id)"
                  >
                    Sim, desconectar
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                  @click="confirming = `${MP}:${env.id}`"
                >
                  Desconectar
                </button>
              </template>
            </div>
          </li>
        </ul>

        <button
          v-if="usesMercadoPago"
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm ds-self-start"
          :disabled="busy"
          @click="select.run('manual', selectedEnv ?? INTEGRATION_ENV.SANDBOX)"
        >
          Voltar para o pagamento manual
        </button>

        <p
          v-if="errors[MP]"
          class="ds-error"
          role="alert"
        >
          {{ errors[MP] }}
        </p>
      </article>

      <!-- Melhor Envio -->
      <article class="ds-card ds-stack--5">
        <header class="ds-card__header">
          <h2 class="ds-card__title ds-cluster ds-cluster--2">
            <Truck
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            Melhor Envio
          </h2>
          <span :class="['ds-badge', ENVIRONMENTS.some((e) => meConnection(e.id)) ? 'ds-badge--success' : 'ds-badge--done']">
            {{ ENVIRONMENTS.some((e) => meConnection(e.id)) ? 'Frete cotado' : 'Frete combinado com a loja' }}
          </span>
        </header>
        <p class="ds-text-sm ds-text-secondary">
          Com a conta conectada, o checkout cota o frete no Melhor Envio (serviço, prazo e valor). Sem ela, a entrega é combinada com a loja depois do pedido. A geração de etiqueta ainda não existe no servidor.
        </p>

        <ul
          class="ds-stack--4 ds-list-reset"
          aria-label="Ambientes do Melhor Envio"
        >
          <li
            v-for="env in ENVIRONMENTS"
            :key="env.id"
            class="ds-card ds-card--sunken ds-stack--3"
          >
            <div class="ds-cluster ds-cluster--between">
              <strong class="ds-text-medium">{{ env.label }}</strong>
              <span :class="['ds-badge', meConnection(env.id) ? 'ds-badge--success' : 'ds-badge--done']">
                {{ meConnection(env.id) ? 'Conectado' : 'Não conectado' }}
              </span>
            </div>
            <dl
              v-if="meConnection(env.id)"
              class="ds-dl ds-text-sm"
            >
              <dt>Conta</dt>
              <dd class="ds-mono">
                {{ meConnection(env.id).externalAccountId }}
              </dd>
              <dt>Permissões</dt>
              <dd>{{ meConnection(env.id).scopes }}</dd>
              <dt>Conectada em</dt>
              <dd>{{ formatDateTime(meConnection(env.id).connectedAt) }}</dd>
            </dl>
            <div class="ds-cluster ds-cluster--2">
              <button
                v-if="!meConnection(env.id)"
                type="button"
                class="ds-btn ds-btn--primary ds-btn--sm"
                :disabled="busy"
                @click="connectMe.run(env.id)"
              >
                Conectar conta
              </button>
              <template v-else-if="confirming === `${ME}:${env.id}`">
                <span class="ds-text-sm">O checkout deixa de cotar frete neste ambiente.</span>
                <button
                  type="button"
                  class="ds-btn ds-btn--ghost ds-btn--sm"
                  @click="confirming = null"
                >
                  Manter
                </button>
                <button
                  type="button"
                  class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                  :disabled="busy"
                  @click="disconnectMe.run(env.id)"
                >
                  Sim, desconectar
                </button>
              </template>
              <button
                v-else
                type="button"
                class="ds-btn ds-btn--ghost-danger ds-btn--sm"
                @click="confirming = `${ME}:${env.id}`"
              >
                Desconectar
              </button>
            </div>
          </li>
        </ul>

        <p
          v-if="errors[ME]"
          class="ds-error"
          role="alert"
        >
          {{ errors[ME] }}
        </p>
      </article>
    </section>

    <!-- Notificações do Mercado Pago -->
    <article class="ds-card ds-stack--4">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Avisos de pagamento pendentes
        </h2>
        <span class="ds-text-xs ds-text-secondary">últimos 100 pendentes ou em revisão</span>
      </header>
      <p
        v-if="!notifications.length"
        class="ds-text-sm ds-text-secondary"
      >
        Nenhum aviso pendente ou em revisão.
      </p>
      <div
        v-else
        class="ds-table-scroll"
      >
        <table class="ds-table">
          <thead>
            <tr>
              <th scope="col">
                Pagamento
              </th>
              <th scope="col">
                Situação
              </th>
              <th scope="col">
                Motivo
              </th>
              <th scope="col">
                Recebido em
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="n in notifications"
              :key="n.id"
            >
              <td class="ds-mono">
                {{ n.paymentId }}
              </td>
              <td>
                <span :class="['ds-badge', `ds-badge--${notificationStatus(n.status).tone}`]">{{ notificationStatus(n.status).label }}</span>
              </td>
              <td>{{ n.resolutionCode || '—' }}</td>
              <td>{{ formatDateTime(n.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </LoadState>
</template>
