# [Admin · Front-end] Produtos e variantes: busca paginada, edição por seção e SKUs

**Depende de:** 27 · Atualiza a task 25 · Fonte: Endpoints.md, "Produtos" e "Variantes por produto"

## Funcionalidade alterada

O lojista **cadastra e edita produtos** com variantes (tamanho, cor…), cada uma com SKU, preço e dimensões próprios, e encontra produtos num catálogo grande.

## Estado atual

`AdminCatalog.vue` lista com `products.getAll()` e salva com `patch` (CRUD `update` com o objeto inteiro). O back agora:

- separa a edição em **seções com permissões diferentes**: alterar preço exige `products.change_price`, e a atualização completa também passa a exigi-la;
- tem SKU por variante: o produto simples tem uma variante padrão;
- pagina a busca (`get-all` "evitar em grandes conjuntos").

## Como implementar

| Ação | Rota | Permissão |
|---|---|---|
| Buscar | `GET products/search?term&categoryId&includeSubcategories&brand&minPrice&maxPrice&inStock&isActive&sort&page&pageSize` | `products.view` |
| Detalhes | `PUT products/{id}/details` `{ name, slug, description, sku, barCode, brand, imageUrls, isDigital }` | `products.edit` |
| Preço | `PUT products/{id}/pricing` `{ price, costPrice }` | `products.change_price` |
| Dimensões | `PUT products/{id}/dimensions` `{ weight, height, width, length }` | `products.edit` |
| Categoria | `PUT products/{id}/category` `{ categoryId, supplierId }` | `products.edit` |
| Ativar | `PUT products/{id}/active` `{ isActive }` | `products.edit` |
| Habilitar variantes | `PUT products/{id}/variants/enable` | `products.edit` |
| Variantes | `GET/POST products/{id}/variants`, `PUT …/variants/{vid}`, `…/pricing`, `…/dimensions`, `DELETE …/variants/{vid}` | view/create/edit/change_price/delete |

1. **Lista:** `.ds-table` paginada no servidor, com filtros na `.ds-toolbar` e colunas produto, SKU, categoria, preço, disponível e situação.
2. **Edição em abas**, uma por seção, cada uma com seu botão salvar. A aba Preço fica **somente leitura** sem `products.change_price` (task 40). Mostre a regra "preço não pode ficar abaixo do custo" antes de enviar.
3. **Variantes:** tabela de SKUs com atributos, preço efetivo (o herdado aparece em cinza com "herdado"), saldo e ativo. A criação usa `CreateVariantRequest` (`details` obrigatório; `pricing` e `dimensions` opcionais). Todas as variantes usam as **mesmas chaves de opção** (de 1 a 8), e combinação repetida dá 400.
4. **Habilitar variantes** só funciona com o SKU padrão sem saldo e sem reserva: desabilite com o motivo. Excluir SKU ou produto também exige saldo e reservas zerados.
5. Slug e SKU são únicos por loja: o 409 vira erro no campo.

## Critérios de aceite

- [ ] Nenhum `products.getAll()` ou `products.patch` na tela
- [ ] Produto com 3 variantes criado e editado pela tela
- [ ] Sem permissão de preço, a aba Preço fica bloqueada e o back não recebe a chamada

## Para o Claude Code

> Crie `src/services/admin-catalog-api.js` e divida `AdminCatalog.vue` em lista e editor. O estoque fica na task 34: aqui o saldo é só exibido.
