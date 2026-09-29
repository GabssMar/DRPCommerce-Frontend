# [Admin · Front-end] Gestão de drops: lista, criação, edição e mudança de fase

**Depende de:** tasks 20, 21, 22 · Roda em `VITE_API_MODE=mock`

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (`<script setup>`) + **Vite** |
| Estilo | `.ds-table`, `.ds-toolbar`, `.ds-pagination`, `.ds-modal`, `.ds-input`, `.ds-badge` |
| Dados | `listDropEventsAdmin`, `getDropEventAdmin`, `createDropEvent`, `updateDropEvent`, `setDropEventStatus`, `listDropProducts`, `upsertDropProduct` (task 22) |

## Funcionalidade nova

O administrador cria um drop, define as janelas de tempo e o estoque alocado, acompanha o que está no ar e muda a fase do evento (rascunho → inscrições → fila → ativo → encerrado).

## Estado atual

`AdminDrops.vue` renderiza `.ds-empty` (task 21). Hoje os três drops de demonstração são objetos fixos em `src/services/api.js`, editáveis só pelo `SimulationPanel` — que é ferramenta de teste, não de gestão.

No back-end, `DropEvent` já tem todos os campos necessários (`DropEventController` expõe o CRUD em `/api/drop-events`), e `DropProduct` guarda o estoque alocado do evento.

## Como implementar

### 1. Lista

`.ds-toolbar` (busca por nome + filtro por `dropEventStatusId` + "Novo drop") sobre uma `.ds-table` dentro de `.ds-card--flush`, com `.ds-pagination` no rodapé.

Colunas — máximo 6, regra 5 de `components/table.md`:

| Coluna | Conteúdo |
|---|---|
| Drop | `.ds-avatar--sm` com `coverImageUrl` + `name` |
| Fase | `.ds-badge` pela tabela §3 do contrato |
| Janela | `queueOpensAt` → `dropEndsAt`, formato curto `01/10 14:32` |
| Estoque | `unitsSold / totalUnitsAvailable` + `.ds-meter` |
| Preço | `--numeric`, pt-BR |
| Ações | `.ds-icon-btn--ghost` à direita |

Ordenação por data e por estoque (`.ds-table__th--sortable` da task 20). Abaixo de 768px, cards em vez de tabela.

### 2. Formulário de drop

`.ds-modal` para criar; tela cheia para editar (o formulário é longo). Campos, na ordem do domínio:

| Grupo | Campos |
|---|---|
| Identidade | `name`, `slug`, `description`, `coverImageUrl`, `bannerImageUrl` |
| Comercial | `price`, `totalUnitsAvailable`, `productId` |
| Regras | `requiresRegistration`, `isPublic` |
| Janelas | `registrationStartsAt`, `registrationEndsAt`, `queueOpensAt`, `dropStartsAt`, `dropEndsAt` |

**Validações que o domínio impõe** — replique no front para o erro chegar antes do 400 (`DropEvent.Create`):

1. `totalUnitsAvailable >= 1`; `price >= 0.01`; `unitsReserved` e `unitsSold` nunca negativos.
2. `registrationStartsAt < registrationEndsAt` e `dropStartsAt < dropEndsAt` (`ValidateDateRange`).
3. Todos os campos de texto obrigatórios — inclusive `bannerImageUrl`, que não é opcional no domínio.
4. `slug` único, minúsculo, sem espaço.

Ordem coerente e não validada pelo back, mas errada na prática — **avise sem bloquear**: `registrationEndsAt <= queueOpensAt <= dropStartsAt`.

Validação por campo conforme `components/input.md`: erro sob o campo, `aria-describedby`, foco no primeiro inválido, `<label>` visível em todos. Erros de servidor chegam por `ApiError.fieldErrors`, já mapeados por sufixo (`CreateDropEventCommand.slug` → `slug`).

### 3. Mudança de fase

A fase é `dropEventStatusId` (1–8, §3 do contrato). Não há `PATCH`: `setDropEventStatus` lê o evento, troca o campo e reenvia o objeto inteiro (task 22 §4.3).

