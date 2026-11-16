# [Admin · Front-end] Categorias: árvore, ativação, reordenação e exclusão com transferência

**Depende de:** 27 · Fonte: Endpoints.md, "Categorias"; [Categories.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Application/Categories.md)

## Funcionalidade alterada

O lojista organiza as **categorias em árvore**, define a ordem do menu da vitrine, desativa ramos inteiros e exclui categorias sem deixar produtos órfãos.

## Estado atual

`#/admin/catalogo/categorias` usa o CRUD `categories` como lista plana. Não há hierarquia, ordem nem tratamento de produtos vinculados.

## Como implementar

| Ação | Rota |
|---|---|
| Árvore (inclui inativas) | `GET categories/tree` |
| Busca paginada | `GET categories/search?name&parentId&isActive&rootsOnly&page&pageSize` |
| Ativar ou desativar | `PUT categories/{id}/active` `{ isActive }` |
| Reordenar | `PUT categories/reorder` `{ items: [{ id, displayOrder }] }` |
| Excluir | `DELETE categories/{id}?moveProductsToCategoryId=` |
| Excluir em lote | `DELETE categories/delete-with-products` `{ ids, moveProductsToCategoryId }` |

1. **Árvore** com `role="tree"` e `aria-expanded`, navegável por teclado. As inativas aparecem esmaecidas com badge. Desativar um pai mostra o aviso "filhos e produtos deste ramo somem da vitrine".
2. **Reordenar** com setas ↑/↓ acessíveis (arrastar é extra opcional), salvando a ordem dos irmãos numa chamada só.
3. **Excluir:** se houver produtos, o modal pede uma categoria **ativa** de destino; sem destino, o back recusa. No lote, as subcategorias precisam fazer parte do conjunto: selecione-as junto e diga isso.

## Critérios de aceite

- [ ] Criar, mover, reordenar, desativar e excluir com transferência funcionando
- [ ] A árvore funciona só com teclado
- [ ] O menu da vitrine (task 29) reflete a ordem e a desativação

## Para o Claude Code

> Componente novo de árvore = spec em `design-system/components/tree.md` + `.ds-tree` em `components.css` (regra R6).
