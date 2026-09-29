# Contrato de API: front-end (Vue) ↔ back-end (DropCommerce.Api)

Fonte da verdade para **qual informação da tela vem de qual endpoint**. Vale para front e back: mudou um campo ou rota, atualize este arquivo na mesma PR.

Levantado no código em 2026-09-28 (`backend/DROP-Ecommerce`, `frontend/src/services/api.js`). Legenda da coluna **Situação**:

- ✅ **existe**: endpoint já implementado no back-end
- 🆕 **task N**: endpoint a criar, especificado nesta página e na task indicada

## 1. Topologia

| Serviço | Porta | Papel |
|---|---|---|
| Front-end (Vite) | 5173 | SPA Vue. Em dev, faz proxy de `/api` para o Gateway |
| `Commerce.Gateway` (YARP) | 5000 | Ponto de entrada único. `/api/drop/**` → Drop API, `/api/store/**` → Store API |
| `DropCommerce.Api` | 5002 | Toda a API consumida pelo front |
| `StoreCommerce.Api` | 5001 | Catálogo canônico. Consumido **só pelo back-end do Drop** (Refit), nunca pelo front |

O front chama **sempre o Gateway**. URL base: `VITE_API_BASE_URL`, padrão `/api/drop`.

```
front  GET /api/drop/drop-events/get-public
  ↓ Vite proxy (dev) → http://localhost:5000
gateway  /api/drop/{**}  →  /api/{**}      (depois da correção da task 10)
  ↓
drop-api GET /api/drop-events/get-public
```

> **Hoje o Gateway remove `/api/drop` e encaminha `/drop-events/...`**, mas os controllers estão em `/api/drop-events/...`. Toda chamada pelo Gateway dá 404. Correção na task 10.

## 2. Formato das respostas

### Sucesso: HTTP 200 com envelope `Result<T>`

```json
{
  "isSuccess": true,
  "isFailure": false,
  "content": { },
  "errors": [],
  "listMessageErrors": []
}
```

- JSON em **camelCase**; datas em ISO 8601 **UTC**; valores monetários como `number` (decimal).
- Os endpoints CRUD `add` / `update` **devolvem uma lista** em `content`, mesmo para um item só (o controller embrulha em `add-range`). Os endpoints de caso de uso (🆕) devolvem objeto único.
- Entidades vêm com as navegações vazias (`listDropProduct: []`, `dropEventStatus: null`). O front ignora esses campos e lê os `*Id`.

### Erro: `application/problem+json` (**não** é o envelope)

```json
{
  "type": "https://httpstatuses.com/409",
  "title": "Conflito",
  "status": 409,
  "detail": "Você já está na fila deste drop.",
  "code": "Queue.AlreadyJoined",
  "traceId": "0HN…"
}
```

Validação (400) usa `ValidationProblemDetails`, com `errors` agrupados pelo **código** do erro. O código tem o formato `<Command>.<Propriedade>`:

```json
{
  "status": 400,
  "title": "Erro de validação",
  "code": "CheckoutDropOrderCommand.shippingZipCode",
  "errors": {
    "CheckoutDropOrderCommand.shippingZipCode": ["CEP inválido."]
  }
}
```

**Regra do front:** o campo do formulário é o trecho depois do último `.` do código (`shippingZipCode`), sem o `[]` de listas.

| Status | `ErrorType` do back | O que o front faz |
|---|---|---|
| 400 | `Validation` / `Failure` | erro por campo (validação) ou mensagem do `detail` |
| 401 / 403 | `Unauthorized` / `Forbidden` | mensagem de sessão; sem retry automático |
| 404 | `NotFound` | estado "não encontrado" da tela |
| 409 | `Conflict` | regra de negócio (já na fila, esgotado, janela expirada): mensagem própria pelo `code` |
| 503 | `Unavailable` | "Serviço indisponível", retry com backoff |
| 500 | exceção não tratada | mensagem genérica + `traceId` no log |
| rede / timeout | — | "Reconectando…", mantém o último dado na tela |

## 3. Tabelas de status (ids fixos, seed do banco)

O front mapeia **pelo id**, nunca pela descrição.

| `dropEventStatusId` | Descrição | Badge no front (DS) |
|---|---|---|
| 1 | Rascunho | não aparece no portal |
| 2 | Inscrições abertas | `--scheduled` |
| 3 | Inscrições encerradas | `--scheduled` |
| 4 | Fila aberta | `--live` |
| 5 | Ativo | `--live` |
| 6 | Esgotado | `--done` "Esgotado" |
| 7 | Encerrado | `--done` "Encerrado" |
| 8 | Cancelado | não aparece no portal |

