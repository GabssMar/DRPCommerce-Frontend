# Testes do front contra o back-end local (15/11/2026)

Validação da task 27 (contrato v2) contra o pacote `backend-local` rodando na máquina de desenvolvimento.

| Item | Valor |
|---|---|
| Pacote do back | `backend-local`, commit `42ccf6b-dirty`, publicado em 05/11/2026 |
| Gateway | `https://localhost:5000`, sem Swagger |
| Store | `https://localhost:5001`, Swagger com 277 rotas |
| Drop | `https://localhost:5002`, Swagger com 167 rotas |
| Bancos | PostgreSQL por túnel SSH (MobaXterm): Store em `localhost:5433`, Drop em `localhost:5432` |
| Front | branch `feat/27-contrato-v2`, `VITE_API_MODE=http`, proxy do Vite na porta 5179 |

**Legenda:** ✅ passou · ❌ falhou · ⚠️ passou com ressalva ou comportamento inesperado do back · ⏭️ não testado

---

## 1. Resumo

| Área | Resultado |
|---|---|
| Caminho no Gateway (`/api/<serviço>/api/...`) | ✅ confirmado |
| Autenticação da equipe: CSRF, login, cookie de refresh, seleção de loja, renovação, F5, logout | ✅ depois da correção do CSRF no front |
| Formatos de resposta: `Result<T>`, DTO direto e paginação | ✅ |
| Erros com `kind`: 400, 401, 403, 404 e 429 | ✅ |
| Erros com `kind`: 409, 412 e 428 | ⏭️ sem dado no banco para provocar |
| Vitrine (`storefront/*`) pelo Gateway | ❌ 404 `Enterprise.Unavailable`, falha do back (§5.1) |
| Mock nas URLs novas | ✅ |
| `npm run lint` e `npm run build` | ✅ |

---

## 2. Preparação do ambiente

| # | Problema encontrado | Causa | Ação |
|---|---|---|---|
| 1 | As três URLs informadas eram `https://localhost:5002/swagger` | Engano na mensagem | Portas conferidas: Store 5001, Drop 5002, Gateway 5000 |
| 2 | Toda rota que acessa o banco respondia 500 | O `config.env` vindo de outra máquina apontava para 15432/15433; os túneis desta máquina estão em 5432/5433 | Só as portas trocadas no `config.env` (backup em `config.env.bak-15432`) e back reiniciado |
| 3 | Proxy do Vite sem resposta | Apontava para `http://localhost:5000`; o Gateway só atende HTTPS | Corrigido no front (§6, item 2) |

---

## 3. Testes de rota (curl direto no Gateway e no Store)

### 3.1 Identidade e loja (backoffice)

| Rota (pelo Gateway, prefixo `/api/store/api`) | Cenário | Esperado | Obtido | |
|---|---|---|---|---|
| `GET /auth/csrf` | sem sessão | 200 `{ requestToken, headerName }` + cookie `__Host-Commerce-Csrf` | 200 | ✅ |
| `GET /api/store/storefront/store` (sem o `/api` duplo) | caminho antigo | não chegar ao controller | 401 | ✅ confirma o caminho duplo |
| `POST /auth/register` | senha com 11 caracteres | 400 | 400 `Identity.PasswordPolicy` "A senha deve ter entre 12 e 128 caracteres." | ✅ |
| `POST /auth/register` | banco fora do ar | — | 500 `Server.Unexpected` | ⚠️ ambiente (§2, item 2) |
| `POST /auth/register` | dados válidos | 200 | 200, usuário id 1 | ✅ |
| `POST /auth/login` | e-mail inexistente com banco fora do ar | 401 | 500 | ⚠️ ambiente |
| `POST /auth/login` | credenciais válidas | 200 | 200 `{ accessToken, accessTokenExpiresAt, requiresEnterpriseSelection: false, enterprises: [] }` | ✅ |
| `POST /enterprises/register` | corpo com acento corrompido pelo terminal | 400 | 400 de conversão de JSON | ✅ problema do teste, não do back |
| `POST /enterprises/register` | slug `teste` | 200 | 200 `{ id: 1, tradeName: "Loja Teste", isActive: true }` | ✅ |
| `GET /enterprises/mine` | antes e depois de criar a loja | lista de vínculos | `[]` e depois `[{ membershipId: 1, enterpriseId: 1, ... }]` | ✅ |
| `POST /auth/select-enterprise` | CSRF pedido **sem** Bearer | 200 | 403 "Token CSRF inválido." | ❌ levou à correção do front (§6, item 4) |
| `POST /auth/select-enterprise` | CSRF pedido **com** Bearer | 200 | 200 com token da loja | ✅ |
| `GET /enterprise-domains/get-all` | loja selecionada | domínio criado com a loja | `teste.stores.localhost`, primário, verificado e ativo | ✅ |
| `GET /store-settings` | loja selecionada | `Result` | 200 `Result`, configurações padrão criadas com a loja | ✅ |
| `GET /products/search?Page=1&PageSize=5` | loja selecionada | `PagedResponse` | 200 `Result` com `{ items: [], totalCount: 0, page: 1, pageSize: 5 }` | ✅ |
| `GET /categories/tree` | loja selecionada | `Result` | 200 `[]` | ✅ |
| `GET /internal/tenants/resolve` (Store direto) | sem chave de serviço | 401 | 401 `Security.InvalidService` | ✅ rota interna, fora do front |

