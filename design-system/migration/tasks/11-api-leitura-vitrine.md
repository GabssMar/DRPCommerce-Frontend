# [API · Back-end] Endpoints de leitura da vitrine: drops públicos, slug e estoque por evento

**Depende de:** task 10

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API · MediatR · FluentValidation · EF Core 9 + Npgsql (PostgreSQL) |
| Gateway | `Commerce.Gateway` com **YARP** (porta 5000) |
| Padrões | `Result<T>` + `ResultHttpExtensions` (erros em ProblemDetails), controllers herdando `BaseController` |
| Consumidor | Front-end **Vue 3** + Vite (porta 5173). Contrato em `CONTRATO-API.md` |

## Funcionalidade alterada

As consultas que alimentam o **portal de drops**, o **detalhe do drop** e a **barra de estoque**. Só leitura, sem regra de negócio nova.

## Estado atual

- Só existem as rotas CRUD genéricas (`get-all`, `get-by-id`, `get-list-by-list-id`).
- `get-all` de eventos devolve **tudo** do tenant, inclusive rascunhos (1) e cancelados (8), e ignora `IsPublic`.
- Não há como buscar os produtos **de um evento**: o front chama `GET /api/drop-product?dropEventId=`, que não existe.
- Os repositórios já têm os métodos, sem handler nem rota: `IDropEventRepository.GetBySlugAsync`, `IDropEventRepository.GetActiveEventsAsync` (só status 5) e `IDropProductRepository.GetByEventAsync`.

## Como implementar

Três queries MediatR novas, nos controllers existentes (as rotas ficam ao lado das do `BaseController`):

| Rota | Query / handler | Regra |
|---|---|---|
| `GET /api/drop-events/get-public` | `GetPublicDropEventQuery` | `IsPublic == true` e `DropEventStatusId` **fora** de {1 Rascunho, 8 Cancelado}, ordenado por `QueueOpensAt` |
| `GET /api/drop-events/get-by-slug/{slug}` | `GetBySlugDropEventQuery` | usa `GetBySlugAsync`; 404 (`Error.NotFound("DropEvent.NotFound", …)`) se não achar |
| `GET /api/drop-products/get-by-event/{dropEventId}` | `GetByEventDropProductQuery` | usa `GetByEventAsync`; só `IsActive == true`; lista vazia se o evento não tiver produtos |

Detalhes:

- Adicione `GetPublicEventsAsync` ao `IDropEventRepository`. **Não reaproveite** `GetActiveEventsAsync`: o portal também mostra drops agendados e encerrados.
- `get-by-event` precisa respeitar o tenant: confirme que o `DropEvent` do `dropEventId` é visível no tenant atual (o filtro global cobre `DropEvent`, mas **não** `DropProduct`). Evento de outra loja → 404.
- Sem `Include` de navegações: as respostas seguem o formato atual (ids, sem objetos aninhados).
- Validators FluentValidation: `dropEventId > 0`, `slug` não vazio.

### Decisão a registrar nesta task: fonte do estoque

`DropEvent` tem `TotalUnitsAvailable`, `UnitsReserved` e `UnitsSold`, e `DropProduct` tem `UnitsAllocated` e `UnitsSold`. Definir e documentar em `CONTRATO-API.md` §4 (Estoque) qual o front deve exibir. **Proposta:** `DropProduct` é a fonte, e o evento é agregado, atualizado pelos casos de uso da task 14.

## Critérios de aceite

- [ ] `get-public` não devolve eventos com status 1 ou 8 nem `IsPublic == false`
- [ ] `get-by-slug` devolve 200 para slug existente e 404 com `code` para inexistente
- [ ] `get-by-event` devolve só produtos ativos daquele evento; evento de outro tenant → 404
- [ ] Rotas acessíveis pelo Gateway (`/api/drop/drop-events/get-public` etc.)
- [ ] Decisão sobre a fonte do estoque registrada no `CONTRATO-API.md`
- [ ] Testes dos três handlers (sucesso, vazio, não encontrado)
- [ ] Swagger lista as três rotas novas

## Verificação

```bash
H='-H X-Enterprise-Id:1'
curl -s $H http://localhost:5000/api/drop/drop-events/get-public
curl -s $H http://localhost:5000/api/drop/drop-events/get-by-slug/veloce-cyber-edition-s-x1
curl -s $H http://localhost:5000/api/drop/drop-products/get-by-event/1
```

## Referências

- `CONTRATO-API.md` §4: seções "Portal", "Detalhe do drop" e "Estoque"
- `DropCommerce.Domain/Interfaces/IDropEventRepository.cs`, `IDropProductRepository.cs`
- Handlers base em `DropCommerce.Application/Features/Commands/Base/Handlers/`

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §4. No backend/DROP-Ecommerce,
crie três queries MediatR com handlers e validators: GetPublicDropEventQuery
(GET /api/drop-events/get-public: IsPublic e status fora de 1 e 8, ordenado por QueueOpensAt,
com novo GetPublicEventsAsync no repositório), GetBySlugDropEventQuery
(GET /api/drop-events/get-by-slug/{slug}, 404 com Error.NotFound) e GetByEventDropProductQuery
(GET /api/drop-products/get-by-event/{dropEventId}, só ativos, 404 se o evento não for
visível no tenant). Siga o padrão Result<T> + HandleResult dos controllers existentes.
Registre no CONTRATO-API.md a decisão sobre a fonte do estoque.
```
