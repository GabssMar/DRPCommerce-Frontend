// Erro único da camada de dados. As telas leem `message` (texto para o usuário),
// `status`, `code` (regra de negócio) e `fieldErrors` (validação por campo).

const STATUS_MESSAGES = {
  0: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',
  401: 'Sua sessão expirou. Entre de novo para continuar.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Não encontramos o que você procurava.',
  409: 'Não foi possível concluir: os dados mudaram enquanto você editava.',
  503: 'Serviço indisponível no momento. Tente de novo em instantes.',
};

// "CreateDropEventCommand.commands[0].name" -> "name"
const fieldFromCode = (code) => code.split('.').pop().replace(/\[\d+\]/g, '');

export class ApiError extends Error {
  constructor({ status = 0, code = '', message = '', fieldErrors = {}, traceId = '' } = {}) {
    super(message || STATUS_MESSAGES[status] || 'Algo deu errado. Tente de novo.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.traceId = traceId;
  }

  // ProblemDetails / ValidationProblemDetails (application/problem+json).
  static fromResponse(status, body) {
    if (!body || typeof body !== 'object') return new ApiError({ status });

    if (body.isSuccess === false) return ApiError.fromEnvelope(body, status);

    const fieldErrors = {};
    Object.entries(body.errors ?? {}).forEach(([code, messages]) => {
      fieldErrors[fieldFromCode(code)] = Array.isArray(messages) ? messages : [String(messages)];
    });
    const firstFieldMessage = Object.values(fieldErrors)[0]?.[0];

    return new ApiError({
      status,
      code: body.code ?? '',
      message: body.detail || firstFieldMessage || body.title || STATUS_MESSAGES[status],
      fieldErrors,
      traceId: body.traceId ?? '',
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
