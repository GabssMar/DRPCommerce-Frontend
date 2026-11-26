// Seleção de SKU no detalhe do produto. O back devolve os SKUs ativos com
// `attributes` ({ Tamanho: '40', Cor: 'Preto' }), `price`, `availableQuantity` e
// `canPurchase`. Combinações que não existem simplesmente não vêm na lista.

/** Um grupo por chave de atributo, com os valores na ordem dos SKUs. */
export function optionGroups(variants) {
  const groups = new Map();
  for (const variant of variants ?? []) {
    for (const [key, value] of Object.entries(variant.attributes ?? {})) {
      if (!groups.has(key)) groups.set(key, []);
      if (!groups.get(key).includes(value)) groups.get(key).push(value);
    }
  }
  return [...groups].map(([key, values]) => ({ key, values }));
}

const matches = (variant, selection) =>
  Object.entries(selection).every(([key, value]) => value == null || variant.attributes?.[key] === value);

/** SKU escolhido, só quando todos os grupos têm valor. */
export function resolveVariant(variants, selection) {
  const groups = optionGroups(variants);
  if (!groups.every((g) => selection[g.key] != null)) return null;
  return (variants ?? []).find((v) => matches(v, selection)) ?? null;
}

/**
 * Um valor fica indisponível quando, junto com o que já foi escolhido nos outros
 * grupos, não existe SKU (combinação inexistente) ou nenhum pode ser comprado.
 * @returns {{ disabled: boolean, reason: string }}
 */
export function optionState(variants, selection, key, value) {
  const candidate = { ...selection, [key]: value };
  const found = (variants ?? []).filter((v) => matches(v, candidate));
  if (!found.length) return { disabled: true, reason: 'Combinação indisponível' };
  if (!found.some((v) => v.canPurchase)) return { disabled: true, reason: 'Esgotado' };
  return { disabled: false, reason: '' };
}

/** Grupos com um valor só já começam escolhidos. */
export function initialSelection(variants) {
  return Object.fromEntries(optionGroups(variants).filter((g) => g.values.length === 1).map((g) => [g.key, g.values[0]]));
}
