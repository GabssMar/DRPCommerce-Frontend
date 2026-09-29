# [Admin · API] Camada de dados do painel: `admin-api` com adaptador mock no formato exato do back-end

**Depende de:** task 15 (camada HTTP) · **Bloqueia as tasks 23–26** · **Não depende do back-end ficar pronto**

## Tecnologias

| Camada | Stack |
|---|---|
| HTTP | `fetch` nativo via `src/services/http.js` (task 15) — sem axios |
| Configuração | `VITE_API_MODE` (`mock` \| `http`), `VITE_API_BASE_URL`, `VITE_ENTERPRISE_ID` |
| Back-end alvo | endpoints da task 19, contrato em `CONTRATO-API.md` §4.7 |

## Funcionalidade

Esta é a task que cumpre a regra do painel: **as telas não chamam o back-end agora, mas ficam prontas para chamar.** Cada função do painel nasce com o endpoint real, o método, o corpo e o formato de resposta corretos; enquanto o back-end não existe, um adaptador mock devolve **exatamente** o mesmo formato. A virada é trocar `VITE_API_MODE=mock` por `http` — **sem tocar em nenhum componente**.

## Estado atual

A task 15 cria `src/services/` com `http.js`, `api-error.js`, `status.js`, `drop-api.js`, `mock/drop-api.js` e `index.js`. Ela cobre só o storefront. O painel não tem nada.

Do lado do back-end, o levantamento da task 19 encontrou: o `StoreCommerce.Api` **não tem controllers**, `Product` **não tem campo de estoque** e **não existe endpoint de agregação de vendas**. Ou seja: o painel seria impossível de integrar hoje — e é justamente por isso que o mock tem de falar o formato final, e não um formato de conveniência.

## Como implementar

### 1. Estrutura

```
src/services/admin/
├── admin-api.js        funções reais, chamando http.js
├── mock/
│   ├── admin-api.js    mesmas assinaturas, mesmos formatos, dados falsos
│   └── seed.js         catálogo, pedidos e vendas de exemplo (determinístico)
├── endpoints.js        o mapa único endpoint -> { method, path, query, body }
└── index.js            exporta um ou outro conforme VITE_API_MODE
```

As telas importam **só** de `src/services/admin/index.js`.

### 2. `endpoints.js` — a peça que torna a virada possível

O endpoint é declarado **uma vez**, e os dois adaptadores leem daqui. O mock não "finge um endpoint": ele conhece o endpoint real e registra no log a requisição que **seria** enviada.

```js
// src/services/admin/endpoints.js
export const ENDPOINTS = {
  salesSummaryDrop:  { method: 'GET',  path: '/drop-orders/sales-summary' },
  salesSummaryStore: { method: 'GET',  path: '/api/store/orders/sales-summary', absolute: true },
  listDropEvents:    { method: 'GET',  path: '/drop-events/get-all' },
  getDropEvent:      { method: 'GET',  path: (id) => `/drop-events/get-by-id/${id}` },
  createDropEvent:   { method: 'POST', path: '/drop-events/add' },
  updateDropEvent:   { method: 'PUT',  path: '/drop-events/update' },
  listDropProducts:  { method: 'GET',  path: (eventId) => `/drop-products/get-by-event/${eventId}` },
  listStoreProducts: { method: 'GET',  path: '/api/store/products/get-paged', absolute: true },
  updateStoreProduct:{ method: 'PUT',  path: '/api/store/products/update',    absolute: true },
  adjustStock:       { method: 'POST', path: '/api/store/products/adjust-stock', absolute: true },
  listDropOrders:    { method: 'GET',  path: '/drop-orders/get-paged' },
  listStoreOrders:   { method: 'GET',  path: '/api/store/orders/get-paged',  absolute: true },
  updateDropOrder:   { method: 'PUT',  path: '/drop-orders/update' },
};
```

`absolute: true` marca o que vai ao **StoreCommerce** pelo Gateway (`/api/store/...`), fora da `VITE_API_BASE_URL` do Drop (`/api/drop`).

### 3. Funções do painel

Uma por linha de `CONTRATO-API.md` §4.7. Todas devolvem o `content` já desembrulhado ou lançam `ApiError`:

| Função | Endpoint | Tela |
|---|---|---|
| `getSalesSummary({ from, to, granularity, source })` | `sales-summary` dos dois lados | 23 |
| `listDropEventsAdmin({ page, pageSize, statusId, search })` | `drop-events/get-all` | 24 |
| `getDropEventAdmin(id)` | `drop-events/get-by-id/{id}` | 24 |
| `createDropEvent(payload)` / `updateDropEvent(payload)` | `drop-events/add` / `update` | 24 |
| `setDropEventStatus(id, dropEventStatusId)` | `drop-events/update` (objeto inteiro) | 24 |
| `listDropProducts(eventId)` / `upsertDropProduct(payload)` | `drop-products/*` | 24 |
| `listStoreProducts({ page, pageSize, categoryId, search })` | `store/products/get-paged` | 25 |
| `updateStoreProduct(payload)` | `store/products/update` | 25 |
| `adjustStock({ productId, delta, reason })` | `store/products/adjust-stock` | 25 |
| `listOrders({ source, page, pageSize, statusId, from, to, search })` | `*/get-paged` | 26 |
| `getOrder(source, id)` | `*/get-by-id/{id}` | 26 |
| `setOrderStatus(source, order, statusId)` | `*/update` | 26 |

### 4. Três armadilhas do back-end que o mock **tem** que reproduzir

