# [API · Front-end] Portal, detalhe do drop e estoque com dados reais

**Depende de:** tasks 15 e 11 · **Recomendado depois de:** tasks 02, 03, 04 e 05 (DS das mesmas telas, para evitar conflito de PR)

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | Design System (`ds-*`, `var(--ds-*)`), **sem bloco `<style>` nos `.vue`** |
| Dados | `src/services/index.js` + `usePolling` (task 15) |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API via `Commerce.Gateway` (YARP, porta 5000). Contrato em `CONTRATO-API.md` |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

As telas de **leitura**: portal com a lista de drops, detalhe do drop (produto, countdown) e a barra de estoque que atualiza durante o drop.

## Estado atual

- `App.vue` busca eventos e produto pelo mock, e guarda `eventsList`, `eventData` e `productData` combinando campos dos dois (`{ ...eventData, price: productData?.price }`).
- O estoque é sincronizado a cada 4s com `setInterval` direto no `App.vue`.
- O badge de status e o countdown usam o tempo virtual do simulador (`getVirtualTime`).
- Com o mock, `unitsAllocated` vem do evento. Na API real vem de `DropProduct` (decisão da task 11).

## Como implementar

### 1. Portal (`EventPortal.vue` / `App.vue`)

| Na tela | De onde vem |
|---|---|
| lista de cards | `listPublicEvents()` |
| nome, descrição, imagem, preço | `name`, `description`, `coverImageUrl`, `price` |
| badge | `dropEventStatusId` + datas, com o mapa de `CONTRATO-API.md` §3 e `components/badge.md` |
| "Abre em HH:MM" | `queueOpensAt`, formatado em `pt-BR`, fuso local |

Estados de tela (já montados na task 03), agora alimentados por erro real: `ApiError` com `status 0` → "Sem conexão" + "Tentar de novo"; lista vazia → `.ds-empty`.

### 2. Detalhe do drop

| Na tela | De onde vem |
|---|---|
| dados do evento | `getEvent(id)` |
| imagem principal | `bannerImageUrl` → fallback `coverImageUrl` |
| produto e preço | `getEventProducts(id)[0]`; o `id` do produto é o `dropProductId` usado na reserva (task 18) |
| countdown | `queueOpensAt`, `dropStartsAt`, `dropEndsAt` comparados com **`serverNow()`** |
| fase | `dropEventStatusId` |

- `404` em `getEvent` → estado "Drop não encontrado", com botão para voltar ao portal.
- Os dados do evento e os do produto ficam em refs separados, sem o merge `{ ...eventData, price }`.
- `Countdown.vue` recebe `now` (de `serverNow()`, atualizado a cada 1s) em vez de `virtualTime`.

### 3. Estoque (`StockProgress.vue`)

```js
const { data: products, isRefreshing, error } =
  usePolling(() => api.getEventProducts(eventId.value), 4000, { pauseWhenHidden: true })
```

- Props: `unitsAllocated` e `unitsSold` do produto (fonte definida na task 11).
- Polling **só** com o drop em 4 ou 5 (fila aberta / ativo). Fora disso, uma leitura só.
- Erro no polling não zera a barra: mantém o último valor e mostra o indicador discreto de "atualizando".
- Ao chegar em 6 (Esgotado), para o polling e mostra o estado esgotado.

### 4. Remover dependências do simulador

`getVirtualTime` e `subscribeToSimState` saem de `App.vue`, `EventPortal.vue` e `Countdown.vue`. O tempo vem de `serverNow()`, que no modo mock já é o tempo virtual (task 15).

## Critérios de aceite

- [ ] Portal, detalhe e estoque funcionam com `VITE_API_MODE=http` contra o back-end real
- [ ] Continuam funcionando com `VITE_API_MODE=mock`
- [ ] Nenhum campo lido fora do contrato (`CONTRATO-API.md` §4: Portal, Detalhe, Estoque)
- [ ] Countdown usa `serverNow()`; mudar o relógio do computador não altera o countdown no modo http
- [ ] Estoque atualiza a cada 4s só em drop ativo, pausa com a aba oculta e não pisca em erro
- [ ] Estados de erro, vazio e "não encontrado" testados derrubando o Gateway e usando id inexistente
- [ ] Nenhum `getVirtualTime` / `subscribeToSimState` fora de `services/mock/` e do `SimulationPanel`

## Verificação

```bash
grep -rn "getVirtualTime\|subscribeToSimState" src/ | grep -v "services/mock\|SimulationPanel"   # vazio
npm run lint
```

Manual (modo http, back-end com as tasks 10, 11 e 13): abrir o portal, entrar num drop, alterar `units_sold` no banco e ver a barra atualizar em até 4s; parar o Gateway e ver o estado de erro; subir de novo e clicar em "Tentar de novo".

## Referências

- `CONTRATO-API.md` §3 e §4 (Portal, Detalhe do drop, Estoque)
- `design-system/patterns/states.md`, `components/badge.md`, `components/progress-chart.md`

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §3–§4 e a task 15. Conecte
EventPortal.vue, App.vue (detalhe), ProductDetails.vue, Countdown.vue e StockProgress.vue
às funções listPublicEvents, getEvent e getEventProducts de src/services/index.js,
exatamente com os campos do contrato. Countdown com serverNow(); estoque com usePolling
de 4s só com dropEventStatusId 4 ou 5; estados de erro, vazio e 404 alimentados por
ApiError. Remova getVirtualTime/subscribeToSimState fora do mock e do SimulationPanel.
Não mude o visual (é das tasks de DS) nem crie bloco <style>.
```
