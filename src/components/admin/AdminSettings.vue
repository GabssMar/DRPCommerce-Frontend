<script setup>
import { computed } from 'vue';
import { href } from '../../router';
import AdminTeam from './AdminTeam.vue';
import AdminEnterprise from './AdminEnterprise.vue';
import AdminAudit from './AdminAudit.vue';
import AccountSecurity from '../account/AccountSecurity.vue';
import { REALMS } from '../../services/session';
import { usePermissions } from '../../composables/usePermissions';

// Configurações: Equipe (E12), Empresa (E12), Auditoria (E13) e Segurança da
// conta (task 28: sessões e troca de senha). Equipe, Empresa e Auditoria são só
// do dono principal no back.
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const TABS = [
  { id: 'equipe', label: 'Equipe', component: AdminTeam, ownerOnly: true },
  { id: 'empresa', label: 'Empresa', component: AdminEnterprise, ownerOnly: true },
  { id: 'auditoria', label: 'Auditoria', component: AdminAudit, ownerOnly: true },
  { id: 'seguranca', label: 'Segurança', component: AccountSecurity, props: { realm: REALMS.backoffice } },
];
const { isOwner } = usePermissions();
const tabs = computed(() => TABS.filter((t) => !t.ownerOnly || isOwner.value));
const current = computed(() => tabs.value.find((t) => t.id === props.params.tab) ?? tabs.value[0]);
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
        v-for="tab in tabs"
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
