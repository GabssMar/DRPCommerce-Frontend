# [API · Back-end] Endpoints do painel do administrador: controllers do Store, estoque e resumo de vendas

**Depende de:** task 10 (rota do Gateway, CORS, tenant) · **Bloqueia a virada** das tasks 22–26 para `VITE_API_MODE=http` · As tasks de front **não esperam** por esta

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API (MediatR, FluentValidation, EF Core + PostgreSQL) |
| Projetos | `StoreCommerce.Api` (5001), `DropCommerce.Api` (5002), `Commerce.Gateway` (YARP, 5000) |
| Contrato | `CONTRATO-API.md` §4.7 (painel do administrador) |

## Funcionalidade

O administrador da loja precisa de três coisas que hoje **não existem como endpoint**: ler e escrever o catálogo do Store, controlar estoque, e ver quanto vendeu no dia e no mês.

## Estado atual (levantado no código do back-end)

| Fato | Onde |
|---|---|
| ✅ O Drop expõe CRUD completo em 15 recursos | `src/Drop/DropCommerce.Api/Controllers/` |
| ❌ **O `StoreCommerce.Api` não tem pasta `Controllers`** | `src/Store/StoreCommerce.Api/` — só `Program.cs`, `Configuration`, `Extensions` |
| ✅ Mas os handlers do Store existem e estão completos | `StoreCommerce.Application/Features/Commands/{Product,Order,Category,Supplier,Customer,Invoice,Transaction,…}/` com `Create`, `Update`, `Delete`, `Queries` |
| ❌ **`Product` não tem campo de estoque** | `StoreCommerce.Domain/Entity/Product/Product.cs`: `Price`, `CostPrice`, `Weight`, `Brand`, `ImageUrls`, `IsActive`, `IsDigital`… e nenhuma quantidade |
| ❌ Não há endpoint de agregação de vendas | nenhum `sales-summary`; só `get-all` de `DropOrder` / `Order` |
| ❌ Não há listagem paginada nem filtrada | `BaseController.GetAllAsync()` devolve a tabela inteira |
| ✅ `CreatedAt` existe em tudo | `BaseEntity`: `Id`, `CreatedAt`, `UpdatedAt` — gravados em **UTC** (`DateTime.UtcNow`) |

Ou seja: expor o Store é sobretudo **fiação** (os handlers estão prontos); estoque e resumo de vendas são **regra nova**.

## Como implementar

### 1. Controllers do Store (fiação)

Replique o `BaseController` do Drop no `StoreCommerce.Api` e crie os controllers que o painel usa. Mesmas rotas do Drop (`add`, `add-range`, `update`, `update-range`, `delete/{id}`, `delete-range`, `get-all`, `get-by-id/{id}`, `get-list-by-list-id`):

| Controller | Rota | Usado por |
|---|---|---|
| `ProductController` | `api/products` | catálogo e estoque (task 25) |
| `CategoryController` | `api/categories` | filtro de categoria |
| `SupplierController` | `api/suppliers` | ficha do produto |
| `OrderController` | `api/orders` | pedidos da vitrine (task 26) |
| `OrderItemController` | `api/order-items` | detalhe do pedido |

Pelo Gateway, viram `/api/store/products/get-all` etc.

> ⚠️ **A mesma armadilha da task 10 vale aqui.** O Gateway faz `PathRemovePrefix: /api/store`, então `/api/store/products/get-all` chega na API como `/products/get-all`, mas o controller está em `/api/products/...`. Aplique a correção da task 10 **nas duas rotas** (`rota_store` e `rota_drop`).

### 2. Estoque do produto (decisão de modelagem)

O front já exibe estoque na vitrine (`stockQuantity`, badge "Últimas unidades" em ≤ 5, "Esgotado" em 0) usando um catálogo **inventado** no simulador. Não há campo correspondente no domínio.

**Proposta** (confirmar antes de implementar): dois campos em `Product`, no padrão que `DropProduct` já usa (`UnitsAllocated` / `UnitsSold`):

```csharp
public int StockQuantity { get; private set; }   // disponível para venda
public int StockReserved { get; private set; }   // em pedido não concluído
```

E um caso de uso para movimentar, em vez de `update` no produto inteiro:

```
POST /api/store/products/adjust-stock
body { "productId": 101, "delta": -3, "reason": "Venda balcão" }
-> content { "productId": 101, "stockQuantity": 39, "stockReserved": 0 }
```

Regras: `stockQuantity + delta` nunca fica negativo (409 `Stock.Insufficient`); toda movimentação grava linha de auditoria com `employeeId` e `reason`; o checkout da vitrine (`POST /api/store/orders/add`) debita dentro da mesma transação da criação do pedido.

**Alternativa**, se o time preferir não tocar em `Product`: entidade `StockMovement` (produto, delta, motivo, data) com o saldo calculado. Mais rastreável, mais caro de ler. **Decida na PR desta task e registre em `CONTRATO-API.md`.**

### 3. Resumo de vendas

Dois endpoints simétricos, um de cada lado:

```
GET /api/drop/drop-orders/sales-summary?from=2026-09-01&to=2026-09-30&granularity=day
GET /api/store/orders/sales-summary?from=…&to=…&granularity=day
```

`granularity`: `day` | `month`. `from`/`to` são **datas locais** (`YYYY-MM-DD`), inclusivas.

