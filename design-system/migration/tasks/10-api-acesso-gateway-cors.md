# [API · Back-end] Acesso do front à API: rota do Gateway, CORS, tenant e cliente provisórios

**Bloqueia todas as tasks de integração (11–18).** Sem ela, nenhuma chamada do navegador chega à API do Drop.

## Tecnologias

| Camada | Stack |
|---|---|
| Back-end | **C# / .NET 9**, ASP.NET Core Web API · MediatR · FluentValidation · EF Core 9 + Npgsql (PostgreSQL) |
| Gateway | `Commerce.Gateway` com **YARP** (porta 5000) |
| Padrões | `Result<T>` + `ResultHttpExtensions` (erros em ProblemDetails), controllers herdando `BaseController` |
| Consumidor | Front-end **Vue 3** + Vite (porta 5173). Contrato em `CONTRATO-API.md` |

## Funcionalidade alterada

O caminho de rede entre o navegador e o `DropCommerce.Api`: roteamento do Gateway, política de CORS e a identificação de **loja** (tenant) e **cliente** em cada requisição.

## Estado atual

1. **Rota do Gateway quebrada.** `rota_drop` casa `/api/drop/{**catch-all}` e aplica `PathRemovePrefix: /api/drop`. `GET /api/drop/drop-events/get-all` chega na API como `/drop-events/get-all`, mas os controllers estão em `/api/drop-events/...`: **404**. O mesmo vale para `rota_store`.
2. **Sem CORS** em nenhum dos três serviços (`AddCors` não existe). O navegador bloqueia qualquer chamada vinda de outra origem.
3. **Tenant só por JWT, e não há JWT.** `TenantProvider` lê a claim `EnterpriseId` e devolve `0` se não houver. O filtro global de `DropEvent` (`EnterpriseId == tenant`) faz **toda consulta de evento voltar vazia**.
4. **Cliente inexistente.** O front manda `customerId: 1` fixo no corpo. Não há como o back saber quem está na fila.
5. `app.UseHttpsRedirection()` com a API servindo só `http://localhost:5002`.
6. `DropCommerce.Api.http` ainda aponta para `/weatherforecast` na porta 5069 (resto do template).

## Como implementar

### 1. Corrigir as rotas do Gateway

```json
// Commerce.Gateway/appsettings.json
"rota_drop": {
  "ClusterId": "cluster_drop",
  "Match": { "Path": "/api/drop/{**catch-all}" },
  "Transforms": [ { "PathPattern": "/api/{**catch-all}" } ]
},
"rota_store": {
  "ClusterId": "cluster_store",
  "Match": { "Path": "/api/store/{**catch-all}" },
  "Transforms": [ { "PathPattern": "/api/{**catch-all}" } ]
}
```

Resultado: `GET /api/drop/drop-events/get-all` → `GET /api/drop-events/get-all` no Drop. Atualizar o exemplo de `Documentation/Shared/StartupProject.md`, que hoje diz que a rota chega como `/products`.

### 2. CORS no Gateway (único ponto de entrada)

```csharp
// Commerce.Gateway/Program.cs
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()!)
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .WithHeaders("Content-Type", "X-Enterprise-Id", "X-Customer-Id")
    .WithExposedHeaders("Date")));
// …
app.UseCors("frontend");
app.MapReverseProxy();
```

```json
"Cors": { "AllowedOrigins": [ "http://localhost:5173" ] }
```

`Date` exposto porque o front usa a hora do servidor no countdown. Em dev, o front também pode usar o proxy do Vite (mesma origem), mas o CORS precisa existir para homologação e produção.

### 3. Tenant por cabeçalho (provisório)

`TenantProvider.GetEnterpriseId()`: se não houver claim `EnterpriseId`, ler o cabeçalho `X-Enterprise-Id`. Continua devolvendo `0` se nenhum dos dois existir.

### 4. Cliente por cabeçalho (provisório)

Criar `ICustomerProvider` (Domain/Interfaces) + `CustomerProvider` (Infrastructure), no mesmo molde do `TenantProvider`: claim `CustomerId` primeiro, cabeçalho `X-Customer-Id` como fallback. Os casos de uso das tasks 12 e 14 usam **só** esse provider: `customerId` nunca vem do corpo da requisição.

> ⚠️ **Os passos 3 e 4 são inseguros por definição**: qualquer cliente forja o cabeçalho. Deixar um comentário `// TODO(auth)` nos dois providers e registrar em `CONTRATO-API.md` §7. Antes de produção, os dois valores vêm de JWT.

### 5. Limpeza

- `UseHttpsRedirection()` só fora de Development.
- `DropCommerce.Api.http`: trocar o `weatherforecast` por requisições reais via Gateway (`http://localhost:5000/api/drop/drop-events/get-all` com os dois cabeçalhos).

## Critérios de aceite

- [ ] `GET http://localhost:5000/api/drop/drop-events/get-all` com `X-Enterprise-Id` devolve 200 com os eventos daquela loja
- [ ] Sem `X-Enterprise-Id`, a mesma chamada devolve lista vazia (o filtro de tenant continua valendo)
- [ ] Preflight `OPTIONS` vindo de `http://localhost:5173` responde com `Access-Control-Allow-Origin` e com os dois cabeçalhos permitidos
- [ ] `Access-Control-Expose-Headers: Date` presente
- [ ] `ICustomerProvider` registrado no DI e coberto por teste (claim > cabeçalho > 0)
- [ ] `Documentation/Shared/StartupProject.md` e `DropCommerce.Api.http` atualizados
- [ ] `dotnet build` sem warnings novos

## Verificação

```bash
curl -i http://localhost:5000/api/drop/drop-events/get-all -H "X-Enterprise-Id: 1"
curl -i -X OPTIONS http://localhost:5000/api/drop/drop-events/get-all \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-enterprise-id,x-customer-id"
```

## Referências

- `CONTRATO-API.md` §1 (topologia) e §4 (cabeçalhos)
- `backend/Documentation/Shared/Infrastructure.md`: multi-tenancy e `TenantProvider`
- `backend/Documentation/Shared/StartupProject.md`: portas e rotas

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md (§1, §4 e §7).
No backend/DROP-Ecommerce: troque PathRemovePrefix por PathPattern "/api/{**catch-all}" nas
duas rotas do Gateway; adicione CORS no Commerce.Gateway (origens em Cors:AllowedOrigins,
cabeçalhos X-Enterprise-Id e X-Customer-Id, expor Date); faça o TenantProvider aceitar o
cabeçalho X-Enterprise-Id quando não houver claim; crie ICustomerProvider/CustomerProvider
(claim CustomerId, fallback X-Customer-Id) com TODO(auth); limite UseHttpsRedirection a
fora de Development; atualize StartupProject.md e DropCommerce.Api.http.
Não altere controllers nem handlers existentes.
```
