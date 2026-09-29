# [API · Back-end] Fila: entrar, consultar posição, restaurar e sair

**Depende de:** task 10 · **Caminho crítico do produto**

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API · MediatR · FluentValidation · EF Core 9 + Npgsql (PostgreSQL) |
| Gateway | `Commerce.Gateway` com **YARP** (porta 5000) |
| Padrões | `Result<T>` + `ResultHttpExtensions` (erros em ProblemDetails), controllers herdando `BaseController` |
| Consumidor | Front-end **Vue 3** + Vite (porta 5173). Contrato em `CONTRATO-API.md` |

## Funcionalidade alterada

Os casos de uso que o cliente executa na fila: **entrar**, **acompanhar a posição** (polling de 3s), **recuperar a entrada** ao recarregar a página e **sair**. A promoção de quem está aguardando para "chamado" fica na task 13.

## Estado atual

Só existe o CRUD de `queue-entries`. O `add` exige que o **cliente** envie `position`, `sessionToken`, `statusId`, `ipAddress`, `userAgent` e as datas: o navegador escolheria a própria posição na fila. Não existe consulta de posição relativa, nem de "minha entrada neste drop". `IQueueEntryRepository` já tem `GetByEventAsync` e `GetByCustomerAndEventAsync`, sem uso.

## Como implementar

Todas as rotas em `QueueEntryController`. `customerId` vem **sempre** do `ICustomerProvider` (task 10), nunca do corpo.

### `POST /api/queue-entries/join`

Body: `{ "dropEventId": 1, "deviceFingerprint": "…" }`

1. Evento visível no tenant e com `DropEventStatusId` 4 (Fila aberta) ou 5 (Ativo). Senão → `409 Queue.NotOpen`, com `detail` informando `queueOpensAt`.
2. Já existe entrada do cliente no evento com status 1, 2 ou 3 → **devolve a existente com 200** (idempotente: duplo clique e outra aba não criam duas entradas).
3. Cliente já tem entrada com status 4 (Concluído) e atingiu `MaxPerCustomer` → `409 Queue.AlreadyPurchased`.
4. Evento esgotado (status 6) → `409 Queue.SoldOut`.
5. Cria a entrada com dados preenchidos **pelo servidor**:
   - `position` = maior posição do evento + 1, calculada dentro de transação com lock (dois `join` simultâneos não podem ter a mesma posição)
   - `sessionToken` = token aleatório criptograficamente seguro
   - `queueEntryStatusId = 1` (Aguardando), `enteredAt = UtcNow`
   - `ipAddress` e `userAgent` lidos do `HttpContext` (com `X-Forwarded-For` do Gateway)

Resposta: `content` = entrada criada (objeto único, não lista).

### `GET /api/queue-entries/status/{id}`

DTO próprio, não a entidade:

```json
{
  "id": 4012,
  "dropEventId": 1,
  "queueEntryStatusId": 1,
  "position": 37,
  "totalWaiting": 1842,
  "calledAt": null,
  "checkoutDeadline": null,
  "serverNow": "2026-09-28T18:00:03Z"
}
```

- `position`: posição **relativa** = quantas entradas status 1 do evento têm `Position` menor + 1. Não é a posição de chegada.
- `totalWaiting`: total com status 1 no evento.
- `checkoutDeadline`: `calledAt + Queue:CheckoutWindowSeconds` quando status 2; `ExpiresAt` da reserva quando status 3; `null` nos demais.
- Entrada de outro cliente → `404` (não revelar que existe).
- **Performance:** é chamado a cada 3s por cliente. Índice em `(drop_event_id, queue_entry_status_id, position)` e uma query de contagem, sem carregar entidades.

### `GET /api/queue-entries/get-my-entry/{dropEventId}`

Usa `GetByCustomerAndEventAsync`. Devolve a entrada mais recente do cliente no evento, ou `404 Queue.EntryNotFound`. Permite ao front restaurar o estado depois de recarregar a página, sem `localStorage`.

### `POST /api/queue-entries/leave/{id}`

Status 1 ou 2 → 6 (Removido). Status 3 → também cancela a reserva ativa (reserva vira 4, devolve `UnitsReserved`). Status 4, 5 ou 6 → `409 Queue.CannotLeave`.

### Configuração

```json
"Queue": { "CheckoutWindowSeconds": 600 }
```

## Critérios de aceite

- [ ] `join` ignora qualquer `position`/`statusId`/`customerId` enviado no body
- [ ] `join` idempotente: duas chamadas seguidas devolvem a mesma entrada
- [ ] 50 `join` concorrentes geram posições únicas e contíguas (teste de integração)
- [ ] `status` devolve posição relativa, que diminui quando alguém à frente sai ou é chamado
- [ ] `status` e `leave` de entrada de outro cliente → 404
- [ ] Erros de regra como `409` com `code` estável (`Queue.NotOpen`, `Queue.AlreadyPurchased`, `Queue.SoldOut`, `Queue.CannotLeave`, `Queue.EntryNotFound`), documentados no `CONTRATO-API.md`
- [ ] Índice criado por migration
- [ ] Testes dos quatro handlers

## Verificação

```bash
H='-H X-Enterprise-Id:1 -H X-Customer-Id:42 -H Content-Type:application/json'
curl -s $H -X POST http://localhost:5000/api/drop/queue-entries/join -d '{"dropEventId":1,"deviceFingerprint":"abc"}'
curl -s $H http://localhost:5000/api/drop/queue-entries/status/<id>
curl -s $H http://localhost:5000/api/drop/queue-entries/get-my-entry/1
curl -s $H -X POST http://localhost:5000/api/drop/queue-entries/leave/<id>
```

## Referências

- `CONTRATO-API.md` §3 (status da fila) e §4 (seção "Fila")
- `DropCommerce.Domain/Entity/QueueEntry/QueueEntry.cs`, `StaticEntity/QueueEntryStatus`
- `IQueueEntryRepository`

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §3 e §4 (Fila). No
backend/DROP-Ecommerce, crie em QueueEntryController os casos de uso join, status/{id},
get-my-entry/{dropEventId} e leave/{id}, como commands/queries MediatR com validators.
customerId vem do ICustomerProvider; posição, sessionToken, status, IP e user agent são
definidos pelo servidor; posição atribuída em transação com lock; join idempotente;
status devolve DTO com posição relativa, totalWaiting, checkoutDeadline e serverNow.
Erros de regra como Error.Conflict com os códigos listados na task. Adicione o índice
(drop_event_id, queue_entry_status_id, position) via migration e a config
Queue:CheckoutWindowSeconds. Não altere as rotas CRUD existentes.
```
