<script setup>
import { computed, reactive, ref } from 'vue';
import { AlertCircle, Plus, X } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { admin, inviteMember, listAccessRoles, listInvitations, revokeInvitation } from '../../services/admin-api';
import { MEMBERSHIP_KIND, labelOf } from '../../services/status';
import { formatDate, formatMonthYear, initials, toDateInput, fromDateInput } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// E12 · Equipe. Rotas (/api/store): employees · employee-positions (cargos) · departments
// (get-all / add / update) · GET/POST/DELETE invitations (convite por e-mail, o funcionário
// nasce quando o convite é aceito) · GET access-roles/get-all (papéis do convite).
const data = useAsync(async () => {
  const [employees, positions, departments, invitations, roles] = await Promise.all([
    admin.employees.getAll(), admin.positions.getAll(), admin.departments.getAll(),
    listInvitations().catch(() => []), listAccessRoles().catch(() => []),
  ]);
  return { employees, positions, departments, invitations, roles };
});

const d = computed(() => data.data.value);
const positionName = (id) => d.value?.positions.find((p) => p.id === id)?.name ?? '—';
const departmentName = (id) => d.value?.departments.find((p) => p.id === id)?.name ?? '—';
const countIn = (field, id) => (d.value?.employees ?? []).filter((e) => e[field] === id && e.isActive).length;
const people = (n) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
const pendingInvitations = computed(() => (d.value?.invitations ?? []).filter((i) => !i.acceptedAt && !i.revokedAt));

// Funcionário
const editing = ref(null);
const openEmployee = (e) => {
  editing.value = { ...e, hiredDate: toDateInput(e.hiredAt) };
};
const saveEmployee = useAction(async () => {
  const e = editing.value;
  await admin.employees.update({ ...e, hiredAt: fromDateInput(e.hiredDate) });
  editing.value = null;
  await data.reload();
});

// Convite
const invite = ref(null);
const openInvite = () => {
  invite.value = reactive({ email: '', kindId: 3, accessRoleIds: [] });
};
const sendInvite = useAction(async () => {
  await inviteMember({ ...invite.value, email: invite.value.email.trim() });
  invite.value = null;
  await data.reload();
});
const revoke = useAction(async (id) => {
  await revokeInvitation(id);
  await data.reload();
});

// Cargos e departamentos
const newPosition = ref('');
const newDepartment = ref('');
const addPosition = useAction(async () => {
  await admin.positions.add({ enterpriseId: 1, name: newPosition.value.trim(), description: '', isActive: true });
  newPosition.value = '';
  await data.reload();
});
const addDepartment = useAction(async () => {
  await admin.departments.add({ enterpriseId: 1, name: newDepartment.value.trim(), description: '', isActive: true });
  newDepartment.value = '';
  await data.reload();
});
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
              Funcionários
            </h2>
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
          </header>
          <div class="ds-table-scroll">
            <table class="ds-table">
              <caption class="ds-sr-only">
                Funcionários da empresa
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Pessoa
                  </th>
                  <th scope="col">
                    Cargo
                  </th>
                  <th scope="col">
                    Departamento
                  </th>
                  <th scope="col">
                    Desde
                  </th>
                  <th scope="col">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="e in d.employees"
                  :key="e.id"
                >
                  <td>
                    <button
                      type="button"
                      class="ds-table__open ds-cluster ds-cluster--2"
                      @click="openEmployee(e)"
                    >
                      <span
                        class="ds-avatar ds-avatar--sm"
                        aria-hidden="true"
                      >{{ initials(e.fullName) }}</span>
                      <span class="ds-stack--1">
                        <span>{{ e.fullName }}</span>
                        <span class="ds-text-xs ds-text-secondary">membro #{{ e.enterpriseMembershipId }}</span>
                      </span>
                    </button>
                  </td>
                  <td>{{ positionName(e.positionId) }}</td>
                  <td>{{ departmentName(e.departmentId) }}</td>
                  <td class="ds-numeric">
                    {{ formatMonthYear(e.hiredAt) }}
                  </td>
                  <td>
                    <span :class="['ds-badge', e.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ e.isActive ? 'Ativo' : 'Inativo' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="ds-hint ds-card__note">
            O funcionário aparece aqui depois de aceitar o convite. E-mail e senha ficam na conta de usuário da pessoa.
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
              <span>{{ i.email }}</span>
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
    v-if="editing"
    :title="editing.fullName"
    @close="editing = null"
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
          v-model="editing.fullName"
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
            v-model.number="editing.positionId"
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
            v-model.number="editing.departmentId"
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
            v-model="editing.hiredDate"
            class="ds-input"
            type="date"
            required
          >
        </div>
      </div>
      <label class="ds-check">
        <input
          v-model="editing.isActive"
          type="checkbox"
        >
        Ativo
      </label>
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
        @click="editing = null"
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
    v-if="invite"
    title="Convidar para a equipe"
    @close="invite = null"
  >
    <form
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
          Papéis de acesso
        </legend>
        <label
          v-for="role in d.roles"
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
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="invite = null"
      >
        <X
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Cancelar
      </button>
      <button
        type="submit"
        form="invite-form"
        class="ds-btn ds-btn--primary"
        :disabled="sendInvite.isPending.value"
      >
        Enviar convite
      </button>
    </template>
  </ModalDialog>
</template>