### 3.2 Vitrine (resolução da loja pelo subdomínio)

Domínio base configurado no back: `Security__StorefrontBaseDomain=stores.localhost`.

| Rota | Cabeçalho | Obtido | |
|---|---|---|---|
| Gateway `GET /api/store/api/storefront/store` | sem Host de loja, banco fora do ar | 500 | ⚠️ ambiente |
| Gateway `GET /api/store/api/storefront/store` | `Host: teste.stores.localhost` | 404 `Enterprise.Unavailable` | ❌ |
| Gateway `GET /api/store/api/storefront/store` | `Host: teste.stores.localhost:5000` | 404 `Enterprise.Unavailable` | ❌ |
| Gateway `GET /api/store/api/storefront/store` | `X-Forwarded-Host: teste.stores.localhost` | 404 `Enterprise.Unavailable` | ❌ |
| Gateway `https://teste.stores.localhost:5000/...` (DNS para 127.0.0.1) | Host real | 404 `Enterprise.Unavailable` | ❌ |
| **Store direto** `GET /api/storefront/store` | `Host: teste.stores.localhost` | **200** `Result` com `tradeName`, `currencyCode`, `minOrderValue` | ✅ |
| Store direto `GET /api/storefront/store` | `Host: teste.stores.localhost:5001` | 200 | ✅ |
| Store direto `GET /api/storefront/store` | `X-Forwarded-Host: teste.stores.localhost` | 404 | ❌ o Store ignora o cabeçalho |
| Gateway `GET /api/drop/api/storefront/drop/events` | banco fora do ar | 503 `Security.StoreUnavailable` | ⚠️ ambiente |
| Gateway `GET /api/drop/api/storefront/drop/events` | `Host: teste.stores.localhost` | 404 `Enterprise.Unavailable` | ❌ mesma causa |

**Conclusão:** o Store resolve a loja pelo `Host`, mas o Gateway (YARP) troca o `Host` pelo do destino e o Store ignora `X-Forwarded-Host`. Detalhes em §5.1.

### 3.3 Limite de requisições

| Rota | Cenário | Obtido | |
|---|---|---|---|
| `POST /auth/login` | vários logins seguidos durante os testes | 429 `{ "code": "Security.RateLimited", "message": "Muitas requisições. Tente novamente depois." }` | ✅ o limite funciona |
| `GET /auth/csrf` | durante a janela do limite | 429 | ⚠️ o limite cobre todo o grupo `auth/*` |
| cabeçalho `Retry-After` | no 429 | ausente | ⚠️ §5.2 |

---

## 4. Teste ponta a ponta com o código do front

Os módulos reais de `src/services` (`auth.js`, `http.js`, `paging.js`, `api-error.js`, `session.js`), carregados pelo Vite em modo `http`, chamaram o back pelo proxy do Vite. Só o navegador foi simulado: um `fetch` que guarda cookies, inclusive os `__Host-`.

