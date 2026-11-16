# [Vitrine · Front-end] Checkout real: idempotência, endereço, instruções de pagamento e cancelamento

**Depende de:** 30, 31 · Fonte: Endpoints.md, "Checkout e cancelamento do cliente"; OrdersAndCheckout.md, "Checkout"

## Funcionalidade alterada

O cliente **finaliza a compra da vitrine**: escolhe o endereço e a forma de pagamento, aplica o cupom e recebe o pedido numerado com as **instruções de pagamento** e o prazo.

## Estado atual

`placeStoreOrder` monta o pedido **no navegador**, com 4 chamadas CRUD (`orders/add`, `order-items/add-range`, `transactions/add`, `coupons/update`), preço e desconto calculados no front. O back agora **bloqueia** isso: preço, snapshot e transição são do servidor, e o CRUD não serve de atalho para venda. Também não há proteção contra clique duplo.

## Como implementar

1. **Uma chamada:** `POST storefront/checkout` com:

   ```json
   { "idempotencyKey": "<uuid da tentativa>", "paymentMethodId": 1, "couponCode": null,
     "addressId": 789, "useProfileAddress": false,
     "shippingAddressLine": null, "shippingCity": null, "shippingStateId": null, "shippingZipCode": null,
     "notes": null }
   ```

   O checkout compra os **itens selecionados do carrinho**. Não envie itens, preço nem desconto.
2. **Chave idempotente:** gere com `crypto.randomUUID()` ao abrir a revisão do pedido e guarde em `sessionStorage` até o sucesso. Repetir com a mesma chave (timeout ou F5) devolve o **mesmo pedido**. Uma compra nova usa chave nova. Se não houver resposta, consulte `GET storefront/orders` antes de reenviar.
3. **Endereço:** pode ser um endereço salvo (`addressId`), o endereço do perfil (`useProfileAddress`) ou um novo, digitado. `addressId` e `useProfileAddress` juntos são inválidos, então o formulário deixa escolher só uma das três opções.
4. **Etapas** com `StepsBar`: Sacola → Entrega → Pagamento → Revisão. Use `paymentMethodId` dos métodos habilitados, sem fixar ID.
5. **Resultado:** tela do pedido com o número comercial (não o id), o total do servidor, o **prazo de pagamento** (`pendingOrderExpirationMinutes` da loja) e as instruções. Hoje o pagamento é **manual**: diga "A loja confirmará o recebimento". Não simule Pix.
6. **Cancelar:** em `#/conta/pedidos/store/:id`, "Cancelar pedido" só aparece com o pedido **pendente** e chama `POST storefront/orders/{id}/cancel` `{ reason? }`.
7. **Erros 409** (estoque mudou, cupom esgotado, pedido mínimo): volte para a sacola com a mensagem e releia o carrinho.

## Critérios de aceite

- [ ] Clique duplo ou F5 no "Confirmar" geram **um** pedido
- [ ] Nenhuma chamada CRUD de pedido, item, transação ou cupom no fluxo do cliente
- [ ] O pedido mostra o número comercial, o prazo e as instruções manuais
- [ ] O cliente cancela o pedido pendente; o botão some em pedido pago

## Verificação

```bash
grep -rn "placeStoreOrder\|storeOrders.add\|orderItems\.\|transactions\.add" src/services/client-api.js src/components   # 0
```

## Para o Claude Code

> Substitua `placeStoreOrder` em `client-api.js` e ajuste `StoreCheckout.vue`. A task 18 (checkout do **drop**) continua separada: o Drop ainda não tem venda integrada ao Store.
