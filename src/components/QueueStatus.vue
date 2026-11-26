<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowRight, WifiOff } from '@lucide/vue';
import { QUEUE_STATUS } from '../services/client-api';
import { formatCpf, isValidCpf } from '../services/cpf';

// Fila prioritária (task 17). Estado vindo de useDropQueue (GET/POST
// storefront/{slug}/drop/events/{id}/queue). Entrar pede CPF; a vez é uma sessão
// de compra de 15 minutos fixos (session.expiresAt), que não renova. Não há "sair".
const props = defineProps({
  event: { type: Object, default: null },
  // serverNow() em ms
  now: { type: Number, required: true },
  entry: { type: Object, default: null },
  secondsLeft: { type: Number, default: null },
  etaMinutes: { type: Number, default: null },
  isLoading: { type: Boolean, default: false },
  isJoining: { type: Boolean, default: false },
  joinError: { type: Object, default: null },
  reconnecting: { type: Boolean, default: false },
});

const emit = defineEmits(['join', 'checkout']);

const CRITICAL_SECONDS = 60;
const integerBR = new Intl.NumberFormat('pt-BR');
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const formatWindow = (secs) => `${Math.floor(secs / 60)}:${pad(secs % 60)}`;

// Posição de quando entrou: base do medidor de progresso.
const startPosition = ref(null);
const status = computed(() => props.entry?.queueEntryStatusId ?? null);

// Máquina de estados de patterns/drop-page.md.
const view = computed(() => {
  const ev = props.event;
  if (!ev) return null;
  const queueOpens = Date.parse(ev.queueOpensAt);
  const dropEnds = Date.parse(ev.dropEndsAt);

  if (props.isLoading && !props.entry) return { key: 'loading', badge: { variant: 'ds-badge--scheduled', label: 'Consultando' } };
  if (status.value === QUEUE_STATUS.COMPLETED) {
    return { key: 'done', badge: { variant: 'ds-badge--success', label: 'Concluído' }, text: 'Sua compra neste drop foi concluída.' };
  }
  if (status.value === QUEUE_STATUS.WAITING) return { key: 'waiting', badge: { variant: 'ds-badge--waiting', label: 'Na fila', dot: true } };
  if (status.value === QUEUE_STATUS.CALLED) return { key: 'your-turn', badge: { variant: 'ds-badge--live', label: 'Sua vez!', live: true } };
  if (status.value === QUEUE_STATUS.CHECKING_OUT) return { key: 'checking-out', badge: { variant: 'ds-badge--live', label: 'Finalizando', live: true } };
  if (props.now >= dropEnds) {
    return { key: 'ended', badge: { variant: 'ds-badge--done', label: 'Encerrado' }, text: 'O drop encerrou. A fila não aceita mais entradas.' };
  }
  if (props.now < queueOpens) {
    return {
      key: 'scheduled',
      badge: { variant: 'ds-badge--scheduled', label: `Abre às ${timeFmt.format(queueOpens)}` },
      text: `A fila abre às ${timeFmt.format(queueOpens)}. Deixe esta tela aberta para entrar assim que liberar.`,
    };
  }
  if (status.value === QUEUE_STATUS.EXPIRED) {
    return {
      key: 'join',
      badge: { variant: 'ds-badge--done', label: 'Prazo encerrado' },
      text: 'Seu prazo de compra terminou. Você pode entrar de novo: a vaga vai para o fim da fila e uma nova sessão começa quando chegar a sua vez.',
      cta: 'Entrar de novo na fila',
    };
  }
  return {
    key: 'join',
    badge: { variant: 'ds-badge--live', label: 'Fila aberta', live: true },
    text: status.value === QUEUE_STATUS.REMOVED
      ? 'Sua entrada foi removida da fila. Você pode entrar de novo.'
      : 'As compras seguem a ordem de chegada. Entre na fila para garantir sua vez.',
    cta: 'Entrar na fila',
  };
});

// ---------------------------------------------------------------- CPF ---
const cpf = ref('');
const cpfTouched = ref(false);
// Erros do servidor valem para o CPF enviado; mudar o campo os esconde.
const submittedCpf = ref('');
const serverError = computed(() => (props.joinError && cpf.value === submittedCpf.value ? props.joinError : null));
const onCpfInput = (event) => {
  cpf.value = formatCpf(event.target.value);
  event.target.value = cpf.value;
};
const cpfInvalid = computed(() => cpfTouched.value && !isValidCpf(cpf.value));

const fieldError = computed(() => {
  if (cpfInvalid.value) return 'CPF inválido. Confira os números.';
  const err = serverError.value;
  if (!err) return '';
  if (err.code === 'DropPurchase.IdentityConflict') return 'Use o mesmo CPF da sua primeira entrada neste drop.';
  if (err.fieldErrors?.CPF?.length) return err.fieldErrors.CPF[0];
  return '';
});

const formError = computed(() => {
  const err = serverError.value;
  if (!err || fieldError.value) return '';
  if (err.code === 'Drop.QueueClosed') {
    if (props.event?.requiresRegistration) return 'Este drop exige inscrição prévia aprovada para entrar na fila.';
    return 'A fila não está aberta agora.';
  }
  if (err.code === 'Drop.NotFound') return 'Drop não encontrado.';
  if (err.code === 'DropPurchase.Unavailable') return 'A compra deste drop não está disponível agora.';
  if (err.kind === 'unavailable') return 'A fila está indisponível no servidor. Tente de novo em instantes.';
  return err.message;
});

const submit = () => {
  cpfTouched.value = true;
  if (!isValidCpf(cpf.value) || props.isJoining) return;
  submittedCpf.value = cpf.value;
  emit('join', cpf.value);
};

