# [Admin · Front-end] Clientes: busca com métricas, endereços e pedidos

**Depende de:** 27, 37 · Fonte: Endpoints.md, "Clientes no backoffice"

## Funcionalidade alterada

O lojista **encontra um cliente** por nome, e-mail ou telefone e vê quanto ele comprou, quando foi a última compra, os endereços e os pedidos.

## Estado atual

`AdminCustomers.vue` carrega `customers.getAll()` e calcula métricas no navegador, cruzando pedidos.

## Como implementar

| Ação | Rota (`customers.view`) |
|---|---|
| Buscar | `GET customers/search?term&isActive&isVerified&emailConfirmed&stateId&hasOrders&createdFrom&createdTo&sort&page&pageSize` |
| Endereços | `GET customers/{id}/addresses` |
| Pedidos do cliente | `GET orders/search?customerId=` (task 37) |

1. **Tabela** com nome, contato, UF, compras concluídas, total gasto, última compra e situação. As métricas **vêm do back**: rascunho não conta como compra.
2. Filtros na toolbar, com período em dois campos de data.
3. **Detalhe** do cliente (painel lateral) com dados, endereços e a lista paginada de pedidos, cada um com link para o detalhe da task 37.

## Critérios de aceite

- [ ] Nenhum cálculo de total gasto no front
- [ ] Do cliente para o pedido em dois cliques

## Para o Claude Code

> Remova o cruzamento de `customers.getAll()` com pedidos. Não exponha dados do cliente no `request-log` além da URL.
