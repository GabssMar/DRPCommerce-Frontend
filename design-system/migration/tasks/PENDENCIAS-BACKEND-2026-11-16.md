# Pendências do back-end encontradas nos testes pelas telas (16/11/2026)

Testes de navegador (Playwright, Chrome) passando pelas **telas do front**, contra o pacote `backend-local` (commit `42ccf6b-dirty`). Nenhum teste chamou endpoint direto: quem monta as requisições é o próprio front.

| Fluxo testado | Resultado |
|---|---|
| Painel: login, navegação, F5, logout | ✅ |
| Catálogo: criar categoria, criar e editar produto | ✅ (depois de correção no front) |
| Drop: criar com variante, F5, abrir inscrições | ✅ (depois de correção no front) |
| Conta do cliente: as 9 rotas `storefront/auth/*` e `storefront/me` | ✅ **só contornando o Gateway** (item 1) |

---

## 1. O Gateway perde o Host: toda rota `storefront/*` responde 404 — **bloqueante**

A loja do cliente é resolvida pelo Host (`dominio_empresa.normalized_host = teste.stores.localhost`, ativo e verificado). O YARP troca o Host pelo do destino (`localhost:5001`) e o Store não lê o `X-Forwarded-Host`.

| Caminho (`GET /api/storefront/auth/csrf`) | Resultado |
|---|---|
| Store direto (5001), `Host: teste.stores.localhost` | 200 |
| Gateway (5000), mesmo Host | 404 `Enterprise.Unavailable` |
| Front (5173 → Gateway) | 404 `Enterprise.Unavailable` |

```json
{"title":"Loja indisponível.","status":404,"code":"Enterprise.Unavailable"}
```

`app/gateway/appsettings.json` hoje só tem `PathRemovePrefix` nas rotas.

**Correção sugerida (recomendada):** no Store (e no Drop, se ele também resolver a loja pelo Host), `UseForwardedHeaders` com `ForwardedHeaders.XForwardedHost | XForwardedFor | XForwardedProto`, aceitando os cabeçalhos **só do Gateway** (`KnownProxies`/`KnownNetworks`), senão qualquer um troca de loja forjando o cabeçalho. O YARP já envia `X-Forwarded-*` por padrão.

**Alternativa testada:** `{ "RequestHeaderOriginalHost": "true" }` nas rotas do Gateway. O 404 vira **502**: com o Host original, a conexão HTTPS Gateway → Store passa a usar `teste.stores.localhost` e o certificado local só vale para `localhost` (hipótese — não confirmei desligando a validação). Por isso a primeira opção é mais simples.

**Como conferir:** `curl -k -H "Host: teste.stores.localhost" https://localhost:5000/api/store/api/storefront/auth/csrf` deve responder 200.

## 2. Falta rota de cliente para o documento (CPF)

A tela **Minha conta** mostra e envia o CPF. Não existe rota em `storefront/`, então o front usa o CRUD da equipe com o token do cliente:

| Chamada do front | Resposta |
|---|---|
| `GET /api/store/api/documents/get-all` (token de cliente) | 401, corpo vazio |
| `POST /api/store/api/documents/add` (envio do CPF) | não testado — deve dar o mesmo 401 |

Hoje a seção de CPF não carrega para nenhum cliente. **Pedido:** `GET storefront/me/documents` e `POST storefront/me/documents` (o back carimba `referenceType = Customer`, `referenceId` e a loja pela sessão).

Mesma situação, já listada em `TELAS-DESIGN.md` §83: entrar/sair da lista de espera, canais de aviso, cancelar inscrição, excluir notificação e criar pedido da vitrine usam CRUD da equipe com token de cliente.

## 3. Limite de requisições da autenticação conta por IP — risco atrás do Gateway

As rotas de autenticação usam `SlidingWindowLimiter` (políticas `auth`, `login`, `change-password`…). Em teste, depois de ~15 chamadas de autenticação em ~1 minuto do mesmo IP, **até `register` e `login` de contas novas** passaram a responder 429 — o limite é por IP, não por conta.

Atrás do Gateway, sem o item 1 resolvido, o Store vê **o IP do Gateway para todos os clientes**: o limite viraria um só para a loja inteira, e alguns clientes tentando entrar bloqueariam todos. Confirmar a chave da partição e ler o IP real do `X-Forwarded-For` (vem junto com a correção do item 1).

## 4. O 429 foge do padrão de erro

```json
{"code":"Security.RateLimited","message":"Muitas requisições. Tente novamente depois."}
```

Todos os outros erros vêm em ProblemDetails (`type`, `title`, `status`, `code`, `traceId`). O 429 também **não manda `Retry-After`**, então a tela não consegue dizer quando tentar de novo. **Pedido:** ProblemDetails com `status: 429`, `code` e o cabeçalho `Retry-After` (o front já lê os dois).

---

## Para conferir com o back: validações que o front passou a cumprir

O front foi ajustado para o que o back exige hoje. Se alguma regra não for intencional, avisem:

| Regra do back | O que o front fazia | Agora |
|---|---|---|
| Produto: `height`, `width`, `length` > 0 | Não tinha os campos e mandava `0` (400) | Campos Altura, Largura, Comprimento (cm) e Peso obrigatórios, > 0 |
| Drop: `bannerImageUrl` obrigatório | Tratava como opcional ("Sem banner: usa a capa") e mandava vazio (400) | Sem banner, envia a capa como banner; capa obrigatória |
| `dateOfBirth` gravado como data (`1995-04-20T00:00:00Z`) | Convertia pelo fuso e cada "Salvar" voltava um dia | Data de calendário, sem fuso |

Unidade das dimensões: o front usa **cm** e o peso em **kg**. Confirmar se é a mesma do back (frete).
