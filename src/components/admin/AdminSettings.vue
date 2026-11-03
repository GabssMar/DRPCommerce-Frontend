<script setup>
import { computed } from 'vue';
import { href } from '../../router';
import AdminTeam from './AdminTeam.vue';
import AdminEnterprise from './AdminEnterprise.vue';
import AdminAudit from './AdminAudit.vue';

// Configurações: Equipe (E12), Empresa (E12) e Auditoria (E13).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const TABS = [
  { id: 'equipe', label: 'Equipe', component: AdminTeam },
  { id: 'empresa', label: 'Empresa', component: AdminEnterprise },
  { id: 'auditoria', label: 'Auditoria', component: AdminAudit },
];
const current = computed(() => TABS.find((t) => t.id === props.params.tab) ?? TABS[0]);
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Configurações
    </h1>
    <nav
      class="ds-nav"
      aria-label="Seções das configurações"
    >
      <a
        v-for="tab in TABS"
        :key="tab.id"
        class="ds-nav__item"
        :href="href(`/admin/configuracoes/${tab.id}`)"
        :aria-current="current.id === tab.id ? 'page' : undefined"
      >{{ tab.label }}</a>
    </nav>
  </div>

  <component :is="current.component" />
</template>
