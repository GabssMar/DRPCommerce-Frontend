# [API · Front-end] Checkout do drop com dados reais: reserva por variação e pagamento

**Depende de:** tasks 15, 14, 16 e 17 · **Recomendado depois de:** task 07 (DS do checkout)

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

## Revisão de 25/11/2026

O back-end reescreveu a compra do drop (Partes 6 e 7, [FluxoComercial.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Drop/Application/FluxoComercial.md)): a reserva é por **variação** dentro da sessão da fila, e o checkout parte da reserva e devolve a **URL de pagamento** do Mercado Pago da loja. Hoje não há cupom nem frete no checkout do drop (frete zero), e o endereço vem do **cadastro do cliente**, não de um formulário do modal.

## Como implementar

### 1. Rotas (cliente logado, prefixo `/api/drop/api/storefront/{slug}/drop`)

| Momento | Rota | Corpo / resposta |
|---|---|---|
| Chamado na fila (status 2), escolheu variações | `POST events/{id}/reservations` | `{ participationId, sessionId, idempotencyKey, lines: [{ variantId, quantity }] }` → `DropReservationResponse`: `id`, `quantity`, `totalAmount`, `expiresAt`, `lines[]` (`variantId`, `sku`, `itemName`, `quantity`, `unitPrice`, `optionsJson`) |
| Consultar reserva | `GET reservations/{id}` · `GET reservations` | reserva própria (status 1 Ativa, 2 Confirmada, 3 Expirada, 4 Cancelada) |
| Pagar | `POST reservations/{id}/checkout` | `DropPurchaseResponse`: `id`, `totalAmount`, `paymentCheckoutUrl`, `dropOrderPaymentStatusId`, endereço e `items[]` |
| Acompanhar | `GET purchases/{id}` | mesmo formato; `financialReviewCode` quando o pagamento caiu em revisão |

- `participationId` e `variantId` vêm do detalhe do evento (task 16); `sessionId` vem de `session.id` da fila (task 17).
- `idempotencyKey` = `crypto.randomUUID()` criado quando o cliente confirma as variações e **reaproveitado** em qualquer nova tentativa da mesma reserva.
- O checkout é idempotente pela reserva: repetir devolve o mesmo pedido.

### 2. Tela (`CheckoutModal.vue` vira o resumo da reserva)

1. Escolha das variações e quantidades de uma participação, até `maxPerCustomer` somando todas as variações.
2. "Reservar" → resumo com as linhas, `totalAmount` e prazo (`expiresAt − serverNow()`, o mesmo da sessão: 15 min fixos).
3. Endereço de entrega lido do cadastro (`GET storefront/me`), só para conferência, com link para "Minha conta" se estiver incompleto.
4. "Ir para o pagamento" → `checkout` → abre `paymentCheckoutUrl`. **Voltar do Mercado Pago não confirma a compra**: a tela de retorno consulta `GET purchases/{id}` e mostra "Aguardando confirmação do pagamento" até o status mudar.
5. Frete: "Grátis" (o checkout do drop usa frete zero; não é cotação).

### 3. Erros (`code` → comportamento)

| `code` | Comportamento |
|---|---|
| `DropPurchase.PurchaseLimit` | mensagem no resumo: limite do CPF no produto atingido (conta reservas vigentes e compras) |
| `DropPurchase.InsufficientStock` / `ProductUnavailable` | volta para a escolha de variações e relê o detalhe (task 16) |
| `DropPurchase.SessionExpired` / `SessionNotFound` | fecha o modal: "Seu prazo terminou"; a fila (task 17) mostra o status 5 |
| `DropPurchase.IdempotencyConflict` | gera nova chave e pede para confirmar de novo |
| `DropPurchase.InvalidTotal` / `InvalidReservation` | mensagem genérica no topo |
| `DropPurchase.AddressRequired` (409 no checkout) | "Complete o endereço", com link para a conta |
| `DropPurchase.ReservationExpired` / `ReservationNotFound` | fecha o modal com a explicação |
| rede / timeout na reserva ou no checkout | **não reenviar sozinho**: consulta `GET reservations` / `GET purchases/{id}` e, se nada foi criado, libera "Tentar de novo" com a mesma `idempotencyKey` |

### 4. Limpeza

Sai do front: validação local de `DROP10`, cálculo de desconto e frete, formulário de endereço do modal, `createDropOrder` e `ORDER_SUCCESS_PREFIX` no `localStorage`.

## Critérios de aceite

- [ ] Reserva por variação com `participationId`, `sessionId`, `idempotencyKey` e `lines`
- [ ] Limite por CPF respeitado somando as variações; o erro do back aparece no resumo
- [ ] Prazo do resumo = `expiresAt − serverNow()`
- [ ] Checkout abre `paymentCheckoutUrl`; o retorno só mostra "confirmado" depois de `GET purchases/{id}`
- [ ] Timeout não reenvia sozinho, e a nova tentativa usa a mesma chave
- [ ] Nenhum cálculo monetário no front
- [ ] Funciona com `VITE_API_MODE=http` e `mock`

## Verificação

```bash
grep -rnE "DROP10|\* 0\.9|\+ 20|ORDER_SUCCESS|createDropOrder" src/ | grep -v "services/mock"   # vazio
npm run lint
```

## Referências

- `FluxoComercial.md` (back-end), seções "Fila e compra" e "Pagamento e confirmação"
- Tasks 16 e 17; task 07 (comportamento do modal)
- `design-system/components/modal.md`, `components/input.md`

## Para o Claude Code

```
Leia a task inteira. Crie reserveDrop(eventId, { participationId, sessionId, idempotencyKey, lines }),
getDropReservation(id), checkoutDrop(reservationId) e getDropPurchase(id) em client-api.js e conecte
CheckoutModal.vue e o App.vue a elas: escolha de variações até maxPerCustomer, resumo e prazo só da
resposta, endereço do cadastro, redirecionamento para paymentCheckoutUrl e tela de retorno que consulta
a compra. Trate os códigos da tabela; timeout não reenvia sozinho. Atualize o mock nas mesmas rotas.
Remova o cupom e o frete locais e o formulário de endereço do modal. Não crie bloco <style>.
```
