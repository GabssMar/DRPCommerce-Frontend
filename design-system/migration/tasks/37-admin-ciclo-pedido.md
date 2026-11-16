# [Admin · Front-end] Ciclo do pedido: busca, detalhe, pagamento manual, envio, entrega e cancelamento

**Depende de:** 27 · Atualiza a task 26 · Fonte: Endpoints.md, "Pedidos administrativos"; OrdersAndCheckout.md, "Ciclo de vida"

## Funcionalidade alterada

O lojista **opera os pedidos da vitrine**: confirma o pagamento recebido, separa, envia com rastreio, marca a entrega e cancela com estorno quando permitido.

## Estado atual

`setOrderStatus`, `refundOrder`, `saveShipment` e `issueInvoice` gravam por CRUD (`orders.patch`, `transactions.add`, `shipments.add`, `invoices.add`). O back agora **bloqueia transições livres pelo CRUD**: as mudanças de estado têm rotas próprias, que movimentam estoque e cupom na mesma transação.

## Como implementar

| Ação | Rota | Permissão |
|---|---|---|
| Buscar | `GET orders/search?number&statusIds&paymentStatusIds&customerId&couponId&createdFrom&createdTo&minTotal&maxTotal&sort&page&pageSize` | `orders.view` |
| Detalhe | `GET orders/{id}/detail` (itens, cobrança, envios e histórico) | `orders.view` |
| Confirmar pagamento | `POST orders/{id}/confirm-payment` `{ transactionMethodId?, gatewayReference?, note? }` | `orders.manage` |
| Iniciar processamento | `POST orders/{id}/start-processing` | `orders.manage` |
| Enviar | `POST orders/{id}/ship` `{ shipmentTypeId, carrierName, trackingCode, estimatedDelivery, note }` | `orders.manage` |
| Entregar | `POST orders/{id}/deliver` | `orders.manage` |
| Cancelar | `POST orders/{id}/cancel` `{ reason }` | `orders.cancel` (+ `orders.refund` se pago) |

1. A **lista** dos pedidos da vitrine usa `search` paginado e mostra o **número comercial**, não o id. Os pedidos de drop continuam pelo CRUD do Drop até a venda do Drop ser integrada (pendente no back).
2. O **detalhe** mostra a linha do tempo de `OrderStatusHistory` (de → para, ator, motivo, hora) e os botões **apenas da próxima transição válida**: pendente → confirmar pagamento; confirmado → processar; em processamento → enviar; enviado → entregar.
3. **Confirmar pagamento** é manual: o modal deixa claro "registre só depois de conferir o recebimento". Pedir o método só quando ainda não há cobrança.
4. **Enviar:** dados obrigatórios para produto físico; retirada local tem a exceção de transportadora.
5. **Cancelar:** disponível em pendente, confirmado e em processamento. Com o pedido pago, avise "o estorno é registrado, mas a devolução do dinheiro é feita fora do sistema" e exija `orders.refund`, com o botão bloqueado se faltar.
6. Remova `setOrderStatus`, `refundOrder`, `saveShipment` e `issueInvoice` do caminho da vitrine. Nota fiscal fica fora: `Invoice` não emite NF-e.

## Critérios de aceite

- [ ] Um pedido percorre pendente → entregue só pelos botões da tela
- [ ] Sem `orders.refund`, o pedido pago não pode ser cancelado (botão desabilitado com o motivo)
- [ ] Nenhum `orders.patch` ou `transactions.add` para mudar estado de pedido da vitrine

## Para o Claude Code

> Funções em `admin-api.js` (seção pedidos). Ajuste `AdminOrders.vue` e o detalhe. Não trate pedido de drop com essas rotas: elas existem só no Store.
