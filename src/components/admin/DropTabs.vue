<script setup>
import { href } from '../../router';

// Abas das telas de um drop: editor (E2) e engajamento (E4).
defineProps({
  eventId: { type: Number, required: true },
  current: { type: String, required: true },
});

const TABS = [
  { id: 'editor', label: 'Editor' },
  { id: 'inscricoes', label: 'Inscrições' },
  { id: 'lista-de-espera', label: 'Lista de espera' },
  { id: 'avisos', label: 'Avisos' },
];
</script>

<template>
  <nav
    class="ds-nav"
    aria-label="Seções do drop"
  >
    <a
      v-for="tab in TABS"
      :key="tab.id"
      class="ds-nav__item"
      :href="href(tab.id === 'editor' ? `/admin/drops/${eventId}` : `/admin/drops/${eventId}/${tab.id}`)"
      :aria-current="current === tab.id ? 'page' : undefined"
    >{{ tab.label }}</a>
  </nav>
</template>
