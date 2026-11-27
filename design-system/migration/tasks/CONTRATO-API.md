# Contrato de API: front-end (Vue) ↔ back-end (DropCommerce.Api)

Fonte da verdade para **qual informação da tela vem de qual endpoint**. Vale para front e back: mudou um campo ou rota, atualize este arquivo na mesma PR.

Levantado no código em 2026-09-28 (`backend/DROP-Ecommerce`, `frontend/src/services/api.js`). Legenda da coluna **Situação**:

- ✅ **existe**: endpoint já implementado no back-end
- 🆕 **task N**: endpoint a criar, especificado nesta página e na task indicada

## 1. Topologia

| Serviço | Porta | Papel |
|---|---|---|
| Front-end (Vite) | 5173 | SPA Vue. Em dev, faz proxy de `/api` para o Gateway (`VITE_GATEWAY_URL`, padrão `https://localhost:5000`, certificado de dev aceito) |
| `Commerce.Gateway` (YARP) | 5000 (HTTPS) | Ponto de entrada único. `/api/drop/**` → Drop API, `/api/store/**` → Store API. Sem Swagger próprio |
| `DropCommerce.Api` | 5002 (HTTPS) | Drop: eventos, fila, inscrições, reservas. Swagger em `/swagger` |
| `StoreCommerce.Api` | 5001 (HTTPS) | Loja: identidade, catálogo, carrinho, checkout, pedidos, painel. Swagger em `/swagger` |

O front chama **sempre o Gateway**. Bases: `STORE_BASE = /api/store/api` e `DROP_BASE = /api/drop/api` (`VITE_STORE_API_BASE_URL`, `VITE_DROP_API_BASE_URL`).

**O caminho externo tem `/api` duas vezes.** O Gateway remove o prefixo do serviço (`PathRemovePrefix`) e os controllers ficam em `/api/...`:

```
front    GET /api/store/api/storefront/store
  ↓ Vite proxy (dev) → https://localhost:5000
gateway  /api/store/{**}  →  /{**}
  ↓
store    GET /api/storefront/store
```

Conferido contra o back local em 15/11/2026: `/api/store/api/auth/csrf` responde 200 pelo proxy do Vite. Sem o `/api` duplo, a rota não existe.

### Testado contra o back local (15/11/2026)

- **CSRF:** o token vale para o contexto de autenticação em que foi emitido. `GET auth/csrf` vai com o access token atual; com um CSRF pedido antes do login, `select-enterprise`, `refresh` e `logout` respondem 403 "Token CSRF inválido". O `auth.js` guarda o CSRF por token.
- **Vitrine por subdomínio:** o Store resolve a loja pelo `Host` (`<slug>.stores.localhost`, `Security__StorefrontBaseDomain`). Direto no Store, `Host: teste.stores.localhost` responde 200. **Pelo Gateway dá 404 `Enterprise.Unavailable`:** o YARP troca o `Host` pelo do destino e o Store ignora `X-Forwarded-Host`. Correção no back: preservar o Host original nas rotas do Gateway (`RequestHeaderOriginalHost`) ou aceitar `X-Forwarded-Host` no Store. O proxy do Vite já preserva o Host (`changeOrigin: false`); abra o front em `http://<slug>.stores.localhost:5173`.
- **429:** o limite cobre todo o grupo `auth/*`, inclusive `csrf`. A resposta vem como `{ code, message }`, sem ProblemDetails e sem `Retry-After`.
- **`If-Match`:** só nas sessões de edição de aparência (`appearances/edit-sessions/*`). `store-settings` aceita PUT sem versão e não devolve `ETag`.
- **`storefront/store`** devolve `Result<T>`, não DTO direto.

## 2. Formato das respostas

`request()` (`src/services/http.js`) decide pelo **corpo**, não por lista de rotas:

