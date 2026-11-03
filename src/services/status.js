// Tabelas de status do back-end (seed fixo do banco). O front mapeia SEMPRE pelo
// id, nunca pela descrição. `tone` é a variante do .ds-badge (badge.md):
// live = urgência · waiting = andamento · scheduled = agendado/pendente ·
// done = encerrado/neutro · success = concluído com êxito.

const table = (rows) => Object.fromEntries(rows.map(([id, label, tone = 'done']) => [id, { id, label, tone }]));

export const DROP_EVENT_STATUS = table([
  [1, 'Rascunho', 'done'],
  [2, 'Inscrições abertas', 'scheduled'],
  [3, 'Inscrições encerradas', 'scheduled'],
  [4, 'Fila aberta', 'live'],
  [5, 'Ativo', 'live'],
  [6, 'Esgotado', 'done'],
  [7, 'Encerrado', 'done'],
  [8, 'Cancelado', 'done'],
]);

export const DROP_REGISTRATION_STATUS = table([
  [1, 'Pendente', 'waiting'],
  [2, 'Elegível', 'success'],
  [3, 'Inelegível', 'done'],
  [4, 'Na lista de espera', 'scheduled'],
]);

export const WAITLIST_STATUS = table([
  [1, 'Aguardando', 'waiting'],
  [2, 'Notificado', 'live'],
  [3, 'Expirado', 'done'],
  [4, 'Atendido', 'success'],
]);

export const QUEUE_ENTRY_STATUS = table([
  [1, 'Aguardando', 'waiting'],
  [2, 'Chamado', 'live'],
  [3, 'Finalizando compra', 'live'],
  [4, 'Concluído', 'success'],
  [5, 'Expirado', 'done'],
  [6, 'Removido', 'done'],
]);

export const QUEUE_SESSION_STATUS = table([
  [1, 'Ativa', 'waiting'],
  [2, 'Expirada', 'done'],
  [3, 'Invalidada', 'done'],
]);

export const RESERVATION_STATUS = table([
  [1, 'Ativa', 'waiting'],
  [2, 'Confirmada', 'success'],
  [3, 'Expirada', 'done'],
  [4, 'Cancelada', 'done'],
]);

// Mesmos ids em DropOrderStatus e OrderStatus.
export const ORDER_STATUS = table([
  [1, 'Pendente', 'done'],
  [2, 'Confirmado', 'waiting'],
  [3, 'Em processamento', 'waiting'],
  [4, 'Enviado', 'waiting'],
  [5, 'Entregue', 'success'],
  [6, 'Cancelado', 'done'],
  [7, 'Reembolsado', 'done'],
]);
export const ORDER_STATUS_EXCLUDED = [6, 7]; // não entram no faturamento

export const PAYMENT_STATUS = table([
  [1, 'Pendente', 'scheduled'],
  [2, 'Pago', 'success'],
  [3, 'Reembolso parcial', 'done'],
  [4, 'Reembolso total', 'done'],
  [5, 'Falhou', 'live'],
]);

export const TRANSACTION_STATUS = table([
  [1, 'Pendente', 'scheduled'],
  [2, 'Autorizado', 'waiting'],
  [3, 'Capturado', 'success'],
  [4, 'Falhou', 'live'],
  [5, 'Cancelado', 'done'],
  [6, 'Reembolsado', 'done'],
]);

export const TRANSACTION_TYPE = table([
  [1, 'Pagamento'],
  [2, 'Reembolso'],
  [3, 'Reembolso parcial'],
  [4, 'Estorno'],
]);

export const TRANSACTION_METHOD = table([
  [1, 'Cartão de crédito'],
  [2, 'Pix'],
  [3, 'Boleto'],
  [4, 'Carteira'], // só no Drop
]);

export const NOTIFICATION_CHANNEL = table([
  [1, 'E-mail'],
  [2, 'SMS'],
  [3, 'Push'],
  [4, 'WhatsApp'],
]);

export const NOTIFICATION_TYPE = table([
  [1, 'Inscrição confirmada', 'waiting'],
  [2, 'Abertura da fila', 'scheduled'],
  [3, 'Chamado na fila', 'live'],
  [4, 'Reserva expirando', 'live'],
  [5, 'Pedido confirmado', 'success'],
  [6, 'Disponível na lista de espera', 'done'],
]);

