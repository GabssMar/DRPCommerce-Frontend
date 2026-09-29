# [API · Front-end] Checkout com dados reais: reserva, cupom e pedido

**Depende de:** tasks 15, 14 e 17 · **Recomendado depois de:** task 07 (DS do checkout)

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | Design System (`ds-*`, `var(--ds-*)`), **sem bloco `<style>` nos `.vue`** |
| Dados | `src/services/index.js` (task 15) |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API via `Commerce.Gateway` (YARP, porta 5000). Contrato em `CONTRATO-API.md` |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

`CheckoutModal.vue` e `handleCheckoutSubmit` do `App.vue`: da chamada da fila até o pedido criado, com preço, desconto, frete e prazo vindos do servidor.

## Estado atual

- O cupom `DROP10` é validado **no front** (`formData.couponCode === 'DROP10'`), e o desconto é calculado localmente.
- O pedido é criado numa chamada só (`createDropOrder`), com `addressLine`/`city`/`state`/`zipCode` e sem reserva.
- Frete de R$ 20 fixo no mock.
- Erros voltam como `listMessageErrors` genérico, sem ligação com o campo.
- `fullName` e `email` são coletados e **não são enviados** a lugar nenhum.

## Como implementar

### 1. Fluxo

| Momento | Chamada | Na tela |
|---|---|---|
| Modal abre (status 2 Chamado) | `reserve({ queueEntryId, dropProductId, quantity: 1 })` | skeleton do resumo → subtotal (`totalAmount`) e prazo (`expiresAt`) |
| Clicar "Aplicar" no cupom | `validateCoupon(eventId, code)` | desconto (`discountAmount`) ou erro no campo do cupom |
| Clicar "Confirmar compra" | `checkout({ reservationId, couponCode, shipping… })` | loading no botão (DS task 07) |
| Sucesso | — | número do pedido (`id`) em `--ds-font-mono`, totais da resposta, badge `--success` |

- `dropProductId` vem de `getEventProducts` (task 16). `queueEntryId` vem da fila (task 17).
- Reabrir o modal com status 3 chama `reserve` de novo: o back-end é idempotente e devolve a mesma reserva.
- O prazo do modal é `expiresAt − serverNow()`. Ao zerar, o modal fecha explicando o motivo (task 07), e o polling da fila (task 17) já vai mostrar status 5.

### 2. Mapa de campos formulário ↔ API

| Campo do formulário | Campo no `checkout` | Erro vindo de `fieldErrors` |
|---|---|---|
| `addressLine` | `shippingAddressLine` | `shippingAddressLine` |
| `city` | `shippingCity` | `shippingCity` |
| `state` | `shippingState` | `shippingState` |
| `zipCode` | `shippingZipCode` | `shippingZipCode` |
| `couponCode` | `couponCode` | `couponCode` / `Coupon.Invalid` |
| `fullName`, `email` | **conforme decisão da task 14** | — |

Renomear os campos do formulário para os nomes da API é aceitável, e elimina a tabela de tradução.

### 3. Totais

O resumo exibe **somente** valores devolvidos pela API (`reserve` antes, `checkout` depois). Nenhum cálculo de desconto, frete ou total no front. Formatação `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

### 4. Erros (`ApiError.code` → comportamento)

| `code` | Comportamento |
|---|---|
| 400 com `fieldErrors` | erro abaixo de cada campo (`aria-invalid` + `role="alert"`, task 07) |
| `Coupon.Invalid` | erro no campo do cupom, com o `detail` |
| `Checkout.NotYourTurn` / `Checkout.WindowExpired` / `Checkout.ReservationExpired` | fecha o modal com a explicação; a fila mostra "expirado" |
| `Checkout.SoldOut` | fecha o modal: "Esgotou antes da confirmação" |
| `Checkout.LimitExceeded` | mensagem no topo do modal |
| `Network` / `Timeout` no **checkout** | **não reenviar automaticamente**: mostrar "Confirmando seu pedido…" e reconsultar o status da fila. Status 4 = pedido criado (mostrar sucesso); status 3 com reserva ainda válida = liberar "Tentar de novo" |

O último caso importa: um timeout no checkout pode ter criado o pedido, e reenviar às cegas pode gerar cobrança dupla quando houver pagamento.

### 5. Limpeza

Sai do front: validação local de `DROP10`, cálculo de desconto e frete, `createDropOrder`, `ORDER_SUCCESS_PREFIX` no `localStorage`.

## Critérios de aceite

- [ ] Reserva criada ao abrir o modal; resumo e prazo vêm dela
- [ ] Cupom validado pela API; nenhuma regra de cupom no front
- [ ] Pedido criado via `checkout`; confirmação mostra `id` e totais da resposta
- [ ] Erros de campo aparecem no campo certo
- [ ] Todos os `code` da tabela tratados; timeout no checkout não reenvia sozinho
- [ ] Nenhum cálculo monetário no front (`grep` abaixo)
- [ ] Funciona com `VITE_API_MODE=http` e `mock`

## Verificação

```bash
grep -rnE "DROP10|\* 0\.9|\+ 20|ORDER_SUCCESS|createDropOrder" src/ | grep -v "services/mock"   # vazio
npm run lint
```

Manual (modo http, tasks 10–14): ser chamado na fila, abrir o checkout, aplicar cupom válido e inválido, enviar CEP inválido, confirmar o pedido e conferir no banco: `pedido` e `item_pedido` criados, reserva confirmada, `units_sold` incrementado. Repetir deixando a reserva expirar com o modal aberto.

## Referências

- `CONTRATO-API.md` §2 (erros) e §4 (Checkout)
- Task 14 (regras e códigos do back-end) e task 07 (comportamento do modal)
- `design-system/components/input.md`, `components/modal.md`

## Para o Claude Code

```
Leia frontend/design-system/migration/tasks/CONTRATO-API.md §2 e §4 (Checkout) e as tasks
14, 15 e 17. Conecte CheckoutModal.vue e o App.vue a reserve (ao abrir o modal),
validateCoupon e checkout de src/services/index.js. Resumo, prazo e totais vêm só das
respostas da API (prazo = expiresAt − serverNow()); fieldErrors vão para os campos
conforme a tabela; trate os códigos Checkout.* e Coupon.Invalid; timeout no checkout não
reenvia sozinho. Remova do front a validação local de cupom, o cálculo de desconto/frete,
createDropOrder e o localStorage de pedido. Siga a decisão da task 14 sobre fullName/email.
Não crie bloco <style>.
```
