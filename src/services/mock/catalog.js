// Catálogo público da vitrine no mock (task 29), nos formatos do back:
//   products/search        PagedResponse<StorefrontProductResponse>
//   products/by-slug/{s}   StorefrontProductDetailResponse { product, variants }
//   categories/tree        CategoryTreeResponse[]
//   categories/by-slug/{s} CategoryResponse
// Os SKUs ficam em data()['store/product-variants'], criados aqui na primeira
// consulta se o seed ainda não os tiver.

const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

// [productId, [atributos, saldo, preço próprio?]...]. Produto sem entrada aqui é
// simples: ganha um SKU padrão com o saldo do produto.
// Tênis Canvas Hi tem duas opções: 40/Off-white esgotado e 41/Off-white inexistente.
const VARIANT_PLAN = {
  101: [
    [{ Tamanho: '38', Cor: 'Preto' }, 6], [{ Tamanho: '38', Cor: 'Off-white' }, 4],
    [{ Tamanho: '39', Cor: 'Preto' }, 9], [{ Tamanho: '39', Cor: 'Off-white' }, 3],
    [{ Tamanho: '40', Cor: 'Preto' }, 11], [{ Tamanho: '40', Cor: 'Off-white' }, 0],
    [{ Tamanho: '41', Cor: 'Preto' }, 2, 369.9],
  ],
  102: [[{ Tamanho: '39' }, 1], [{ Tamanho: '40' }, 3], [{ Tamanho: '41' }, 0]],
  103: [[{ Tamanho: 'P' }, 5], [{ Tamanho: 'M' }, 7], [{ Tamanho: 'G' }, 6], [{ Tamanho: 'GG' }, 0, 239.9]],
  104: [[{ Tamanho: 'P' }, 20], [{ Tamanho: 'M' }, 25], [{ Tamanho: 'G' }, 15]],
  105: [[{ Tamanho: '38' }, 0], [{ Tamanho: '40' }, 0], [{ Tamanho: '42' }, 0]],
};

function buildVariants(products) {
  let id = 5000;
  return products.flatMap((product) => {
    const plan = VARIANT_PLAN[product.id];
    const variant = (attributes, stockQuantity, price, isDefault) => {
      id += 1;
      return {
        id, productId: product.id, name: Object.values(attributes).join(' / ') || product.name,
        sku: isDefault ? product.sku : `${product.sku}-${Object.values(attributes).join('-').toUpperCase()}`, barCode: '', attributes, isDefault, isActive: true,
        isDeleted: false, price: price ?? null, stockQuantity, reservedQuantity: 0,
      };
    };
    if (!plan) return [variant({}, product.stockQuantity ?? 0, null, true)];
    // Produto com opções: o SKU padrão existe, mas fica fora da vitrine (como no back).
    return [variant({}, 0, null, true), ...plan.map(([attributes, stock, price]) => variant(attributes, stock, price, false))];
  });
}

