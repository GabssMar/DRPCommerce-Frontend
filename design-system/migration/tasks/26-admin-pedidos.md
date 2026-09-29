# [Admin · Front-end] Pedidos: lista unificada, detalhe e mudança de status

**Depende de:** tasks 20, 21, 22 · Roda em `VITE_API_MODE=mock`

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (`<script setup>`) + **Vite** |
| Estilo | `.ds-table`, `.ds-toolbar`, `.ds-pagination`, `.ds-badge`, `.ds-card` |
| Dados | `listOrders`, `getOrder`, `setOrderStatus` (task 22) |

## Funcionalidade nova

A tela das **vendas realizadas**: todo pedido da loja, de drop e de vitrine, em uma lista só — com filtro, detalhe e avanço de status (confirmar, processar, enviar, entregar, cancelar).

## Estado atual

`AdminOrders.vue` renderiza `.ds-empty` (task 21). Hoje o pedido do drop existe só como objeto em `localStorage` (`veloce_order_success_<eventId>`) e o da vitrine só na resposta do mock — nenhuma tela lista pedidos.

No back-end são **duas entidades em dois serviços**:

| | `DropOrder` (Drop, 5002) | `Order` (Store, 5001) |
|---|---|---|
| Status | `dropOrderStatusId` | `orderStatusId` |
| Pagamento | `dropOrderPaymentStatusId` | `orderPaymentStatusId` |
| Origem | `dropEventId`, `dropReservationId` | — |
| Cupom | `dropCouponId` | `couponId` |
| UF de entrega | `shippingState` (**string**) | `shippingStateId` (**long**, entidade `State`) |
| Itens | `ListDropOrderItem` | `ListOrderItem` |

Os **ids de status são iguais nos dois** (seed idêntico): `1 Pendente · 2 Confirmado · 3 Em processamento · 4 Enviado · 5 Entregue · 6 Cancelado · 7 Reembolsado`; pagamento: `1 Pendente · 2 Pago · 3 Reembolso parcial · 4 Reembolso total · 5 Falhou`. O resto diverge — **não trate as duas entidades como uma só**.

## Como implementar

### 1. Lista unificada

A camada de dados (task 22) busca nos dois serviços e devolve linhas com uma chave `source: 'drop' | 'store'`. A tela **não** sabe de dois endpoints; ela sabe de uma coluna "Origem".

`.ds-toolbar`: busca (número do pedido, cidade), filtro de origem, filtro de status, período. `.ds-pagination` no rodapé.

| Coluna | Conteúdo |
|---|---|
| Pedido | `#{{ id }}` em `<code>` + `.ds-badge` de origem (Drop / Vitrine) |
| Data | `createdAt` em `01/10 14:32` — convertido de UTC para local |
| Itens | quantidade + nome do primeiro, truncado com `title` |
| Status | `.ds-badge` pela tabela acima |
| Pagamento | `.ds-badge` — coluna separada, nunca fundida com status |
| Total | `--numeric`, pt-BR |

Ordenação padrão: `createdAt` desc. Paginação real, vinda do `get-paged` (task 19 §4) — nunca carregue tudo e corte no cliente.

### 2. Status e pagamento são dois eixos

Um pedido "Enviado" com pagamento "Pendente" é um problema operacional, e a tela existe para tornar isso visível. Duas colunas, dois badges, nunca uma string combinada.

Mapa de badges: `2 Confirmado`/`5 Entregue`/`2 Pago` → `--success`; `1 Pendente` → `--scheduled`; `3`/`4` → `--live`; `6 Cancelado`/`7 Reembolsado`/`5 Falhou` → `--done`; reembolso parcial/total → `--waiting`.

### 3. Detalhe

Painel lateral (`.ds-grid--sidebar`) ou tela cheia no mobile:

- **Itens**: SKU, nome, quantidade, preço unitário, subtotal da linha;
- **Totais**: `subTotal`, `discountAmount`, `shippingCost`, `taxAmount`, `totalAmount` — nesta ordem, com o total destacado. Os valores vêm do servidor; **a tela nunca recalcula**, nem para "conferir";
- **Entrega**: `shippingAddressLine`, `shippingCity`, UF, `shippingZipCode`. Trate a divergência: string no Drop, id de `State` no Store;
- **Origem**: no pedido de drop, link para o evento (`dropEventId`) e a reserva (`dropReservationId`);
- **Cliente**: `customerId`. Não há endpoint de cliente exposto hoje — mostre o id e deixe o link pronto para quando existir.

