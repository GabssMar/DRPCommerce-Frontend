# DRPCommerce — Frontend

SPA do **DRPCommerce**: uma loja com dois modos de compra e um painel de gestão no mesmo app.

- **Drops** — lançamentos de estoque limitado com **fila prioritária de checkout**: o cliente entra numa fila, acompanha a posição, é chamado e tem uma janela de tempo para fechar o pedido.
- **Vitrine** — catálogo regular, sem fila: produto, sacola e checkout direto.
- **Painel do administrador** *(especificado, ainda não implementado)* — dashboard de vendas do dia e do mês, gestão de drops, catálogo, estoque e pedidos. Tasks 19–26 em [`design-system/migration/tasks/`](./design-system/migration/tasks/).

O back-end (`DropCommerce.Api` + `StoreCommerce.Api` atrás de um Gateway YARP) fica em repositório separado. Este front roda **sem back-end** por padrão, usando um simulador embutido (ver [Como o front enxerga o back-end](#como-o-front-enxerga-o-back-end)).

---

## Tecnologias

| Camada | Stack |
|---|---|
| Framework | **Vue 3** — Composition API, `<script setup>`, Single File Components |
| Build / dev server | **Vite 8** (`@vitejs/plugin-vue`) |
| Linguagem | **JavaScript** puro — sem TypeScript |
| Estilo | **CSS puro** com custom properties (`var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` — tamanhos 16/20/24, `stroke-width: 1.5` |
| Tipografia | Poppins (display) + Inter (UI), via Google Fonts no `index.html` |
| HTTP | `fetch` nativo — sem axios |
| Estado | Refs e `watch` do Vue + `localStorage`. Sem Pinia/Vuex |
| Roteamento | Por estado (`currentPage` em `App.vue`). Sem Vue Router |
| Qualidade | ESLint (`eslint-plugin-vue`, flat config) · Conventional Commits (commitlint + husky) |
| Back-end alvo | C# / .NET 9, ASP.NET Core Web API, Gateway YARP |

### Rodando

```bash
npm install
npm run dev      # Vite em http://localhost:5173
npm run build
npm run preview
npm run lint     # ESLint
```

Commits seguem [Conventional Commits](https://www.conventionalcommits.org/) — validados por commitlint no hook `commit-msg`.

---

## Design System

O visual **não** é improvisado por tela: existe um Design System versionado em [`design-system/`](./design-system), derivado por análise sistêmica do projeto [**Stratus CRM**](https://www.behance.net/gallery/215887035/Stratus-CRM-SaaS-UX-UI-Dashboard-Design) (Rondesignlab, 2024) e adaptado ao domínio de drop com fila.

Ele é **contrato, não sugestão**: [`design-system/CLAUDE.md`](./design-system/CLAUDE.md) define regras, anti-padrões e o checklist obrigatório antes de dar qualquer UI por pronta. Para ver o sistema renderizado, abra [`design-system/preview.html`](./design-system/preview.html) no navegador.

### A linguagem visual em uma tabela

| | |
|---|---|
| **Superfície** | canvas `#EDEEF0` + card branco. A hierarquia vem do contraste, não de bordas |
| **Marca** | periwinkle `#83A2DB` — cor de **bloco/superfície**, nunca de texto (2.58:1 em branco) |
| **Ação** | tinta `#2A292E`. O botão mais importante da tela é quase-preto, não azul |
| **Urgência** | coral `#FD8E8C` (fundo) / `#C5453F` (texto) |
| **Forma** | raio 24px em card, pill em badge, círculo em botão de ícone |
| **Tipografia** | hierarquia por tamanho e cor, nunca por peso |
| **Profundidade** | sombra difusa neutra. Sem glow, sem glass, sem gradiente |

### Arquitetura de tokens

`tokens.json` é a fonte da verdade; `tokens.css` publica as custom properties (light **e** dark) e `tokens.js` expõe paletas para gráficos e a troca de tema. Um token novo nasce nos três.

São duas camadas — **primitivos** (só dentro de `tokens.css`) e **semânticos** (os únicos usados em componente):

```css
/* design-system/tokens/tokens.css */
--ds-blue-400: #83A2DB;                  /* primitivo: MARCA — superfície apenas */
--ds-blue-600: #4A6FB5;                  /* primitivo: texto de marca (4.97:1)   */

--ds-surface-brand:  var(--ds-blue-400); /* semântico: use este                  */
--ds-text-brand:     var(--ds-blue-600); /* semântico: use este                  */
--ds-text-primary:   var(--ds-ink-800);
--ds-text-danger:    var(--ds-coral-600);
```

O CSS entra no app por um único import, e o tema claro é aplicado no boot:

```js
// src/main.js
import { createApp } from 'vue'
import '../design-system/styles/index.css'   // tokens -> base -> componentes -> utilitários
import './index.css'
import { initTheme } from '../design-system/tokens/tokens.js'
import App from './App.vue'

initTheme()                                   // claro por padrão; restaura a preferência salva
createApp(App).mount('#root')
```

### Regras inegociáveis (resumo)

- Nunca hex, `rgb()`, px de espaçamento ou sombra **literal** em componente — só `var(--ds-*)`.
- Toda cor tem par light/dark. Só no `:root` está incompleto.
- Componente novo = classe `ds-*` em `styles/components.css` **+** spec em `components/<nome>.md`. Nada de CSS solto no `.vue`.
- Todo interativo tem `:hover :active :focus-visible :disabled`, anel de foco `--ds-ring` e alvo ≥ 44px.
- Contraste ≥ 4.5:1 (texto) e ≥ 3:1 (bordas e ícones funcionais); funciona a 360px; respeita `prefers-reduced-motion`.

Convenção de nomes:

```
--ds-<categoria>-<papel>-<variante>     tokens       --ds-action-primary-bg-hover
.ds-<bloco>__<elemento>--<modificador>  componentes  .ds-card__header, .ds-btn--ghost
.ds-<utilitário>--<escala>              utilitários  .ds-stack--6, .ds-grid--sidebar
```

Na prática, uma tela é composição de classes — sem CSS local:

```vue
<article class="ds-card">
  <header class="ds-card__header">
    <h3 class="ds-card__title">Sua posição na fila</h3>
    <span class="ds-badge ds-badge--waiting"><span class="ds-badge__dot" />Aguardando</span>
  </header>
  <div class="ds-stat ds-stat--lg">
    <div class="ds-stat__value">127<span class="ds-stat__unit">º</span></div>
    <div class="ds-stat__label">de 1.842 na fila</div>
  </div>
</article>
```

### Verificação rápida

```bash
# nenhum literal de cor fora do design system
grep -rnE "#[0-9a-fA-F]{3,8}" src/ --include=*.vue --include=*.css

# nenhum resquício do tema legado (neon/glass)
grep -rn "glass-card\|shadow-neon\|backdrop-filter" src/
```

> `src/index.css` ainda carrega o tema **legado** (dark neon/glass), em substituição pelo Design System. O plano está em [`design-system/migration/from-neon-glass.md`](./design-system/migration/from-neon-glass.md).

---

## Drop e fila prioritária

Um **drop** (`DropEvent`) é um evento de venda com estoque alocado (`DropProduct`) e três marcos no tempo:

```
queueOpensAt ─────────── dropStartsAt ─────────────────── dropEndsAt
  fila abre               venda começa                     drop encerra
```

### Máquina de estados da tela

A tela do drop é dirigida por estado, não por navegação. `QueueStatus.vue` resolve badge + texto + CTA a partir do relógio e da entrada de fila:

| Estado | Quando | CTA |
|---|---|---|
| `scheduled` | agora < `queueOpensAt` | "Entrar na fila" desabilitado, com horário de abertura |
| aguardando | entrada com status **1** | posição + estimativa; permite sair da fila |
| chamado | entrada com status **2** | "Finalizar compra" — abre o `CheckoutModal` |
| expirado | janela de 600s estourou | explica a perda e oferece voltar |
| `ended` | agora ≥ `dropEndsAt` | "Fila encerrada" |

Regras que valem em toda a jornada: **1 unidade por cliente** (`maxPerCustomer`), estoque em polling de **4s**, posição na fila em polling de **3s**, e uma **janela de checkout de 600s** a partir do momento em que o cliente é chamado.

A fila em si:

```js
// src/components/QueueStatus.vue — polling de 3s enquanto aguarda
watch(localQueue, (entry) => {
  if (!entry || entry.statusId !== 1) return;

  const intervalId = setInterval(async () => {
    const response = await api.getQueueStatus(entry.id, entry.dropEventId);
    if (response.isSuccess) {
      localQueue.value = response.content;
      if (response.content.statusId !== 1) emit('join-queue', response.content);  // foi chamado
    }
  }, 3000);

  onWatcherCleanup(() => clearInterval(intervalId));
}, { immediate: true });
```

A janela de checkout, que expira a entrada quando zera:

```js
// src/App.vue — 600s contados a partir da chamada
watch([queueEntry, selectedEventId], ([entry, eventId]) => {
  if (!entry || entry.statusId !== 2) { secondsToExpiry.value = 600; return; }

  const timerId = setInterval(() => {
    if (secondsToExpiry.value <= 1) {
      clearInterval(timerId);
      const expiredEntry = { ...entry, statusId: 3, expiredAt: new Date().toISOString() };
      queueEntry.value = expiredEntry;
      localStorage.setItem(`veloce_queue_entry_${eventId}`, JSON.stringify(expiredEntry));
      api.updateEventSettings(eventId, { queueStatusId: 3 });
      isCheckoutOpen.value = false;
      return;
    }
    secondsToExpiry.value -= 1;
  }, 1000);

  onWatcherCleanup(() => clearInterval(timerId));
}, { immediate: true });
```

### Tabelas de status

O front mapeia **pelo id**, nunca pela descrição (ids são seed fixo do banco):

| `dropEventStatusId` | Badge |
|---|---|
| 1 Rascunho · 8 Cancelado | não aparece no portal |
| 2 Inscrições abertas · 3 Inscrições encerradas | `--scheduled` |
| 4 Fila aberta · 5 Ativo | `--live` |
| 6 Esgotado · 7 Encerrado | `--done` |

| `queueEntryStatusId` | Estado da tela |
|---|---|
| 1 Aguardando | "Na fila, aguardando" |
| 2 Chamado | "É a sua vez" — abre o checkout |
| 3 Finalizando compra | reserva ativa |
| 4 Concluído | "Pedido confirmado" |
| 5 Expirado | janela perdida |
| 6 Removido | saiu da fila |

> ⚠️ **Divergência conhecida.** O simulador atual (`src/services/api.js`) usa `statusId: 3` como *expirado*; no back-end 3 é *Finalizando compra* e 5 é *Expirado*. O campo também muda de nome (`statusId` → `queueEntryStatusId`). A correção faz parte da integração (task 15).

### Persistência local do drop

| Chave | Conteúdo |
|---|---|
| `veloce_queue_entry_<eventId>` | entrada na fila (sobrevive ao F5) |
| `veloce_order_success_<eventId>` | pedido confirmado — bloqueia nova entrada no mesmo drop |
| `veloce_sim_settings_v2` | estado do simulador (tempo virtual, fila, vendas) |

---

## Vitrine

Compra casual, **sem fila**: catálogo regular do `StoreCommerce`, filtrado por categoria, com sacola local e checkout direto. Três telas — `StoreShowcase.vue` (grade), `StoreProductDetail.vue` (detalhe) e `StoreCart.vue` (sacola).

| Regra | Onde |
|---|---|
| Só produtos com `isActive` | `getStoreProducts()` |
| `stockQuantity === 0` → badge "Esgotado" | `StoreShowcase.vue` |
| `stockQuantity <= 5` → badge "Últimas unidades" | `StoreShowcase.vue` |
| Máximo **10 unidades por pedido** por produto | `StoreProductDetail.vue` |
| Sem imagem → placeholder (`imageUrl` é opcional) | `StoreShowcase.vue` |

A **sacola vive só no front** — não há carrinho no back-end. É um array `[{ productId, quantity }]` persistido em `localStorage` sob `veloce_store_bag`:

```js
// src/App.vue
const BAG_KEY = 'veloce_store_bag';
const bag = ref(readBag());

watch(bag, (items) => {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(items)); }
  catch { /* storage bloqueado: a sacola vale só nesta sessão */ }
}, { deep: true });
```

No checkout, o front manda **apenas ids e quantidades** — o servidor valida estoque (409 se faltar) e calcula os totais:

```js
// src/App.vue
const response = await api.createStoreOrder(
  bag.value.map(({ productId, quantity }) => ({ productId, quantity }))
);
if (response.isSuccess) {
  storeOrder.value = response.content;
  bag.value = [];
  loadStoreData();          // o estoque mudou: recarrega o catálogo
}
```

Drops e Vitrine convivem no mesmo shell: a navegação do topo alterna entre os dois (`currentPage`: `portal` · `detail` | `vitrine` · `product` · `cart`).

---

## Como o front enxerga o back-end

### Topologia

```
Front-end (Vite)   :5173   SPA Vue. Em dev, faz proxy de /api para o Gateway
Commerce.Gateway   :5000   YARP. /api/drop/** -> Drop API · /api/store/** -> Store API
DropCommerce.Api   :5002   toda a API de drop consumida pelo front
StoreCommerce.Api  :5001   catálogo canônico — consumido só pelo back-end do Drop (Refit)
```

O front chama **sempre o Gateway**, nunca uma API diretamente:

```
front    GET /api/drop/drop-events/get-public
  ↓ proxy do Vite (dev) -> http://localhost:5000
gateway  /api/drop/{**}  ->  /api/{**}
  ↓
drop-api GET /api/drop-events/get-public
```

### Configuração

```bash
# .env.local
VITE_API_MODE=mock            # mock | http
VITE_API_BASE_URL=/api/drop   # via Gateway
VITE_ENTERPRISE_ID=1          # provisório, até existir autenticação
VITE_CUSTOMER_ID=             # vazio = gera um id e guarda no localStorage
```

```js
// vite.config.js
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
})
```

Cabeçalhos enviados em toda requisição — `X-Enterprise-Id` (loja dona dos drops) e `X-Customer-Id` (cliente). São **provisórios e inseguros**: qualquer um forja o cabeçalho. Antes de produção os dois passam a vir de um JWT.

### Formato das respostas

**Sucesso** — HTTP 200 com envelope `Result<T>`, camelCase, datas ISO 8601 UTC, dinheiro como `number`:

```json
{ "isSuccess": true, "content": {}, "errors": [], "listMessageErrors": [] }
```

**Erro** — `application/problem+json`, que **não** é o envelope:

```json
{
  "status": 409,
  "detail": "Você já está na fila deste drop.",
  "code": "Queue.AlreadyJoined",
  "traceId": "0HN…"
}
```

Validação (400) usa `ValidationProblemDetails` com os erros agrupados por código `<Command>.<Propriedade>`. **Regra do front:** o campo do formulário é o trecho depois do último `.` — `CheckoutDropOrderCommand.shippingZipCode` → `shippingZipCode`.

| Status | O que o front faz |
|---|---|
| 400 | erro por campo (validação) ou mensagem do `detail` |
| 401 / 403 | mensagem de sessão; sem retry automático |
| 404 | estado "não encontrado" da tela |
| 409 | regra de negócio (já na fila, esgotado, janela expirada): mensagem pelo `code` |
| 503 | "Serviço indisponível", retry com backoff |
| 500 | mensagem genérica + `traceId` no log |
| rede / timeout | "Reconectando…", mantém o último dado na tela |

### Mapa de endpoints

| Tela | Ação | Endpoint |
|---|---|---|
| Portal | lista de drops públicos | `GET /drop-events/get-public` |
| Detalhe | dados do evento | `GET /drop-events/get-by-id/{id}` |
| Estoque (4s) | produtos do drop | `GET /drop-products/get-by-event/{dropEventId}` |
| Fila | entrar | `POST /queue-entries/join` |
| Fila | restaurar ao recarregar | `GET /queue-entries/get-my-entry/{dropEventId}` |
| Fila (3s) | posição, `totalWaiting`, `checkoutDeadline`, `serverNow` | `GET /queue-entries/status/{id}` |
| Fila | sair | `POST /queue-entries/leave/{id}` |
| Checkout | reservar a unidade | `POST /drop-reservations/reserve` |
| Checkout | validar cupom | `GET /drop-coupons/validate?dropEventId=&code=` |
| Checkout | finalizar | `POST /drop-orders/checkout` |
| Vitrine | catálogo | `GET /api/store/products/get-all` |
| Vitrine | pedido | `POST /api/store/orders/add` |

Duas regras que o front respeita:

- **Totais são sempre calculados no servidor.** O checkout nunca envia `subTotal`, `totalAmount` nem `statusId`.
- **O CRUD administrativo não é para o front.** `POST /queue-entries/add` e `POST /drop-orders/add` existem, mas exigem que o cliente mande `position`, `sessionToken`, status e totais. Use os endpoints de caso de uso (`join`, `checkout`).

O contrato completo — campo a campo, tela por tela — está em [`design-system/migration/tasks/CONTRATO-API.md`](./design-system/migration/tasks/CONTRATO-API.md). **Mudou um campo ou uma rota, atualize esse arquivo na mesma PR.**

### Estado atual: simulador

Hoje `src/services/api.js` concentra três coisas: o **simulador**, o **cliente HTTP** e o **log de requisições**. Cada método tem a mesma forma — ramo mock ou ramo `fetch`:

```js
// src/services/api.js
async getAllDropEvents() {
  const url = `/api/drop-event/GetAll`;

  if (simSettings.isSimulationMode) {
    await delay(simSettings.networkLatency);
    const response = createEnvelope(true, /* eventos do simulador */);
    addApiLog('GET', url, null, 200, response);
    return response;
  }

  const res = await fetch(url);
  const data = await res.json();
  addApiLog('GET', url, null, res.status, data);
  return data;
}
```

O simulador oferece **tempo virtual** (`getVirtualTime()`), latência de rede artificial, avanço automático da fila e venda de unidades ao longo do drop — tudo controlável pelo `SimulationPanel.vue`, que também mostra o log das últimas 30 requisições. As telas se inscrevem no estado do simulador:

```js
const unsubscribeSim = subscribeToSimState((newSim) => { /* atualiza evento, fila, estoque */ });
onWatcherCleanup(unsubscribeSim);
```

> ⚠️ **O modo real ainda não funciona.** As URLs do ramo `fetch` (`/api/drop-event/GetAll`, `/api/queue-entry/Add`…) **não existem** no back-end, os erros são tratados como se também viessem no envelope `Result`, e não há proxy no `vite.config.js` nem `.env.example`. A camada HTTP definitiva está especificada na [task 15](./design-system/migration/tasks/15-front-camada-http.md): `http.js` + `api-error.js` + `status.js` + `drop-api.js` + `mock/drop-api.js` atrás de um `index.js` que escolhe o adaptador por `VITE_API_MODE`, mais o composable `usePolling`. As tasks 10–18 em [`design-system/migration/tasks/`](./design-system/migration/tasks/) cobrem a integração ponta a ponta.

Quando essa camada existir, valem os invariantes: **nenhum componente chama `fetch`** (tudo passa por `src/services/index.js`), mock e API real devolvem **os mesmos nomes de campo e os mesmos ids de status**, e countdowns usam `serverNow()` (derivado do cabeçalho `Date`), nunca o relógio do usuário.

---

## Estrutura

```
src/
├── main.js                    entrada: Design System, initTheme(), monta o App
├── App.vue                    shell + roteamento por estado (portal ↔ detalhe ↔ vitrine)
├── index.css                  tema LEGADO (neon/glass) — em migração
├── components/
│   ├── EventPortal.vue        grade de drops
│   ├── ProductDetails.vue     ficha do produto do drop
│   ├── Countdown.vue          contagem até abertura da fila / início / fim
│   ├── QueueStatus.vue        fila: posição, polling de 3s, CTA por estado
│   ├── StockProgress.vue      estoque alocado × vendido
│   ├── CheckoutModal.vue      checkout do drop (foco preso, validação por campo)
│   ├── StoreShowcase.vue      vitrine: grade + filtro por categoria
│   ├── StoreProductDetail.vue detalhe do produto da vitrine
│   ├── StoreCart.vue          sacola e fechamento do pedido
│   └── SimulationPanel.vue    controles do simulador + log de requisições
└── services/api.js            simulador + cliente HTTP + log

design-system/
├── CLAUDE.md                  o contrato (regras, anti-padrões, checklist)
├── ANALYSIS.md                a análise sistêmica que originou o sistema
├── preview.html               o sistema renderizado
├── tokens/                    tokens.json (fonte) · tokens.css · tokens.js
├── styles/                    index.css · base.css · components.css · utilities.css
├── foundations/               color · typography · space-layout · radius-elevation · motion · iconography
├── components/                uma spec por componente
├── patterns/                  app-shell · drop-page · states
└── migration/tasks/           CONTRATO-API.md + tasks 00–26
```

## Painel do administrador (planejado)

Terceiro módulo, ainda não implementado. A regra que organiza a série de tasks: **o painel não chama o back-end agora, mas nasce pronto para chamar.** Cada função da camada de dados (`src/services/admin/`) declara o endpoint real, o método e o corpo corretos em um mapa único, e um adaptador mock devolve exatamente o mesmo formato — incluindo as armadilhas do CRUD do back-end (`add`/`update` devolvem lista, não há `PATCH`, `createdAt` em UTC agrupado em `America/Sao_Paulo`). A virada é trocar `VITE_API_MODE=mock` por `http`, sem tocar em componente.

| # | Task | Entrega |
|---|---|---|
| 19 | Endpoints do admin (back-end) | controllers do Store, estoque em `Product`, `sales-summary`, `get-paged` |
| 20 | Componentes do painel (DS) | tabela ordenável, paginação, barras temporais, toolbar |
| 21 | Shell do painel | rota `#/admin/*`, layout com rail, navegação |
| 22 | Camada de dados | `admin-api` + mock no formato exato do back-end |
| 23 | Dashboard de vendas | KPIs do dia e do mês, pago × pendente, curva, ranking |
| 24 | Gestão de drops | lista, criação, edição e mudança de fase |
| 25 | Catálogo e estoque | produtos, preço e movimentação de saldo |
| 26 | Pedidos | lista unificada (drop + vitrine), detalhe e status |

O painel só monta com `VITE_ADMIN_ENABLED=true` (ou em DEV) e **não vai para ambiente aberto antes de existir autenticação** — hoje não há login em nenhuma das pontas.

## Fora de escopo (decisões registradas)

- **Autenticação** — `X-Customer-Id` e `X-Enterprise-Id` são provisórios; viram JWT antes de produção.
- **Pagamento** — o checkout cria o pedido com pagamento *Pendente*; integrar gateway é outra série.
- **Tempo real** — a fila usa polling de 3s. SignalR/SSE é evolução futura; o contrato de `status/{id}` continua válido.
- **Inscrição prévia e lista de espera** — existem no back-end, nenhuma tela usa hoje.
