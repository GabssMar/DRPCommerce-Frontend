# [Admin · Front-end] Catálogo e estoque da vitrine: produtos, preço e movimentação de saldo

**Depende de:** tasks 20, 21, 22 · **Decisão de modelagem na task 19 §2** · Roda em `VITE_API_MODE=mock`

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (`<script setup>`) + **Vite** |
| Estilo | `.ds-table`, `.ds-toolbar`, `.ds-pagination`, `.ds-modal`, `.ds-input`, `.ds-badge`, `.ds-meter` |
| Dados | `listStoreProducts`, `updateStoreProduct`, `adjustStock` (task 22) |

## Funcionalidade nova

O administrador mantém o catálogo regular da loja — o que o cliente casual vê na Vitrine — e controla o **estoque**: conferir saldo, corrigir divergência, ativar e desativar produto.

## Estado atual

`AdminCatalog.vue` renderiza `.ds-empty` (task 21). O catálogo da vitrine hoje é o array `storeCatalog` em `src/services/api.js`: 8 produtos com `id`, `name`, `sku`, `category`, `description`, `price`, `stockQuantity`, `imageUrl`, `isActive`.

> ⚠️ **Leia isto antes de começar.** O `Product` do `StoreCommerce` **não tem campo de estoque**. Os campos reais são `EnterpriseId`, `CategoryId`, `SupplierId`, `Name`, `Slug`, `Description`, `SKU`, `BarCode`, `Price`, `CostPrice`, `Weight`, `Height`, `Width`, `Length`, `Brand`, `ImageUrls`, `IsActive`, `IsDigital`. O `stockQuantity` que a vitrine exibe hoje é **invenção do simulador**, e `category` é nome, não id. A task 19 §2 decide como o estoque passa a existir. Esta tela é construída sobre **a decisão registrada no contrato**, não sobre o mock atual — se a decisão ainda não foi tomada quando a task começar, implemente sobre a proposta (`stockQuantity` + `stockReserved` + `adjust-stock`) e **marque no PR** que depende de confirmação.

Outras diferenças entre o mock e o domínio, que esta tela precisa resolver:

| Mock hoje | Domínio real |
|---|---|
| `category: "Tênis"` | `categoryId: 3` + entidade `Category` |
| `imageUrl` (uma) | `ImageUrls` (string com várias) |
| — | `costPrice`, `barCode`, dimensões, `brand`, `isDigital` |

## Como implementar

### 1. Lista

`.ds-toolbar` (busca por nome/SKU + filtro por categoria + filtro "só com estoque baixo" + "Novo produto") sobre `.ds-table` paginada.

| Coluna | Conteúdo |
|---|---|
| Produto | `.ds-avatar--sm` (primeira de `imageUrls`, ou placeholder) + nome + SKU em `.ds-text-xs` |
| Categoria | texto |
| Preço | `--numeric`; custo em `.ds-text-secondary` abaixo, se houver |
| Estoque | número + `.ds-badge` de faixa + `.ds-meter` |
| Situação | `.ds-badge` ativo / inativo |
| Ações | ajustar estoque · editar |

**Faixas de estoque — as mesmas da vitrine do cliente**, porque divergir aqui é como o administrador perde a confiança na tela: `0` → "Esgotado" (`--done`); `<= 5` → "Últimas unidades" (`--live`); acima → sem badge. Se a task 25 mudar o limite, mude em `StoreShowcase.vue` na mesma PR, ou extraia a constante para um módulo compartilhado.

### 2. Ajuste de estoque

É a ação mais usada da tela e a mais perigosa. `.ds-modal` curto:

```
Produto:        Tênis Court Low (VLC-TEN-102)
Saldo atual:    4
Operação:       (•) Entrada  ( ) Saída  ( ) Definir saldo
Quantidade:     [    12 ]
Motivo:         [ Recebimento de fornecedor        ]   ← obrigatório
─────────────────────────────────────────────────────
Novo saldo:     16
```

Regras:

