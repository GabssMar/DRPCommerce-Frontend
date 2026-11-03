import { localDayKey } from './format';
import { ORDER_STATUS_EXCLUDED } from './status';

// Agregação de vendas feita no front a partir de get-all (o back ainda não tem
// sales-summary, task 19). Mesmas regras do resumo planejado:
//   - eixo de tempo = createdAt convertido para America/Sao_Paulo antes de agrupar;
//   - cancelado (6) e reembolsado (7) ficam fora do faturamento;
//   - dia sem venda existe com zero (o gráfico não tem buraco).

const DAY_MS = 864e5;

// Normaliza pedidos dos dois lados para o mesmo formato.
export const normalizeOrders = ({ dropOrders = [], storeOrders = [] }) => [
  ...dropOrders.map((o) => ({
    source: 'drop', id: o.id, customerId: o.customerId, createdAt: o.createdAt, totalAmount: o.totalAmount,
    statusId: o.dropOrderStatusId, paymentStatusId: o.dropOrderPaymentStatusId, eventId: o.dropEventId, raw: o,
  })),
  ...storeOrders.map((o) => ({
    source: 'store', id: o.id, customerId: o.customerId, createdAt: o.createdAt, totalAmount: o.totalAmount,
    statusId: o.orderStatusId, paymentStatusId: o.orderPaymentStatusId, eventId: null, raw: o,
  })),
];

// Dias locais (YYYY-MM-DD) do intervalo, do mais antigo ao mais novo.
export const dayRange = (days, now = Date.now()) =>
  Array.from({ length: days }, (_, i) => localDayKey(now - (days - 1 - i) * DAY_MS));

export const isCounted = (order) => !ORDER_STATUS_EXCLUDED.includes(order.statusId);

/**
 * @param {ReturnType<typeof normalizeOrders>} orders
 * @param {{ days: number, source?: 'all'|'drop'|'store', items?: { drop: object[], store: object[] }, now?: number }} options
 */
export function summarizeSales(orders, { days, source = 'all', items = { drop: [], store: [] }, now = Date.now() }) {
  const keys = dayRange(days, now);
  const inRange = new Set(keys);
  const scoped = orders.filter((o) => (source === 'all' || o.source === source) && inRange.has(localDayKey(o.createdAt)));
  const counted = scoped.filter(isCounted);

  const buckets = keys.map((date) => ({ date, drop: 0, store: 0, orderCount: 0 }));
  const bucketByDate = new Map(buckets.map((b) => [b.date, b]));
  counted.forEach((o) => {
    const bucket = bucketByDate.get(localDayKey(o.createdAt));
    bucket[o.source] += o.totalAmount;
    bucket.orderCount += 1;
  });

  const countedIds = { drop: new Set(), store: new Set() };
  counted.forEach((o) => countedIds[o.source].add(o.id));
  const countedItems = [
    ...items.drop.filter((i) => countedIds.drop.has(i.dropOrderId)).map((i) => ({ ...i, source: 'drop' })),
    ...items.store.filter((i) => countedIds.store.has(i.orderId)).map((i) => ({ ...i, source: 'store' })),
  ];

  const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
  const bySource = (src) => counted.filter((o) => o.source === src);
  const unitsBySource = (src) => sum(countedItems.filter((i) => i.source === src), (i) => i.quantity);
  const revenue = sum(counted, (o) => o.totalAmount);

  const byPayment = [1, 2, 5].map((paymentStatusId) => {
    const list = counted.filter((o) => o.paymentStatusId === paymentStatusId);
    return { paymentStatusId, orderCount: list.length, revenue: sum(list, (o) => o.totalAmount) };
  });

  const byStatus = [1, 2, 3, 4, 5, 6, 7].map((statusId) => ({
    statusId,
    orderCount: scoped.filter((o) => o.statusId === statusId).length,
  }));

  // Mais vendidos: agrupa por produto (drop: variante do evento; vitrine: produto/serviço).
  const top = new Map();
  countedItems.forEach((i) => {
    const key = i.source === 'drop' ? `drop:${i.itemName.split(' · ')[0]}` : `store:${i.productId ?? `s${i.serviceId}`}`;
    const current = top.get(key) ?? { key, source: i.source, name: i.source === 'drop' ? i.itemName.split(' · ')[0] : i.itemName, unitCount: 0, revenue: 0 };
    current.unitCount += i.quantity;
    current.revenue += i.totalPrice;
    top.set(key, current);
  });

  return {
    days,
    from: keys[0],
    to: keys[keys.length - 1],
    revenue,
    orderCount: counted.length,
    unitCount: countedItems.reduce((s, i) => s + i.quantity, 0),
    averageTicket: counted.length ? revenue / counted.length : 0,
    drop: { orderCount: bySource('drop').length, revenue: sum(bySource('drop'), (o) => o.totalAmount), unitCount: unitsBySource('drop') },
    store: { orderCount: bySource('store').length, revenue: sum(bySource('store'), (o) => o.totalAmount), unitCount: unitsBySource('store') },
    buckets,
    byPayment,
    byStatus,
    topProducts: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
}
