<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, Copy, KeyRound, Plus, UserX } from '@lucide/vue';
import { exclusive, useAsync, useAction } from '../../composables/useAsync';
import { admin } from '../../services/admin-api';
import {
  cancelOwnershipTransfer, deactivateEmployee, inviteMember, listAccessRoles, listInvitations, listMembershipRoles,
  listMemberships, revokeInvitation, setMembershipRoles, startOwnershipTransfer, updateMembership,
} from '../../services/team-api';
import { MEMBERSHIP_KIND, labelOf } from '../../services/status';
import { formatDate, formatDateTime, formatMonthYear, initials, toCalendarInput, fromCalendarInput } from '../../services/format';
import { currentEnterpriseId } from '../../services/session';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import AdminAccessRoles from './AdminAccessRoles.vue';

// E12 · Equipe (task 40). Rotas (/api/store): enterprise-memberships · membership-access-roles
// · employees (nome, cargo e departamento) · employee-positions · departments · invitations
// · ownership-transfers. Tudo aqui é só do dono principal.
const OWNER = 1;

const data = useAsync(async () => {
  const [memberships, memberRoles, employees, positions, departments, invitations, roles] = await Promise.all([
    listMemberships(), listMembershipRoles(), admin.employees.getAll(), admin.positions.getAll(),
    admin.departments.getAll(), listInvitations(), listAccessRoles(),
  ]);
  return { memberships, memberRoles, employees, positions, departments, invitations, roles };
});

const d = computed(() => data.data.value);
const positionName = (id) => d.value?.positions.find((p) => p.id === id)?.name ?? '—';
const departmentName = (id) => d.value?.departments.find((p) => p.id === id)?.name ?? '—';
const countIn = (field, id) => (d.value?.employees ?? []).filter((e) => e[field] === id && e.isActive).length;
const people = (n) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
const pendingInvitations = computed(() => (d.value?.invitations ?? []).filter((i) => !i.acceptedAt && !i.revokedAt));

// Membros: o vínculo não traz nome; o funcionário (quando existe) traz.
const members = computed(() => (d.value?.memberships ?? []).map((m) => {
  const employee = d.value.employees.find((e) => e.enterpriseMembershipId === m.id) ?? null;
  const roleIds = d.value.memberRoles.filter((r) => r.enterpriseMembershipId === m.id).map((r) => r.accessRoleId);
  return {
    ...m,
    employee,
    name: employee?.fullName ?? `${labelOf(MEMBERSHIP_KIND, m.kindId)} · membro #${m.id}`,
    roleIds,
    roleNames: d.value.roles.filter((r) => roleIds.includes(r.id)).map((r) => r.name).join(', ') || '—',
  };
}));
const transferable = computed(() => members.value.filter((m) => m.kindId !== OWNER && m.isActive));

// Funcionário (cargo e departamento)
const editingEmployee = ref(null);
const openEmployee = (e) => {
  saveEmployee.error.value = null;
  editingEmployee.value = { ...e, hiredDate: toCalendarInput(e.hiredAt) };
};
const saveEmployee = useAction(async () => {
  const e = editingEmployee.value;
  await admin.employees.update({ ...e, hiredAt: fromCalendarInput(e.hiredDate) });
  editingEmployee.value = null;
  await data.reload();
});

// Acesso do membro: vínculo, situação e perfis
const access = ref(null);
const openAccess = (m) => {
  saveAccess.error.value = null;
  access.value = { id: m.id, name: m.name, kindId: m.kindId, isActive: m.isActive, accessRoleIds: [...m.roleIds] };
};
const saveAccess = useAction(async () => {
  const a = access.value;
  await updateMembership(a.id, a);
  await setMembershipRoles(a.id, a.accessRoleIds);
  access.value = null;
  await data.reload();
});

// Desativar: funcionário pelo id dele; sócio pelo vínculo.
const deactivating = ref(null);
const deactivate = useAction(async () => {
  const m = deactivating.value;
  if (m.employee) await deactivateEmployee(m.employee.id);
  else await updateMembership(m.id, { kindId: m.kindId, isActive: false });
  deactivating.value = null;
  await data.reload();
});

