<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  LayoutDashboard, LogOut, Package, Radio, Receipt, Rocket, Settings, ShieldAlert, Users, Wallet,
} from '@lucide/vue';
import { focusMain, href, route } from '../../router';
import { IS_MOCK } from '../../services/config';
import { isSignedIn, REALMS } from '../../services/session';
import { logoutEmployee, restoreSession } from '../../services/auth';
import { getCurrentEmployee } from '../../services/admin-api';
import { initials } from '../../services/format';
import AdminLogin from './AdminLogin.vue';
import RequestLog from './RequestLog.vue';
import AdminDashboard from './AdminDashboard.vue';
import AdminDrops from './AdminDrops.vue';
import AdminDropEditor from './AdminDropEditor.vue';
import AdminEngagement from './AdminEngagement.vue';
import AdminLive from './AdminLive.vue';
import AdminOrders from './AdminOrders.vue';
import AdminFinance from './AdminFinance.vue';
import AdminCatalog from './AdminCatalog.vue';
import AdminCoupons from './AdminCoupons.vue';
import AdminSuppliers from './AdminSuppliers.vue';
import AdminCustomers from './AdminCustomers.vue';
import AdminFraud from './AdminFraud.vue';
import AdminSettings from './AdminSettings.vue';

// Shell do painel da loja (patterns/app-shell.md): rail com os módulos,
// topbar com o ambiente e a pessoa logada, e a tela da rota.
const SECTIONS = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, routes: ['admin-dashboard'] },
  { label: 'Drops', path: '/admin/drops', icon: Rocket, routes: ['admin-drops', 'admin-drop', 'admin-drop-new', 'admin-drop-tab'] },
  { label: 'Drop ao vivo', path: '/admin/ao-vivo', icon: Radio, routes: ['admin-live'] },
  { label: 'Pedidos', path: '/admin/pedidos', icon: Receipt, routes: ['admin-orders'] },
  { label: 'Catálogo', path: '/admin/catalogo', icon: Package, routes: ['admin-catalog', 'admin-coupons', 'admin-suppliers'] },
  { label: 'Fraude', path: '/admin/fraude', icon: ShieldAlert, routes: ['admin-fraud'] },
  { label: 'Financeiro', path: '/admin/financeiro', icon: Wallet, routes: ['admin-finance'] },
  { label: 'Clientes', path: '/admin/clientes', icon: Users, routes: ['admin-customers'] },
  { label: 'Configurações', path: '/admin/configuracoes', icon: Settings, routes: ['admin-settings'] },
];

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
  'admin-coupons': AdminCoupons,
  'admin-suppliers': AdminSuppliers,
  'admin-customers': AdminCustomers,
  'admin-fraud': AdminFraud,
  'admin-settings': AdminSettings,
};

const page = computed(() => {
  // /admin/drops/:id/editor é o próprio editor.
  if (route.value.name === 'admin-drop-tab' && route.value.params.tab === 'editor') return AdminDropEditor;
  return PAGES[route.value.name] ?? AdminDashboard;
});
const isCurrent = (section) => section.routes.includes(route.value.name);

const signedIn = computed(() => isSignedIn(REALMS.backoffice));
const restoring = ref(!IS_MOCK && !signedIn.value);
const employee = ref(null);

const loadEmployee = async () => {
  employee.value = await getCurrentEmployee().catch(() => null);
};

onMounted(async () => {
  if (restoring.value) {
    await restoreSession(REALMS.backoffice);
    restoring.value = false;
  }
  if (signedIn.value) loadEmployee();
});

const onSignedIn = () => loadEmployee();

const logout = async () => {
  await logoutEmployee().catch(() => {});
  employee.value = null;
};
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
          v-for="section in SECTIONS"
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
              v-for="section in SECTIONS"
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
          <AdminLogin
            v-else-if="!signedIn"
            @signed-in="onSignedIn"
          />
          <component
            :is="page"
            v-else
            :key="route.path"
            :params="route.params"
          />

          <RequestLog />
        </main>
      </div>
    </div>
  </div>
</template>