| `queueEntryStatusId` | Descrição | Estado da tela de fila |
|---|---|---|
| 1 | Aguardando | "Na fila, aguardando" |
| 2 | Chamado | "É a sua vez" (abre o checkout) |
| 3 | Finalizando compra | checkout em andamento (reserva ativa) |
| 4 | Concluído | "Pedido confirmado" |
| 5 | Expirado | janela perdida: explica e oferece voltar |
| 6 | Removido | saiu da fila |

| `dropReservationStatusId` | 1 Ativa · 2 Confirmada · 3 Expirada · 4 Cancelada |
|---|---|
| `dropOrderStatusId` | 1 Pendente · 2 Confirmado · 3 Em processamento · 4 Enviado · 5 Entregue · 6 Cancelado · 7 Reembolsado |
| `dropOrderPaymentStatusId` | 1 Pendente · 2 Pago · 3 Reembolso parcial · 4 Reembolso total · 5 Falhou |
| `dropCouponTypeId` | 1 Percentual · 2 Valor fixo |

> **Divergência com o mock atual:** o `api.js` usa `statusId` 3 como "expirado". No back, 3 é "Finalizando compra" e 5 é "Expirado". O campo também muda de nome: `statusId` → `queueEntryStatusId` / `dropEventStatusId`.

## 4. Mapa tela → informação → endpoint

### Cabeçalhos enviados em toda requisição

| Cabeçalho | Valor | Situação |
|---|---|---|
| `X-Enterprise-Id` | `VITE_ENTERPRISE_ID`: loja dona dos drops | 🆕 task 10 (hoje o tenant vem só de JWT, que não existe) |
| `X-Customer-Id` | id do cliente (provisório, até existir autenticação) | 🆕 task 10 |

### Portal de drops (`EventPortal.vue`)

| Informação na tela | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Lista de drops visíveis | `GET /drop-events/get-public` | `content[]` | 🆕 task 11 |
| Nome, descrição | idem | `name`, `description` | 🆕 task 11 |
| Imagem do card | idem | `coverImageUrl` | 🆕 task 11 |
| Preço | idem | `price` | 🆕 task 11 |
| Badge de status | idem | `dropEventStatusId` (tabela §3) + datas | 🆕 task 11 |
| "Abre em HH:MM" | idem | `queueOpensAt` | 🆕 task 11 |
| Esgotado? | idem | `dropEventStatusId == 6` ou estoque (abaixo) | 🆕 task 11 |

`GET /drop-events/get-all` ✅ existe, mas devolve rascunhos e cancelados e fica vazio sem tenant: é para o painel administrativo, não para o portal.

### Detalhe do drop (`App.vue`, `ProductDetails.vue`, `Countdown.vue`)

| Informação na tela | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Dados do evento | `GET /drop-events/get-by-id/{id}` | `content` | ✅ existe (depende do tenant: task 10) |
| Link amigável (opcional) | `GET /drop-events/get-by-slug/{slug}` | `content` | 🆕 task 11 |
| Imagem principal | `get-by-id` | `bannerImageUrl` (fallback `coverImageUrl`) | ✅ |
| Nome, descrição, preço | `get-by-id` | `name`, `description`, `price` | ✅ |
| Countdown: abertura da fila | `get-by-id` | `queueOpensAt` | ✅ |
| Countdown: início / fim do drop | `get-by-id` | `dropStartsAt`, `dropEndsAt` | ✅ |
| Fase do drop | `get-by-id` | `dropEventStatusId` (o worker da task 13 mantém atualizado) | ✅ |
| Hora do servidor (para o countdown não depender do relógio do usuário) | qualquer resposta | cabeçalho `Date` | 🆕 task 10 (expor no CORS) |

### Estoque (`StockProgress.vue`), polling de 4s

| Informação na tela | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Produto(s) do drop | `GET /drop-products/get-by-event/{dropEventId}` | `content[]` | 🆕 task 11 |
| Total alocado | idem | `unitsAllocated` | 🆕 task 11 |
| Vendidos | idem | `unitsSold` | 🆕 task 11 |
| Limite por cliente | idem | `maxPerCustomer` | 🆕 task 11 |
| Disponível (número absoluto) | calculado no front | `unitsAllocated − unitsSold` | — |
| Id do produto para reservar | idem | `id` (é o `dropProductId`) | 🆕 task 11 |

