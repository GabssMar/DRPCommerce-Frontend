# [Admin · Front-end] Configurações comerciais da loja

**Depende de:** 27 · Fonte: Endpoints.md, "Configurações comerciais"; OrdersAndCheckout.md, "Configurações da loja"

## Funcionalidade nova

O dono define as **regras de venda** da loja: moeda, pedido mínimo, limite de unidades por pedido, venda sem estoque e o prazo para o cliente pagar.

## Estado atual

Configurações tem as abas Equipe, Empresa e Auditoria. As regras comerciais não aparecem em lugar nenhum.

## Como implementar

`GET` e `PUT store-settings` (`settings.manage`):

| Campo | Regra |
|---|---|
| `currencyCode` | 3 letras, padrão BRL (não converte moeda) |
| `minOrderValue` | ≥ 0, sobre o subtotal dos produtos |
| `maxItemsPerOrder` | opcional, de 1 a 10.000 unidades |
| `allowBackorder` | padrão `false` |
| `pendingOrderExpirationMinutes` | de 5 a 10.080, padrão 60 |

1. Nova aba **Vendas** em `#/admin/configuracoes/vendas`.
2. Formulário com validação no cliente nos mesmos limites; a expiração aparece também em horas ("60 min = 1 h").
3. Ao ligar `allowBackorder`, avise "clientes poderão comprar itens sem saldo".
4. O checkout (task 32) lê o prazo de expiração para exibir ao cliente.

## Critérios de aceite

- [ ] Salvar e reler mostra os valores gravados
- [ ] Valores fora dos limites são barrados antes do envio

## Para o Claude Code

> Crie `AdminStoreSettings.vue` e registre a aba em `AdminSettings.vue`.
