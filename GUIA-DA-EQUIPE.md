# DRPCommerce Frontend: guia para quem está chegando

Situação em **16/11/2026**. Este documento resume o projeto para quem vai pegar tasks: como ele está organizado, a stack, o que já foi feito, o que falta, o que já vem do back-end e o que ainda é mockado.

Documentos de referência (leia conforme a task):

| Assunto | Arquivo |
|---|---|
| Como rodar, modos mock/http | [`README.md`](./README.md) |
| Regras do Design System (leitura obrigatória antes de mexer em UI) | [`design-system/CLAUDE.md`](./design-system/CLAUDE.md) |
| Lista de tasks com status e dependências | [`design-system/migration/tasks/README.md`](./design-system/migration/tasks/README.md) |
| Qual tela usa qual rota do back | [`CONTRATO-API.md`](./design-system/migration/tasks/CONTRATO-API.md) e [`TELAS-DESIGN.md`](./design-system/migration/tasks/TELAS-DESIGN.md) |
| O que está quebrado no back hoje | [`PENDENCIAS-BACKEND-2026-11-16.md`](./design-system/migration/tasks/PENDENCIAS-BACKEND-2026-11-16.md) |
| Resultado dos testes contra o back local | [`TESTES-BACKEND-LOCAL-2026-11-15.md`](./design-system/migration/tasks/TESTES-BACKEND-LOCAL-2026-11-15.md) |

---

## 1. O produto

Uma loja virtual com três áreas no mesmo app:

- **Drops**: lançamentos de estoque limitado. O cliente se inscreve, entra numa fila, acompanha a posição e, na vez dele, tem alguns minutos para comprar.
- **Vitrine**: loja do dia a dia, sem fila (catálogo, sacola e checkout).
- **Painel do administrador** (`#/admin`): o lojista acompanha vendas e gerencia drops, produtos, cupons, pedidos, clientes e equipe.

O cliente tem ainda a área **Minha conta** (perfil, pedidos, notificações). A loja exige login. A página inicial (`#/`) depende da sessão:

| Quem abre `#/` | Vai para |
|---|---|
| Ninguém logado | Página de apresentação (`LandingPage.vue`) |
| Cliente logado | Portal de drops (a sessão de cliente tem prioridade se as duas existirem) |
| Só o lojista logado | Dashboard do painel (`#/admin`) |

Sem sessão de cliente, `#/entrar` e `#/criar-conta` mostram o formulário e qualquer outra rota da loja mostra o login; depois de entrar, a rota pedida aparece. A regra fica num `watch` em `App.vue`.

---