| # | Funcionalidade | Chamada | Esperado | Obtido | |
|---|---|---|---|---|---|
| 1 | Rota protegida sem sessão | `GET products/search` | `ApiError` 401, `kind: auth` | 401 `auth` | ✅ |
| 2 | Login da equipe | `auth.loginEmployee()` (CSRF + login) | sessão em memória + cookies | access token e cookies `__Host-Commerce-Csrf` e `__Host-DRP-BackofficeRefresh` | ✅ |
| 3 | DTO direto | `GET enterprises/mine` | lista crua | lista com a Loja Teste | ✅ |
| 4 | Seleção de loja | `auth.selectEnterprise(1)` | novo token com a loja | 200 | ✅ (❌ antes da correção) |
| 5 | Paginação | `GET products/search` + `toPage()` | `{ items, total, page, pageSize, pages }` | `{ items: [], total: 0, page: 1, pageSize: 5, pages: 0 }` | ✅ |
| 6 | Envelope `Result` | `GET categories/tree` | `content` desembrulhado | `[]` | ✅ |
| 7 | `withMeta` | `GET store-settings` | `{ data, etag }` | `data` certo, `etag: null` (o back não manda ETag aqui) | ✅ |
| 8 | 404 | `GET products/get-by-id/999999` | `kind: not-found` + mensagem do back | 404 `not-found` `Product.NotFound` "Product com id 999999 não encontrado." | ✅ |
| 9 | 400 | `POST categories/add` com `{}` | `kind: validation` | 400 `validation` "The name field is required." | ✅ |
| 10 | Drop pelo Gateway | `GET drop/api/drop-events/get-all` | 200 | `[]` | ✅ |
| 11 | Renovação automática | token trocado por um inválido + `GET enterprises/mine` | 401 → `refresh` pelo cookie → repete | renovou e devolveu a lista | ✅ |
| 12 | F5 | `clearSession` + `auth.restoreSession()` | `true` | `true` | ✅ |
| 13 | Vitrine | `GET storefront/store` | 404 pelo Gateway (§3.2) | 404 `not-found` `Enterprise.Unavailable` | ✅ o front trata; o defeito é do back |
| 14 | Logout | `auth.logoutEmployee()` | sem erro, sessão limpa | ok | ✅ |
| 15 | Renovar depois do logout | `auth.restoreSession()` | `false` | `false` | ✅ |
| 16 | PUT sem `If-Match` | `PUT store-settings` | 428 se a rota exigir versão | 200 | ⚠️ a rota não usa versão |
| 17 | PUT com `If-Match` antigo | `PUT store-settings` | 412 se a rota exigir versão | 200 | ⚠️ idem |
| 18 | Criar categoria | `POST categories/add` (`name`, `slug`, `isActive`) | 200 | 400 "The imageUrl field is required." | ⚠️ `imageUrl` é obrigatório (vale para a task 35) |
| 19 | Sessões ativas | `GET auth/sessions` | lista | lista com `familyId`, `createdAt`, `expiresAt`, `isCurrent` | ✅ |
| 20 | Limite no login | `auth.loginEmployee()` repetido | `kind: rate-limit` | 429 `rate-limit` `Security.RateLimited`, `retryAfter: null` | ✅ |
| 21 | Temas | `GET appearance-themes` | lista | `[]` | ✅ |
| 22 | Aparência | `GET appearances` | estado da aparência | `{ target: "store", publishedRevisionId: null, version: 0, ... }`, sem ETag | ✅ |
| 23 | Sessão de edição de aparência | `POST appearances/edit-sessions` com `{}` | sessão + ETag | 400 "The ThemeKey field is required." | ⏭️ não há tema no banco |

### 4.1 Testes do mock e das funções puras (sem back)

| Teste | Resultado | |
|---|---|---|
| Mock: `/api/store/api/storefront/store`, `/api/drop/api/storefront/drop/events`, `/api/store/api/products/get-all`, `/api/drop/api/drop-events/get-all` | 200 | ✅ |
| Mock: caminho antigo `/api/store/products/get-all` | 404 | ✅ |
| `searchQuery({ page: 0, pageSize: 500, term: 'tênis', categoryId: null, statusIds: [1, 2] })` | `?Page=1&PageSize=100&Term=t%C3%AAnis&StatusIds=1&StatusIds=2` (limites aplicados, filtro vazio omitido) | ✅ |
| `toPage({ items: [1, 2], totalCount: 45, page: 2, pageSize: 20 })` | `pages: 3` | ✅ |
| `ApiError.fromResponse` com 400, 409, 412, 428, 429, 503 e 500 | `validation`, `conflict`, `stale`, `precondition`, `rate-limit` (lê `Retry-After`), `unavailable`, `server`; 5xx com mensagem genérica | ✅ |

---

## 5. Pendências do back-end

### 5.1 Vitrine não funciona pelo Gateway (bloqueante)

- **Sintoma:** toda rota `storefront/*` do Store e do Drop responde 404 `Enterprise.Unavailable` pelo Gateway, mesmo com `Host: teste.stores.localhost`.
- **Causa:** o YARP repassa a requisição com o `Host` do destino (`localhost:5001`). O Store resolve a loja pelo `Host` e não lê `X-Forwarded-Host`.
- **Correção sugerida (uma das duas):**
  - no Gateway, preservar o Host original nas rotas (`"Transforms": [{ "RequestHeaderOriginalHost": "true" }]`);
  - no Store, aplicar `ForwardedHeaders` (`XForwardedHost`) confiando no Gateway.
- **Como validar:** `curl -k https://localhost:5000/api/store/api/storefront/store -H "Host: teste.stores.localhost"` deve responder 200.

### 5.2 Formato do 429

O 429 vem como `{ code, message }`, fora do ProblemDetails e sem `Retry-After`, e o limite bloqueia até `GET auth/csrf`. O front já lida com isso: usa `message` e mostra uma espera genérica. Mandar `Retry-After` permitiria mostrar o tempo exato.

### 5.3 Documentação divergente

