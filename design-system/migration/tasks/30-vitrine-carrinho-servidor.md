# [Vitrine · Front-end] Carrinho no servidor: itens, seleção, indisponíveis e prévia de cupom

**Depende de:** 27, 28, 29 · Fonte: Endpoints.md, "Carrinho do cliente" e "Prévia pública de cupom"; [OrdersAndCheckout.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Application/OrdersAndCheckout.md)

## Funcionalidade alterada

A **sacola** passa a viver no back-end: acompanha o cliente entre dispositivos, mostra preço e disponibilidade atuais e deixa escolher **quais itens entram na compra**.

## Estado atual

`useBag.js` guarda `[{ productId, quantity }]` no `localStorage` e "não vai ao back". Sem SKU, sem preço recalculado e sem aviso de item esgotado. O cupom é validado buscando `coupons/get-all` (CRUD administrativo) e calculando o desconto no navegador (`couponDiscount`).

## Como implementar

| Ação | Rota (todas devolvem o carrinho atualizado) |
|---|---|
| Ler | `GET storefront/cart?couponCode=` |
| Adicionar (soma se o SKU já existe) | `POST storefront/cart/items` `{ productId, productVariantId?, quantity }` |
| Alterar quantidade | `PUT storefront/cart/items/{itemId}` `{ quantity }` |
| Remover um / vários / tudo | `DELETE storefront/cart/items/{itemId}` · `DELETE storefront/cart/items` `[ids]` · `DELETE storefront/cart` |
| Marcar para compra | `PUT storefront/cart/selection` `{ itemIds?, selected }` |
| Manter aguardando reposição | `PUT storefront/cart/items/{itemId}/await-stock` |
| Prévia de cupom | `GET storefront/coupons/validate?code&subTotal&itemQuantity` |

1. **`useBag` vira uma fachada:** com cliente logado, todas as operações chamam o back e o estado é o **último carrinho devolvido**. Sem login, mantém a sacola local; ao logar, envia os itens locais (`POST items`, um por SKU) e limpa o `localStorage`.
2. Os IDs das rotas são **IDs do item do carrinho**, não do produto. Não misture.
3. **Itens com `requiresDecision`** aparecem em um bloco "Precisa da sua decisão", com "Remover" e "Avisar quando voltar" (`await-stock`). Esses itens saem da seleção.
4. Checkbox por item e "selecionar todos" chamam `selection`. Os **totais exibidos são os dos selecionados**, vindos do back. A tela não soma nada.
5. **Cupom:** use a prévia pública, que não ocupa uso. Mostre o desconto devolvido e o aviso "o desconto é confirmado no pagamento".
6. Limites: 500 itens distintos e 10.000 unidades por item. Erro 400/409 vira mensagem no item, sem derrubar a tela.

## Critérios de aceite

- [ ] A sacola é a mesma em dois navegadores com o mesmo cliente
- [ ] Item esgotado não entra no total e oferece remover ou aguardar
- [ ] Nenhum cálculo de preço ou desconto no front (`couponDiscount` removido)
- [ ] O visitante sem login continua com a sacola local e ela migra no login

## Verificação

```bash
grep -rn "couponDiscount\|findStoreCoupon\|coupons/get-all" src   # 0
```

## Para o Claude Code

> Reescreva `src/composables/useBag.js` sobre `storefront-api.js` e ajuste `StoreCart.vue`. O mock precisa recalcular totais e marcar `requiresDecision` como o back faz.
