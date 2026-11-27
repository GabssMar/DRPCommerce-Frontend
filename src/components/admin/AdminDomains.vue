<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, Copy } from '@lucide/vue';
import { exclusive, useAction, useAsync } from '../../composables/useAsync';
import { addDomain, deleteDomain, listDomains, setDomainPublication, verifyDomain } from '../../services/team-api';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// Domínio próprio (task 41). Rotas (/api/store, só o dono principal): enterprise-domains
// get-all, add, {id}/verify, {id}/publication e DELETE. A vitrine resolve a loja pelo Host.
// O back só guarda "verificado": pendente e falhou são estados da tela, a partir das respostas.
const ERRORS = {
  'Domain.OwnershipUnverified': 'Ainda não encontramos o registro TXT. O DNS pode levar alguns minutos para atualizar: confira o nome e o valor e tente de novo.',
  'Domain.DnsUnavailable': 'Não foi possível consultar o DNS agora. Tente de novo em instantes.',
  'Domain.PlatformDomainReserved': 'Este domínio pertence à plataforma. Use o domínio da sua marca.',
  'Domain.InUse': 'Este domínio já está cadastrado.',
  'Domain.PrimaryProtected': 'O domínio principal não pode ser despublicado nem excluído. Torne outro domínio principal antes.',
  'Domain.PrimaryMustBeActive': 'O domínio principal precisa estar publicado.',
};
const messageOf = (error) => (error ? ERRORS[error.code] ?? error.message : '');

const domains = useAsync(listDomains, { initial: [] });
const list = computed(() => domains.data.value ?? []);

// Host: sem https://, caminho, porta ou espaços; rótulos de 1 a 63 caracteres sem hífen nas pontas.
const host = ref('');
const hostInput = ref(null);
const hostError = computed(() => {
  const value = host.value.trim().toLowerCase();
  if (!value) return '';
  if (/[/:@\s]/.test(value)) return 'Informe só o host, sem https://, caminho, porta ou espaços.';
  if (value.length > 253 || !value.includes('.')) return 'Use um domínio completo, como loja.minhamarca.com.br.';
  if (!value.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return 'Cada parte do domínio usa letras, números e hífens, sem hífen no começo ou no fim.';
  return '';
});

// O valor do TXT só vem no cadastro: fica na tela até o dono fechar.
const challenges = ref({});
const add = useAction(async () => {
  const created = await addDomain(host.value.trim().toLowerCase());
  challenges.value = { ...challenges.value, [created.id]: created };
  host.value = '';
  await domains.reload();
});

const failed = ref(new Set());
const verify = useAction(async (domain) => {
  const next = new Set(failed.value);
  try {
    await verifyDomain(domain.id);
    next.delete(domain.id);
  } catch (err) {
    next.add(domain.id);
    throw err;
  } finally {
    failed.value = next;
  }
  await domains.reload();
});

const publish = useAction(async (domain, change) => {
  await setDomainPublication(domain.id, { isPrimary: domain.isPrimary, isActive: domain.isActive, ...change });
  await domains.reload();
});

const removing = ref(null);
const remove = useAction(async () => {
  await deleteDomain(removing.value.id);
  removing.value = null;
  await domains.reload();
});

const stateOf = (d) => {
  if (d.isVerified) return { label: 'Verificado', tone: 'success' };
  return failed.value.has(d.id) ? { label: 'Não verificado', tone: 'live' } : { label: 'Pendente', tone: 'waiting' };
};

exclusive(verify, publish);

const copied = ref('');
const copy = async (key, text) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
  } catch {
    copied.value = 'falhou';
  }
};
const actionError = computed(() => messageOf(verify.error.value || publish.error.value));
</script>

