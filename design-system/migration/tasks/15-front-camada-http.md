# [API · Front-end] Camada HTTP: cliente, erros, configuração e mock no formato do contrato

**Depende de:** task 00 (base Vue) · **Bloqueia as tasks 16–18** · Pode começar antes do back-end ficar pronto

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| HTTP | `fetch` nativo + `AbortController` (sem axios nem outra dependência) |
| Configuração | variáveis `VITE_*` (`import.meta.env`) + proxy do Vite em dev |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API via `Commerce.Gateway` (YARP, porta 5000). Contrato em `CONTRATO-API.md` |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

A forma como o front conversa com a API. Nenhuma tela muda nesta task: ela cria a camada que as tasks 16–18 usam, e faz o simulador atual falar **o mesmo formato** da API real.

## Estado atual

`src/services/api.js` (492 linhas) mistura três coisas:

1. **Simulador**: eventos, fila e estoque falsos em `localStorage`, tempo virtual, latência artificial
2. **Cliente HTTP**: `fetch` com URLs que **não existem** no back-end (`/api/drop-event/GetAll`, `/api/queue-entry/Add`…) e sem tratamento de erro além de `console.error`
3. **Log de requisições** para o painel de simulação

O modo real nunca funcionou: rotas erradas, espera o envelope `Result` também nos erros (a API devolve ProblemDetails) e usa `statusId` com significados diferentes dos do back-end.

## Como implementar

### 1. Estrutura

```
src/services/
├── http.js            cliente HTTP (fetch, cabeçalhos, timeout, erros, relógio do servidor)
├── api-error.js       classe ApiError
├── status.js          ids de status (espelho de CONTRATO-API.md §3)
├── drop-api.js        funções do contrato, chamando http.js
├── mock/drop-api.js   mesmas funções e mesmos formatos, com o simulador atual
├── api-log.js         log de requisições (usado pelo painel)
└── index.js           exporta drop-api ou mock/drop-api conforme VITE_API_MODE
src/composables/
└── usePolling.js
```

As telas importam **só** de `src/services/index.js`. Nenhum componente chama `fetch`.

### 2. Configuração

```bash
# .env.example (versionado) — copiar para .env.local
VITE_API_MODE=mock            # mock | http
VITE_API_BASE_URL=/api/drop   # via Gateway
VITE_ENTERPRISE_ID=1          # provisório (task 10)
VITE_CUSTOMER_ID=             # provisório; vazio = gera um id e guarda no localStorage
```

```js
// vite.config.js
server: { proxy: { '/api': 'http://localhost:5000' } }
```

Para testar vários clientes na fila, `?customer=<id>` na URL sobrescreve o id (só quando `import.meta.env.DEV`).

### 3. `http.js`

- `request(method, path, { body, signal, timeoutMs = 10000 })`
- Envia `Content-Type: application/json`, `X-Enterprise-Id` e `X-Customer-Id`
- **2xx** → lê o envelope e devolve `content`. `isSuccess: false` com 200 também vira `ApiError`
- **Não-2xx** com `application/problem+json` → `ApiError` montado a partir do ProblemDetails
- Falha de rede / timeout → `ApiError` com `status: 0`, `code: 'Network'` ou `'Timeout'`
- **Relógio do servidor:** a cada resposta, calcula `offset = Date(header) − Date.now()` e expõe `serverNow()`. Countdown e prazos usam `serverNow()`, nunca `new Date()`
- Registra cada chamada em `api-log.js` (mesmo formato de hoje, para o painel continuar funcionando)

### 4. `ApiError`

```js
class ApiError extends Error {
  status      // HTTP (0 = rede)
  code        // "Queue.NotOpen", "Checkout.SoldOut", "Network"…
  message     // detail do ProblemDetails
  fieldErrors // { shippingZipCode: ['CEP inválido.'] }: sufixo depois do último "."
  traceId
}
```

Regra de `fieldErrors` em `CONTRATO-API.md` §2.

### 5. `drop-api.js`: uma função por linha do contrato

| Função | Endpoint (`CONTRATO-API.md` §4) |
|---|---|
| `listPublicEvents()` | `GET /drop-events/get-public` |
| `getEvent(id)` | `GET /drop-events/get-by-id/{id}` |
| `getEventBySlug(slug)` | `GET /drop-events/get-by-slug/{slug}` |
| `getEventProducts(eventId)` | `GET /drop-products/get-by-event/{eventId}` |
| `joinQueue(eventId)` | `POST /queue-entries/join` |
| `getQueueStatus(entryId)` | `GET /queue-entries/status/{id}` |
| `getMyQueueEntry(eventId)` | `GET /queue-entries/get-my-entry/{eventId}` (404 → `null`) |
| `leaveQueue(entryId)` | `POST /queue-entries/leave/{id}` |
| `reserve({ queueEntryId, dropProductId, quantity })` | `POST /drop-reservations/reserve` |
| `validateCoupon(eventId, code)` | `GET /drop-coupons/validate` |
| `checkout(payload)` | `POST /drop-orders/checkout` |

