# [Admin · Front-end] Catálogo do Drop e transferência de produtos entre vitrine e Drop

**Depende de:** 27 · **Combinar com:** 33 e 34 (mesma área do painel: produtos e estoque) · Fonte: [FluxoComercial.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Drop/Application/FluxoComercial.md), "Catálogo e contrato" e "Transferência de estoque"

## Funcionalidade alterada

Um produto é **ou** de vitrine **ou** de Drop, nunca dos dois ao mesmo tempo. O lojista pode:

- **transferir** um produto da vitrine para o Drop (o saldo sai da vitrine e entra no catálogo do Drop);
- **devolver** um produto do Drop para a vitrine (o saldo restante volta para o produto arquivado);
- **criar** um produto direto no Drop, sem passar pela vitrine;
- **associar** um produto do Drop a um evento, com limite por cliente.

## Estado atual

- O painel não conhece o catálogo do Drop. `AdminDropEditor.vue` escolhe um **produto da vitrine** como base do evento (`productId`), e `AdminCatalog.vue` mostra quantas unidades do produto estão "em drops" (`drop-products/get-all`), como se as duas coisas convivessem.
- O back-end já separa os módulos (Partes 6 e 7, 20–21/11/2026): o Store marca o produto com `isTransferredToDrop`, e o DROP tem catálogo próprio (`DropCatalogProduct` com variações, saldo e preço). O `ProductId` de um produto do Drop é só uma referência externa opcional ao Store.
- O mock já segue a regra (25/11/2026): os produtos-base dos drops (109–112) estão arquivados e com `isTransferredToDrop: true`, e nenhum produto ativo da vitrine está em drop.

## Como implementar

### 1. Rotas (no Gateway, prefixos `/api/store/api` e `/api/drop/api`)

| Ação | Serviço | Rota | Corpo / resposta |
|---|---|---|---|
| Arquivar o produto da vitrine | Store | `PUT products/{id}/active` | `{ isActive: false }` (pré-requisito da transferência) |
| Transferir para o Drop | Store | `POST products/{id}/drop-stock-transfer` | `{ idempotencyKey, expectedContractRevision }` → **202** |
| Listar o catálogo do Drop | DROP | `GET drop-catalog/products?afterId=` | até 50 principais por página, com `variants[]` (`sku`, `optionsJson`, `price`, `quantityOnHand`, `quantityReserved`), `storeProductId`, `isContractBlocked`, `isReturning`, `isReturned` |
| Cotas e transferências em curso | DROP | `GET drop-catalog/usage` | `contractRevision`, `allowsDrop`, `productLimit`, `catalogTotal`, `canCreate`, `publishedPrincipalEvents`, `blockedParticipations`, `awaitingStockTransfer`, `transferringStock` |
| Criar produto próprio | DROP | `POST drop-catalog/products` | `{ name, description, variants: [{ sku, options: { Tamanho: '40' }, price, quantity }] }` |
| Associar a um evento | DROP | `POST drop-catalog/products/{id}/events` | `{ dropEventId, maxPerCustomer }` |
| Devolver para a vitrine | DROP | `POST drop-catalog/products/{id}/return-to-store` | **202** (assíncrono) |
| Excluir do Drop | DROP | `DELETE drop-catalog/products/{id}` | 204; falha se houver reserva, estoque ou operação financeira |
| Reativar após downgrade | DROP | `POST drop-catalog/products/{id}/reactivate` | `{ expectedContractRevision }` |
| Reativar participações | DROP | `POST drop-catalog/reactivation/preview` e `/reactivation` | `{ expectedContractRevision, mode, participationIds? }` → `{ contractRevision, available, participationIds, applied }` |
| Histórico comercial | DROP | `GET drop-catalog/activity?beforeId=` | até 100 registros; exige `store.history.view` |

Permissões: `products.edit` para transferir; `drop.events.view` para ler o catálogo do Drop.

### 2. Vitrine → Drop (`AdminCatalog.vue`)

1. Ação "Transferir para o Drop" no menu do produto, com confirmação que explica: o produto sai da vitrine, o saldo vai inteiro para o Drop e a operação não é instantânea.
2. Se o produto está ativo, a confirmação arquiva primeiro (`PUT products/{id}/active`) e depois transfere.
3. `idempotencyKey` = `crypto.randomUUID()` gerado **ao abrir** a confirmação, reaproveitado em nova tentativa após erro de rede. `expectedContractRevision` vem de `GET drop-catalog/usage`.
4. Produto com `isTransferredToDrop` aparece com o badge "No Drop", fora dos filtros de produto ativo, sem ações de estoque e sem o botão de transferir.
5. Remova a coluna/contagem "em drops" (`inDrops`): ela pressupõe produto nos dois módulos.