export const NOTIFICATION_STATUS = table([
  [1, 'Agendado', 'scheduled'],
  [2, 'Enviado', 'waiting'],
  [3, 'Entregue', 'success'],
  [4, 'Falhou', 'live'],
  [5, 'Devolvido', 'done'],
]);

export const FRAUD_SIGNAL_TYPE = table([
  [1, 'IP duplicado'],
  [2, 'Dispositivo duplicado'],
  [3, 'Comportamento de bot'],
  [4, 'Múltiplas contas'],
  [5, 'VPN detectada'],
  [6, 'Velocidade anormal'],
]);

export const FRAUD_SEVERITY = table([
  [1, 'Baixa', 'done'],
  [2, 'Média', 'scheduled'],
  [3, 'Alta', 'live'],
  [4, 'Crítica', 'live'],
]);

export const COUPON_TYPE = table([
  [1, 'Percentual'],
  [2, 'Valor fixo'],
]);

export const DOCUMENT_TYPE = table([
  [1, 'CPF'],
  [2, 'CNPJ'],
  [3, 'RG'],
  [4, 'CNH'],
]);

export const DOCUMENT_STATUS = table([
  [1, 'Pendente', 'done'],
  [2, 'Aguardando validação', 'scheduled'],
  [3, 'Validado', 'success'],
  [4, 'Rejeitado', 'live'],
  [5, 'Expirado', 'done'],
]);

export const INVOICE_TYPE = table([
  [1, 'NF-e'],
  [2, 'NFC-e'],
  [3, 'NFS-e'],
  [4, 'NF'],
]);

export const INVOICE_STATUS = table([
  [1, 'Pendente', 'scheduled'],
  [2, 'Autorizada', 'waiting'],
  [3, 'Emitida', 'success'],
  [4, 'Cancelada', 'done'],
]);

export const SHIPMENT_TYPE = table([
  [1, 'Normal'],
  [2, 'Expresso'],
  [3, 'Econômico'],
  [4, 'Retirada no local'],
]);

export const SHIPMENT_STATUS = table([
  [1, 'Pendente', 'scheduled'],
  [2, 'Em processamento', 'waiting'],
  [3, 'Enviado', 'waiting'],
  [4, 'Em trânsito', 'waiting'],
  [5, 'Entregue', 'success'],
  [6, 'Cancelado', 'done'],
  [7, 'Devolvido', 'done'],
]);

export const MEMBERSHIP_KIND = table([
  [1, 'Dono principal'],
  [2, 'Sócio-proprietário'],
  [3, 'Funcionário'],
]);

// UF: o id é o da tabela State do back-end (ordem alfabética pelo nome).
export const STATES = [
  [1, 'AC', 'Acre'], [2, 'AL', 'Alagoas'], [3, 'AP', 'Amapá'], [4, 'AM', 'Amazonas'],
  [5, 'BA', 'Bahia'], [6, 'CE', 'Ceará'], [7, 'DF', 'Distrito Federal'], [8, 'ES', 'Espírito Santo'],
  [9, 'GO', 'Goiás'], [10, 'MA', 'Maranhão'], [11, 'MT', 'Mato Grosso'], [12, 'MS', 'Mato Grosso do Sul'],
  [13, 'MG', 'Minas Gerais'], [14, 'PA', 'Pará'], [15, 'PB', 'Paraíba'], [16, 'PR', 'Paraná'],
  [17, 'PE', 'Pernambuco'], [18, 'PI', 'Piauí'], [19, 'RJ', 'Rio de Janeiro'], [20, 'RN', 'Rio Grande do Norte'],
  [21, 'RS', 'Rio Grande do Sul'], [22, 'RO', 'Rondônia'], [23, 'RR', 'Roraima'], [24, 'SC', 'Santa Catarina'],
  [25, 'SP', 'São Paulo'], [26, 'SE', 'Sergipe'], [27, 'TO', 'Tocantins'],
].map(([id, uf, name]) => ({ id, uf, name }));

export const stateById = (id) => STATES.find((s) => s.id === Number(id)) ?? null;
export const ufOf = (id) => stateById(id)?.uf ?? '';

// Status desconhecido (id novo no banco) não quebra a tela.
export const statusOf = (tableRef, id) => tableRef[id] ?? { id, label: `#${id}`, tone: 'done' };
export const labelOf = (tableRef, id) => statusOf(tableRef, id).label;
export const options = (tableRef) => Object.values(tableRef);
