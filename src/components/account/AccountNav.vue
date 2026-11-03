<script setup>
import { href, route } from '../../router';

// Seções da conta do cliente.
const SECTIONS = [
  { label: 'Meus dados', path: '/conta', names: ['account'] },
  { label: 'Pedidos', path: '/conta/pedidos', names: ['account-orders', 'account-order'] },
  { label: 'Notificações', path: '/conta/notificacoes', names: ['account-notifications'] },
];
</script>

<template>
  <nav
    class="ds-nav"
    aria-label="Seções da conta"
  >
    <a
      v-for="section in SECTIONS"
      :key="section.path"
      class="ds-nav__item"
      :href="href(section.path)"
      :aria-current="section.names.includes(route.name) ? 'page' : undefined"
    >{{ section.label }}</a>
  </nav>
</template>