Erros que o back devolve e precisam de mensagem própria (409): reserva, pedido em andamento, pagamento pendente ou incerto, operação financeira não resolvida, produto ativo, revisão de contrato desatualizada (recarregue `usage` e peça para confirmar de novo).

### 3. Catálogo do Drop (tela nova `AdminDropCatalog.vue`, rota `#/admin/drops/catalogo`)

- Lista paginada por cursor (`afterId` = id do último da página; "Carregar mais").
- Cada principal mostra: nome, origem ("Da vitrine" se `storeProductId`, "Criado no Drop" se não), variações com SKU, opções, preço e saldo livre (`quantityOnHand − quantityReserved`), e o estado: "Transferindo" (contado em `transferringStock`), "Devolvendo" (`isReturning`), "Bloqueado pelo plano" (`isContractBlocked`).
- Barra de cotas com `catalogTotal / productLimit` e `publishedPrincipalEvents`. Sem `canCreate`, o botão "Novo produto" fica desabilitado com o motivo.
- "Novo produto": formulário com nome, descrição e variações (até 200; SKU até 100 caracteres; quantidade até 1.000.000; preço positivo).
- "Associar a evento": escolhe um evento (`drop-events/get-all`) e o `maxPerCustomer`. Se o limite for igual ou maior que o saldo, mostre a recomendação de concentração (o back aceita; a tela só avisa, sem bloquear).
- "Devolver para a vitrine": só habilitado sem evento ativo ou futuro (inclusive rascunho futuro). A confirmação explica que o saldo restante volta para o produto arquivado na vitrine e que o produto continua arquivado até alguém reativá-lo.

### 4. Drop → Vitrine e eventos (`AdminDropEditor.vue`)

O evento deixa de escolher um produto da vitrine. Os produtos do evento vêm do catálogo do Drop, pela associação do item 3. O campo `productId` do formulário sai.

### 5. Assincronia

Transferência e devolução respondem **202**: um worker conclui em até ~30 s. Depois da ação, a tela mostra o item como "Transferindo"/"Devolvendo" e relê `usage` e a lista a cada 5 s, por no máximo 2 minutos, até o estado mudar.

### 6. Mock

`mock/drop-catalog.js`, nas mesmas rotas, com as regras da tabela. A transferência marca o produto do Store (`isTransferredToDrop`, saldo zerado), cria o principal com `storeProductId` e só "conclui" na próxima leitura, para a tela exercitar o estado intermediário.

## Critérios de aceite

- [ ] Nenhum produto ativo da vitrine aparece como item de evento de drop
- [ ] Transferir tira o produto da vitrine (busca pública e sacola) e o mostra no catálogo do Drop
- [ ] Devolver só é possível sem evento ativo/futuro, e o produto volta arquivado para a vitrine
- [ ] Repetir a transferência após erro de rede usa a mesma `idempotencyKey`
- [ ] Cotas e bloqueios de plano vêm de `drop-catalog/usage`; nenhuma conta de cota no front
- [ ] Estados "Transferindo" e "Devolvendo" aparecem e se resolvem sozinhos
- [ ] Funciona em `VITE_API_MODE=mock` e `http`

## Verificação

```bash
grep -rn "inDrops" src                              # 0
grep -rn "drop-stock-transfer\|drop-catalog/" src/services   # rotas só na camada de serviços
npm run lint && npm run ds:check
```

## Referências

- `FluxoComercial.md` (back-end), seções "Catálogo e contrato", "Transferência de estoque" e "Rotas públicas e administrativas"
- Tasks 24 (gestão de drops), 25 (catálogo), 33 e 34 (produtos e estoque por SKU)
- `design-system/components/table.md`, `badge.md`, `modal.md`, `patterns/states.md`

## Para o Claude Code

> Leia a task inteira e `FluxoComercial.md`. Crie as funções do catálogo do Drop e da transferência em `src/services/admin-api.js` (ou `drop-catalog-api.js`), o mock `mock/drop-catalog.js`, a tela `AdminDropCatalog.vue` e a ação de transferir em `AdminCatalog.vue`; tire o `productId` de `AdminDropEditor.vue`. Combine antes com quem está nas tasks 33 e 34, que mexem em `AdminCatalog.vue`. Não crie bloco `<style>`.
