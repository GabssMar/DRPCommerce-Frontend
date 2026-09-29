# [API · Front-end] Fila com dados reais: entrar, acompanhar, restaurar e sair

**Depende de:** tasks 15, 12 e 13 · **Recomendado depois de:** task 06 (DS da fila)

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | Design System (`ds-*`, `var(--ds-*)`), **sem bloco `<style>` nos `.vue`** |
| Dados | `src/services/index.js` + `usePolling` (task 15) |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API via `Commerce.Gateway` (YARP, porta 5000). Contrato em `CONTRATO-API.md` |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

`QueueStatus.vue` e o estado de fila do `App.vue`: entrar na fila, ver a posição cair, ser chamado, perder a vez, sair e **voltar para a mesma posição depois de recarregar a página**.

## Estado atual

- A entrada na fila vive em `localStorage` (`veloce_queue_entry_<id>`). Recarregar a página em outro navegador perde a fila.
- A posição cai aleatoriamente no mock, e `App.vue` escreve de volta no simulador (`api.updateEventSettings(... currentPosition)`).
- O prazo do checkout é um contador local de 600s (`secondsToExpiry`), sem relação com o servidor.
- Os status seguem o mock (`statusId` 1/2/3), que diverge do back-end (§3 do contrato).

## Como implementar

### 1. Ciclo de vida

| Momento | Chamada | Resultado na tela |
|---|---|---|
| Abrir o detalhe do drop | `getMyQueueEntry(eventId)` | `null` → CTA "Entrar na fila"; entrada → retoma o estado dela |
| Clicar "Entrar na fila" | `joinQueue(eventId)` | inicia o polling |
| Enquanto status ∈ {1, 2, 3} | `getQueueStatus(entryId)` a cada 3s (`usePolling`) | posição, total, estado |
| Clicar "Sair da fila" | `leaveQueue(entryId)` | volta ao CTA inicial |
| Status ∈ {4, 5, 6} | para o polling | estado final |

`localStorage` deixa de guardar a entrada: a fonte é `getMyQueueEntry`.

### 2. Mapa status → tela (`CONTRATO-API.md` §3 + `patterns/drop-page.md`)

| `queueEntryStatusId` | Tela | Dado exibido |
|---|---|---|
| — (sem entrada) | "Entrar na fila" | — |
| 1 Aguardando | posição em `.ds-stat--lg` | `position` "de `totalWaiting`" |
| 2 Chamado | "É a sua vez", CTA "Finalizar compra" (emite `checkout`) | prazo: `checkoutDeadline − serverNow` |
| 3 Finalizando compra | checkout em andamento (reabre o modal se foi fechado) | prazo: `checkoutDeadline − serverNow` |
| 4 Concluído | "Pedido confirmado" | — |
| 5 Expirado | "Sua vez expirou", com explicação e opção de voltar ao portal | — |
| 6 Removido | volta ao CTA inicial | — |

O prazo **substitui** o `secondsToExpiry` local: é derivado de `checkoutDeadline` e `serverNow()`, e o `Countdown` da task 05 exibe.

### 3. Estimativa "≈ N min"

`eta = position × (tempo médio entre chamadas)`, estimado no front pela variação de `position` nas últimas leituras. Sem histórico suficiente, mostrar só a posição, **nunca** um número inventado (`patterns/drop-page.md`, regra 3).

### 4. Erros (`ApiError.code` → mensagem)

| `code` | Mensagem / ação |
|---|---|
| `Queue.NotOpen` | "A fila abre às HH:MM" (horário do `detail` ou do evento) |
| `Queue.SoldOut` | "Esgotou" + link para o portal |
| `Queue.AlreadyPurchased` | "Você já comprou este drop" |
| `Queue.CannotLeave` | recarrega o status (a entrada mudou de estado) |
| `Network` / `Timeout` | "Reconectando…", mantendo a posição na tela; o polling continua |
| 404 em `getQueueStatus` | entrada perdida: chama `getMyQueueEntry` de novo |

### 5. Remover o acoplamento com o simulador

`App.vue` não escreve mais no simulador (`updateEventSettings` com `currentPosition`/`queueStatusId`). No modo mock, quem avança a fila é o próprio `mock/drop-api.js` (task 15), como o worker da task 13 faz no back-end.

## Critérios de aceite

- [ ] Entrar, acompanhar, ser chamado, expirar e sair funcionam com `VITE_API_MODE=http`
- [ ] Recarregar a página (ou abrir em outra aba) mantém a posição, via `getMyQueueEntry`
- [ ] Nenhum `localStorage` de fila; nenhuma escrita no simulador a partir do `App.vue`
- [ ] Prazo do checkout vem de `checkoutDeadline` e `serverNow()`
- [ ] Polling de 3s para nos estados finais, pausa com a aba oculta e não pisca em erro
- [ ] Todos os `code` da tabela com mensagem própria
- [ ] Duplo clique em "Entrar na fila" não gera duas chamadas (botão em loading)
- [ ] Continua funcionando em `VITE_API_MODE=mock`

## Verificação

```bash
grep -rn "veloce_queue_entry\|updateEventSettings\|secondsToExpiry" src/ | grep -v "services/mock\|SimulationPanel"   # vazio
npm run lint
```

Manual (modo http, tasks 10–13 no back-end, evento com 2 unidades): abrir três abas com `?customer=1`, `2` e `3`, entrar na fila nas três, acompanhar as posições, confirmar que duas são chamadas; deixar uma expirar e ver a terceira ser chamada; recarregar uma aba no meio e confirmar que a posição volta.

## Referências

- `CONTRATO-API.md` §3 e §4 (Fila)
- `design-system/patterns/drop-page.md`: máquina de estados
- Tasks 12 e 13: regras do back-end

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §3–§4 (Fila) e a task 15.
Conecte QueueStatus.vue e o estado de fila do App.vue a getMyQueueEntry, joinQueue,
getQueueStatus (usePolling de 3s, parando nos status 4/5/6) e leaveQueue. Mapeie
queueEntryStatusId conforme a tabela da task; derive o prazo de checkoutDeadline e
serverNow(), removendo secondsToExpiry; trate os códigos de ApiError listados. Remova o
localStorage de fila e as escritas no simulador (updateEventSettings) do App.vue. Mantenha
os eventos join-queue e checkout e o visual das tasks de DS. Não crie bloco <style>.
```
