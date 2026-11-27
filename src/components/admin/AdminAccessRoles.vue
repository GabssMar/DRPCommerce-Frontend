<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, Plus } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import {
  createAccessRole, deleteAccessRole, listAccessRoles, listPermissions, listRolePermissions, updateAccessRole,
} from '../../services/team-api';
import { PERMISSION_MODULES } from '../../services/status';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// Perfis de acesso (task 40): catálogo de permissões agrupado por módulo. O PUT
// substitui todas as permissões do perfil; perfil em uso só pode ser desativado.
const emit = defineEmits(['changed']);

const data = useAsync(async () => {
  const [roles, permissions, links] = await Promise.all([listAccessRoles(), listPermissions(), listRolePermissions()]);
  return { roles, permissions: permissions.filter((p) => p.isActive), links };
});
const d = computed(() => data.data.value);

const permissionIdsOf = (roleId) => (d.value?.links ?? []).filter((l) => l.accessRoleId === roleId).map((l) => l.permissionId);

const groups = computed(() => {
  const permissions = d.value?.permissions ?? [];
  return Object.keys(PERMISSION_MODULES)
    .concat([...new Set(permissions.map((p) => p.module))].filter((m) => !PERMISSION_MODULES[m]))
    .map((module) => ({ module, label: PERMISSION_MODULES[module] ?? module, items: permissions.filter((p) => p.module === module) }))
    .filter((g) => g.items.length);
});

const editing = ref(null);
const confirming = ref(false);
const openRole = (role) => {
  confirming.value = false;
  [save, remove, deactivate].forEach((action) => { action.error.value = null; });
  editing.value = role
    ? { ...role, permissionIds: permissionIdsOf(role.id) }
    : { id: null, name: '', description: '', isActive: true, permissionIds: [] };
};

const reloadAll = async () => {
  await data.reload();
  emit('changed');
};

const save = useAction(async () => {
  const role = editing.value;
  if (role.id) await updateAccessRole(role.id, role);
  else await createAccessRole(role);
  editing.value = null;
  await reloadAll();
});

const remove = useAction(async () => {
  await deleteAccessRole(editing.value.id);
  editing.value = null;
  await reloadAll();
});

const roleInUse = computed(() => remove.error.value?.code === 'Access.RoleInUse');
const deactivate = useAction(async () => {
  await updateAccessRole(editing.value.id, { ...editing.value, isActive: false });
  editing.value = null;
  await reloadAll();
});

const countLabel = (n) => `${n} ${n === 1 ? 'permissão' : 'permissões'}`;
</script>

<template>
  <article class="ds-card ds-card--flush">
    <header class="ds-card__header">
      <h2 class="ds-card__title">
        Perfis de acesso
      </h2>
      <button
        type="button"
        class="ds-btn ds-btn--secondary ds-btn--sm"
        @click="openRole(null)"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Novo perfil
      </button>
    </header>
    <LoadState
      :is-loading="data.isLoading.value"
      :error="data.error.value"
      :is-empty="!d?.roles.length"
      empty-text="Nenhum perfil criado. Crie um para definir o que cada pessoa pode fazer."
      :lines="3"
      flush
      @retry="data.reload"
    >
      <template #empty-action>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="openRole(null)"
        >
          Criar perfil
        </button>
      </template>
      <ul class="ds-list">
        <li
          v-for="role in d.roles"
          :key="role.id"
          class="ds-list__item"
        >
          <button
            type="button"
            class="ds-table__open ds-stack--1 ds-min-0"
            @click="openRole(role)"
          >
            <span class="ds-text-medium">{{ role.name }}</span>
            <span class="ds-text-sm ds-text-secondary">{{ countLabel(permissionIdsOf(role.id).length) }}</span>
          </button>
          <span class="ds-list__meta">
            <span :class="['ds-badge', role.isActive ? 'ds-badge--success' : 'ds-badge--done']">{{ role.isActive ? 'Ativo' : 'Inativo' }}</span>
          </span>
        </li>
      </ul>
    </LoadState>
  </article>

  <ModalDialog
    v-if="editing"
    :title="editing.id ? editing.name : 'Novo perfil'"
    @close="editing = null"
  >
    <form
      id="role-form"
      class="ds-stack--5"
      @submit.prevent="save.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="role-name"
        >Nome</label>
        <input
          id="role-name"
          v-model="editing.name"
          class="ds-input"
          maxlength="255"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="role-desc"
        >Descrição</label>
        <input
          id="role-desc"
          v-model="editing.description"
          class="ds-input"
          maxlength="1000"
        >
      </div>
      <label class="ds-check">
        <input
          v-model="editing.isActive"
          type="checkbox"
        >
        Perfil ativo
      </label>
      <fieldset
        v-for="group in groups"
        :key="group.module"
        class="ds-stack--1"
      >
        <legend class="ds-label">
          {{ group.label }}
        </legend>
        <label
          v-for="p in group.items"
          :key="p.id"
          class="ds-check"
        >
          <input
            v-model="editing.permissionIds"
            type="checkbox"
            :value="p.id"
          >
          {{ p.name }}
        </label>
      </fieldset>
      <p
        v-if="save.error.value || remove.error.value || deactivate.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ (save.error.value || remove.error.value || deactivate.error.value).message }}
      </p>
    </form>
    <template #footer>
      <button
        v-if="roleInUse && editing.isActive"
        type="button"
        class="ds-btn ds-btn--ghost"
        :disabled="deactivate.isPending.value"
        @click="deactivate.run()"
      >
        Desativar perfil
      </button>
      <button
        v-else-if="editing.id"
        type="button"
        :class="['ds-btn', confirming ? 'ds-btn--danger' : 'ds-btn--ghost']"
        :disabled="remove.isPending.value"
        @click="confirming ? remove.run() : (confirming = true)"
      >
        {{ confirming ? 'Confirmar exclusão' : 'Excluir' }}
      </button>
      <button
        type="submit"
        form="role-form"
        class="ds-btn ds-btn--primary"
        :disabled="save.isPending.value"
        :aria-busy="save.isPending.value"
      >
        <span
          v-if="save.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Salvar perfil
      </button>
    </template>
  </ModalDialog>
</template>
