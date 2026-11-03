<script setup>
import { href, route } from '../../router';

// Seções do catálogo: produtos (E7), categorias, cupons (E8), fornecedores (E11).
const TABS = [
  { label: 'Produtos', path: '/admin/catalogo' },
  { label: 'Categorias', path: '/admin/catalogo/categorias' },
  { label: 'Cupons', path: '/admin/catalogo/cupons' },
  { label: 'Fornecedores', path: '/admin/catalogo/fornecedores' },
];
</script>

<template>
  <nav
    class="ds-nav"
    aria-label="Seções do catálogo"
  >
    <a
      v-for="tab in TABS"
      :key="tab.path"
      class="ds-nav__item"
      :href="href(tab.path)"
      :aria-current="route.path === tab.path ? 'page' : undefined"
    >{{ tab.label }}</a>
  </nav>
</template>
