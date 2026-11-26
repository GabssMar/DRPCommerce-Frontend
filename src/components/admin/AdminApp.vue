<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  BadgeDollarSign, LayoutDashboard, LogOut, Package, Plug, Radio, Receipt, Rocket, Settings, ShieldAlert, Users, Wallet,
} from '@lucide/vue';
import { focusMain, href, navigate, route } from '../../router';
import { IS_MOCK } from '../../services/config';
import { getAccessToken, hasSelectedEnterprise, isSignedIn, REALMS, tokenClaims } from '../../services/session';
import { logoutEmployee, restoreSession } from '../../services/auth';
import { usePermissions } from '../../composables/usePermissions';
import { getCurrentEmployee } from '../../services/admin-api';
import { initials } from '../../services/format';
import AdminLogin from './AdminLogin.vue';
import AdminEnterpriseChoice from './AdminEnterpriseChoice.vue';
import AdminInviteAccept from './AdminInviteAccept.vue';
import RequestLog from './RequestLog.vue';
import AdminDashboard from './AdminDashboard.vue';
import AdminDrops from './AdminDrops.vue';
import AdminDropEditor from './AdminDropEditor.vue';
import AdminEngagement from './AdminEngagement.vue';
import AdminLive from './AdminLive.vue';
import AdminOrders from './AdminOrders.vue';
import AdminFinance from './AdminFinance.vue';
import AdminCatalog from './AdminCatalog.vue';
import AdminProductEditor from './AdminProductEditor.vue';
import AdminCoupons from './AdminCoupons.vue';
import AdminSuppliers from './AdminSuppliers.vue';
import AdminCustomers from './AdminCustomers.vue';
import AdminFraud from './AdminFraud.vue';
import AdminSettings from './AdminSettings.vue';
import AdminPlan from './AdminPlan.vue';
import AdminIntegrations from './AdminIntegrations.vue';
import PlanSignup from '../plans/PlanSignup.vue';

// Shell do painel da loja (patterns/app-shell.md): rail com os módulos,
// topbar com o ambiente e a pessoa logada, e a tela da rota. Módulo sem a
// permissão de leitura some do rail; `ownerOnly` é o que o back ainda não mapeou
// para perfis (só o dono principal acessa).
const SECTIONS = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, routes: ['admin-dashboard'] },
  { label: 'Drops', path: '/admin/drops', icon: Rocket, routes: ['admin-drops', 'admin-drop', 'admin-drop-new', 'admin-drop-tab'], permission: 'drop.events.view' },
  { label: 'Drop ao vivo', path: '/admin/ao-vivo', icon: Radio, routes: ['admin-live'], permission: 'drop.events.view' },
  { label: 'Pedidos', path: '/admin/pedidos', icon: Receipt, routes: ['admin-orders'], permission: 'orders.view' },
  { label: 'Catálogo', path: '/admin/catalogo', icon: Package, routes: ['admin-catalog', 'admin-product', 'admin-coupons', 'admin-suppliers'], permission: ['products.view', 'categories.view', 'coupons.view', 'suppliers.manage'] },
  { label: 'Fraude', path: '/admin/fraude', icon: ShieldAlert, routes: ['admin-fraud'], ownerOnly: true },
  { label: 'Financeiro', path: '/admin/financeiro', icon: Wallet, routes: ['admin-finance'], ownerOnly: true },
  { label: 'Clientes', path: '/admin/clientes', icon: Users, routes: ['admin-customers'], permission: 'customers.view' },
  { label: 'Plano', path: '/admin/plano', icon: BadgeDollarSign, routes: ['admin-plan'], ownerOnly: true },
  { label: 'Integrações', path: '/admin/integracoes', icon: Plug, routes: ['admin-integrations'], permission: 'settings.manage' },
  { label: 'Configurações', path: '/admin/configuracoes', icon: Settings, routes: ['admin-settings'] },
];

const { can, isOwner } = usePermissions();
const sectionAllowed = (s) => (s.ownerOnly ? isOwner.value : !s.permission || [].concat(s.permission).some((code) => can(code)));
const sections = computed(() => SECTIONS.filter(sectionAllowed));

const PAGES = {
  'admin-dashboard': AdminDashboard,
  'admin-drops': AdminDrops,
  'admin-drop-new': AdminDropEditor,
  'admin-drop': AdminDropEditor,
  'admin-drop-tab': AdminEngagement,
  'admin-live': AdminLive,
  'admin-orders': AdminOrders,
  'admin-finance': AdminFinance,
  'admin-catalog': AdminCatalog,
  'admin-product': AdminProductEditor,
  'admin-coupons': AdminCoupons,
  'admin-suppliers': AdminSuppliers,
  'admin-customers': AdminCustomers,
  'admin-fraud': AdminFraud,
  'admin-settings': AdminSettings,
  'admin-plan': AdminPlan,
  'admin-integrations': AdminIntegrations,
};
// Cadastro de lojista vindo da landing page: abre com ou sem sessão.
const isSignup = computed(() => route.value.name === 'admin-signup');

const page = computed(() => {
  // /admin/drops/:id/editor é o próprio editor.
  if (route.value.name === 'admin-drop-tab' && route.value.params.tab === 'editor') return AdminDropEditor;
  return PAGES[route.value.name] ?? AdminDashboard;
});
const isCurrent = (section) => section.routes.includes(route.value.name);
// Sem permissão no módulo, a rota digitada à mão também não abre a tela.
const blocked = computed(() => {
  const section = SECTIONS.find(isCurrent);
  return Boolean(section) && !sectionAllowed(section);
});

