# Tasks: Design System e integração com o back-end

Dezenove tasks: **00–09** migram o front para Vue e para o Design System; **10–18** conectam o front ao back-end. Cada uma tem o tamanho de **uma funcionalidade / uma PR**. Cada arquivo é o corpo pronto da issue: o título é a primeira linha (`# …`), o resto é a descrição.

Destino: [Project 1 de joseHenrique346](https://github.com/users/joseHenrique346/projects/1/views/1), coluna **Design**.

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | CSS puro + Design System (`design-system/`: classes `ds-*` e tokens `var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` (`<X :size="20" :stroke-width="1.5" />`), tamanhos 16/20/24 |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API (MediatR, FluentValidation, EF Core + PostgreSQL), em `../backend` |
| Integração | HTTP/JSON via `Commerce.Gateway` (YARP, porta 5000), camada `src/services/` (task 15). Contrato em `CONTRATO-API.md` |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Série Design System (00–09)

| # | Task | Arquivo tocado | Inline styles hoje | Depende de |
|---|---|---|---|---|
| 00 | Migração da base: React → Vue 3 | `package.json`, configs, `main.js`, `App.vue`, `components/*.vue` | — | — |
| 01 | Fundação: ativar DS, fontes e tema | `main.js`, `index.html`, `index.css` | — | 00 |
| 02 | App shell, cabeçalho e navegação | `App.vue` | 29 | 00, 01 |
| 03 | Portal de drops | `EventPortal.vue` | 24 | 00, 01 |
| 04 | Vitrine do produto e estoque | `ProductDetails.vue`, `StockProgress.vue` | 25 | 00, 01 |
| 05 | Countdown e linguagem de urgência | `Countdown.vue` | 13 | 00, 01 |
| 06 | Fila prioritária | `QueueStatus.vue` | 40 | 00, 01, 05 |
| 07 | Checkout | `CheckoutModal.vue` | 45 | 00, 01, 06 |
| 08 | Painel de simulação | `SimulationPanel.vue` | 50 | 00, 01 |
| 09 | Remover legado e travar o sistema | global | — | 02–08 |

**00 e 01 bloqueiam tudo. 09 fecha tudo.** A 00 é um port 1:1 de React para Vue, sem mudança visual. A 01 já foi aplicada no código React e a 00 a carrega para `main.js`. As tasks 02–08 podem correr em paralelo entre si (arquivos distintos), respeitando as dependências da coluna.

## Série de integração front ↔ back (10–18)

O objetivo da série é, além do Design System, **ligar o front à API real**. Hoje o front roda 100% sobre um simulador (`src/services/api.js`), e o back-end só expõe CRUD genérico. **Qual informação de cada tela vem de qual endpoint está em [`CONTRATO-API.md`](./CONTRATO-API.md)**, a referência comum para front e back.

| # | Task | Lado | Onde | Depende de |
|---|---|---|---|---|
| 10 | Acesso do front à API: rota do Gateway, CORS, tenant e cliente | Back | `Commerce.Gateway`, `TenantProvider`, novo `CustomerProvider` | — |
| 11 | Leitura da vitrine: drops públicos, slug, estoque por evento | Back | `DropEventController`, `DropProductController` | 10 |
| 12 | Fila: entrar, consultar posição, restaurar, sair | Back | `QueueEntryController` | 10 |
| 13 | Avanço e expiração da fila, fases do drop | Back | novo `DropProgressionWorker` | 12 |
| 14 | Reserva, cupom e checkout | Back | `DropReservation`, `DropCoupon`, `DropOrder` | 12, 13 |
| 15 | Camada HTTP, erros, configuração e mock no formato do contrato | Front | `src/services/`, `usePolling` | 00 |
| 16 | Portal, detalhe e estoque com dados reais | Front | `EventPortal`, `App`, `ProductDetails`, `Countdown`, `StockProgress` | 15, 11 · após 02–05 |
| 17 | Fila com dados reais | Front | `QueueStatus`, `App` | 15, 12, 13 · após 06 |
| 18 | Checkout com dados reais | Front | `CheckoutModal`, `App` | 15, 14, 17 · após 07 |

**10 bloqueia o back-end; 15 bloqueia o front.** As duas pontas andam em paralelo: a task 15 faz o simulador falar o formato do contrato, então 16–18 podem ser desenvolvidas em `VITE_API_MODE=mock` e só a validação final precisa do back-end pronto. "Após 02–07" evita conflito de PR com as tasks de DS que mexem nos mesmos arquivos.

Problemas encontrados no levantamento (detalhes nas tasks):

- O Gateway remove `/api/drop` e a API espera `/api/...`: **toda chamada pelo Gateway dá 404** (task 10)
- Sem CORS e sem autenticação; o filtro de tenant faz **a lista de eventos voltar vazia** sem JWT (task 10)
- O front chama rotas que não existem (`/api/drop-event/GetAll`…) e trata `statusId` com significados diferentes do back (task 15)
- O back não tem regra de fila nem de checkout: o CRUD aceita posição, status e totais vindos do navegador (tasks 12–14)

## Linha de base medida

Contada no código React em 2026-09-20; inline styles e hex recontados em 2026-09-28, após a task 01. O port da task 00 é 1:1, então os números valem para os `.vue` (`style={{}}` vira `:style`).

| Indicador | Hoje | Meta ao fim da série |
|---|---|---|
| Estilos inline (`style` / `:style`) no `src/` | **226** | ≤ 20 (só valores calculados) |
| Hex literais em componentes | **74** (eram 76 antes da task 01) | 0 |
| Blocos `<style>` em componentes | 0 após a task 01 | 0 |
| Classes usadas e inexistentes | 0 após a task 01 (eram 2: `.spinner`, `.spin-anim`) | 0 |
| Telas com estado de erro tratado | 0 | todas |
| Componentes com `aria-live` | 0 | fila, countdown e checkout |

Esses números estão dentro das tasks como critério de aceite. Não são estimativa: foram contados no código.

## Publicar no GitHub Project

```bash
winget install --id GitHub.cli        # se ainda não tiver
gh auth login
gh auth refresh -s project,read:project

cd frontend/design-system/migration/tasks
DRY_RUN=1 bash create-project-tasks.sh   # confere os títulos
bash create-project-tasks.sh             # cria draft items na coluna Design
# ou, para criar issues reais no repositório:
MODE=issue bash create-project-tasks.sh
```

As tasks 01–09 já estão no board, com a descrição antiga (React). Para publicar só as novas: `FILES="00-*.md 1[0-8]-*.md" bash create-project-tasks.sh`. As 01–09 precisam ter a descrição atualizada no próprio board. Em `MODE=issue`, as tasks `[API · Back-end]` vão para `BACKEND_REPO` (padrão `joseHenrique346/DRPCommerce-Backend`; confirme o nome).

Se o board usar outro nome de campo para as colunas, o script avisa e lista os disponíveis — rode de novo com `FIELD_NAME="<nome>"`.

## Formato de cada task

Toda task tem a mesma espinha, pensada para ser executável por uma pessoa **ou** pelo Claude Code:

1. **Funcionalidade alterada** — o que o usuário faz nessa parte do produto
2. **Estado atual** — o que existe hoje, com números reais do código
3. **Como implementar** — tabela de tradução + trechos prontos + as regras do DS que aquela tela precisa passar a respeitar
4. **Critérios de aceite** — checklist verificável
5. **Verificação** — comandos `grep`/`npm` que provam o resultado
6. **Referências do Design System** — os arquivos exatos a ler
7. **Para o Claude Code** — prompt pronto, com o escopo e o que **não** tocar