<template>
  <section class="ds-stack--6">
    <article class="ds-card ds-stack--4">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Conectar domínio
        </h2>
      </header>
      <p class="ds-text-secondary">
        Cadastre o domínio da sua marca (por exemplo, loja.minhamarca.com.br) e prove que ele é seu criando um registro TXT no DNS.
      </p>
      <form
        class="ds-stack--2"
        @submit.prevent="add.run()"
      >
        <label
          class="ds-label"
          for="dm-host"
        >Domínio</label>
        <div class="ds-input-group">
          <input
            id="dm-host"
            ref="hostInput"
            v-model="host"
            class="ds-input ds-mono"
            autocapitalize="none"
            spellcheck="false"
            placeholder="loja.minhamarca.com.br"
            maxlength="253"
            required
            aria-describedby="dm-host-hint"
            :aria-invalid="Boolean(hostError || add.error.value)"
          >
          <button
            type="submit"
            class="ds-btn ds-btn--primary"
            :disabled="Boolean(hostError) || add.isPending.value"
            :aria-busy="add.isPending.value"
          >
            <span
              v-if="add.isPending.value"
              class="ds-spinner"
              aria-hidden="true"
            />
            Cadastrar
          </button>
        </div>
        <span
          id="dm-host-hint"
          :class="hostError || add.error.value ? 'ds-error' : 'ds-hint'"
          :role="hostError || add.error.value ? 'alert' : undefined"
        >
          <AlertCircle
            v-if="hostError || add.error.value"
            :size="14"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ hostError || messageOf(add.error.value) || 'Só o host: sem https:// e sem caminho.' }}
        </span>
      </form>
      <p class="ds-hint">
        Verificar prova que o domínio é seu. Apontar o DNS para a plataforma e o certificado HTTPS são configurados pela equipe.
      </p>
    </article>

    <article
      v-for="c in Object.values(challenges)"
      :key="c.id"
      class="ds-card ds-stack--3"
    >
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Crie o registro TXT de {{ c.host }}
        </h2>
        <button
          type="button"
          class="ds-btn ds-btn--ghost ds-btn--sm"
          @click="delete challenges[c.id]"
        >
          Fechar
        </button>
      </header>
      <ol class="ds-stack--2 ds-text-sm">
        <li>No painel do seu provedor de DNS, crie um registro do tipo <strong>TXT</strong>.</li>
        <li>
          Nome (host):
          <span class="ds-cluster ds-cluster--2">
            <code class="ds-code">{{ c.recordName }}</code>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :aria-label="`Copiar o nome do registro de ${c.host}`"
              @click="copy(`n${c.id}`, c.recordName)"
            >
              <Copy
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ copied === `n${c.id}` ? 'Copiado' : 'Copiar' }}
            </button>
          </span>
        </li>
        <li>
          Valor:
          <span class="ds-cluster ds-cluster--2">
            <code class="ds-code">{{ c.recordValue }}</code>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :aria-label="`Copiar o valor do registro de ${c.host}`"
              @click="copy(`v${c.id}`, c.recordValue)"
            >
              <Copy
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ copied === `v${c.id}` ? 'Copiado' : 'Copiar' }}
            </button>
          </span>
        </li>
        <li>Salve e volte aqui para <strong>Verificar agora</strong>. O DNS pode levar alguns minutos.</li>
      </ol>
      <p
        v-if="copied === 'falhou'"
        class="ds-error"
        role="alert"
      >
        Não foi possível copiar. Selecione o texto e copie manualmente.
      </p>
      <p class="ds-hint">
        O valor aparece só agora. Se perder, exclua o domínio e cadastre de novo para gerar outro.
      </p>
    </article>

    <article class="ds-card ds-card--flush">
      <header class="ds-card__header">
        <h2 class="ds-card__title">
          Domínios
        </h2>
      </header>
      <LoadState
        :is-loading="domains.isLoading.value"
        :error="domains.error.value"
        :is-empty="!list.length"
        empty-text="Nenhum domínio próprio. A loja responde só no endereço da plataforma."
        :lines="3"
        flush
        @retry="domains.reload"
      >
        <template #empty-action>
          <button
            type="button"
            class="ds-btn ds-btn--secondary ds-btn--sm"
            @click="hostInput?.focus()"
          >
            Cadastrar domínio
          </button>
        </template>
        <ul class="ds-list">
          <li
            v-for="d in list"
            :key="d.id"
            class="ds-list__item"
          >
            <span class="ds-icon-tile ds-icon-tile--square" />
            <span class="ds-stack--1 ds-min-0">
              <span class="ds-text-medium ds-mono">{{ d.host }}</span>
              <span class="ds-cluster ds-cluster--2">
                <span :class="['ds-badge', `ds-badge--${stateOf(d).tone}`]">{{ stateOf(d).label }}</span>
                <span
                  v-if="d.isPrimary"
                  class="ds-badge ds-badge--inverse"
                >Principal</span>
                <span
                  v-else-if="d.isActive"
                  class="ds-badge ds-badge--done"
                >Publicado</span>
              </span>
            </span>
            <span class="ds-list__meta">
              <button
                v-if="!d.isVerified"
                type="button"
                class="ds-btn ds-btn--secondary ds-btn--sm"
                :disabled="verify.isPending.value"
                @click="verify.run(d)"
              >
                Verificar agora
              </button>
              <template v-else>
                <button
                  v-if="!d.isActive"
                  type="button"
                  class="ds-btn ds-btn--secondary ds-btn--sm"
                  :disabled="publish.isPending.value"
                  @click="publish.run(d, { isActive: true })"
                >
                  Publicar
                </button>
                <button
                  v-if="!d.isPrimary"
                  type="button"
                  class="ds-btn ds-btn--ghost ds-btn--sm"
                  :disabled="publish.isPending.value"
                  @click="publish.run(d, { isPrimary: true, isActive: true })"
                >
                  Tornar principal
                </button>
                <button
                  v-if="d.isActive && !d.isPrimary"
                  type="button"
                  class="ds-btn ds-btn--ghost ds-btn--sm"
                  :disabled="publish.isPending.value"
                  @click="publish.run(d, { isActive: false })"
                >
                  Despublicar
                </button>
              </template>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                :disabled="d.isPrimary"
                :title="d.isPrimary ? 'O domínio principal não pode ser excluído. Torne outro principal antes.' : undefined"
                :aria-label="`Excluir ${d.host}`"
                @click="remove.error.value = null; removing = d"
              >
                Excluir
              </button>
            </span>
          </li>
        </ul>
        <p
          v-if="actionError"
          class="ds-error ds-card__note"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ actionError }}
        </p>
      </LoadState>
    </article>
  </section>

  <ModalDialog
    v-if="removing"
    :title="`Excluir ${removing.host}?`"
    @close="removing = null"
  >
    <p class="ds-text-secondary">
      A vitrine deixa de responder neste domínio. Para voltar, cadastre e verifique de novo.
    </p>
    <p
      v-if="remove.error.value"
      class="ds-error"
      role="alert"
    >
      {{ messageOf(remove.error.value) }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="removing = null"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="remove.isPending.value"
        @click="remove.run()"
      >
        Excluir
      </button>
    </template>
  </ModalDialog>
</template>