Todas devolvem o `content` já desembrulhado ou lançam `ApiError`. Os nomes de campo seguem **exatamente** o back-end (`queueEntryStatusId`, `dropEventStatusId`, `unitsAllocated`…): sem renomear na camada de serviço.

### 6. `mock/drop-api.js`: simulador no formato do contrato

Mover o simulador de `api.js` para cá, com as **mesmas assinaturas e os mesmos formatos** de `drop-api.js`:

- `statusId` → `queueEntryStatusId` / `dropEventStatusId`, com os ids da §3 (3 = Finalizando compra, 5 = Expirado)
- Erros como `ApiError` com os mesmos `code` do back-end (`Queue.NotOpen`, `Checkout.SoldOut`…)
- `getQueueStatus` devolve o DTO de status (`position`, `totalWaiting`, `checkoutDeadline`, `serverNow`)
- Checkout em duas etapas (`reserve` + `checkout`), com totais calculados no mock

Os controles do simulador (`updateSettings`, `updateEventSettings`, `resetSimulation`, tempo virtual) ficam exportados **só** pelo mock. No modo mock, `serverNow()` devolve o tempo virtual.

### 7. `usePolling(fn, intervalMs, { immediate, pauseWhenHidden })`

Composable com `ref`s `data`, `error`, `isLoading` (só na primeira carga) e `isRefreshing`. Limpa o intervalo em `onUnmounted`, pausa com a aba oculta (`visibilitychange`) e **mantém o último `data`** quando uma chamada falha. Usado pelas tasks 16 (estoque, 4s) e 17 (fila, 3s).

### 8. Painel de simulação

`SimulationPanel.vue` só é montado com `VITE_API_MODE=mock`. No modo `http`, o log de requisições continua disponível (é útil para depurar a integração) num bloco somente leitura.

## Critérios de aceite

- [ ] Nenhum componente importa `fetch` nem URLs: tudo passa por `src/services/index.js`
- [ ] `VITE_API_MODE=mock` roda o app inteiro como hoje, sem back-end
- [ ] `VITE_API_MODE=http` com as tasks 10–11 prontas: portal carrega dados reais
- [ ] `ApiError` montado corretamente para ProblemDetails, ValidationProblemDetails, rede e timeout
- [ ] Mock e API real devolvem os mesmos nomes de campo e os mesmos ids de status
- [ ] `serverNow()` usa o cabeçalho `Date` no modo http e o tempo virtual no mock
- [ ] `.env.example` versionado; `.env.local` no `.gitignore`
- [ ] `src/services/api.js` removido
- [ ] Testes unitários de `http.js` (parse de envelope, ProblemDetails, `fieldErrors`, timeout) e de `usePolling`
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn "fetch(" src/ --include=*.vue          # vazio
grep -rn "services/api'" src/                    # vazio (api.js removido)
grep -rn "statusId" src/ | grep -v "EntryStatusId\|EventStatusId\|OrderStatusId\|PaymentStatusId\|ReservationStatusId\|CouponTypeId"   # vazio
VITE_API_MODE=mock npm run dev                   # app como antes
VITE_API_MODE=http npm run dev                   # com o back-end e o Gateway rodando
```

## Referências

- `CONTRATO-API.md` (inteiro): é a especificação desta task
- `design-system/patterns/states.md`: estados carregando / atualizando / erro que o `usePolling` alimenta

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md inteiro. No frontend, substitua
src/services/api.js por: http.js (fetch com cabeçalhos X-Enterprise-Id/X-Customer-Id,
timeout, parse do envelope Result, ProblemDetails → ApiError com fieldErrors, serverNow()
a partir do cabeçalho Date, log de requisições), api-error.js, status.js, drop-api.js (uma
função por endpoint da §4), mock/drop-api.js (o simulador atual reescrito para o mesmo
formato e códigos de erro do contrato) e index.js escolhendo o adaptador por VITE_API_MODE.
Crie src/composables/usePolling.js, .env.example e o proxy /api no vite.config.js.
Ajuste os imports de App.vue e dos componentes para o novo index.js, sem mudar
comportamento de tela. SimulationPanel só em modo mock. Testes de http.js e usePolling.
```
