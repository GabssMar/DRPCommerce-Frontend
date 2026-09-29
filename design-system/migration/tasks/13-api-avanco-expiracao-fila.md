# [API · Back-end] Avanço e expiração da fila, e fases do drop

**Depende de:** task 12

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API · MediatR · FluentValidation · EF Core 9 + Npgsql (PostgreSQL) |
| Execução | `BackgroundService` (hosted service) no `DropCommerce.Api` |
| Padrões | `Result<T>` + `ResultHttpExtensions` (erros em ProblemDetails), controllers herdando `BaseController` |
| Consumidor | Front-end **Vue 3** + Vite (porta 5173). Contrato em `CONTRATO-API.md` |

## Funcionalidade alterada

O "relógio" do drop no servidor: quem sai de **Aguardando** para **Chamado**, quem perde a vez por não comprar a tempo, e em que **fase** está cada evento. Hoje isso só existe no simulador do front (`api.js` decrementa a posição aleatoriamente a cada polling).

## Estado atual

Nada no back-end muda `QueueEntryStatusId`, `ExpiredAt`, o status das reservas ou o `DropEventStatusId` com o passar do tempo. Sem esta task, o front fica parado em "Aguardando" para sempre.

## Como implementar

`DropProgressionWorker : BackgroundService`, com um ciclo a cada `Queue:TickSeconds` (padrão 2s). Cada ciclo abre um escopo de DI e executa um command MediatR por responsabilidade, para ficar testável sem o worker:

### 1. Fases do evento (`AdvanceDropEventPhasesCommand`)

| Condição (UTC) | Novo `DropEventStatusId` |
|---|---|
| `now >= QueueOpensAt` e status ∈ {2, 3} | 4 Fila aberta |
| `now >= DropStartsAt` e status = 4 | 5 Ativo |
| unidades disponíveis = 0 e status ∈ {4, 5} | 6 Esgotado |
| `now >= DropEndsAt` e status ∈ {4, 5, 6} | 7 Encerrado |

O worker roda **sem** requisição HTTP, então não há tenant: use `IgnoreQueryFilters()` e filtre `IsDeleted` manualmente.

### 2. Chamar os próximos (`CallNextInQueueCommand`)

Para cada evento com status 5 (Ativo):

- `vagas = disponível − (entradas com status 2 + status 3)`, em que disponível é a fonte definida na task 11
- Promover as `vagas` primeiras entradas com status 1 (por `Position`) para **2 Chamado**, com `CalledAt = now`
- Limite por ciclo `Queue:MaxCallsPerTick` (padrão 50), para não chamar milhares de uma vez

### 3. Expirar quem não comprou (`ExpireQueueEntriesCommand`)

- Status 2 com `CalledAt + CheckoutWindowSeconds < now` → **5 Expirado**, `ExpiredAt = now`
- Reserva status 1 com `ExpiresAt < now` → reserva **3 Expirada**; a entrada da fila → **5 Expirado**; devolver `UnitsReserved` do produto/evento
- Evento encerrado (status 7): todas as entradas 1/2 → **5 Expirado**

### Concorrência

Os comandos rodam dentro de transação. Se houver mais de uma instância da API, o worker precisa de **lock distribuído** (ex.: `pg_try_advisory_lock` no PostgreSQL) para só uma instância avançar a fila por vez. Registrar a decisão no PR.

### Configuração

```json
"Queue": { "CheckoutWindowSeconds": 600, "TickSeconds": 2, "MaxCallsPerTick": 50 }
```

## Critérios de aceite

- [ ] Evento muda de fase sozinho nos horários configurados
- [ ] Com N unidades disponíveis, no máximo N clientes ficam em 2/3 ao mesmo tempo
- [ ] Chamado que não reserva em `CheckoutWindowSeconds` vira Expirado, e o próximo é chamado no ciclo seguinte
- [ ] Reserva expirada devolve a unidade (`UnitsReserved` volta)
- [ ] Os três commands têm teste unitário com relógio injetável (`TimeProvider`), sem `DateTime.UtcNow` direto
- [ ] Duas instâncias da API rodando juntas não chamam a mesma entrada duas vezes
- [ ] Logs estruturados por ciclo: eventos avançados, chamados, expirados

## Verificação

Criar um evento com `QueueOpensAt` daqui a 1 min, `DropStartsAt` daqui a 2 min e 3 unidades. Entrar com 5 clientes (`X-Customer-Id` 1..5) e acompanhar `status/{id}` de cada um: os 3 primeiros viram Chamado quando o drop inicia; sem reservar, expiram após a janela e os 2 restantes são chamados.

## Referências

- `CONTRATO-API.md` §3 (tabelas de status)
- Task 12 (`Queue:CheckoutWindowSeconds`) e task 11 (fonte do estoque)
- `StaticEntity/DropEventStatus`, `QueueEntryStatus`, `DropReservationStatus`

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §3 e as tasks 11 e 12. No
backend/DROP-Ecommerce, crie um BackgroundService DropProgressionWorker que a cada
Queue:TickSeconds executa três commands MediatR: AdvanceDropEventPhasesCommand (fases por
data e esgotamento), CallNextInQueueCommand (promove Aguardando→Chamado até o limite de
unidades livres, no máximo Queue:MaxCallsPerTick) e ExpireQueueEntriesCommand (expira
chamados fora da janela e reservas vencidas, devolvendo UnitsReserved). Use TimeProvider
injetável, IgnoreQueryFilters com filtro manual de IsDeleted, transação por command e
pg_try_advisory_lock para instância única. Testes unitários dos três commands.
```