Transições oferecidas, e só elas:

```
1 Rascunho ──► 2 Inscrições abertas ──► 3 Inscrições encerradas ──► 4 Fila aberta ──► 5 Ativo ──► 7 Encerrado
     └────────────────────────── 8 Cancelado ◄──────────────────────────┘
```

`6 Esgotado` é **derivado** (`unitsSold >= totalUnitsAvailable`) e não pode ser escolhido à mão. Avançar para `5 Ativo` antes de `dropStartsAt`, ou cancelar um drop com pedidos, pede confirmação em `.ds-modal` dizendo **o efeito**: "3 clientes estão na fila e perderão a vez". Ação destrutiva usa `.ds-btn--danger`.

> Quando o worker da task 13 existir, ele passa a mover as fases pelo relógio. Esta tela continua válida como **override manual** — deixe claro no texto do card qual fase veio do worker.

### 4. Estoque alocado do drop

Dentro do detalhe, a lista de `DropProduct` do evento: `sku`, `unitsAllocated`, `unitsSold`, `maxPerCustomer`, `price`, `isActive`. Editável enquanto o drop não começou; depois, só `maxPerCustomer` e `isActive`.

Reduzir `unitsAllocated` abaixo de `unitsSold` é recusado pelo servidor — valide antes e explique: "já foram vendidas 38 unidades".

### 5. Estados e feedback

Esqueleto de 5 linhas na primeira carga; `.ds-empty` com "Criar o primeiro drop"; erro com "Tentar de novo". Depois de salvar, feedback em `aria-live` e a linha alterada em destaque breve (`.ds-animate-in`) — sem recarregar a tabela inteira.

## Critérios de aceite

- [ ] Lista com busca, filtro por fase, ordenação e paginação
- [ ] Criar e editar drop com as quatro validações do domínio replicadas no cliente
- [ ] `fieldErrors` do servidor caem no campo certo
- [ ] Mudança de fase só pelas transições permitidas; `6 Esgotado` não é escolhível
- [ ] Ação destrutiva com confirmação que declara o efeito, em `.ds-btn--danger`
- [ ] Lista de `DropProduct` editável conforme a fase, recusando `unitsAllocated < unitsSold`
- [ ] Três estados tratados; feedback de salvamento em `aria-live`
- [ ] Zero estilo inline (exceto largura de `.ds-meter`), zero hex, zero `<style>`
- [ ] Light e dark; 360px com cards no lugar da tabela
- [ ] Nenhuma chamada a `fetch` ou URL no componente
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn "fetch(\|/api/" src/components/admin/AdminDrops.vue    # vazio
grep -rnE "#[0-9a-fA-F]{3,8}" src/components/admin/             # vazio
# no navegador: crie um drop com dropEndsAt anterior a dropStartsAt (deve barrar no cliente),
# tente reduzir unitsAllocated abaixo de unitsSold, cancele um drop com fila (confirmação)
```

## Referências do Design System

- `components/table.md` (colunas, mobile, ordenação) · `components/toolbar.md` e `components/pagination.md` (task 20)
- `components/input.md`: validação por campo, `<label>`, `aria-describedby`
- `components/modal.md`: foco preso, `Esc`, devolução de foco · `components/badge.md`: mapa de fases
- `CONTRATO-API.md` §3: ids de `dropEventStatusId`

## Para o Claude Code

```
Leia CONTRATO-API.md §3, as tasks 20 e 22, e design-system/components/{table,input,modal,
badge}.md. Implemente AdminDrops.vue: lista com toolbar (busca + filtro de fase), tabela
ordenável e paginada, formulário de criação/edição com as validações do domínio DropEvent
(totalUnitsAvailable >= 1, price >= 0.01, ranges de data, textos obrigatórios incluindo
bannerImageUrl, slug único), mudança de fase pelas transições permitidas com confirmação
declarando o efeito, e edição dos DropProduct do evento. Use só as funções de
src/services/admin/. setDropEventStatus encapsula o reenvio do objeto inteiro — não monte
esse corpo na tela. Sem CSS novo: faltou classe, PARE e reporte (task 20).
```
