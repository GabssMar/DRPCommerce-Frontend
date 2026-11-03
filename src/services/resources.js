import { DROP_BASE, STORE_BASE } from './config';
import { request } from './http';

// CRUD genérico dos BaseControllers do Drop e do Store:
//   POST add | add-range · PUT update | update-range · DELETE delete/{id} | delete-range
//   GET get-all | get-by-id/{id} · POST get-list-by-list-id
//
// Três armadilhas do back-end tratadas AQUI, para nenhuma tela lidar com elas:
//   1. add/update devolvem LISTA mesmo para um item: add() e update() devolvem content[0].
//   2. A entidade volta com nomes de domínio (dropEventStatusId), mas o comando recebe
//      nomes genéricos (statusId). RENAMES traduz entidade -> comando.
//   3. update exige o objeto INTEIRO (não há PATCH): use patch(entity, changes).

// entidade -> comando, por recurso. Só os campos que mudam de nome.
export const RENAMES = {
  'drop/drop-events': { dropEventStatusId: 'statusId' },
  'drop/drop-products': {},
  'drop/drop-coupons': { dropCouponTypeId: 'typeId' },
  'drop/drop-orders': {
    dropReservationId: 'reservationId',
    dropCouponId: 'couponId',
    dropOrderStatusId: 'statusId',
    dropOrderPaymentStatusId: 'paymentStatusId',
  },
  'drop/drop-order-items': {},
  'drop/drop-registrations': { dropRegistrationStatusId: 'statusId' },
  'drop/drop-reservations': { dropReservationStatusId: 'statusId' },
  'drop/drop-transactions': {
    dropTransactionTypeId: 'typeId',
    dropTransactionMethodId: 'methodId',
    dropTransactionStatusId: 'statusId',
  },
  'drop/drop-notifications': {
    dropNotificationChannelId: 'channelId',
    dropNotificationTypeId: 'typeId',
    dropNotificationStatusId: 'statusId',
  },
  'drop/drop-audit-logs': {},
  'drop/fraud-signals': { fraudSignalTypeId: 'signalTypeId', fraudSeverityId: 'severityId' },
  'drop/queue-entries': { queueEntryStatusId: 'statusId' },
  'drop/queue-sessions': { queueSessionStatusId: 'statusId' },
  'drop/waitlist-entries': { waitlistEntryStatusId: 'statusId' },
  'store/products': {},
  'store/categories': {},
  'store/coupons': { couponTypeId: 'typeId' },
  'store/customers': {},
  'store/documents': { documentTypeId: 'typeId', documentStatusId: 'statusId' },
  'store/orders': { orderStatusId: 'statusId', orderPaymentStatusId: 'paymentStatusId' },
  'store/order-items': {},
  'store/shipments': { shipmentTypeId: 'typeId', shipmentStatusId: 'statusId' },
  'store/invoices': { invoiceTypeId: 'typeId', invoiceStatusId: 'statusId' },
  'store/transactions': {
    transactionTypeId: 'typeId',
    transactionMethodId: 'methodId',
    transactionStatusId: 'statusId',
  },
  'store/suppliers': {},
  'store/services': {},
  'store/employees': {},
  'store/employee-positions': {},
  'store/departments': {},
};

// O comando de criação do log de auditoria tem o nome com erro de digitação no back
// (CreateDropAuditLogCommand.ocurredAt); o de atualização usa occurredAt.
const CREATE_ONLY_RENAMES = {
  'drop/drop-audit-logs': { occurredAt: 'ocurredAt' },
};

const SKIP = new Set(['createdAt', 'updatedAt', 'isDeleted', 'deletedAt']);

// Entidade como veio da API -> corpo do comando. Navegações (listas e objetos de
// status) ficam de fora; value objects { value } passam como estão.
export const toCommand = (key, entity, { create = false } = {}) => {
  const renames = { ...RENAMES[key], ...(create ? CREATE_ONLY_RENAMES[key] : {}) };
  const command = {};
  Object.entries(entity).forEach(([field, value]) => {
    if (SKIP.has(field)) return;
    if (create && field === 'id') return;
    if (Array.isArray(value)) return;
    if (value && typeof value === 'object' && !('value' in value)) return;
    command[renames[field] ?? field] = value;
  });
  return command;
};

// Comando -> entidade (usado pelo mock para gravar no formato que a API devolve).
export const toEntity = (key, command) => {
  const inverse = Object.fromEntries(
    Object.entries({ ...RENAMES[key], ...CREATE_ONLY_RENAMES[key] }).map(([entityField, commandField]) => [commandField, entityField]),
  );
  return Object.fromEntries(Object.entries(command).map(([field, value]) => [inverse[field] ?? field, value]));
};

export const urlFor = (key) => {
  const [service, resource] = key.split('/');
  return `${service === 'drop' ? DROP_BASE : STORE_BASE}/${resource}`;
};

export function crud(key, { realm = 'backoffice' } = {}) {
  const base = urlFor(key);
  const opts = (body) => ({ realm, body });

  const api = {
    key,
    getAll: () => request('GET', `${base}/get-all`, opts()),
    getById: (id) => request('GET', `${base}/get-by-id/${id}`, opts()),
    getByIds: (ids) => {
      const unique = [...new Set(ids.filter((id) => id != null))];
      return unique.length ? request('POST', `${base}/get-list-by-list-id`, opts(unique)) : Promise.resolve([]);
    },
    add: async (entity) => (await request('POST', `${base}/add`, opts(toCommand(key, entity, { create: true }))))?.[0],
    addRange: (entities) =>
      request('POST', `${base}/add-range`, opts({ commands: entities.map((e) => toCommand(key, e, { create: true })) })),
    update: async (entity) => (await request('PUT', `${base}/update`, opts(toCommand(key, entity))))?.[0],
    updateRange: (entities) =>
      request('PUT', `${base}/update-range`, opts({ commands: entities.map((e) => toCommand(key, e)) })),
    remove: (id) => request('DELETE', `${base}/delete/${id}`, opts()),
    removeRange: (ids) => request('DELETE', `${base}/delete-range`, opts(ids)),
    // Lê o objeto inteiro já carregado, aplica as mudanças e reenvia (não há PATCH).
    patch: (entity, changes) => api.update({ ...entity, ...changes }),
    patchRange: (entities, changes) => api.updateRange(entities.map((e) => ({ ...e, ...changes }))),
  };
  return api;
}