### 4. Mudança de status

Como nos drops: não há `PATCH`. `setOrderStatus` lê o pedido, troca o campo e reenvia o objeto inteiro, no endpoint do serviço certo (task 22 §4.3).

Transições oferecidas:

```
1 Pendente ──► 2 Confirmado ──► 3 Em processamento ──► 4 Enviado ──► 5 Entregue
     └──────────────► 6 Cancelado ◄──────────┘
                      7 Reembolsado  (só a partir de 6, ou de 5 com pagamento 2)
```

- Nunca ofereça retrocesso (de `4 Enviado` para `1 Pendente`). Corrigir engano é caso de suporte, não de dropdown.
- `6 Cancelado` e `7 Reembolsado` pedem confirmação em `.ds-modal` com `.ds-btn--danger`, declarando o efeito: "o estoque não é devolvido automaticamente" (enquanto a task 19 não implementar estorno).
- Mudança de status **não** mexe no pagamento. São campos diferentes, com regras diferentes; a tela não simula baixa de pagamento.

### 5. Consistência com o dashboard

A soma da coluna Total, no mesmo período e com os mesmos filtros, **tem que bater** com o KPI da task 23 — as duas telas leem o mesmo seed pela mesma camada. Se divergir, a regra de exclusão (cancelado/reembolsado) está aplicada em um lugar só. Isso é critério de aceite das duas tasks.

### 6. Estados

Esqueleto de 8 linhas; `.ds-empty` "Nenhum pedido nesse filtro" com ação de limpar; erro com "Tentar de novo". Se **uma** das origens falhar, mostre a outra e sinalize qual faltou — igual ao dashboard, e sem apresentar a lista parcial como completa.

## Critérios de aceite

- [ ] Lista unificada com coluna de origem, busca, filtros (origem, status, período) e paginação do servidor
- [ ] Status e pagamento em colunas separadas, com o mapa de badges acima
- [ ] Detalhe com itens, totais na ordem do contrato e endereço, sem recálculo no cliente
- [ ] Divergência `shippingState` (string) × `shippingStateId` (long) tratada nas duas origens
- [ ] Mudança de status só nas transições permitidas, sem retrocesso, com confirmação nas destrutivas
- [ ] Pagamento não é alterado pela tela
- [ ] Soma do período bate com o KPI do dashboard (task 23)
- [ ] Falha de uma origem não vira lista parcial silenciosa
- [ ] Três estados tratados; `createdAt` convertido de UTC
- [ ] Zero estilo inline, zero hex, zero `<style>`; light e dark; 360px com cards
- [ ] Nenhuma chamada a `fetch` ou URL no componente
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn "fetch(\|/api/" src/components/admin/AdminOrders.vue   # vazio
grep -rn "totalAmount\s*=" src/components/admin/                 # vazio: a tela não calcula total
# no navegador: filtre por "mês atual" e compare a soma da coluna Total com o KPI do dashboard;
# tente cancelar um pedido entregue e confira a confirmação; force erro em uma origem
```

## Referências do Design System

- `components/table.md`: colunas, truncagem, mobile, ordenação · `components/badge.md`: mapa de status
- `components/toolbar.md`, `components/pagination.md` (task 20) · `components/modal.md`: confirmação destrutiva
- `patterns/states.md` · `CONTRATO-API.md` §3: ids de status dos pedidos

## Para o Claude Code

```
Leia CONTRATO-API.md §3, a task 22 e design-system/components/{table,badge,modal}.md.
Implemente AdminOrders.vue: lista unificada de DropOrder e Order com coluna de origem,
busca, filtros de origem/status/período, paginação do servidor e ordenação por data;
colunas separadas para status e pagamento com o mapa de badges; detalhe com itens, totais
do servidor (sem recalcular) e endereço, tratando shippingState string no Drop e
shippingStateId long no Store; mudança de status pelas transições permitidas, sem
retrocesso, com confirmação declarando o efeito nas destrutivas. setOrderStatus encapsula o
reenvio do objeto inteiro no serviço certo. A soma do período precisa bater com o KPI do
dashboard. Use só src/services/admin/. Sem CSS novo: faltou classe, PARE e reporte.
```
