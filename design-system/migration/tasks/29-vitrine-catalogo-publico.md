# [Vitrine · Front-end] Catálogo público: busca paginada, categorias e variantes por SKU

**Depende de:** 27 · Fonte: Endpoints.md, seções "Catálogo público" e "Categorias da vitrine"; [ProductsAndInventory.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Application/ProductsAndInventory.md)

## Funcionalidade alterada

O cliente navega pela **vitrine** da loja: filtra por categoria, busca, ordena, abre o produto e escolhe **tamanho/cor** antes de pôr na sacola.

## Estado atual

- `StoreShowcase.vue` e `StoreCheckout.vue` usam `listStoreProducts()` → `GET storefront/products?page=1&pageSize=100`, a **listagem legada** (array direto, sem filtro e sem SKU). Com mais de 100 produtos, o resto some.
- Não existe navegação por categoria nem URL por slug: `#/vitrine/:id` usa o id técnico.
- O produto é tratado como item único. O back passou a ter **variantes por SKU** (de 1 a 8 opções, cada uma com saldo e preço próprios), e um produto com opções **exige** `productVariantId` no carrinho.

## Como implementar

| Tela | Rota do back |
|---|---|
| Lista e busca | `GET storefront/products/search?term&categoryId&includeSubcategories&brand&minPrice&maxPrice&inStock&sort&page&pageSize` |
| Menu de categorias | `GET storefront/categories/tree` |
| Página da categoria | `GET storefront/categories/by-slug/{slug}` + `search?categoryId=` |
| Detalhe | `GET storefront/products/by-slug/{slug}` (SKUs ativos, opções e preços efetivos) |

1. **Rotas novas:** `#/vitrine?busca=&categoria=&ordem=&pagina=`, `#/vitrine/c/:slug` e `#/vitrine/p/:slug`. Mantenha `#/vitrine/:id` redirecionando, se o id resolver.
2. **Filtros** na `.ds-toolbar`. A ordenação aceita só `price_asc`, `price_desc`, `newest` e `name`. Paginação com `PaginationNav`, e o estado vai na URL, para que o F5 e o voltar funcionem.
3. **Seletor de variante:** um grupo de opções por chave (`Tamanho`, `Cor`). Combinações inexistentes ou sem saldo ficam desabilitadas com `aria-disabled` e um motivo no `title`. O preço exibido é o **efetivo do SKU**. O botão "Adicionar" só habilita com o SKU resolvido; produto simples não mostra seletor.
4. **Disponibilidade:** use o que o back devolve, sem calcular saldo no front. "Sem estoque" usa `.ds-badge`.
5. Categoria inativa ou de ancestral inativo devolve 404: mostre `LoadState` "Categoria indisponível".

## Critérios de aceite

- [ ] Nenhuma chamada a `storefront/products?page=` (legado) nas telas da vitrine
- [ ] Busca, filtro, ordem e página ficam na URL e sobrevivem ao F5
- [ ] Produto com variantes não entra na sacola sem SKU escolhido
- [ ] Mock com pelo menos um produto com 2 opções e uma combinação esgotada

## Verificação

```bash
grep -rn "listStoreProducts" src/components   # 0
```

## Para o Claude Code

> Crie as funções em `src/services/storefront-api.js` (novo) e use-as em `StoreShowcase.vue` e `StoreProductDetail.vue`. Componentes só com classes `ds-*`. O seletor de variante, se for novo componente, ganha spec em `design-system/components/`.