- `storefront/store` devolve `Result<T>`; a documentação de 03/11 dizia DTO direto. O front decide pelo corpo, então funciona nos dois casos.
- `store-settings` não usa `ETag` nem `If-Match`. Só as sessões de edição de aparência exigem versão.

### 5.4 Sem temas no banco

`GET appearance-themes` volta vazio, e os temas só podem ser criados por rota interna (`POST /api/internal/appearance-themes`, com chave de serviço). Sem um tema não dá para abrir sessão de edição de aparência nem testar 412 e 428. Um seed de tema destrava os testes da task 42.

---

## 6. Correções feitas no front

| # | Arquivo | Problema | Correção | Validado por |
|---|---|---|---|---|
| 1 | `src/services/config.js`, `.env.example`, `src/services/mock/server.js` | Bases `/api/store` e `/api/drop` não chegavam aos controllers | Bases `/api/store/api` e `/api/drop/api`; mock nas mesmas URLs | §3.1, §4 e §4.1 |
| 2 | `vite.config.js` | Proxy para `http://localhost:5000`, onde nada responde | Alvo `https://localhost:5000` (ou `VITE_GATEWAY_URL`), `secure: false` para o certificado de dev | §4 inteiro |
| 3 | `vite.config.js` | Proxy trocava o `Host` (`changeOrigin: true`), o que quebraria a vitrine | `changeOrigin: false` e `allowedHosts: ['.stores.localhost']`; abrir o front em `http://teste.stores.localhost:5173` | §3.2 (valida depois de §5.1) |
| 4 | `src/services/auth.js` | CSRF pedido sem sessão e reaproveitado: `select-enterprise`, `refresh` e `logout` dariam 403 "Token CSRF inválido." | CSRF pedido com o access token atual e guardado por token; muda a sessão, busca outro | §3.1 e §4 #4, #11, #14 |
| 5 | `src/services/api-error.js` | Erros sem categoria; 409, 412, 428 e 429 sem tratamento próprio | `kind` por status, `retryAfter`, mensagem genérica em 5xx, leitura de `message` (formato do 429) | §4 #1, #8, #9, #20 e §4.1 |
| 6 | `src/services/http.js` | Sem acesso a cabeçalhos; 204 dependia do parse | Lê `ETag` e `Retry-After`; `{ withMeta: true }` devolve `{ data, etag }`; 204 → `null` | §4 #7, #14 |
| 7 | `src/services/paging.js` (novo) | Não havia tipo de paginação | `toPage()` e `searchQuery()` com os limites do back | §4 #5 e §4.1 |
| 8 | `src/components/ui/LoadState.vue` | "Tentar de novo" em erros onde repetir não adianta | Botão escondido em `forbidden`, `not-found` e `validation`; tempo de espera no 429 | build e lint |
| 9 | `design-system/migration/tasks/CONTRATO-API.md` | Topologia e formatos desatualizados | Caminho duplo, portas, tabelas de formatos e erros, achados deste teste | — |

Todas as mudanças estão na branch `feat/27-contrato-v2`, **sem commit**.

### Fora do escopo da task 27

`src/components/QueueStatus.vue` ainda lê `isSuccess` e `content`, porque usa o simulador antigo (`api.js`). Isso sai nas tasks 16–18.

---

## 7. Entidades tocadas no banco

Os nomes das tabelas não aparecem na API, por isso a lista é por entidade. Tudo foi criado só para teste:

| Banco | Entidade | Registro |
|---|---|---|
| Store | Usuário (identidade) | id 1, `admin.teste@drp.local`, "Admin Teste" |
| Store | Loja (enterprise) | id 1, "Loja Teste", slug `teste` |
| Store | Vínculo usuário–loja (membership) | id 1, dono (`kindId` 1) |
| Store | Domínio da loja | id 1, `teste.stores.localhost`, primário e verificado (criado com a loja) |
| Store | Configurações comerciais | id 1, BRL, padrões (criadas com a loja) |
| Store | Sessões de login e tokens de refresh | várias, de cada login dos testes, encerradas no logout |
| Store / Drop | Produtos, categorias, eventos de drop, temas | só leitura; nada criado (o `categories/add` foi recusado por validação) |

A senha da conta de teste não fica neste arquivo; peça a quem rodou os testes.

---

## 8. Como repetir

1. Suba os túneis do banco (Store em 5433, Drop em 5432) e rode `Iniciar-Backend.bat`.
2. Confira: `curl -k https://localhost:5000/api/store/api/auth/csrf` deve dar 200.
3. No front: `VITE_API_MODE=http npm run dev` e abra `http://localhost:5173/#/admin` (painel) ou `http://teste.stores.localhost:5173` (vitrine, depois da correção §5.1).
4. Se vierem muitos 429, espere a janela do limite passar antes de repetir os logins.