Levantadas lendo as entidades; se o mock suavizar qualquer uma, a virada quebra:

1. **`add` e `update` devolvem uma lista**, mesmo para um item só — o `BaseController` embrulha em `add-range`. `content[0]` é o objeto.
2. **Os nomes dos campos são os do domínio, não os do simulador atual.** `DropOrder` tem `dropReservationId`, `dropCouponId`, `dropOrderStatusId`, `dropOrderPaymentStatusId` — **não** `reservationId`, `couponId`, `statusId`, `paymentStatusId`. `DropEvent` tem `dropEventStatusId`. Use os ids da §3 do contrato (`status.js` da task 15).
3. **`update` exige o objeto inteiro.** Não há `PATCH`: mudar a fase de um drop é ler o evento, trocar `dropEventStatusId` e reenviar todos os campos. `setDropEventStatus` encapsula isso — as telas nunca montam esse corpo à mão.

E uma quarta, de data: **`createdAt` vem em UTC**. O agrupamento por dia é feito no servidor em `America/Sao_Paulo` (task 19 §3). O mock **repete essa conversão**, senão o número do "hoje" diverge na virada.

### 5. `mock/admin-api.js`

- Dados em `seed.js`: ~8 produtos de vitrine (os mesmos do `storeCatalog` atual), 3 drops, ~120 pedidos espalhados nos últimos 90 dias. **Determinístico** — gerador com semente fixa, para o dashboard não mudar a cada F5.
- Os pedidos derivam dos produtos, e os totais do resumo derivam dos pedidos: `getSalesSummary` **agrega o seed**, não devolve números soltos. Se a tela somar a coluna e der diferente do KPI, é bug — e a task 23 tem isso como critério.
- Reproduz o formato de erro: `ApiError` com os `code` da task 19 (`Stock.Insufficient`, `Report.RangeTooLong`), não `throw new Error('...')`.
- Respeita `networkLatency` do simulador e registra **a requisição real que seria enviada** via `api-log.js`.

### 6. Log de requisições do painel

`AdminRequestLog.vue` — bloco somente leitura, ao pé do painel, com as últimas 30 chamadas (método, caminho, status, corpo). Em modo mock, cada linha mostra o endpoint real com um selo "simulado". **É essa tela que prova a prontidão da virada:** o que aparece nela é literalmente o que o front vai disparar em `http`.

### 7. Polling

Nada de polling no painel. Dado de gestão atualiza por ação do usuário e por um botão "Atualizar" com `aria-live` no resultado. O `usePolling` da task 15 fica reservado ao storefront.

## Critérios de aceite

- [ ] Nenhum componente do painel importa `fetch`, URL ou `ENDPOINTS` — tudo passa por `src/services/admin/index.js`
- [ ] `admin-api.js` e `mock/admin-api.js` têm **as mesmas assinaturas** e devolvem **os mesmos nomes de campo e ids de status**
- [ ] Toda função lê o endpoint de `endpoints.js`; nenhuma URL escrita direto na função
- [ ] O mock reproduz as quatro armadilhas: lista em `add`/`update`, nomes de campo do domínio, `update` com objeto inteiro, `createdAt` em UTC agrupado em `America/Sao_Paulo`
- [ ] Erros são `ApiError` com os `code` da task 19
- [ ] Seed determinístico: dois F5 seguidos dão os mesmos números
- [ ] `getSalesSummary` é consistente com `listOrders`: somar os pedidos do período bate com o KPI
- [ ] `AdminRequestLog` mostra método + caminho reais em modo mock
- [ ] Testes: agregação por dia e por mês, virada de fuso (venda às 22h de 30/09 cai em 30/09), intervalo vazio, `adjustStock` com saldo insuficiente, desembrulho de `content[0]`
- [ ] `VITE_API_MODE=http` com a task 19 pronta: o painel carrega dados reais **sem alterar componente**
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn "fetch(" src/components/admin/                  # vazio
grep -rn "/api/" src/components/admin/                   # vazio
grep -rn "statusId" src/components/admin/ | grep -v "EventStatusId\|OrderStatusId\|PaymentStatusId"   # vazio
npm test -- admin                                        # agregação, fuso, erros
VITE_API_MODE=mock npm run dev                           # painel com o seed
VITE_API_MODE=http npm run dev                           # com back-end da task 19
```

## Referências

- `CONTRATO-API.md` §2 (envelope e ProblemDetails), §3 (ids), §4.7 (painel)
- `15-front-camada-http.md`: `http.js`, `ApiError`, `status.js`, `api-log.js` — reutilize, não duplique
- `19-api-admin-endpoints.md`: formato de `sales-summary`, `get-paged` e `adjust-stock`

## Para o Claude Code

```
Leia CONTRATO-API.md §2, §3 e §4.7, a task 15 e a task 19. Crie src/services/admin/ com
endpoints.js (mapa único dos endpoints reais), admin-api.js (usando http.js da task 15),
mock/admin-api.js + mock/seed.js (determinístico, ~120 pedidos em 90 dias) e index.js
escolhendo por VITE_API_MODE. As duas implementações têm assinaturas e formatos idênticos,
com os nomes de campo do domínio do back-end (dropOrderStatusId, dropReservationId,
dropEventStatusId), add/update devolvendo lista, update exigindo o objeto inteiro e
createdAt em UTC agrupado em America/Sao_Paulo. Erros como ApiError com os code da task 19.
Crie AdminRequestLog.vue mostrando as requisições reais que seriam enviadas. Escreva os
testes de agregação e de fuso. Não crie tela de gestão aqui — são as tasks 23-26.
```
