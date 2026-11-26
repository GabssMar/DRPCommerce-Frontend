# [API · Front-end] Portal, detalhe do drop e estoque com dados reais

**Depende de:** tasks 15, 11 e 44 (o produto do drop vem do catálogo do Drop) · **Recomendado depois de:** tasks 02, 03, 04 e 05

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

## Revisão de 25/11/2026

O back-end reescreveu o fluxo do drop (Partes 6 e 7, [FluxoComercial.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Drop/Application/FluxoComercial.md)). Esta task foi atualizada para as rotas novas: o detalhe público já traz os produtos do evento (participações), as variações com saldo e o preço. O CRUD de `drop-events`/`drop-products` não é mais a fonte da vitrine do drop. O produto do drop vem do **catálogo do Drop** (task 44), e nunca é um produto ativo da vitrine.

## Como implementar

### 1. Rotas (anônimas, prefixo `/api/drop/api/storefront/{slug}/drop`)

| Tela | Rota | Resposta |
|---|---|---|
| Portal | `GET events` | `DropStorefrontEventSummary[]`: `id`, `name`, `slug`, `description`, `price`, `coverImageUrl`, `dropStartsAt`, `dropEndsAt`, `requiresRegistration` |
| Detalhe e estoque | `GET events/{id}` | `DropStorefrontEventResponse`: datas (`registrationStartsAt/EndsAt`, `queueOpensAt`, `dropStartsAt`, `dropEndsAt`), `purchaseWindowMinutes`, `bannerImageUrl` e `products[]` |
| `products[]` (participação) | — | `participationId`, `name`, `description`, `maxPerCustomer`, `concentrationWarning`, `variants[]` |
| `variants[]` | — | `id`, `sku`, `optionsJson`, `price`, `available` |

- Evento que não é público devolve **404**: estado "Drop não encontrado".
- A resposta pública não traz `dropEventStatusId`: a fase sai das datas comparadas com `serverNow()` (inscrição → fila aberta → em andamento → encerrado). "Esgotado" = todas as variações com `available` 0.
- `participationId` e `variant.id` são os ids usados na reserva (task 18). Não use `dropProductId` nem o `productId` da vitrine.

### 2. Portal (`EventPortal.vue`)

Cards com os campos do resumo e badge pela fase calculada. O resumo não traz `queueOpensAt`: o "Abre em HH:MM" só aparece no detalhe.

### 3. Detalhe do drop

- Imagem: `bannerImageUrl` → `coverImageUrl`.
- Um bloco por participação, com o seletor de variações da task 29 (`VariantPicker`, opções de `optionsJson`), preço e saldo da variação escolhida.
- "Limite de N por CPF neste drop" com `maxPerCustomer`; a soma vale para todas as variações do mesmo produto.
- `concentrationWarning`: aviso discreto de que poucas pessoas podem levar o estoque inteiro. Só informativo.
- Countdown com `serverNow()`.

### 4. Estoque

`usePolling(() => getDropEvent(id), 4000, { pauseWhenHidden: true })` só na fase "fila aberta" ou "em andamento". Erro no polling mantém o último saldo.

### 5. Remover dependências do simulador

`getVirtualTime` e `subscribeToSimState` saem de `App.vue`, `EventPortal.vue` e `Countdown.vue`.

## Critérios de aceite

- [ ] Portal e detalhe usam só `GET events` e `GET events/{id}` (nada de CRUD de `drop-events`/`drop-products`)
- [ ] Participações, variações, preço e saldo vêm do detalhe público
- [ ] Fase calculada pelas datas com `serverNow()`; mudar o relógio do computador não altera nada no modo http
- [ ] Estoque atualiza a cada 4 s só com fila aberta ou drop em andamento, e não pisca em erro
- [ ] 404, vazio e erro de rede com estado próprio
- [ ] Funciona em `VITE_API_MODE=mock` e `http`

## Verificação

```bash
grep -rn "getVirtualTime\|subscribeToSimState" src/ | grep -v "services/mock\|SimulationPanel"   # vazio
npm run lint
```

## Referências

- `FluxoComercial.md` (back-end) e task 44 (catálogo do Drop)
- Task 29 (`VariantPicker`, `variants.js`)
- `design-system/patterns/drop-page.md`, `patterns/states.md`

## Para o Claude Code

```
Leia a task inteira. Crie getDropEvent(id) em client-api.js (GET storefront/{slug}/drop/events/{id})
e use-o com listPublicDrops no portal e no detalhe. Fase pelas datas com serverNow(); participações
com VariantPicker (optionsJson), preço, saldo (available), maxPerCustomer e concentrationWarning.
Estoque com usePolling de 4 s só com fila aberta/em andamento. Atualize o mock nas mesmas rotas.
Remova getVirtualTime/subscribeToSimState fora do mock e do SimulationPanel. Não crie bloco <style>.
```