// ------------------------------------------------------------ fila ---
const position = computed(() => props.entry?.position ?? 0);
watch([status, position], ([current, pos]) => {
  if (current !== QUEUE_STATUS.WAITING) startPosition.value = null;
  else if (startPosition.value == null || pos > startPosition.value) startPosition.value = pos;
}, { immediate: true });
const queueProgress = computed(() => {
  if (status.value !== QUEUE_STATUS.WAITING) return 0;
  const start = startPosition.value;
  if (!start) return 0;
  return Math.round(Math.min(100, Math.max(0, ((start - position.value) / start) * 100)));
});
const isWindowCritical = computed(() => props.secondsLeft != null && props.secondsLeft < CRITICAL_SECONDS);
</script>

<template>
  <article
    v-if="view"
    class="ds-card ds-stack--5"
  >
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Fila prioritária
      </h2>
      <span :class="['ds-badge', view.badge.variant]">
        <span
          v-if="view.badge.live || view.badge.dot"
          class="ds-badge__dot"
          aria-hidden="true"
        />
        {{ view.badge.label }}
      </span>
    </header>

    <p
      v-if="reconnecting"
      class="ds-hint"
      role="status"
    >
      <WifiOff
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Reconectando… sua posição continua guardada.
    </p>

    <!-- Entrar (ou voltar) com CPF -->
    <form
      v-if="view.key === 'join'"
      class="ds-stack--4"
      novalidate
      @submit.prevent="submit"
    >
      <p class="ds-text-secondary">
        {{ view.text }}
      </p>
      <div class="ds-field">
        <label
          class="ds-label"
          for="queue-cpf"
        >CPF</label>
        <input
          id="queue-cpf"
          class="ds-input ds-mono"
          :value="cpf"
          inputmode="numeric"
          autocomplete="off"
          maxlength="14"
          placeholder="000.000.000-00"
          :aria-invalid="fieldError ? 'true' : undefined"
          aria-describedby="queue-cpf-hint"
          @input="onCpfInput"
          @blur="cpfTouched = Boolean(cpf)"
        >
        <span
          v-if="fieldError"
          id="queue-cpf-hint"
          class="ds-error"
          role="alert"
        >{{ fieldError }}</span>
        <span
          v-else
          id="queue-cpf-hint"
          class="ds-hint"
        >O limite por CPF vale para o produto inteiro neste drop, somando todas as opções, e é dividido entre contas com o mesmo CPF. O CPF não fica salvo neste aparelho.</span>
      </div>
      <p
        v-if="formError"
        class="ds-error"
        role="alert"
      >
        {{ formError }}
      </p>
      <button
        type="submit"
        class="ds-btn ds-btn--primary ds-btn--block"
        :disabled="isJoining"
        :aria-busy="isJoining"
      >
        <span
          v-if="isJoining"
          class="ds-spinner"
          aria-hidden="true"
        />
        {{ view.cta }}
        <ArrowRight
          v-if="!isJoining"
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
    </form>

    <!-- Aguardando -->
    <div
      v-else-if="view.key === 'waiting'"
      class="ds-stack--4"
    >
      <div class="ds-stat ds-stat--lg">
        <div class="ds-stat__value ds-numeric">
          {{ integerBR.format(position) }}<span class="ds-stat__unit">º</span>
        </div>
        <div class="ds-stat__label">
          sua posição na fila{{ etaMinutes ? ` · ≈ ${etaMinutes} min` : '' }}
        </div>
      </div>
      <div
        class="ds-meter"
        role="progressbar"
        aria-label="Progresso na fila"
        :aria-valuenow="queueProgress"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="ds-meter__fill"
          :style="{ width: `${queueProgress}%` }"
        />
      </div>
      <p class="ds-hint">
        Atualizado a cada 3 segundos. Pode fechar esta tela: ao voltar, a posição continua a mesma.
      </p>
    </div>

    <!-- Sua vez / finalizando -->
    <template v-else-if="view.key === 'your-turn' || view.key === 'checking-out'">
      <button
        type="button"
        class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block"
        @click="emit('checkout')"
      >
        {{ view.key === 'your-turn' ? 'Escolher e reservar' : 'Continuar a compra' }}
        <ArrowRight
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </button>
      <div
        v-if="secondsLeft != null"
        :class="['ds-stat', 'ds-stat--lg', { 'ds-stat--critical': isWindowCritical }]"
      >
        <div class="ds-stat__value ds-numeric">
          {{ formatWindow(secondsLeft) }}
        </div>
        <div class="ds-stat__label">
          para concluir a compra. O prazo é fixo e não renova.
        </div>
      </div>
    </template>

    <p
      v-else-if="view.key === 'loading'"
      class="ds-hint"
    >
      Consultando sua posição…
    </p>

    <template v-else>
      <button
        v-if="view.key === 'scheduled'"
        type="button"
        class="ds-btn ds-btn--primary ds-btn--block"
        disabled
      >
        Entrar na fila
      </button>
      <p class="ds-text-secondary">
        {{ view.text }}
      </p>
    </template>

    <!-- Regiões sempre montadas: posição em polite, "sua vez" em assertive. -->
    <p
      class="ds-sr-only"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ view.key === 'waiting' ? `Sua posição na fila: ${position}` : '' }}
    </p>
    <p
      class="ds-sr-only"
      aria-live="assertive"
    >
      {{ view.key === 'your-turn' ? 'É a sua vez. Escolha e reserve antes de o prazo acabar.' : '' }}
    </p>
  </article>
</template>