| Resposta | Exemplos | O que `request()` devolve |
|---|---|---|
| `Result<T>` (`isSuccess`, `content`, `errors`, `listMessageErrors`) | CRUD, rotas novas de caso de uso | `content` |
| DTO direto | `auth/*`, `storefront/me`, `storefront/store`, `storefront/products` | o corpo como veio |
| `PagedResponse<T>` (`items`, `totalCount`, `page`, `pageSize`) | rotas `search` | o corpo; a tela passa por `toPage()` de `paging.js` |
| 204 sem corpo | desativar funcionário, `DELETE storefront/me` | `null` |

Com `{ withMeta: true }`, `request()` devolve `{ data, etag }`. O `ETag` volta no `If-Match` das rotas que exigem versão. Query das rotas `search`: `searchQuery()` em `paging.js` (`Page` de 1 a 100.000, `PageSize` de 1 a 100, filtros vazios omitidos).

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
| 409 | `Conflict` | regra de negócio (já na fila, esgotado, janela expirada, estoque): mensagem própria pelo `code` |
| 412 | versão antiga | "Outra pessoa alterou este registro": recarregar e pegar o novo `ETag` |
| 428 | falta `If-Match` | erro de integração: a tela não mandou a versão |
| 429 | limite de requisições | espera os segundos de `Retry-After` |
| 503 | `Unavailable` | "Serviço indisponível", retry com backoff |
| 500 | exceção não tratada | mensagem genérica + `traceId` no log |
| rede / timeout | — | "Reconectando…", mantém o último dado na tela |

Cada erro chega às telas como `ApiError` com `kind`: `validation` (400), `auth` (401), `forbidden` (403), `not-found` (404), `conflict` (409), `stale` (412), `precondition` (428), `rate-limit` (429, com `retryAfter`), `unavailable` (503), `server` (outros 5xx), `network` e `timeout`. As telas decidem pelo `kind`, nunca pelo número. `LoadState` esconde "Tentar de novo" em `forbidden`, `not-found` e `validation`.

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
| Sacola (`StoreCart.vue`) | `GET/POST/PUT/DELETE /api/store/api/storefront/{slug}/cart[...]` | `CartResponse`: `items[]` (id do item, SKU, `availability`, `isSelected`, `requiresDecision`), `summary` (totais dos selecionados, `canCheckout`, `coupon`) | ✅ task 30 (ver `storefront-api.js`) |
| Finalizar compra da sacola | `POST /api/store/orders/add` | body `{ items: [{ productId, quantity }] }` → `id`, `items[]`, `subTotal`, `shippingCost`, `totalAmount` | 🆕: servidor valida estoque (409 se faltar) e calcula totais |

> Os nomes de campo seguem o que foi levantado do `Product` do StoreCommerce (`productId`, `name`, `sku`, `isActive`). `category`, `description`, `price`, `stockQuantity` e `imageUrl` são propostas: confirmar com o back-end ao criar o endpoint.

### Painel do administrador (`src/components/admin/`), tasks 19–26

Terceiro módulo do produto. Consome **os dois serviços**: o Drop em `/api/drop/...` e o Store em `/api/store/...`. Nenhum dos endpoints abaixo existe hoje no formato necessário — a task 19 os cria, e a task 22 monta a camada de dados que os declara e um mock com o **mesmo formato**, para a virada `mock → http` não exigir mudança de tela.

#### Dashboard de vendas (`AdminDashboard.vue`)

| Informação na tela | Endpoint | Campo(s) | Situação |
|---|---|---|---|
| Vendido hoje / no mês | `GET /drop-orders/sales-summary` e `GET /api/store/orders/sales-summary` | `grossRevenue` | 🆕 task 19 |
| Pago × pendente | idem | `byPayment[]` (`paymentStatusId` 2 × 1) | 🆕 task 19 |
| Ticket médio, pedidos, unidades | idem | `averageTicket`, `orderCount`, `unitCount` | 🆕 task 19 |
| Curva de faturamento | idem | `buckets[]` (`date`, `revenue`, `orderCount`) | 🆕 task 19 |
| Mais vendidos | idem | `topProducts[]` | 🆕 task 19 |
| Quebra por status | idem | `byStatus[]` | 🆕 task 19 |