// Convite: o token só aparece uma vez
const invite = ref(null);
const issued = ref(null);
const openInvite = () => {
  sendInvite.error.value = null;
  issued.value = null;
  invite.value = reactive({ email: '', kindId: 3, accessRoleIds: [] });
};
const sendInvite = useAction(async () => {
  issued.value = { ...(await inviteMember(invite.value)), email: invite.value.email.trim() };
  await data.reload();
});
const revoke = useAction(async (id) => {
  await revokeInvitation(id);
  await data.reload();
});

// Transferência de propriedade (30 min): o back não lista as pendentes.
const transfer = ref(null);
const openTransfer = () => {
  sendTransfer.error.value = null;
  cancelTransfer.error.value = null;
  transfer.value = reactive({ recipientMembershipId: transferable.value[0]?.id ?? null, currentPassword: '', issued: null });
};
const sendTransfer = useAction(async () => {
  const t = transfer.value;
  t.issued = await startOwnershipTransfer(t);
  t.currentPassword = '';
});
const cancelTransfer = useAction(async () => {
  await cancelOwnershipTransfer(transfer.value.issued.id);
  transfer.value = null;
});

const copied = ref(false);
const copyFailed = ref(false);
const copyToken = async (token) => {
  copied.value = false;
  copyFailed.value = false;
  try {
    await navigator.clipboard.writeText(token);
    copied.value = true;
  } catch {
    copyFailed.value = true;
  }
};

// Cargos e departamentos
const newPosition = ref('');
const newDepartment = ref('');
const addPosition = useAction(async () => {
  await admin.positions.add({ enterpriseId: currentEnterpriseId(), name: newPosition.value.trim(), description: '', isActive: true });
  newPosition.value = '';
  await data.reload();
});
const addDepartment = useAction(async () => {
  await admin.departments.add({ enterpriseId: currentEnterpriseId(), name: newDepartment.value.trim(), description: '', isActive: true });
  newDepartment.value = '';
  await data.reload();
});

exclusive(addPosition, addDepartment, revoke);
</script>