## 2. Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API, `<script setup>`, SFC `.vue`) + **Vite 8**, JavaScript (**sem TypeScript**) |
| Rotas | Roteador próprio por hash (`src/router.js`), **sem Vue Router** |
| Estilo | **CSS puro** + Design System próprio (`design-system/`, classes `ds-*` e tokens `var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` |
| Qualidade | ESLint (`eslint-plugin-vue`), `npm run ds:check` (confere regras do DS), commitlint + husky (Conventional Commits) |
| Back-end (outro repo) | C# / .NET 9, ASP.NET Core Web API, MediatR, FluentValidation, EF Core + PostgreSQL. Dois serviços (**Store** na porta 5001, **Drop** na 5002) atrás de um **Gateway YARP** (porta 5000) |
| Ferramenta de testes | `../test-dashboard/`: painel Node sem dependências (`node server.mjs`, porta 4321) que cruza o Swagger do back com o que o front chama e registra os resultados dos testes |

Requisito: Node 20.19 ou 22.12+.

---

## 3. Estrutura do projeto

```
frontend/
├── src/
│   ├── main.js            entrada: carrega o DS, aplica o tema, restaura as sessões do cliente e do lojista
│   │                      (modo http, pelo cookie de refresh) e só então monta o App
│   ├── router.js          rotas por hash (#/vitrine, #/conta/pedidos, #/admin/drops/:id…)
│   ├── App.vue            shell da loja; decide a página inicial pela sessão; rotas #/admin/* montam
│   │                      components/admin/AdminApp.vue
│   ├── components/
│   │   ├── *.vue          portal de drops, detalhe, fila, checkout do drop, vitrine, sacola,
│   │   │                  checkout da vitrine, landing page, painel de simulação
│   │   ├── drop/          DropRegistration (inscrição) · DropWaitlist (lista de espera)
│   │   ├── account/       CustomerAuth (login/cadastro) · AccountProfile · AccountOrders · AccountNotifications
│   │   ├── admin/         painel do lojista: AdminApp (shell com menu lateral) + uma tela por área
│   │   └── ui/            StatusBadge · LoadState · PaginationNav · ModalDialog · StepsBar
│   ├── composables/       useAsync/useAction (estados de carga e erro) · useNow (relógio) · useBag (sacola)
│   └── services/          TODA a comunicação com o back (nenhum componente chama fetch)
│       ├── config.js      lê o .env: modo mock/http, prefixos das APIs, flag do painel
│       ├── http.js        cliente HTTP único: token, renovação no 401, envelope Result<T>, erros, timeout
│       ├── auth.js · session.js   login/cadastro/logout do cliente e da equipe, tokens em memória
│       ├── resources.js   CRUD genérico do back (get-all, add, update…) e tradução entidade ↔ comando
│       ├── client-api.js  funções das telas do cliente (conta, inscrição, lista de espera, pedidos, checkout)
│       ├── admin-api.js   funções do painel
│       ├── status.js · format.js · sales.js · paging.js · api-error.js · request-log.js
│       ├── api.js         SIMULADOR ANTIGO (portal, detalhe, fila, checkout do drop e catálogo da vitrine).
│       │                  Sai quando as tasks 16–18 forem feitas
│       └── mock/          seed.js (dados de exemplo) + server.js (servidor falso nas MESMAS rotas do back)
├── design-system/         tokens, CSS, specs de componentes, padrões de tela, preview.html
│   └── migration/tasks/   uma task por funcionalidade (00–43) + contrato da API + pendências do back
├── scripts/ds-check.js    verificação do DS (roda no pre-commit)
└── public/                imagens dos produtos de exemplo
```

### Duas regras de arquitetura que valem para qualquer task

1. **Componente não chama `fetch`.** Toda chamada passa por `src/services/`. Se precisa de dado novo, crie a função no serviço certo (`client-api.js` ou `admin-api.js`) e implemente a rota também em `mock/server.js`.
2. **O mock responde nas mesmas URLs e no mesmo formato do back.** Trocar `VITE_API_MODE=mock` por `http` não pode exigir mudança em componente.

### Modos de execução (`.env.local`, copie do `.env.example`)

| `VITE_API_MODE` | Comportamento |
|---|---|
| `mock` (padrão) | Sem servidor. As funções de `services/` caem em `mock/server.js`. Login do cliente: `camila.duarte@exemplo.com` + qualquer senha. Login do lojista: qualquer e-mail e senha. Os dois começam deslogados e as sessões de exemplo sobrevivem ao F5 (`sessionStorage`). O painel mostra as requisições que **seriam** enviadas |
| `http` | Chama o Gateway (`https://localhost:5000`) pelo proxy do Vite. Abra o front em **http://teste.stores.localhost:5173** (a loja é identificada pelo subdomínio) |

---

## 4. O que já foi feito

| Entrega | Tasks | Onde |
|---|---|---|
| Migração de React para Vue 3 | 00 | PR #21 |
| Design System criado e aplicado em todas as telas, tema antigo (neon/glass) removido, `ds:check` no pre-commit | 01–09 | PR #21 + PR #30 |
| Camada HTTP (`http.js`), tratamento de erros, mock no formato do contrato | 15 | PR #23 |
| Componentes do painel no DS (tabela, paginação, gráfico de barras, toolbar) | 20 | PR #23 |
| Painel do administrador completo: shell, dashboard de vendas, drops (lista, editor, ao vivo), catálogo, cupons, fornecedores, pedidos, financeiro, clientes, fraude, equipe, empresa, auditoria | 21–26 | PR #23 |
| Telas do cliente: inscrição no drop, lista de espera, Minha conta (perfil, pedidos, notificações), checkout da vitrine | — | PR #23 |
| Contrato v2: prefixo `/api/<serviço>/api`, envelope `Result`, paginação, erros por `kind` | 27 | PR #28/#29 |
| Login, cadastro e renovação de sessão (cliente e equipe), seleção de loja do lojista | parte da 28 | — |
| Painel usando a loja da sessão no lugar de um `enterpriseId` fixo | — | PR #28 |
| Login obrigatório na loja, página de apresentação para visitantes e página inicial por sessão (cliente vai aos drops, lojista ao dashboard; F5 restaura as duas sessões) | — | PR #30 |
| Testes do front contra o back local e lista de pendências para o back | — | `TESTES-BACKEND-LOCAL-*.md`, `PENDENCIAS-BACKEND-*.md`, `../test-dashboard` |
| Planos e assinatura: planos na landing page, cadastro do lojista com o plano escolhido (`#/admin/assinar/:planId`: conta → loja → pagamento no Mercado Pago) e tela **Plano** no painel (`#/admin/plano`: situação, consumo, troca com prévia de impacto em produtos e equipe, faturas) | — | `services/plans-api.js`, `components/plans/`, `AdminPlan.vue`, `mock/plans.js` |

---

## 5. O que vem do back-end e o que é mockado

### 5.1 Telas que ainda **não falam com o back em nenhum modo** (simulador `services/api.js`)

Mesmo com `VITE_API_MODE=http`, estas telas usam dados inventados no navegador:

| Tela | Componentes | Task que resolve |
|---|---|---|
| Portal de drops (lista de eventos) | `EventPortal.vue` | 16 |
| Detalhe do drop, countdown, barra de estoque | `ProductDetails.vue`, `Countdown.vue`, `StockProgress.vue` | 16 |
| Fila prioritária (posição, avanço) | `QueueStatus.vue` | 17 |
| Checkout do drop | `CheckoutModal.vue` | 18 |
| Catálogo da vitrine e detalhe do produto | `StoreShowcase.vue`, `StoreProductDetail.vue` (dados carregados em `App.vue` via `api.getStoreProducts()`) | 29 |
| Painel de simulação (só em dev) | `SimulationPanel.vue` | ferramenta de teste, some com o `api.js` |

A **sacola** (`useBag.js`) fica só no `localStorage` do navegador e não vai ao back (task 30 leva para o servidor).

### 5.2 Telas que usam a camada `services/` (mock ou back real, conforme o modo)

Legenda: ✅ testado com o back real · ⚠️ funciona, mas usa rota inadequada ou cálculo no front · ❌ bloqueado pelo back

**Painel do administrador**

| Área | Rotas do back | Situação no modo http |
|---|---|---|
| Login, seleção de loja, F5, logout | `auth/*`, `enterprises/mine` | ✅ |
| Catálogo: categorias e produtos | CRUD `categories`, `products` | ✅ criar/editar (dimensões e peso agora obrigatórios) |
| Estoque do produto | `products/adjust-stock` | ❌ o back não tem estoque em `Product` nem essa rota (tasks 19, 34) |
| Drops: criar, editar variantes, abrir inscrições | CRUD `drop-events`, `drop-products`, `drop-coupons` | ✅ |
| Dashboard de vendas | CRUD `orders`, `drop-orders` + soma no front (`sales.js`) | ⚠️ não existe `sales-summary`; o front baixa todos os pedidos e agrega |
| Listas (pedidos, clientes, etc.) | `get-all` | ⚠️ paginação e filtros feitos no front |
| Pedidos, financeiro, envio, nota, estorno | CRUD `orders`, `shipments`, `invoices`, `transactions` | ⚠️ grava por CRUD; o back passou a bloquear parte disso (task 37 troca pelas rotas de ciclo do pedido) |
| Cupons, fornecedores, clientes, fraude, auditoria | CRUD correspondente | ⚠️ funcionam por CRUD; a auditoria é gravada pelo front |
| Equipe e empresa | CRUD `employees`… + `invitations`, `access-roles`, `enterprises/current`, `storefront/store` | ⚠️ não há GET completo da empresa; o formulário pede tudo de novo |

**Cliente (Minha conta, inscrição, lista de espera, checkout da vitrine)**

Hoje **tudo do cliente está bloqueado pelo Gateway** (pendência 1 do back: o Gateway perde o Host e toda rota `storefront/*` responde 404 `Enterprise.Unavailable`). Contornando o Gateway, as rotas abaixo foram validadas:

| Funcionalidade | Rota | Situação |
|---|---|---|
| Cadastro, login, troca de senha, logout | `storefront/auth/*` | ✅ só sem o Gateway |
| Perfil (ver, editar, desativar) | `storefront/me` | ✅ só sem o Gateway |
| Lista de drops, inscrição | `storefront/drop/events`, `.../events/{id}/register` | rota própria do cliente |
| Pedidos e notificações (lista) | `storefront/orders`, `storefront/drop/orders`, `storefront/drop/notifications` | rota própria; detalhe completo vem do CRUD ⚠️ |
| CPF do cliente | CRUD `documents` com token de cliente | ❌ responde 401; falta `storefront/me/documents` |
| Entrar/sair da lista de espera, canais de aviso, cancelar inscrição, excluir notificação | CRUD da equipe com token de cliente | ❌ provável 401/403; faltam rotas `storefront/*` |
| Checkout da vitrine | `orders/add` → `order-items/add-range` → `transactions/add` → `coupons/update` | ❌ totais calculados no navegador; será trocado pelo checkout real do back (tasks 30–32) |
| Cupom da vitrine | CRUD `coupons/get-all` + validação no front | ⚠️ task 30 usa a prévia de cupom do back |

### 5.3 Dados que o front inventa ou calcula porque o back não oferece

- Estoque do produto da vitrine (`stockQuantity`).
- Resumo de vendas e ranking do dashboard.
- Paginação e filtros das listas do painel.
- Estoque disponível do drop (somado a partir de `drop-products` e `drop-reservations`).
- Posição na lista de espera (calculada pelo front ao entrar).
- Pagamento e frete: não existem (Mercado Pago e Melhor Envio dependem do back, task 43).

---

## 6. O que falta fazer

### 6.1 Front-end, tasks prontas para pegar

Cada arquivo em `design-system/migration/tasks/NN-*.md` é a descrição completa da task (estado atual, como implementar, critérios de aceite, verificação).

| # | Task | Depende de | Observação |
|---|---|---|---|
| 16 | Portal, detalhe e estoque do drop com dados reais | back 11 | dá para fazer em mock |
| 17 | Fila com dados reais | back 12, 13 | dá para fazer em mock |
| 18 | Checkout do drop com dados reais | back 14, task 17 | ao final, remover `services/api.js` e `SimulationPanel.vue` |
| 28 | Sessão completa: renovação entre abas, sessões ativas, senha | 27 ✅ | login/cadastro já existem |
| 29 | Catálogo público: busca paginada, categorias, variantes por SKU | 27 ✅ | tira a vitrine do simulador |
| 30 | Carrinho no servidor + prévia de cupom | 28, 29 | substitui o `useBag` local |
| 31 | Endereços de entrega do cliente | 27, 28 | |
| 32 | Checkout real da vitrine (idempotência, endereço, cancelamento) | 30, 31 | substitui o `placeStoreOrder` em 4 chamadas |
| 33 | Admin: produtos e variantes (SKUs) | 27 ✅ | |
| 34 | Admin: estoque por SKU (saldo, ajuste com versão, movimentações) | 33 | |
| 35 | Admin: categorias em árvore | 27 ✅ | |
| 36 | Admin: cupons com condições e simulação | 27 ✅ | |
| 37 | Admin: ciclo do pedido (pagamento manual, envio, entrega, cancelamento) | 27 ✅ | |
| 38 | Admin: clientes com métricas, endereços e pedidos | 27, 37 | |
| 39 | Admin: configurações comerciais da loja | 27 ✅ | |
| 40 | Admin: equipe, perfis, permissões, convites | 27, 28 | convites já parcialmente feitos |
| 41 | Admin: domínio próprio (verificação TXT) | 27, 40 | |
| 42 | Aparência: catálogo de temas, renderer e editor | 27, 40 | |
| 43 | Pagamento (Mercado Pago) e frete (Melhor Envio) | 32, 37 | **bloqueada pelo back** |

Paralelismo: 29–32 (vitrine), 33–39 (admin) e 42 podem correr ao mesmo tempo. 16, 17 e 18 mexem em `App.vue`; evite duas pessoas nelas ao mesmo tempo.

Limpeza pendente: `src/assets/react.svg` e `src/assets/vite.svg` são resto do projeto React.

### 6.2 Back-end, pendências que travam o front

| Prioridade | Pendência | Trava |
|---|---|---|
| **Bloqueante** | Gateway perde o Host: `UseForwardedHeaders` no Store/Drop aceitando `X-Forwarded-Host` só do Gateway | toda a área do cliente no modo http |
| Alta | Rotas `storefront/*` para CPF, lista de espera, canais de aviso, cancelar inscrição, excluir notificação | Minha conta, lista de espera |
| Alta | Task 11: evento por slug, estoque por evento | task 16 |
| Alta | Task 12 (sair/restaurar fila) e 13 (admissão e expiração) | task 17 |
| Alta | Task 14: reserva, cupom e venda do drop integradas ao Store | task 18 |
| Média | Task 19: `sales-summary`, estoque em `Product` | dashboard, estoque no catálogo |
| Média | Rate limit de autenticação por IP (atrás do Gateway vira um limite só para a loja) | login em produção |
| Baixa | 429 fora do padrão ProblemDetails e sem `Retry-After` | mensagem de "tente de novo em X s" |

Detalhes e como conferir cada uma: `PENDENCIAS-BACKEND-2026-11-16.md`.

---

## 7. Como trabalhar numa task

1. Leia o arquivo da task e o `design-system/CLAUDE.md`.
2. Crie a branch a partir da `main` (ex.: `feat/29-catalogo-publico`).
3. Desenvolva em `VITE_API_MODE=mock`. Toda função nova em `services/` precisa da rota equivalente em `mock/server.js`.
4. Antes de commitar: `npm run lint`, `npm run build` e, se o back da task existir, teste em `VITE_API_MODE=http` com o back local (Gateway 5000, Store 5001, Drop 5002).
5. UI: só tokens `var(--ds-*)`, tema claro **e** escuro, celular a partir de 360 px, foco visível e alvo de toque ≥ 44 px. O `ds:check` roda no pre-commit.
6. Commit em Conventional Commits, minúsculo e em português: `feat: adiciona carrinho no servidor`.
7. PR para a `main` de **GabssMar/DRPCommerce-Frontend** (remote `gabssmar`), não para o `origin`.
