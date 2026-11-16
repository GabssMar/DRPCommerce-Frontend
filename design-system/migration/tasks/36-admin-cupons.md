# [Admin · Front-end] Cupons: disponibilidade, ativação, condições e simulação

**Depende de:** 27 · Fonte: Endpoints.md, "Cupons"; [Coupons.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Application/Coupons.md)

## Funcionalidade alterada

O lojista cria cupons **com condições** (valor mínimo, quantidade de itens, cliente novo ou recorrente), acompanha se estão agendados, ativos, expirados ou esgotados e **testa** um cupom antes de divulgar.

## Estado atual

`AdminCoupons.vue` usa `coupons.getAll()` e edita via CRUD. Sem condições, sem situação calculada e sem simulação.

## Como implementar

| Ação | Rota |
|---|---|
| Buscar | `GET coupons/search?code&typeId&isActive&availability&page&pageSize` |
| Ativar ou desativar | `PUT coupons/{id}/activation`, corpo **booleano puro** (`true`) |
| Tipos e operadores de condição | `GET coupons/condition-types` · `GET coupons/condition-operators` |
| Simular | `GET coupons/validate?code&subTotal&itemQuantity&customerId?` |

1. **Lista** com a coluna Situação (`Scheduled`, `Active`, `Expired`, `Exhausted`, `Inactive`) em `.ds-badge`, filtro por situação e a coluna uso `usedCount / maxUses`.
2. **Editor de condições:** linhas "tipo + operador + valor(es)", com tipos e operadores **carregados do back** (nada de ID fixo). O operador "entre" pede dois valores.
3. **Simulador:** painel com código, subtotal, quantidade e cliente opcional (busca da task 38). Mostra o desconto e o motivo da recusa. Avise que **não reserva uso**.
4. Explique o `usedCount` no tooltip: inclui usos comprometidos em pedidos pendentes, que são liberados se o pedido expirar ou for cancelado.

## Critérios de aceite

- [ ] Cupom com duas condições criado e simulado pela tela
- [ ] A ativação envia `true`/`false` puro (não `{ isActive }`)
- [ ] Nenhum ID de tipo ou operador fixo no código

## Para o Claude Code

> Funções em `admin-catalog-api.js`; tela em `AdminCoupons.vue`. Corpo da ativação é diferente dos outros módulos: confira na documentação.