<template>
  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="8"
    @retry="data.reload"
  >
    <section
      v-if="d"
      class="ds-grid ds-grid--split"
    >
      <div class="ds-stack--6 ds-min-0">
        <article class="ds-card ds-card--flush">
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Membros
            </h2>
            <div class="ds-cluster ds-cluster--2">
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                :disabled="!transferable.length"
                @click="openTransfer"
              >
                Transferir propriedade
              </button>
              <button
                type="button"
                class="ds-btn ds-btn--primary ds-btn--sm"
                @click="openInvite"
              >
                <Plus
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Convidar
              </button>
            </div>
          </header>
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Membros da loja
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Pessoa
                  </th>
                  <th scope="col">
                    Vínculo
                  </th>
                  <th scope="col">
                    Perfis
                  </th>
                  <th scope="col">
                    Desde
                  </th>
                  <th scope="col">
                    Situação
                  </th>
                  <th scope="col">
                    <span class="ds-sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="m in members"
                  :key="m.id"
                >
                  <td>
                    <button
                      v-if="m.employee"
                      type="button"
                      class="ds-table__open ds-cluster ds-cluster--2"
                      @click="openEmployee(m.employee)"
                    >
                      <span
                        class="ds-avatar ds-avatar--sm"
                        aria-hidden="true"
                      >{{ initials(m.name) }}</span>
                      <span class="ds-stack--1">
                        <span>{{ m.name }}</span>
                        <span class="ds-text-xs ds-text-secondary">{{ positionName(m.employee.positionId) }} · {{ departmentName(m.employee.departmentId) }}</span>
                      </span>
                    </button>
                    <span
                      v-else
                      class="ds-cluster ds-cluster--2"
                    >
                      <span
                        class="ds-avatar ds-avatar--sm"
                        aria-hidden="true"
                      >{{ initials(labelOf(MEMBERSHIP_KIND, m.kindId)) }}</span>
                      <span>{{ m.name }}</span>
                    </span>
                  </td>
                  <td>{{ labelOf(MEMBERSHIP_KIND, m.kindId) }}</td>
                  <td class="ds-text-sm">
                    {{ m.kindId === OWNER ? 'Acesso total' : m.roleNames }}
                  </td>
                  <td class="ds-numeric">
                    {{ formatMonthYear(m.joinedAt) }}
                  </td>
                  <td>
                    <span :class="['ds-badge', m.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ m.isActive ? 'Ativo' : 'Inativo' }}</span>
                  </td>
                  <td>
                    <div
                      v-if="m.kindId !== OWNER"
                      class="ds-cluster ds-cluster--2 ds-cluster--end"
                    >
                      <button
                        type="button"
                        class="ds-icon-btn ds-icon-btn--ghost"
                        :aria-label="`Editar acesso de ${m.name}`"
                        :title="`Editar acesso de ${m.name}`"
                        @click="openAccess(m)"
                      >
                        <KeyRound
                          :size="20"
                          :stroke-width="1.5"
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        v-if="m.isActive"
                        type="button"
                        class="ds-icon-btn ds-icon-btn--ghost"
                        :aria-label="`Desativar ${m.name}`"
                        :title="`Desativar ${m.name}`"
                        @click="deactivate.error.value = null; deactivating = m"
                      >
                        <UserX
                          :size="20"
                          :stroke-width="1.5"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="ds-hint ds-card__note">
            A pessoa aparece aqui depois de aceitar o convite. Mudanças de acesso valem na próxima requisição dela.
          </p>
        </article>

        <article
          v-if="pendingInvitations.length"
          class="ds-card ds-stack--3"
        >
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Convites pendentes
            </h2>
          </header>
          <div
            v-for="i in pendingInvitations"
            :key="i.id"
            class="ds-row-divided ds-text-sm"
          >
            <span class="ds-stack--1">
              <span>{{ i.email.toLowerCase() }}</span>
              <span class="ds-text-xs ds-text-secondary">{{ labelOf(MEMBERSHIP_KIND, i.kindId) }} · expira {{ formatDate(i.expiresAt) }}</span>
            </span>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="revoke.isPending.value"
              @click="revoke.run(i.id)"
            >
              Revogar
            </button>
          </div>
        </article>

        <AdminAccessRoles @changed="data.reload" />
      </div>

      <aside class="ds-stack--6">
        <article class="ds-card ds-stack--3">
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Cargos
            </h2>
          </header>
          <div
            v-for="p in d.positions"
            :key="p.id"
            class="ds-cluster ds-cluster--between ds-text-sm"
          >
            <span>{{ p.name }}</span>
            <span class="ds-text-secondary">{{ people(countIn('positionId', p.id)) }}</span>
          </div>
          <form
            class="ds-input-group"
            @submit.prevent="addPosition.run()"
          >
            <label
              class="ds-sr-only"
              for="new-position"
            >Novo cargo</label>
            <input
              id="new-position"
              v-model="newPosition"
              class="ds-input"
              placeholder="Novo cargo"
              required
            >
            <button
              type="submit"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="addPosition.isPending.value"
            >
              Adicionar
            </button>
          </form>
        </article>

        <article class="ds-card ds-stack--3">
          <header class="ds-card__header">
            <h2 class="ds-card__title">
              Departamentos
            </h2>
          </header>
          <div
            v-for="dep in d.departments"
            :key="dep.id"
            class="ds-cluster ds-cluster--between ds-text-sm"
          >
            <span>{{ dep.name }}</span>
            <span class="ds-text-secondary">{{ people(countIn('departmentId', dep.id)) }}</span>
          </div>
          <form
            class="ds-input-group"
            @submit.prevent="addDepartment.run()"
          >
            <label
              class="ds-sr-only"
              for="new-department"
            >Novo departamento</label>
            <input
              id="new-department"
              v-model="newDepartment"
              class="ds-input"
              placeholder="Novo departamento"
              required
            >
            <button
              type="submit"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="addDepartment.isPending.value"
            >
              Adicionar
            </button>
          </form>
          <p
            v-if="addPosition.error.value || addDepartment.error.value || revoke.error.value"
            class="ds-error"
            role="alert"
          >
            {{ (addPosition.error.value || addDepartment.error.value || revoke.error.value).message }}
          </p>
        </article>
      </aside>
    </section>
  </LoadState>

  <ModalDialog
    v-if="editingEmployee"
    :title="editingEmployee.fullName"
    @close="editingEmployee = null"
  >
    <form
      id="employee-form"
      class="ds-stack--4"
      @submit.prevent="saveEmployee.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="em-name"
        >Nome</label>
        <input
          id="em-name"
          v-model="editingEmployee.fullName"
          class="ds-input"
          required
          autofocus
        >
      </div>
      <div class="ds-grid ds-grid--2">
        <div class="ds-field">
          <label
            class="ds-label"
            for="em-pos"
          >Cargo</label>
          <select
            id="em-pos"
            v-model.number="editingEmployee.positionId"
            class="ds-input"
          >
            <option
              v-for="p in d.positions"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="em-dep"
          >Departamento</label>
          <select
            id="em-dep"
            v-model.number="editingEmployee.departmentId"
            class="ds-input"
          >
            <option
              v-for="dep in d.departments"
              :key="dep.id"
              :value="dep.id"
            >
              {{ dep.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="em-hired"
          >Contratado em</label>
          <input
            id="em-hired"
            v-model="editingEmployee.hiredDate"
            class="ds-input"
            type="date"
            required
          >
        </div>
      </div>
      <p
        v-if="saveEmployee.error.value"
        class="ds-error"
        role="alert"
      >
        {{ saveEmployee.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="editingEmployee = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="employee-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveEmployee.isPending.value"
      >
        Salvar
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="access"
    :title="`Acesso de ${access.name}`"
    @close="access = null"
  >
    <form
      id="access-form"
      class="ds-stack--4"
      @submit.prevent="saveAccess.run()"
    >
      <fieldset class="ds-stack--1">
        <legend class="ds-label">
          Vínculo
        </legend>
        <label
          v-for="kind in [2, 3]"
          :key="kind"
          class="ds-check"
        >
          <input
            v-model="access.kindId"
            type="radio"
            name="access-kind"
            :value="kind"
          >
          {{ labelOf(MEMBERSHIP_KIND, kind) }}
        </label>
      </fieldset>
      <fieldset class="ds-stack--1">
        <legend class="ds-label">
          Perfis de acesso
        </legend>
        <label
          v-for="role in d.roles"
          :key="role.id"
          class="ds-check"
        >
          <input
            v-model="access.accessRoleIds"
            type="checkbox"
            :value="role.id"
          >
          {{ role.name }}{{ role.isActive ? '' : ' (inativo)' }}
        </label>
      </fieldset>
      <label class="ds-check">
        <input
          v-model="access.isActive"
          type="checkbox"
        >
        Acesso ativo
      </label>
      <p
        v-if="saveAccess.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ saveAccess.error.value.message }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="access = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="access-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveAccess.isPending.value"
        :aria-busy="saveAccess.isPending.value"
      >
        <span
          v-if="saveAccess.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Salvar acesso
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="deactivating"
    :title="`Desativar ${deactivating.name}?`"
    @close="deactivating = null"
  >
    <p class="ds-text-secondary">
      O acesso ao painel cai na próxima requisição da pessoa. Para devolver, edite o acesso e marque "Acesso ativo".
    </p>
    <p
      v-if="deactivate.error.value"
      class="ds-error"
      role="alert"
    >
      {{ deactivate.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="deactivating = null"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="deactivate.isPending.value"
        @click="deactivate.run()"
      >
        Desativar
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="invite"
    :title="issued ? 'Convite emitido' : 'Convidar para a equipe'"
    @close="invite = null"
  >
    <div
      v-if="issued"
      class="ds-stack--3"
    >
      <p class="ds-text-secondary">
        Entregue este código a {{ issued.email }} por um canal privado. Ele não será exibido de novo e vale até {{ formatDateTime(issued.expiresAt) }}.
      </p>
      <code class="ds-code">{{ issued.token }}</code>
      <p
        v-if="copied"
        class="ds-hint"
        role="status"
      >
        Código copiado.
      </p>
      <p
        v-if="copyFailed"
        class="ds-error"
        role="alert"
      >
        Não foi possível copiar. Selecione o código e copie manualmente.
      </p>
    </div>
    <form
      v-else
      id="invite-form"
      class="ds-stack--4"
      @submit.prevent="sendInvite.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="inv-email"
        >E-mail</label>
        <input
          id="inv-email"
          v-model="invite.email"
          class="ds-input"
          type="email"
          required
          autofocus
        >
      </div>
      <fieldset class="ds-stack--1">
        <legend class="ds-label">
          Vínculo
        </legend>
        <label
          v-for="kind in [2, 3]"
          :key="kind"
          class="ds-check"
        >
          <input
            v-model="invite.kindId"
            type="radio"
            name="inv-kind"
            :value="kind"
          >
          {{ labelOf(MEMBERSHIP_KIND, kind) }}
        </label>
      </fieldset>
      <fieldset
        v-if="d.roles.length"
        class="ds-stack--1"
      >
        <legend class="ds-label">
          Perfis de acesso
        </legend>
        <label
          v-for="role in d.roles.filter((r) => r.isActive)"
          :key="role.id"
          class="ds-check"
        >
          <input
            v-model="invite.accessRoleIds"
            type="checkbox"
            :value="role.id"
          >
          {{ role.name }}
        </label>
      </fieldset>
      <p
        v-if="sendInvite.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ sendInvite.error.value.message }}
      </p>
    </form>
    <template #footer>
      <template v-if="issued">
        <button
          type="button"
          class="ds-btn ds-btn--secondary"
          @click="copyToken(issued.token)"
        >
          <Copy
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Copiar código
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--primary"
          @click="invite = null"
        >
          Concluir
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="invite = null"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="invite-form"
          class="ds-btn ds-btn--primary"
          :disabled="sendInvite.isPending.value"
        >
          Emitir convite
        </button>
      </template>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="transfer"
    title="Transferir propriedade"
    @close="transfer = null"
  >
    <div
      v-if="transfer.issued"
      class="ds-stack--3"
    >
      <p class="ds-text-secondary">
        Entregue este código à pessoa que vai receber a loja. Ela aceita em "Tenho um convite", com a própria senha, até {{ formatDateTime(transfer.issued.expiresAt) }}. Você passa a ser sócio-proprietário.
      </p>
      <code class="ds-code">{{ transfer.issued.token }}</code>
      <p
        v-if="copied"
        class="ds-hint"
        role="status"
      >
        Código copiado.
      </p>
      <p
        v-if="copyFailed"
        class="ds-error"
        role="alert"
      >
        Não foi possível copiar. Selecione o código e copie manualmente.
      </p>
      <p
        v-if="cancelTransfer.error.value"
        class="ds-error"
        role="alert"
      >
        {{ cancelTransfer.error.value.message }}
      </p>
    </div>
    <form
      v-else
      id="transfer-form"
      class="ds-stack--4"
      @submit.prevent="sendTransfer.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="tr-member"
        >Novo dono principal</label>
        <select
          id="tr-member"
          v-model.number="transfer.recipientMembershipId"
          class="ds-input"
          required
        >
          <option
            v-for="m in transferable"
            :key="m.id"
            :value="m.id"
          >
            {{ m.name }}
          </option>
        </select>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="tr-password"
        >Sua senha atual</label>
        <input
          id="tr-password"
          v-model="transfer.currentPassword"
          class="ds-input"
          type="password"
          autocomplete="current-password"
          required
        >
        <span class="ds-hint">O código vale por 30 minutos.</span>
      </div>
      <p
        v-if="sendTransfer.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ sendTransfer.error.value.message }}
      </p>
    </form>
    <template #footer>
      <template v-if="transfer.issued">
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          :disabled="cancelTransfer.isPending.value"
          @click="cancelTransfer.run()"
        >
          Cancelar transferência
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--secondary"
          @click="copyToken(transfer.issued.token)"
        >
          <Copy
            class="ds-btn__icon"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Copiar código
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="transfer = null"
        >
          Voltar
        </button>
        <button
          type="submit"
          form="transfer-form"
          class="ds-btn ds-btn--primary"
          :disabled="sendTransfer.isPending.value"
          :aria-busy="sendTransfer.isPending.value"
        >
          <span
            v-if="sendTransfer.isPending.value"
            class="ds-spinner"
            aria-hidden="true"
          />
          Gerar código
        </button>
      </template>
    </template>
  </ModalDialog>
</template>