Parâmetros: `from`, `to` (datas locais `YYYY-MM-DD`, inclusivas) e `granularity` (`day` \| `month`).

**Três regras de cálculo que mudam o número na tela**, definidas na task 19 §3 e replicadas pelo mock:

1. O eixo de tempo é `createdAt`, gravado em **UTC**; a agregação por dia converte para `America/Sao_Paulo` antes de agrupar. Sem isso, toda venda depois das 21h cai no dia seguinte.
2. Pedidos com status `6 Cancelado` ou `7 Reembolsado` **não entram** em nenhuma soma.
3. `bucket` sem venda existe com zeros — o gráfico não pode ter buraco.

#### Gestão de drops (`AdminDrops.vue`)

| Ação | Endpoint | Situação |
|---|---|---|
| Listar | `GET /drop-events/get-paged?page=&pageSize=&statusId=&search=` | 🆕 task 19 §4 (`get-all` ✅ existe, mas devolve a tabela inteira) |
| Detalhe | `GET /drop-events/get-by-id/{id}` | ✅ existe |
| Criar / editar | `POST /drop-events/add` · `PUT /drop-events/update` | ✅ existem |
| Mudar de fase | `PUT /drop-events/update` com `dropEventStatusId` trocado | ✅ existe |
| Estoque alocado | `GET /drop-products/get-by-event/{id}` · `PUT /drop-products/update` | 🆕 task 11 / ✅ update |

#### Rotas de negócio do painel (tasks 28 e 33–41, conferidas no back local em 22–26/11)

As listas do painel usam as rotas `search` do back (`PagedResponse<T>` + `toPage()`), com `usePagedSearch`. As permissões vêm do access token (`usePermissions`: claims `membership_kind` e `permission`); o back continua sendo a autoridade (403).

| Área | Rotas (`/api/store/api`) | Serviço no front |
|---|---|---|
| Sessões e senha (cliente e equipe) | `auth/sessions` · `DELETE auth/sessions/{familyId}` · `auth/logout-all` · `auth/change-password` (cliente: `storefront/{slug}/auth/*`) | `auth.js` |
| Escolha de loja | `enterprises/mine` · `auth/select-enterprise` · `enterprises/register` | `auth.js`, `admin-api.js` |
| Produtos e variantes | `GET products/search` · `products/get-by-id/{id}` · `POST products/add` · `PUT products/{id}/details \| pricing \| dimensions \| category \| active` · `PUT products/{id}/variants/enable` · `products/{id}/variants[/{vid}[/pricing \| /dimensions]]` | `admin-catalog-api.js` |
| Estoque por SKU | `GET inventory/variants/{id}` · `PUT inventory/variants/{id}/adjust` (`expectedVersion`; conflito = 409 `Inventory.StaleVersion`) · `GET inventory/movements?ProductVariantId` · `inventory/reservations[/{id}[/release \| /commit]]` | `admin-catalog-api.js` |
| Categorias | `GET categories/tree` · `categories/add \| update` (lista) · `PUT categories/{id}/active` · `PUT categories/reorder` · `DELETE categories/delete-with-products` | `admin-catalog-api.js` |
| Cupons | `GET coupons/search` (`availability` 1–5) · `coupons/add \| update` · `PUT coupons/{id}/activation` (corpo `true`/`false`) · `GET coupons/condition-types \| condition-operators` · `GET coupons/validate` | `admin-catalog-api.js` |
| Pedidos da vitrine | `GET orders/search` · `GET orders/{id}/detail` · `POST orders/{id}/confirm-payment \| start-processing \| ship \| deliver \| cancel` (cada uma devolve o detalhe) | `admin-api.js` |
| Pedidos de drop | `drop-orders/get-all` · `POST /api/drop/api/drop-purchases/{id}/fulfillment` (3, 4 e 5, só depois do pagamento) | `admin-api.js` |
| Clientes | `GET customers/search` (métricas do back) · `GET customers/{id}/addresses` · `GET orders/search?CustomerId` | `admin-api.js` |
| Configurações comerciais | `GET/PUT store-settings` | `admin-api.js` |
| Equipe e acessos | `permissions/get-all` · `access-roles…` · `access-role-permissions/get-all` · `enterprise-memberships…` · `membership-access-roles/get-all` · `PUT employees/{id}/deactivate` · `invitations` · `ownership-transfers` · `identity/invitations/accept` · `identity/ownership-transfers/accept` | `team-api.js` |
| Domínio próprio | `enterprise-domains/get-all \| add` · `POST enterprise-domains/{id}/verify` · `PUT enterprise-domains/{id}/publication` · `DELETE enterprise-domains/{id}` | `team-api.js` |

