<script setup>
import { computed } from 'vue';
import { href } from '../../router';
import AdminTeam from './AdminTeam.vue';
import AdminEnterprise from './AdminEnterprise.vue';
import AdminAudit from './AdminAudit.vue';
import AccountSecurity from '../account/AccountSecurity.vue';
import { REALMS } from '../../services/session';

// Configurações: Equipe (E12), Empresa (E12), Auditoria (E13) e Segurança da
// conta (task 28: sessões e troca de senha).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const TABS = [
  { id: 'equipe', label: 'Equipe', component: AdminTeam },
  { id: 'empresa', label: 'Empresa', component: AdminEnterprise },
  { id: 'auditoria', label: 'Auditoria', component: AdminAudit },
  { id: 'seguranca', label: 'Segurança', component: AccountSecurity, props: { realm: REALMS.backoffice } },
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

  <component
    :is="current.component"
    v-bind="current.props ?? {}"
  />
</template>