1. **Motivo obrigatório** — vai no `reason` do `adjust-stock` e alimenta a auditoria (task 19 §2).
2. A tela envia **`delta`**, não saldo final; "Definir saldo" calcula o delta e mostra qual será enviado. Enviar valor absoluto perde a movimentação concorrente.
3. Saldo resultante negativo é bloqueado no cliente **e** recusado pelo servidor (409 `Stock.Insufficient`) — trate o erro, não confie só na validação local.
4. "Novo saldo" é calculado ao vivo, em `aria-live="polite"`.
5. Depois de salvar: linha atualizada com `.ds-animate-in` e confirmação em `aria-live`. Sem recarregar a tabela.

### 3. Formulário de produto

Campos do domínio, agrupados: **Identidade** (`name`, `slug`, `sku`, `barCode`, `description`, `brand`), **Comercial** (`price`, `costPrice`, `categoryId`, `supplierId`), **Logística** (`weight`, `height`, `width`, `length`, `isDigital`), **Publicação** (`imageUrls`, `isActive`).

- `categoryId` e `supplierId` são `<select class="ds-input">` alimentados pelos endpoints de categoria e fornecedor (task 19 §1) — nunca texto livre.
- `price` e `costPrice` em pt-BR, enviados como `number`.
- Produto digital (`isDigital`) esconde o grupo de logística.
- Margem (`price − costPrice`) aparece como texto calculado ao lado do preço. É leitura, não campo.
- `isActive: false` some da vitrine do cliente; diga isso no formulário, junto do campo.

### 4. Estados

Esqueleto de 5 linhas; `.ds-empty` "Nenhum produto nesse filtro" com ação de limpar filtro; erro com "Tentar de novo". Filtro que não devolve nada é **vazio**, não erro — e o texto precisa diferenciar os dois.

## Critérios de aceite

- [ ] Lista com busca, filtros (categoria, estoque baixo), ordenação por nome/preço/estoque e paginação
- [ ] Faixas de estoque idênticas às da vitrine do cliente (0 / ≤ 5)
- [ ] Ajuste de estoque envia `delta` com `reason` obrigatório; "Definir saldo" mostra o delta que será enviado
- [ ] Saldo negativo bloqueado no cliente **e** o 409 `Stock.Insufficient` tratado na tela
- [ ] Formulário com `categoryId`/`supplierId` em `<select>`, margem calculada, grupo de logística oculto para digital
- [ ] `fieldErrors` do servidor caem no campo certo
- [ ] Três estados tratados, com vazio ≠ erro
- [ ] Zero estilo inline (exceto largura de `.ds-meter`), zero hex, zero `<style>`
- [ ] Light e dark; 360px com cards no lugar da tabela
- [ ] Nenhuma chamada a `fetch` ou URL no componente
- [ ] PR declara qual decisão de estoque (task 19 §2) a tela assume
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn "fetch(\|/api/" src/components/admin/AdminCatalog.vue   # vazio
grep -rn "stockQuantity <= 5\|LOW_STOCK" src/components/         # mesmo limite na vitrine e no painel
# no navegador: ajuste com saída maior que o saldo (bloqueio + 409), salve sem motivo (barra),
# desative um produto e confira que ele sai da vitrine do cliente
```

## Referências do Design System

- `components/table.md`, `components/toolbar.md`, `components/pagination.md` (task 20)
- `components/input.md`: agrupamento, `<label>`, validação por campo
- `components/modal.md`: foco preso e devolução de foco · `components/badge.md`: faixas de estoque
- `patterns/states.md`: vazio × erro

## Para o Claude Code

```
Leia a task 19 §2 (decisão de estoque), a task 22, e design-system/components/{table,input,
modal,badge}.md. Implemente AdminCatalog.vue: lista paginada com busca, filtro de categoria
e de estoque baixo; modal de ajuste de estoque enviando delta + reason obrigatório, com
"Definir saldo" convertido em delta, bloqueio de saldo negativo e tratamento do 409
Stock.Insufficient; formulário de produto com os campos reais do domínio Product do
StoreCommerce (categoryId e supplierId em select, margem calculada, logística oculta para
isDigital). As faixas de estoque (0, <= 5) precisam ser as mesmas de StoreShowcase.vue —
extraia a constante para um módulo compartilhado. Use só src/services/admin/. Declare no PR
qual decisão de estoque a tela assume. Sem CSS novo: faltou classe, PARE e reporte.
```