> **Decisão pendente do back-end:** `DropEvent` também tem `totalUnitsAvailable`, `unitsReserved` e `unitsSold`. Definir na task 11 qual é a fonte oficial do estoque exibido. Proposta: `DropProduct`, que é o nível onde a venda acontece, com o evento como agregado.

### Fila (`QueueStatus.vue`), polling de 3s

| Ação / informação | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Entrar na fila | `POST /queue-entries/join` | body `{ dropEventId, deviceFingerprint }` → `content` (entrada) | 🆕 task 12 |
| Restaurar ao recarregar a página | `GET /queue-entries/get-my-entry/{dropEventId}` | `content` ou 404 | 🆕 task 12 |
| Posição atual | `GET /queue-entries/status/{id}` | `position` | 🆕 task 12 |
| "de N na fila" | idem | `totalWaiting` | 🆕 task 12 |
| Estado (badge + CTA) | idem | `queueEntryStatusId` (tabela §3) | 🆕 task 12 |
| Quando foi chamado | idem | `calledAt` | 🆕 task 12 |
| Prazo para finalizar a compra | idem | `checkoutDeadline` | 🆕 task 12 |
| Hora do servidor | idem | `serverNow` | 🆕 task 12 |
| Sair da fila | `POST /queue-entries/leave/{id}` | `content` | 🆕 task 12 |

`POST /queue-entries/add` ✅ existe, mas exige que o **cliente** mande `position`, `sessionToken`, `statusId`, IP e datas: é CRUD administrativo e **não deve** ser usado pelo front.

### Checkout (`CheckoutModal.vue`)

| Ação / informação | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Reservar a unidade ao abrir o checkout | `POST /drop-reservations/reserve` | body `{ queueEntryId, dropProductId, quantity }` → `content` | 🆕 task 14 |
| Prazo da reserva (countdown do modal) | idem | `expiresAt` | 🆕 task 14 |
| Subtotal | idem | `totalAmount` | 🆕 task 14 |
| Validar cupom | `GET /drop-coupons/validate?dropEventId={id}&code={code}` | `content.discountAmount`, `content.dropCouponTypeId` | 🆕 task 14 |
| Finalizar pedido | `POST /drop-orders/checkout` | body abaixo → `content` (pedido) | 🆕 task 14 |
| Número do pedido | idem | `id` | 🆕 task 14 |
| Totais exibidos na confirmação | idem | `subTotal`, `discountAmount`, `shippingCost`, `taxAmount`, `totalAmount` | 🆕 task 14 |
| Status do pedido / pagamento | idem | `dropOrderStatusId`, `dropOrderPaymentStatusId` | 🆕 task 14 |

Body do checkout:

```json
{
  "reservationId": 9012,
  "couponCode": "DROP10",
  "shippingAddressLine": "Rua X, 100, apto 12",
  "shippingCity": "São Paulo",
  "shippingState": "SP",
  "shippingZipCode": "01234-000",
  "notes": null
}
```

**Totais são sempre calculados no servidor.** O front nunca envia `subTotal`, `totalAmount` nem `statusId`.

> **Campos do formulário sem destino no back-end:** `fullName` e `email` não existem em `DropOrder`. Eles pertencem ao cliente (`Customer`, no StoreCommerce). Até existir autenticação, o front **não envia** esses campos. O time decide na task 14 se entram no pedido ou se saem do formulário.

`POST /drop-orders/add` ✅ existe, mas exige `reservationId`, status e totais vindos do cliente: CRUD administrativo, **não usar** no checkout.

### Vitrine (`StoreShowcase.vue`), cliente casual

Catálogo regular, sem fila. Os dados vêm do **StoreCommerce** (pelo Gateway em `/api/store/...`), não do Drop. Hoje a tela usa um catálogo de exemplo do simulador (`storeCatalog` em `src/services/api.js`).

