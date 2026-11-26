// Erro único da camada de dados. As telas leem `message` (texto para o usuário),
// `kind` (categoria do erro), `status`, `code` (regra de negócio, ex.:
// Inventory.OrderReservationProtected), `fieldErrors` (validação por campo) e,
// em 429, `retryAfter` (segundos).

// Categoria por status. Telas decidem o que fazer pelo `kind`, nunca pelo número.
const KIND_BY_STATUS = {
  0: 'network',
  400: 'validation',
  401: 'auth',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  412: 'stale',
  428: 'precondition',
  429: 'rate-limit',
  503: 'unavailable',
};

export const kindOf = (status) => KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'unknown');

const KIND_MESSAGES = {
  network: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
  timeout: 'O servidor demorou para responder. Tente de novo.',
  validation: 'Confira os dados informados.',
  auth: 'Sua sessão expirou. Entre de novo para continuar.',
  forbidden: 'Você não tem permissão para esta ação.',
  'not-found': 'Não encontramos o que você procurava.',
  conflict: 'Não foi possível concluir: os dados mudaram ou não estão mais disponíveis.',
  stale: 'Outra pessoa alterou este registro. Recarregue para ver a versão atual.',
  precondition: 'Recarregue o registro antes de salvar.',
  'rate-limit': 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.',
  unavailable: 'Serviço indisponível no momento. Tente de novo em instantes.',
  server: 'Algo deu errado no servidor. Tente de novo.',
  unknown: 'Algo deu errado. Tente de novo.',
};

// "CreateDropEventCommand.commands[0].name" -> "name"
const fieldFromCode = (code) => code.split('.').pop().replace(/\[\d+\]/g, '');

// Retry-After vem em segundos ou como data HTTP.
const parseRetryAfter = (value) => {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((at - Date.now()) / 1000));
};

// 429: o tempo de espera vale mais que o texto do back. Sem contador de tentativas.
const rateLimitMessage = (retryAfter) =>
  retryAfter > 0 ? `Muitas tentativas. Tente de novo em ${retryAfter} s.` : '';

export class ApiError extends Error {
  constructor({ status = 0, kind, code = '', message = '', fieldErrors = {}, traceId = '', retryAfter = null } = {}) {
    const finalKind = kind ?? kindOf(status);
    const text = (finalKind === 'rate-limit' && rateLimitMessage(retryAfter)) || message;
    super(text || KIND_MESSAGES[finalKind] || KIND_MESSAGES.unknown);
    this.name = 'ApiError';
    this.status = status;
    this.kind = finalKind;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
  }

  // ProblemDetails / ValidationProblemDetails (application/problem+json).
  static fromResponse(status, body, headers = {}) {
    const retryAfter = parseRetryAfter(headers['retry-after']);
    if (!body || typeof body !== 'object') return new ApiError({ status, retryAfter });

    if (body.isSuccess === false) return ApiError.fromEnvelope(body, status);

    const fieldErrors = {};
    if (body.errors && !Array.isArray(body.errors)) {
      Object.entries(body.errors).forEach(([code, messages]) => {
        fieldErrors[fieldFromCode(code)] = Array.isArray(messages) ? messages : [String(messages)];
      });
    }
    const firstFieldMessage = Object.values(fieldErrors)[0]?.[0];
    // 500 traz um detail genérico do back; a mensagem padrão do front é mais útil.
    const detail = status >= 500 ? '' : body.detail;

    return new ApiError({
      status,
      code: body.code ?? '',
      // Algumas respostas fogem do ProblemDetails: o 429 do back vem como { code, message }.
      message: detail || firstFieldMessage || (status >= 500 ? '' : body.title || body.message),
      fieldErrors,
      traceId: body.traceId ?? '',
      retryAfter,
    });
  }

  // Envelope Result<T> com isSuccess: false.
  static fromEnvelope(body, status = 400) {
    const messages = body.listMessageErrors?.length ? body.listMessageErrors : (body.errors ?? []);
    const first = messages[0];
    const text = typeof first === 'string' ? first : first?.message ?? first?.description;
    return new ApiError({ status, code: first?.code ?? '', message: text });
  }
}

export const timeoutError = () => new ApiError({ status: 0, kind: 'timeout', code: 'Timeout' });
export const networkError = () => new ApiError({ status: 0, kind: 'network', code: 'Network' });

// Mensagem de um campo do formulário: validação do back (fieldErrors) ou conflito
// de unicidade pelo `code` (ex.: { 'Product.DuplicateSlug': 'slug' }).
export const fieldMessage = (error, field, conflicts = {}) => {
  if (!error) return '';
  const key = Object.keys(error.fieldErrors ?? {}).find((k) => k.toLowerCase() === field.toLowerCase());
  if (key) return error.fieldErrors[key][0];
  return conflicts[error.code] === field ? error.message : '';
};
