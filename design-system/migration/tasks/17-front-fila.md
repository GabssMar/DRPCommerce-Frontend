# [API · Front-end] Fila com dados reais: entrar com CPF, acompanhar e sessão de compra

**Depende de:** tasks 15, 12, 13 e 16 · **Recomendado depois de:** task 06 (DS da fila)

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

## Revisão de 25/11/2026

O back-end reescreveu a fila (Partes 6 e 7, [FluxoComercial.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Drop/Application/FluxoComercial.md)): entrar pede **CPF**, a vez é dada por uma **sessão de compra de 15 minutos fixos** e **não há rota para sair** da fila. Esta task foi atualizada para isso.

## Como implementar

### 1. Rotas (cliente logado, prefixo `/api/drop/api/storefront/{slug}/drop`)

| Ação | Rota | Resposta |
|---|---|---|
| Entrar | `POST events/{id}/queue` `{ cpf }` | `DropQueueEntryResponse`: `id`, `dropEventId`, `position`, `queueEntryStatusId`, `enteredAt` |
| Acompanhar / retomar | `GET events/{id}/queue` | `DropQueueStatusResponse`: `id`, `position`, `queueEntryStatusId`, `session` (`id`, `issuedAt`, `expiresAt`) ou `null` |
| Minhas filas | `GET queue` | entradas do cliente em todos os eventos |

- Repetir a entrada devolve a mesma entrada e **não** renova o prazo.
- Retomar após F5 ou em outra aba = `GET events/{id}/queue`. Nada de `localStorage`.

### 2. CPF

- Campo com máscara `000.000.000-00` e validação dos dígitos no front, só para avisar cedo; quem decide é o back.
- O back guarda só um HMAC do CPF por loja e evento; o texto não volta. A tela não guarda o CPF em lugar nenhum.
- O mesmo cliente não troca de CPF dentro do evento (`DropPurchase.IdentityConflict`).
- Texto de apoio: o limite por CPF vale para o produto inteiro no evento (todas as variações somadas), e contas diferentes com o mesmo CPF dividem esse limite.

### 3. Estados (`queueEntryStatusId`, conferido em `QueueEntryStatus.cs`)

| Status | Tela |
|---|---|
| sem entrada | formulário de CPF + "Entrar na fila" |
| 1 Aguardando | posição (`position`) |
| 2 Chamado | "É a sua vez", prazo `session.expiresAt − serverNow()`, CTA para reservar (task 18) |
| 3 Finalizando compra | reserva em andamento; mesmo prazo da sessão |
| 4 Concluído | "Compra concluída" |
| 5 Expirado | "Seu prazo terminou": a entrada volta ao fim da fila e recebe nova sessão quando for admitida de novo |
| 6 Removido | volta ao formulário |

- Polling de `GET events/{id}/queue` a cada 3 s nos status 1, 2, 3 e 5 (o worker do back admite e expira a cada 10 s). Para nos status 4 e 6.
- A sessão tem **15 minutos fixos**: reservar outro SKU ou iniciar o checkout não renova. Não mostre "estender prazo".
- Estimativa de espera só com histórico real de `position`; sem histórico, só a posição.

### 4. Erros

| `code` | Comportamento |
|---|---|
| `Drop.QueueClosed` | "A fila não está aberta", com o horário de `queueOpensAt` (task 16) |
| `Drop.NotFound` | "Drop não encontrado" |
| `DropPurchase.IdentityConflict` | erro no campo do CPF: "Use o mesmo CPF da sua primeira entrada neste drop" |
| `DropPurchase.Unavailable` | "A compra deste drop não está disponível agora" |
| 503 | fila indisponível no servidor: mensagem genérica + "Tentar de novo" |
| rede / timeout | "Reconectando…", mantém a posição na tela; o polling continua |

### 5. O que sai

- "Sair da fila" e "restaurar" (não existem no back).
- `veloce_queue_entry_*`, `secondsToExpiry` e as escritas no simulador (`updateEventSettings`) no `App.vue`.

## Critérios de aceite

- [ ] Entrar com CPF, acompanhar, ser chamado e expirar funcionam com `VITE_API_MODE=http`
- [ ] F5 ou outra aba retomam a posição por `GET events/{id}/queue`
- [ ] Prazo vem de `session.expiresAt` e `serverNow()`; nenhum contador local de 600 s
- [ ] CPF não fica em `localStorage`, `sessionStorage` nem na URL
- [ ] Todos os `code` da tabela com mensagem própria
- [ ] Duplo clique em "Entrar na fila" não gera duas chamadas
- [ ] Funciona em `VITE_API_MODE=mock`

## Verificação

```bash
grep -rn "veloce_queue_entry\|updateEventSettings\|secondsToExpiry\|leaveQueue" src/ | grep -v "services/mock\|SimulationPanel"   # vazio
npm run lint
```

## Referências

- `FluxoComercial.md` (back-end), seção "Fila e compra"
- Task 16 (detalhe do evento) e task 18 (reserva e checkout)
- `design-system/patterns/drop-page.md`: máquina de estados

## Para o Claude Code

```
Leia a task inteira. Crie joinDropQueue(eventId, cpf) e getDropQueueStatus(eventId) em client-api.js
(storefront/{slug}/drop/events/{id}/queue) e conecte QueueStatus.vue e o App.vue a elas: formulário de
CPF, polling de 3 s, prazo de session.expiresAt com serverNow(), erros da tabela. Remova "sair da fila",
o localStorage de fila e as escritas no simulador. Atualize o mock nas mesmas rotas, com sessão de
15 min. Não crie bloco <style>.
```