| Informação na tela | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Lista de produtos ativos | `GET /api/store/products/get-all` (pelo Gateway) | `content[]` com `isActive == true` | 🆕 sem task: o StoreCommerce.Api não expõe controllers |
| Nome, SKU, descrição, preço | idem | `name`, `sku`, `description`, `price` | 🆕 |
| Categoria (filtro) | idem | `category` (nome da categoria) | 🆕 |
| Estoque e badge (≤ 5 "Últimas unidades", 0 "Esgotado"); limite de 10 por pedido | idem | `stockQuantity` | 🆕 |
| Imagem | idem | `imageUrl` (opcional; sem imagem, placeholder) | 🆕 |
| Detalhe do produto (`StoreProductDetail.vue`) | `GET /api/store/products/get-by-id/{id}` | mesmos campos da lista | 🆕 (hoje usa o item já carregado da lista) |
| Sacola (`StoreCart.vue`) | — | só no front: `[{ productId, quantity }]` no `localStorage` (`veloce_store_bag`) | sem endpoint: carrinho não é persistido no back |
| Finalizar compra da sacola | `POST /api/store/orders/add` | body `{ items: [{ productId, quantity }] }` → `id`, `items[]`, `subTotal`, `shippingCost`, `totalAmount` | 🆕: servidor valida estoque (409 se faltar) e calcula totais |

> Os nomes de campo seguem o que foi levantado do `Product` do StoreCommerce (`productId`, `name`, `sku`, `isActive`). `category`, `description`, `price`, `stockQuantity` e `imageUrl` são propostas: confirmar com o back-end ao criar o endpoint.

### Painel de simulação (`SimulationPanel.vue`)

Não há endpoint. O tempo virtual e os controles de fila/estoque existem **só no modo mock** (`VITE_API_MODE=mock`). No modo `http` o painel mostra apenas o log de requisições (task 15).

## 5. Endpoints CRUD existentes (referência)

Todos os controllers herdam `BaseController` com as mesmas rotas, sob `/api/<recurso>`:

| Método | Rota | Uso |
|---|---|---|
| `POST` | `add` · `add-range` | criar (devolve lista) |
| `PUT` | `update` · `update-range` | atualizar (devolve lista) |
| `DELETE` | `delete/{id}` · `delete-range` | excluir (soft delete quando a entidade suporta) |
| `GET` | `get-all` | listar tudo |
| `GET` | `get-by-id/{id}` | buscar um |
| `POST` | `get-list-by-list-id` | buscar vários por id (body: `[1,2,3]`) |

Recursos: `drop-events`, `drop-products`, `drop-coupons`, `drop-orders`, `drop-order-items`, `drop-reservations`, `drop-registrations`, `drop-transactions`, `drop-notifications`, `drop-audit-logs`, `fraud-signals`, `queue-entries`, `queue-sessions`, `waitlist-entries`.

O front usa só `drop-events/get-by-id`. O resto do CRUD é para ferramentas administrativas.

## 6. Tradução das chamadas do mock atual

| `api.js` hoje | Endpoint real |
|---|---|
| `getAllDropEvents()` → `GET /api/drop-event/GetAll` | `GET /drop-events/get-public` |
| `getDropEvent(id)` → `GET /api/drop-event/GetById/{id}` | `GET /drop-events/get-by-id/{id}` |
| `getDropProduct(eventId)` → `GET /api/drop-product?dropEventId=` | `GET /drop-products/get-by-event/{eventId}` |
| `joinQueue(eventId)` → `POST /api/queue-entry/Add` | `POST /queue-entries/join` |
| `getQueueStatus(id)` → `GET /api/queue-entry/GetById/{id}` | `GET /queue-entries/status/{id}` |
| `createDropOrder(data)` → `POST /api/drop-order/Add` | `POST /drop-reservations/reserve` + `POST /drop-orders/checkout` |
| `updateSettings`, `updateEventSettings`, `resetSimulation`, `getVirtualTime` | só no adaptador mock |

## 7. Fora de escopo (decisões registradas)

- **Autenticação.** `X-Customer-Id` e `X-Enterprise-Id` são provisórios e **inseguros**: qualquer um forja o cabeçalho. Antes de produção, os dois vêm de um JWT (o `TenantProvider` já lê a claim `EnterpriseId`).
- **Pagamento.** O checkout cria o pedido com pagamento `Pendente`. Integrar gateway (`DropTransaction`) é outra série.
- **Inscrição prévia e lista de espera** (`drop-registrations`, `waitlist-entries`). Existem no back-end, mas nenhuma tela usa hoje.
- **Tempo real** (SignalR/SSE). A fila usa polling de 3s. Trocar por push é evolução futura, e o contrato de `status/{id}` continua válido.