O que o back ainda não oferece para essas telas está em `PENDENCIAS-BACKEND-2026-11-16.md` (itens 5 a 15).

#### Pedido do drop × pedido da vitrine (entidades)

**As duas entidades não são a mesma.** Campos que divergem e precisam de tradução na camada de dados:

| | `DropOrder` | `Order` (Store) |
|---|---|---|
| Status | `dropOrderStatusId` | `orderStatusId` |
| Pagamento | `dropOrderPaymentStatusId` | `orderPaymentStatusId` |
| Cupom | `dropCouponId` | `couponId` |
| UF de entrega | `shippingState` (**string**) | `shippingStateId` (**long**, entidade `State`) |
| Origem | `dropEventId`, `dropReservationId` | — |

Os **ids de status são idênticos nos dois lados** (mesmo seed): pedido `1 Pendente · 2 Confirmado · 3 Em processamento · 4 Enviado · 5 Entregue · 6 Cancelado · 7 Reembolsado`; pagamento `1 Pendente · 2 Pago · 3 Reembolso parcial · 4 Reembolso total · 5 Falhou`.

#### Duas armadilhas do CRUD que valem para todo o painel

1. **`add` e `update` devolvem lista**, mesmo para um item — o `BaseController` embrulha em `add-range`. O objeto é `content[0]`.
2. **Não há `PATCH`.** Mudar um campo (fase do drop, status do pedido) é ler a entidade, trocar o campo e reenviar **todos** os campos. A camada de dados encapsula isso; as telas nunca montam esse corpo.

#### Acesso

Não há autenticação. Os endpoints do painel aceitam `X-Employee-Id` apenas para carimbar auditoria, e **isso não é segurança** — o cabeçalho é forjável, como `X-Enterprise-Id` e `X-Customer-Id` (§7). Quando o JWT existir, todo endpoint do painel fica atrás de papel de administrador. Até lá o painel só monta com `VITE_ADMIN_ENABLED=true` e exibe aviso na tela.

### Telas do design (C3–C13 e E1–E13)

Mapeamento completo tela → rota → situação no back-end em [`TELAS-DESIGN.md`](./TELAS-DESIGN.md),
conferido no `origin/main` do back-end em 2026-10-28 (auth com JWT + CSRF e rotas `storefront/*`).

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

- **Autenticação.** `X-Customer-Id` e `X-Enterprise-Id` são provisórios e **inseguros**: qualquer um forja o cabeçalho. Antes de produção, os dois vêm de um JWT (o `TenantProvider` já lê a claim `EnterpriseId`). O mesmo vale, com mais gravidade, para o `X-Employee-Id` do painel: enquanto não houver JWT com papel de administrador, **o painel não vai para ambiente aberto** (task 21 §5). As entidades `Employee`, `Role` e `Department` já existem no Store, com handlers — falta o fluxo de login.
- **Pagamento.** O checkout cria o pedido com pagamento `Pendente`. Integrar gateway (`DropTransaction`) é outra série.
- **Inscrição prévia e lista de espera** (`drop-registrations`, `waitlist-entries`). Existem no back-end, mas nenhuma tela usa hoje.
- **Tempo real** (SignalR/SSE). A fila usa polling de 3s. Trocar por push é evolução futura, e o contrato de `status/{id}` continua válido.