const signedIn = computed(() => isSignedIn(REALMS.backoffice));
const restoring = ref(!IS_MOCK && !signedIn.value);
const employee = ref(null);

// Token sem loja (várias ou nenhuma): só a escolha de loja aparece.
const needsEnterprise = computed(() => signedIn.value && !hasSelectedEnterprise());
const accepting = computed(() => route.value.name === 'admin-invite');
const choosingEnterprise = computed(() => needsEnterprise.value || route.value.name === 'admin-enterprise-choice');

watch([needsEnterprise, restoring], ([needs, isRestoring]) => {
  if (needs && !isRestoring && !accepting.value) navigate('/admin/entrar/loja');
}, { immediate: true });

// Funcionário da topbar: recarrega quando muda o vínculo, não a cada renovação.
const membershipKey = computed(() => {
  const token = getAccessToken(REALMS.backoffice);
  if (!token || !hasSelectedEnterprise()) return null;
  return tokenClaims(token)?.MembershipId ?? token;
});

// Abas internas (produto, financeiro, configurações) trocam sem remontar a tela e sem perder o que foi digitado.
// Trocar de loja em qualquer aba remonta tudo: a tela nunca mostra uma loja e grava em outra.
const TAB_PAGES = new Set(['admin-product', 'admin-finance', 'admin-settings']);
const pageKey = computed(() => {
  const { name, params, path } = route.value;
  return `${TAB_PAGES.has(name) ? `${name}/${params.id ?? ''}` : path}@${membershipKey.value}`;
});

watch(membershipKey, async (key) => {
  employee.value = null;
  if (key) employee.value = await getCurrentEmployee().catch(() => null);
}, { immediate: true });

onMounted(async () => {
  if (restoring.value) {
    await restoreSession(REALMS.backoffice);
    restoring.value = false;
  }
});

// Entrou pela tela de escolha com uma loja só: o back já selecionou, vai ao dashboard.
const onSignedIn = () => {
  if (route.value.name === 'admin-enterprise-choice' && hasSelectedEnterprise()) navigate('/admin/dashboard');
};

const onEnterpriseSelected = () => navigate('/admin/dashboard');

const logout = () => logoutEmployee().catch(() => {});
</script>

<template>
  <div class="ds-app">
    <a
      href="#main"
      class="ds-skip-link"
      @click.prevent="focusMain"
    >Pular para o conteúdo</a>

    <div class="ds-shell">
      <nav
        class="ds-rail"
        aria-label="Módulos do painel"
      >
        <a
          v-for="section in sections"
          :key="section.path"
          class="ds-icon-btn ds-icon-btn--ghost"
          :href="href(section.path)"
          :aria-label="section.label"
          :title="section.label"
          :aria-current="isCurrent(section) ? 'page' : undefined"
        >
          <component
            :is="section.icon"
            :size="20"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </a>
      </nav>

      <div class="ds-min-0">
        <header class="ds-topbar">
          <a
            class="ds-topbar__brand"
            :href="href('/admin/dashboard')"
          >
            Veloce <span class="ds-text-secondary">· painel da loja</span>
          </a>
          <span :class="['ds-badge', IS_MOCK ? 'ds-badge--scheduled' : 'ds-badge--done']">
            <span
              v-if="IS_MOCK"
              class="ds-badge__dot"
              aria-hidden="true"
            />
            {{ IS_MOCK ? 'Dados simulados · sem servidor' : 'Ambiente conectado' }}
          </span>
          <div
            v-if="signedIn"
            class="ds-cluster ds-cluster--2"
          >
            <a
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :href="href('/')"
            >Ver loja</a>
            <span
              class="ds-avatar"
              :title="employee?.fullName"
            >
              <span aria-hidden="true">{{ initials(employee?.fullName) }}</span>
              <span class="ds-sr-only">{{ employee?.fullName ?? 'Funcionário' }}</span>
            </span>
            <button
              type="button"
              class="ds-icon-btn ds-icon-btn--ghost"
              aria-label="Sair do painel"
              @click="logout"
            >
              <LogOut
                :size="20"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
          </div>
          <nav
            class="ds-nav ds-shell__mobile-nav"
            aria-label="Módulos do painel"
          >
            <a
              v-for="section in sections"
              :key="section.path"
              class="ds-nav__item ds-nowrap"
              :href="href(section.path)"
              :aria-current="isCurrent(section) ? 'page' : undefined"
            >{{ section.label }}</a>
          </nav>
        </header>

        <main
          id="main"
          tabindex="-1"
          class="ds-container ds-container--wide ds-page ds-stack--6"
        >
          <div
            v-if="restoring"
            class="ds-empty"
            role="status"
          >
            <span
              class="ds-spinner"
              aria-hidden="true"
            />
            Verificando sua sessão…
          </div>
          <PlanSignup
            v-else-if="isSignup"
            :key="route.path"
            :params="route.params"
            @signed-in="onSignedIn"
          />
          <AdminLogin
            v-else-if="!signedIn"
            @signed-in="onSignedIn"
          />
          <AdminInviteAccept v-else-if="accepting" />
          <AdminEnterpriseChoice
            v-else-if="choosingEnterprise"
            @selected="onEnterpriseSelected"
          />
          <div
            v-else-if="blocked"
            class="ds-empty"
            role="alert"
          >
            Você não tem permissão para abrir esta área.
          </div>
          <component
            :is="page"
            v-else
            :key="pageKey"
            :params="route.params"
          />

          <RequestLog />
        </main>
      </div>
    </div>
  </div>
</template>