export function createCatalogMock({ data, ok, problem }) {
  const variantsTable = () => {
    const d = data();
    if (!d['store/product-variants']) d['store/product-variants'] = buildVariants(d['store/products']);
    return d['store/product-variants'];
  };

  const hasVariants = (product) => Boolean(VARIANT_PLAN[product.id]) || variantsTable().some((v) => v.productId === product.id && !v.isDefault);

  // SKUs que a vitrine mostra: ativos e, em produto com opções, sem o padrão.
  const sellableVariants = (product) => variantsTable()
    .filter((v) => v.productId === product.id && v.isActive && !v.isDeleted && (!hasVariants(product) || !v.isDefault))
    .sort((a, b) => a.id - b.id);

  const available = (v) => Math.max(0, v.stockQuantity - v.reservedQuantity);

  const variantResponse = (product, v) => {
    const inStock = product.isDigital || available(v) > 0;
    return {
      id: v.id, name: v.name, sku: v.sku, barCode: v.barCode, attributes: v.attributes,
      price: v.price ?? product.price, weight: product.weight, height: product.height, width: product.width,
      length: product.length, availableQuantity: available(v), inStock, canPurchase: inStock,
    };
  };

  const productResponse = (product) => {
    const variants = sellableVariants(product);
    const prices = variants.length ? variants.map((v) => v.price ?? product.price) : [product.price];
    const availableQuantity = variants.reduce((sum, v) => sum + available(v), 0);
    const inStock = product.isDigital || availableQuantity > 0;
    return {
      id: product.id, name: product.name, slug: product.slug, description: product.description,
      price: Math.min(...prices), brand: product.brand, imageUrls: product.imageUrls, categoryId: product.categoryId,
      hasVariants: hasVariants(product), isDigital: product.isDigital, maxPrice: Math.max(...prices),
      availableQuantity, inStock, canPurchase: variants.length > 0 && inStock,
    };
  };

  // Categorias visíveis: ativas e com todos os ancestrais ativos.
  const visibleCategories = () => {
    const all = data()['store/categories'].filter((c) => !c.isDeleted);
    const byId = new Map(all.map((c) => [c.id, c]));
    const visible = (c) => c.isActive && (c.parentCategoryId == null || (byId.has(c.parentCategoryId) && visible(byId.get(c.parentCategoryId))));
    return all.filter(visible).sort((a, b) => a.displayOrder - b.displayOrder);
  };

  const categoryResponse = (c) => ({
    id: c.id, parentCategoryId: c.parentCategoryId, name: c.name, slug: c.slug,
    description: c.description, imageUrl: c.imageUrl, displayOrder: c.displayOrder, isActive: c.isActive,
  });

  const tree = (categories, parentId = null) => categories
    .filter((c) => (c.parentCategoryId ?? null) === parentId)
    .map((c) => ({ ...categoryResponse(c), children: tree(categories, c.id) }));

  const publicProducts = () => {
    const visibleIds = new Set(visibleCategories().map((c) => c.id));
    return data()['store/products'].filter((p) => p.isActive && !p.isDeleted && visibleIds.has(p.categoryId));
  };

  // Parâmetros em qualquer caixa, como o model binding do ASP.NET.
  const param = (query, name) => {
    for (const [key, value] of query) if (key.toLowerCase() === name.toLowerCase()) return value;
    return null;
  };

  function search(query) {
    const page = Number(param(query, 'page') ?? 1);
    const pageSize = Number(param(query, 'pageSize') ?? 20);
    const sort = param(query, 'sort') ?? 'name';
    if (!['price_asc', 'price_desc', 'newest', 'name'].includes(sort) || !(page >= 1 && page <= 100000) || !(pageSize >= 1 && pageSize <= 100)) {
      return problem(400, 'Validation', 'Parâmetros de busca inválidos.');
    }

    const term = normalize(param(query, 'term')).trim();
    const categoryId = param(query, 'categoryId') ? Number(param(query, 'categoryId')) : null;
    const withChildren = param(query, 'includeSubcategories') === 'true';
    const inStock = param(query, 'inStock');

    let categoryIds = null;
    if (categoryId) {
      const visible = visibleCategories();
      categoryIds = new Set(visible.some((c) => c.id === categoryId) ? [categoryId] : []);
      if (withChildren) {
        let grew = true;
        while (grew) {
          grew = false;
          visible.forEach((c) => {
            if (c.parentCategoryId != null && categoryIds.has(c.parentCategoryId) && !categoryIds.has(c.id)) {
              categoryIds.add(c.id);
              grew = true;
            }
          });
        }
      }
    }

    let items = publicProducts()
      .filter((p) => !term || [p.name, p.description, p.brand].some((field) => normalize(field).includes(term)))
      .filter((p) => !categoryIds || categoryIds.has(p.categoryId))
      .map(productResponse)
      .filter((p) => inStock == null || String(p.inStock) === inStock);

    const sorters = {
      name: (a, b) => nameCollator.compare(a.name, b.name),
      price_asc: (a, b) => a.price - b.price || nameCollator.compare(a.name, b.name),
      price_desc: (a, b) => b.price - a.price || nameCollator.compare(a.name, b.name),
      newest: (a, b) => b.id - a.id,
    };
    items = items.sort(sorters[sort]);

    return ok({ items: items.slice((page - 1) * pageSize, page * pageSize), totalCount: items.length, page, pageSize });
  }

  function bySlug(slug) {
    const product = publicProducts().find((p) => p.slug === slug.trim().toLowerCase());
    if (!product) return problem(404, 'Product.NotFound', 'Produto não encontrado.');
    const variants = sellableVariants(product);
    if (!variants.length) return problem(404, 'Product.NotFound', 'Produto sem SKU disponível.');
    return ok({ product: productResponse(product), variants: variants.map((v) => variantResponse(product, v)) });
  }

  /** @returns resposta ou null se a rota não é do catálogo */
  function route(method, path, query) {
    if (method !== 'GET') return null;
    if (path === 'products/search') return search(query);
    if (path.startsWith('products/by-slug/')) return bySlug(decodeURIComponent(path.slice('products/by-slug/'.length)));
    if (path === 'categories/tree') return ok(tree(visibleCategories()));
    if (path.startsWith('categories/by-slug/')) {
      const slug = decodeURIComponent(path.slice('categories/by-slug/'.length)).trim().toLowerCase();
      const category = visibleCategories().find((c) => c.slug === slug);
      return category ? ok(categoryResponse(category)) : problem(404, 'Category.NotFound', 'Categoria não encontrada.');
    }
    return null;
  }

  // O carrinho do mock (task 30) confere disponibilidade com as mesmas regras.
  const sku = (variantId) => variantsTable().find((v) => v.id === variantId) ?? null;
  const productOf = (productId) => data()['store/products'].find((p) => p.id === productId) ?? null;
  const isVisible = (product) => publicProducts().includes(product);

  return { route, sku, productOf, hasVariants, isVisible, available };
}
