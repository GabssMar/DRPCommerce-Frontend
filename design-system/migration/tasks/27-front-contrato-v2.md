# [API · Front-end] Contrato v2 do back-end: prefixo do Gateway, envelope `Result`, paginação e erros

**Depende de:** task 15 · **Bloqueia:** 28–42 · Fonte: [Endpoints.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Api/Endpoints.md) (03/11/2026)

## Funcionalidade alterada

Nenhuma tela muda. O que muda é **a forma como o front chama o back-end**, para que `VITE_API_MODE=http` funcione com a API documentada em 03/11.

## Estado atual

- `config.js` usa `STORE_BASE = '/api/store'` e `DROP_BASE = '/api/drop'`. O Gateway **remove** esse prefixo (`PathRemovePrefix`) e os controllers esperam `/api/...`: `/api/store/products/get-all` chega ao Store como `/products/get-all` → **404 em toda chamada**. A documentação do back fixa o caminho externo como `/api/store/api/storefront/cart`.
- `http.js` só desembrulha `content`. As rotas novas usam `Result<T>` (`isSuccess`, `content`, `errors`, `listMessageErrors`), mas identidade, `storefront/me`, `storefront/store` e `storefront/products` (legado) devolvem **DTO direto**; desativação de funcionário e `DELETE me` devolvem **204** sem corpo.
- Não existe tipo de paginação: o back passou a devolver `PagedResponse<T>` (`items`, `totalCount`, `page`, `pageSize`) nas rotas `search`.
- `api-error.js` não diferencia 409 (conflito/estoque/estado), 412 (versão antiga), 428 (falta `If-Match`), 429 (limite) e 503 (dependência indisponível).

## Como implementar

1. **Prefixo:** `STORE_BASE` → `/api/store/api`, `DROP_BASE` → `/api/drop/api` (valores padrão e `.env.example`). `urlFor` e `sf.store/sf.drop` continuam iguais. Atualize as rotas do `mock/server.js` para o mesmo caminho.
2. **Envelope:** `request()` aceita os três formatos: `Result<T>` → `content`; DTO direto → o próprio corpo; 204 → `null`. Decida pelo corpo (`'isSuccess' in body`), não por lista de rotas.
3. **Paginação:** `services/paging.js` com `toPage(response)` → `{ items, total, page, pageSize, pages }` e o helper de query (`page`, `pageSize`, `sort`, filtros vazios omitidos). Os limites do back são `page` de 1 a 100.000 e `pageSize` de 1 a 100.
4. **Erros:** `ApiError` ganha `kind`: `validation` (400, com campos de `errors`), `auth` (401), `forbidden` (403), `not-found` (404), `conflict` (409, com o `code` do ProblemDetails, por exemplo `Inventory.OrderReservationProtected`), `stale` (412), `precondition` (428), `rate-limit` (429, lê `Retry-After`) e `unavailable` (503). `LoadState` mostra uma mensagem por `kind`.
5. **Cabeçalhos expostos:** leia `ETag` e `Retry-After` da resposta (o CORS do back já os expõe); `request()` devolve `{ data, etag }` quando chamado com `{ withMeta: true }`.
6. **Atualize `CONTRATO-API.md`:** a seção do Gateway passa a citar o caminho duplo e a tabela de formatos de resposta.

## Critérios de aceite

- [ ] Com o back local e `VITE_API_MODE=http`, `GET /api/store/api/storefront/store` responde 200 pelo front
- [ ] Nenhum componente trata `content` ou `isSuccess`: só `src/services/`
- [ ] Rotas 204 resolvem para `null` sem erro de parse
- [ ] 409, 412, 428 e 429 chegam às telas com `kind` próprio
- [ ] O mock responde nas mesmas URLs novas

## Verificação

```bash
grep -rn "'/api/store'\|'/api/drop'" src/services   # só em config.js, como base antiga documentada
grep -rn "isSuccess\|\.content\b" src/components     # 0
npm run lint && npm run build
```

## Para o Claude Code

> Leia `CONTRATO-API.md` e `Documentation/Store/Api/Endpoints.md` (seção "Como chamar e interpretar"). Altere só `src/services/` (`config.js`, `http.js`, `api-error.js`, novo `paging.js`, `mock/server.js`), `.env.example`, `ui/LoadState.vue` e `CONTRATO-API.md`. Não troque rotas de tela nesta task: as rotas novas entram nas tasks 28–42.
