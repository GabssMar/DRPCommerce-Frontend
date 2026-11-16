# [Admin · Front-end] Estoque por SKU: saldo, ajuste com versão, movimentações e reservas avulsas

**Depende de:** 27, 33 · Substitui o `adjustStock` provisório da task 25 · Fonte: Endpoints.md, "Estoque e reservas"

## Funcionalidade alterada

O lojista **dá entrada e baixa no estoque** de cada SKU, vê o histórico de movimentações e separa unidades com reservas avulsas.

## Estado atual

`adjustStock` chama `POST products/adjust-stock`, **rota que não existe** (foi planejada na task 19). O back implementou o estoque por variante: saldo, reservado, disponível e uma **versão** para concorrência.

## Como implementar

| Ação | Rota (`inventory.manage`) |
|---|---|
| Saldo do SKU | `GET inventory/variants/{id}` → estoque, reservado, disponível, `version` |
| Ajustar | `PUT inventory/variants/{id}/adjust` `{ quantityChange, reason, idempotencyKey, expectedVersion? }` |
| Histórico | `GET inventory/movements?productVariantId&page&pageSize` |
| Reserva avulsa | `POST inventory/reservations` `{ idempotencyKey, reference?, items: [{ productVariantId, quantity }] }` |
| Ver, liberar ou efetivar reserva | `GET inventory/reservations/{id}` · `PUT …/{id}/release` · `PUT …/{id}/commit` |

1. **Painel de estoque do SKU:** três números (`.ds-stat`): físico, reservado e disponível.
2. **Ajuste:** um `ModalDialog` com entrada ou saída, quantidade e motivo obrigatório. Envie `expectedVersion` com a versão lida. Com **412/409** de versão, mostre "O saldo mudou enquanto você editava", recarregue e mantenha o formulário preenchido. `idempotencyKey` por envio (`crypto.randomUUID()`), reaproveitada se o envio for repetido.
3. **Movimentações:** tabela paginada com data, operação, quantidade, saldo resultante e ator.
4. **Reservas avulsas:** lista e criação com no máximo 100 SKUs e 10.000 unidades. Reservas de **pedido** devolvem 409 `Inventory.OrderReservationProtected` ao liberar ou efetivar: esconda os botões nelas e trate o 409 com essa mensagem.

## Critérios de aceite

- [ ] `adjustStock` provisório removido; ajuste real com versão funcionando
- [ ] O conflito de versão não perde o que foi digitado
- [ ] O histórico mostra o ajuste recém-feito

## Para o Claude Code

> Crie as funções em `admin-catalog-api.js` e a aba "Estoque" no editor de produto da task 33. Não calcule o disponível no front.
