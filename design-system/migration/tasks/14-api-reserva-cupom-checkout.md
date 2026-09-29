# [API · Back-end] Reserva, cupom e checkout do pedido

**Depende de:** tasks 12 e 13 · **Onde o dinheiro entra**

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API · MediatR · FluentValidation · EF Core 9 + Npgsql (PostgreSQL) |
| Gateway | `Commerce.Gateway` com **YARP** (porta 5000) |
| Padrões | `Result<T>` + `ResultHttpExtensions` (erros em ProblemDetails), controllers herdando `BaseController` |
| Consumidor | Front-end **Vue 3** + Vite (porta 5173). Contrato em `CONTRATO-API.md` |

## Funcionalidade alterada

O fluxo de compra de quem foi chamado na fila: **reservar** a unidade, **validar cupom** e **fechar o pedido**, com todos os valores calculados no servidor.

## Estado atual

- `POST /api/drop-orders/add` exige do cliente `reservationId`, `statusId`, `paymentStatusId`, `subTotal`, `discountAmount`, `shippingCost`, `taxAmount` e `totalAmount`. Hoje, o navegador define quanto paga.
- Não há como criar reserva a partir da fila, nem validar cupom (`IDropCouponRepository.GetByCodeAsync` existe, sem uso).
- O front hoje valida o cupom `DROP10` localmente e soma frete fixo de R$ 20.
- O formulário do front coleta `fullName` e `email`, que **não existem** em `DropOrder`.

## Como implementar

`customerId` vem do `ICustomerProvider` (task 10) em todos os casos de uso.

### 1. `POST /api/drop-reservations/reserve`

Body: `{ "queueEntryId": 4012, "dropProductId": 1, "quantity": 1 }`

1. Entrada da fila do cliente, com status **2 Chamado** e dentro da janela → senão `409 Checkout.NotYourTurn` ou `409 Checkout.WindowExpired`
2. Produto ativo, do mesmo evento, com `quantity ≤ MaxPerCustomer` (considerando compras anteriores do cliente) → senão `400`/`409 Checkout.LimitExceeded`
3. Estoque disponível ≥ `quantity` → senão `409 Checkout.SoldOut`
4. Em **uma transação, com lock na linha do produto**:
   - reserva **1 Ativa**, `UnitPrice` = preço do produto, `TotalAmount`, `LockToken` aleatório, `ReservedAt = now`, `ExpiresAt = calledAt + CheckoutWindowSeconds` (a reserva não estende a janela)
   - `UnitsReserved += quantity` (produto e evento)
   - entrada da fila → **3 Finalizando compra**
5. Idempotente: se já existe reserva ativa para essa entrada, devolve a mesma.

### 2. `GET /api/drop-coupons/validate?dropEventId={id}&code={code}`

Usa `GetByCodeAsync`. Válido se: ativo, do evento, dentro de `StartsAt`/`ExpiresAt`, `UsedCount < MaxUses`, `IsSingleUse` não usado pelo cliente, `IsExclusiveToRegistered` → cliente inscrito. Resposta:

```json
{ "code": "DROP10", "dropCouponTypeId": 1, "discountValue": 10, "discountAmount": 29.99 }
```

`discountAmount` calculado sobre a reserva ativa do cliente, respeitando `MinOrderValue` e `MaxDiscountCap`. Inválido → `409 Coupon.Invalid`, com o motivo no `detail`.

### 3. `POST /api/drop-orders/checkout`

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

1. Reserva do cliente, status **1 Ativa**, `ExpiresAt > now` → senão `409 Checkout.ReservationExpired`
2. Cupom revalidado aqui (não confiar no `validate` anterior)
3. Totais **no servidor**: `subTotal` = reserva; `discountAmount` do cupom; `shippingCost` de `Checkout:ShippingFlatRate` (provisório, em configuração); `taxAmount` = 0 (registrar como pendência); `totalAmount`
4. Em uma transação:
   - `DropOrder` com status **1 Pendente** e pagamento **1 Pendente**
   - `DropOrderItem` com `ItemName` (nome do evento/produto), `SKU`, quantidade e preços
   - reserva → **2 Confirmada**, `ConfirmedAt = now`
   - entrada da fila → **4 Concluído**, `CheckedOutAt = now`
   - `UnitsReserved -= q`, `UnitsSold += q` (produto e evento); cupom `UsedCount += 1`
5. Resposta: o pedido (objeto único), com `id` e todos os totais
6. Validação FluentValidation dos campos de endereço (UF com 2 letras, CEP `00000-000`): os erros voltam como `ValidationProblemDetails`, e o front mapeia por campo (`CONTRATO-API.md` §2)

### Decisão a registrar: `fullName` e `email`

O formulário coleta, mas `DropOrder` não guarda. Opções: (a) adicionar `RecipientName`/`ContactEmail` ao pedido via migration, ou (b) tirar do formulário e usar os dados do cliente quando existir autenticação. Decidir nesta task e atualizar `CONTRATO-API.md` §4 (Checkout).

## Critérios de aceite

- [ ] Nenhum valor monetário nem status é aceito do body
- [ ] Reserva só para entrada Chamada e dentro da janela; idempotente
- [ ] Dois clientes disputando a última unidade: exatamente um reserva (teste de concorrência)
- [ ] Checkout com reserva expirada → 409 e a unidade não é vendida
- [ ] Cupom revalidado no checkout; `UsedCount` incrementado só em pedido criado
- [ ] Estoque consistente após reserva, expiração (task 13) e checkout: `UnitsSold + UnitsReserved ≤ alocado`
- [ ] Erros de campo em `ValidationProblemDetails` com código `<Command>.<campo>`
- [ ] Códigos de erro (`Checkout.*`, `Coupon.Invalid`) documentados no `CONTRATO-API.md`
- [ ] Decisão sobre `fullName`/`email` registrada

## Verificação

Com um cliente Chamado (task 13):

```bash
H='-H X-Enterprise-Id:1 -H X-Customer-Id:42 -H Content-Type:application/json'
curl -s $H -X POST http://localhost:5000/api/drop/drop-reservations/reserve -d '{"queueEntryId":4012,"dropProductId":1,"quantity":1}'
curl -s $H "http://localhost:5000/api/drop/drop-coupons/validate?dropEventId=1&code=DROP10"
curl -s $H -X POST http://localhost:5000/api/drop/drop-orders/checkout -d '{"reservationId":9012,"couponCode":"DROP10","shippingAddressLine":"Rua X, 100","shippingCity":"São Paulo","shippingState":"SP","shippingZipCode":"01234-000"}'
```

## Referências

- `CONTRATO-API.md` §2 (erros), §3 (status) e §4 (Checkout)
- Entidades `DropReservation`, `DropOrder`, `DropOrderItem`, `DropCoupon`
- Task 13 (expiração de reservas)

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §2–§4 e as tasks 12 e 13. No
backend/DROP-Ecommerce, crie três casos de uso MediatR: ReserveDropReservationCommand
(POST /api/drop-reservations/reserve), ValidateDropCouponQuery
(GET /api/drop-coupons/validate) e CheckoutDropOrderCommand (POST /api/drop-orders/checkout),
seguindo as regras da task: customerId do ICustomerProvider; totais e status só no servidor;
transação com lock na linha do produto; atualização de UnitsReserved/UnitsSold, status da
reserva, da entrada da fila e UsedCount do cupom; erros Error.Conflict com os códigos
listados; validators FluentValidation de endereço. Testes de concorrência na última
unidade. Não integre pagamento.
```