```json
{
  "isSuccess": true,
  "content": {
    "from": "2026-09-01", "to": "2026-09-30",
    "granularity": "day", "timeZone": "America/Sao_Paulo",
    "grossRevenue": 48230.50, "discountTotal": 1210.00, "shippingTotal": 980.00,
    "netRevenue": 46040.50, "orderCount": 137, "unitCount": 152, "averageTicket": 352.05,
    "buckets": [
      { "date": "2026-09-01", "revenue": 1299.70, "orderCount": 4, "unitCount": 4 }
    ],
    "byStatus":  [ { "statusId": 2, "orderCount": 120, "revenue": 42100.00 } ],
    "byPayment": [ { "paymentStatusId": 2, "orderCount": 118, "revenue": 41800.00 } ],
    "topProducts": [
      { "productId": 1, "sku": "DROP-SKU-001", "name": "Veloce Cyber Edition S-X1", "unitCount": 38, "revenue": 11396.20 }
    ]
  }
}
```

Regras de cálculo — **decidam e documentem, porque mudam o número na tela**:

1. **Eixo de tempo:** `CreatedAt` do pedido. Está em **UTC**; converta para `America/Sao_Paulo` **antes** de agrupar por dia, senão toda venda depois das 21h cai no dia seguinte.
2. **O que conta como venda:** pedidos com `dropOrderStatusId` (ou `orderStatusId`) **∉ {6 Cancelado, 7 Reembolsado}**.
3. **Faturamento bruto** é a soma de `TotalAmount`; `netRevenue = grossRevenue − discountTotal − shippingTotal`.
4. **`byPayment`** separa o que foi pago (`paymentStatusId == 2`) do que está pendente (`1`). A tela mostra os dois — "vendido" e "recebido" não são o mesmo número.
5. `unitCount` vem de `DropOrderItem` / `OrderItem` (soma de `Quantity`), não da contagem de pedidos.
6. `bucket` sem venda **existe** com zeros — o gráfico não pode ter buraco.
7. Intervalo máximo de 366 dias (400 `Report.RangeTooLong`).

Implemente como query MediatR (`GetDropOrderSalesSummaryQuery`), agregando **no banco** (`GroupBy` traduzido para SQL), nunca carregando os pedidos em memória.

### 4. Listagem paginada para as telas de gestão

`get-all` devolve a tabela inteira: serve para 3 drops de demonstração, não para a tela de pedidos. Acrescente, nos recursos que o painel lista:

```
GET /api/drop/drop-orders/get-paged?page=1&pageSize=25&statusId=&from=&to=&search=
-> content { "items": [...], "page": 1, "pageSize": 25, "totalItems": 137, "totalPages": 6 }
```

Mesmo formato em `/api/store/products/get-paged` e `/api/store/orders/get-paged`.

### 5. Quem é o administrador

Não há autenticação (task 10 usa `X-Enterprise-Id` e `X-Customer-Id` de cabeçalho, forjáveis). O Store **já tem** `Employee`, `Role` e `Department` no domínio, com handlers.

Esta task **não** implementa login. Ela apenas: (a) aceita `X-Employee-Id` nos endpoints de escrita do painel, para carimbar auditoria; (b) registra no `CONTRATO-API.md` que todos os endpoints `/admin` ficam atrás de JWT com papel de administrador quando a autenticação existir. **Não publique o painel em ambiente aberto antes disso.**

## Critérios de aceite

- [ ] `StoreCommerce.Api` expõe `products`, `categories`, `suppliers`, `orders`, `order-items` com as mesmas rotas do Drop
- [ ] Gateway encaminha `/api/store/**` e `/api/drop/**` sem 404 (correção da task 10 aplicada nas duas rotas)
- [ ] Decisão de estoque implementada e registrada no contrato; `adjust-stock` recusa saldo negativo com 409 `Stock.Insufficient`
- [ ] `sales-summary` nos dois lados, com fuso `America/Sao_Paulo`, buckets sem buraco e agregação feita no banco
- [ ] `get-paged` em `drop-orders`, `orders` e `products`
- [ ] Respostas no envelope `Result<T>`; erros em `problem+json` com `code` (§2 do contrato)
- [ ] Testes: cálculo do resumo com venda às 22h (vira dia anterior em UTC), pedido cancelado fora da soma, intervalo vazio, `adjust-stock` concorrente
- [ ] `CONTRATO-API.md` §4.7 atualizado com o que foi realmente implementado

## Verificação

```bash
curl "http://localhost:5000/api/store/products/get-all" -H "X-Enterprise-Id: 1"
curl "http://localhost:5000/api/drop/drop-orders/sales-summary?from=2026-09-01&to=2026-09-30&granularity=day" -H "X-Enterprise-Id: 1"
curl -X POST "http://localhost:5000/api/store/products/adjust-stock" \
     -H "Content-Type: application/json" -H "X-Enterprise-Id: 1" \
     -d '{"productId":101,"delta":-3,"reason":"Venda balcão"}'
```

## Referências

- `CONTRATO-API.md` §2 (envelope e erros), §3 (ids de status), §4.7 (painel do administrador)
- Back-end: `src/Drop/DropCommerce.Api/Controllers/Base/BaseController.cs` é o molde dos controllers do Store
- Back-end: `src/Gateway/Commerce.Gateway/appsettings.json` — `PathRemovePrefix` das duas rotas

## Para o Claude Code

```
Leia CONTRATO-API.md §2, §3 e §4.7 e a task 10. No repositório do back-end: crie o
BaseController e os controllers Product, Category, Supplier, Order e OrderItem no
StoreCommerce.Api espelhando o BaseController do Drop; corrija o PathRemovePrefix das
rotas rota_store e rota_drop no Gateway; implemente a decisão de estoque em Product
(StockQuantity/StockReserved + POST adjust-stock com auditoria); implemente
GetDropOrderSalesSummaryQuery e GetOrderSalesSummaryQuery agregando no banco, com
conversão UTC -> America/Sao_Paulo antes do GroupBy por dia e buckets zerados sem buraco;
adicione get-paged em drop-orders, orders e products. Não invente autenticação: aceite
X-Employee-Id para auditoria e registre a pendência no contrato.
```
