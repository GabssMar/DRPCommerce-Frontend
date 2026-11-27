<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { usePermissions } from '../../composables/usePermissions';
import {
  createCategory, deleteCategories, getCategoryTree, reorderCategories, searchProducts, setCategoryActive, updateCategory,
} from '../../services/admin-catalog-api';
import { fieldMessage } from '../../services/api-error';
import { currentEnterpriseId } from '../../services/session';
import CatalogTabs from './CatalogTabs.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';

// E7 · Categorias (task 35): árvore de até 3 níveis (GET categories/tree), ativação,
// reordenação dos irmãos (PUT categories/reorder) e exclusão com transferência dos
// produtos (DELETE categories/delete-with-products).
const MAX_DEPTH = 3;
const CONFLICTS = { 'Category.DuplicateSlug': 'slug' };
const ERRORS = {
  'Category.HasChildren': 'A categoria tem subcategorias que não estão na seleção.',
  'Category.HasProducts': 'A categoria tem produtos: escolha para onde levá-los.',
  'Category.InvalidDestination': 'O destino precisa ser uma categoria ativa, fora do ramo excluído.',
  'Category.HasServices': 'A categoria tem serviços vinculados: mova-os antes de excluir.',
  'Category.Cycle': 'A categoria-mãe escolhida criaria um ciclo.',
  'Category.MaximumDepth': 'A árvore aceita até 3 níveis.',
  'Category.InvalidParent': 'A categoria-mãe escolhida não é válida.',
};
const messageOf = (error) => (error ? ERRORS[error.code] ?? error.message : '');

const { can, denied } = usePermissions();

const tree = useAsync(getCategoryTree, { initial: [] });
const roots = computed(() => tree.data.value ?? []);

// --------------------------------------------------------------- árvore ---
const collapsed = ref(new Set());
const selectedId = ref(null);
const container = ref(null);

const rows = computed(() => {
  const out = [];
  const walk = (nodes, level, parent) => nodes.forEach((node, i) => {
    out.push({ node, level, parent, setsize: nodes.length, posinset: i + 1, siblings: nodes });
    if (node.children.length && !collapsed.value.has(node.id)) walk(node.children, level + 1, node);
  });
  walk(roots.value, 1, null);
  return out;
});

const flat = computed(() => {
  const out = [];
  const walk = (nodes, level, parent) => nodes.forEach((node) => {
    out.push({ node, level, parent });
    walk(node.children, level + 1, node);
  });
  walk(roots.value, 1, null);
  return out;
});
const subtreeIds = (node) => [node.id, ...node.children.flatMap(subtreeIds)];
const focusable = computed(() => rows.value.find((r) => r.node.id === selectedId.value)?.node.id ?? rows.value[0]?.node.id);

const focusRow = async (id) => {
  selectedId.value = id;
  await nextTick();
  container.value?.querySelector(`[data-id="${id}"]`)?.focus();
};
const toggle = (node) => {
  const next = new Set(collapsed.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  collapsed.value = next;
};

const move = useAction(async (row, delta) => {
  const to = row.siblings.indexOf(row.node) + delta;
  if (to < 0 || to >= row.siblings.length) return;
  const order = [...row.siblings];
  order.splice(to, 0, order.splice(order.indexOf(row.node), 1)[0]);
  await reorderCategories(order.map((c, i) => ({ id: c.id, displayOrder: i })));
  await tree.reload();
  await focusRow(row.node.id);
});

const onKey = (event, row, index) => {
  if (event.target !== event.currentTarget) return;
  const { node } = row;
  const go = (target) => { if (target) { event.preventDefault(); focusRow(target.node.id); } };
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    if (can('categories.manage')) move.run(row, event.key === 'ArrowUp' ? -1 : 1);
  } else if (event.key === 'ArrowDown') go(rows.value[index + 1]);
  else if (event.key === 'ArrowUp') go(rows.value[index - 1]);
  else if (event.key === 'Home') go(rows.value[0]);
  else if (event.key === 'End') go(rows.value.at(-1));
  else if (event.key === 'ArrowRight' && node.children.length) {
    event.preventDefault();
    if (collapsed.value.has(node.id)) toggle(node);
    else go(rows.value[index + 1]);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (node.children.length && !collapsed.value.has(node.id)) toggle(node);
    else go(row.parent && { node: row.parent });
  }
};

// ------------------------------------------------------ criar e editar ---
const form = ref(null);
const parentOptions = computed(() => {
  const own = form.value?.id ? new Set(subtreeIds(flat.value.find((r) => r.node.id === form.value.id).node)) : new Set();
  return flat.value.filter((r) => r.level < MAX_DEPTH && !own.has(r.node.id));
});
const openForm = (node = null, parentId = null) => {
  save.error.value = null;
  form.value = node
    ? { id: node.id, name: node.name, slug: node.slug, description: node.description ?? '', imageUrl: node.imageUrl ?? '', parentCategoryId: node.parentCategoryId, isActive: node.isActive, displayOrder: node.displayOrder }
    : { id: null, name: '', slug: '', description: '', imageUrl: '', parentCategoryId: parentId, isActive: true, displayOrder: null };
};
const save = useAction(async () => {
  const f = form.value;
  const siblings = flat.value.filter((r) => (r.parent?.id ?? null) === f.parentCategoryId).length;
  const payload = {
    enterpriseId: currentEnterpriseId(),
    parentCategoryId: f.parentCategoryId,
    name: f.name.trim(),
    slug: f.slug.trim(),
    description: f.description.trim(),
    imageUrl: f.imageUrl.trim(),
    displayOrder: f.displayOrder ?? siblings,
    isActive: f.isActive,
  };
  if (f.id) await updateCategory({ ...payload, id: f.id });
  else await createCategory(payload);
  form.value = null;
  await tree.reload();
});

// --------------------------------------------------------------- ativar ---
const deactivating = ref(null);
const setActive = useAction(async (node, isActive) => {
  await setCategoryActive(node.id, isActive);
  deactivating.value = null;
  await tree.reload();
});
const askActive = (node) => {
  setActive.error.value = null;
  if (node.isActive && node.children.length) deactivating.value = node;
  else setActive.run(node, !node.isActive);
};

// -------------------------------------------------------------- excluir ---
const removing = ref(null);
const destinations = computed(() => {
  const own = new Set(removing.value ? subtreeIds(removing.value.node) : []);
  return flat.value.filter((r) => !own.has(r.node.id) && r.node.isActive && [r.parent, r.parent?.parent].every((p) => !p || p.isActive));
});
const openRemove = useAction(async (node) => {
  remove.error.value = null;
  const found = await searchProducts({ categoryId: node.id, includeSubcategories: true, page: 1, pageSize: 1 });
  removing.value = { node, products: found.total, destinationId: null };
});
const remove = useAction(async () => {
  const { node, products, destinationId } = removing.value;
  await deleteCategories(subtreeIds(node), products ? destinationId : null);
  removing.value = null;
  await tree.reload();
});
watch(roots, () => {
  if (!rows.value.some((r) => r.node.id === selectedId.value)) selectedId.value = null;
});
const indent = (level) => '— '.repeat(level - 1);
</script>

<template>
  <div class="ds-cluster ds-cluster--between">
    <h1 class="ds-title ds-title--lg">
      Catálogo
    </h1>
    <div class="ds-cluster ds-cluster--2">
      <CatalogTabs />
      <button
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="!can('categories.manage')"
        :title="denied('categories.manage', 'gerenciar categorias')"
        @click="openForm()"
      >
        <Plus
          class="ds-btn__icon"
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        Nova categoria
      </button>
    </div>
  </div>

  <div class="ds-card ds-card--flush">
    <LoadState
      :is-loading="tree.isLoading.value"
      :error="tree.error.value"
      :is-empty="!roots.length"
      empty-text="Nenhuma categoria. Crie a primeira para organizar o catálogo."
      :lines="6"
      flush
      @retry="tree.reload"
    >
      <template #empty-action>
        <button
          v-if="can('categories.manage')"
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          @click="openForm()"
        >
          Criar categoria
        </button>
      </template>
      <ul
        ref="container"
        class="ds-tree"
        role="tree"
        aria-label="Categorias"
      >
        <li
          v-for="(row, index) in rows"
          :key="row.node.id"
          :data-id="row.node.id"
          :class="['ds-tree__item', { [`ds-tree__item--level-${row.level}`]: row.level > 1, 'ds-tree__item--inactive': !row.node.isActive }]"
          role="treeitem"
          :aria-level="row.level"
          :aria-setsize="row.setsize"
          :aria-posinset="row.posinset"
          :aria-expanded="row.node.children.length ? !collapsed.has(row.node.id) : undefined"
          :aria-selected="selectedId === row.node.id"
          :tabindex="focusable === row.node.id ? 0 : -1"
          @keydown="onKey($event, row, index)"
          @focus.self="selectedId = row.node.id"
        >
          <button
            v-if="row.node.children.length"
            type="button"
            class="ds-tree__toggle"
            :aria-label="`${collapsed.has(row.node.id) ? 'Expandir' : 'Recolher'} ${row.node.name}`"
            tabindex="-1"
            @click="toggle(row.node)"
          >
            <component
              :is="collapsed.has(row.node.id) ? ChevronRight : ChevronDown"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
          <span
            v-else
            class="ds-tree__spacer"
            aria-hidden="true"
          />
          <span class="ds-tree__label">
            <span class="ds-text-medium">{{ row.node.name }}</span>
            <span class="ds-text-xs ds-text-secondary ds-mono">{{ row.node.slug }}</span>
          </span>
          <span class="ds-tree__actions">
            <span
              v-if="!row.node.isActive"
              class="ds-badge ds-badge--done"
            >Inativa</span>
            <button
              type="button"
              class="ds-icon-btn ds-icon-btn--ghost"
              :aria-label="`Subir ${row.node.name}`"
              :disabled="row.posinset === 1 || move.isPending.value || !can('categories.manage')"
              @click="move.run(row, -1)"
            >
              <ArrowUp
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="ds-icon-btn ds-icon-btn--ghost"
              :aria-label="`Descer ${row.node.name}`"
              :disabled="row.posinset === row.setsize || move.isPending.value || !can('categories.manage')"
              @click="move.run(row, 1)"
            >
              <ArrowDown
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="!can('categories.manage')"
              :title="denied('categories.manage', 'gerenciar categorias')"
              :aria-label="`Editar ${row.node.name}`"
              @click="openForm(row.node)"
            >
              Editar
            </button>
            <button
              v-if="row.level < MAX_DEPTH"
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="!can('categories.manage')"
              :aria-label="`Nova subcategoria de ${row.node.name}`"
              @click="openForm(null, row.node.id)"
            >
              Subcategoria
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="setActive.isPending.value || !can('categories.manage')"
              :aria-label="`${row.node.isActive ? 'Desativar' : 'Ativar'} ${row.node.name}`"
              @click="askActive(row.node)"
            >
              {{ row.node.isActive ? 'Desativar' : 'Ativar' }}
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost ds-btn--sm"
              :disabled="openRemove.isPending.value || !can('categories.manage')"
              :aria-label="`Excluir ${row.node.name}`"
              @click="openRemove.run(row.node)"
            >
              Excluir
            </button>
          </span>
        </li>
      </ul>
      <p class="ds-hint ds-card__note">
        Setas navegam, → e ← expandem e recolhem, Alt + ↑ e Alt + ↓ reordenam entre irmãos. A ordem vale para o menu da vitrine.
      </p>
      <p
        v-if="move.error.value || setActive.error.value || openRemove.error.value"
        class="ds-error ds-card__note"
        role="alert"
      >
        {{ messageOf(move.error.value || setActive.error.value || openRemove.error.value) }}
      </p>
    </LoadState>
  </div>

  <ModalDialog
    v-if="form"
    :title="form.id ? 'Editar categoria' : 'Nova categoria'"
    @close="form = null"
  >
    <form
      id="category-form"
      class="ds-stack--4"
      @submit.prevent="save.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="ct-name"
        >Nome</label>
        <input
          id="ct-name"
          v-model="form.name"
          class="ds-input"
          maxlength="200"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ct-slug"
        >Slug</label>
        <input
          id="ct-slug"
          v-model="form.slug"
          class="ds-input ds-mono"
          maxlength="100"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          :required="Boolean(form.id)"
          aria-describedby="ct-slug-hint"
          :aria-invalid="Boolean(fieldMessage(save.error.value, 'slug', CONFLICTS))"
        >
        <span
          id="ct-slug-hint"
          :class="fieldMessage(save.error.value, 'slug', CONFLICTS) ? 'ds-error' : 'ds-hint'"
          :role="fieldMessage(save.error.value, 'slug', CONFLICTS) ? 'alert' : undefined"
        >
          <AlertCircle
            v-if="fieldMessage(save.error.value, 'slug', CONFLICTS)"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ fieldMessage(save.error.value, 'slug', CONFLICTS) || 'Vazio: gerado a partir do nome.' }}
        </span>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ct-parent"
        >Categoria-mãe</label>
        <select
          id="ct-parent"
          v-model="form.parentCategoryId"
          class="ds-input"
        >
          <option :value="null">
            Nenhuma (raiz)
          </option>
          <option
            v-for="r in parentOptions"
            :key="r.node.id"
            :value="r.node.id"
          >
            {{ indent(r.level) }}{{ r.node.name }}
          </option>
        </select>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="ct-desc"
        >Descrição</label>
        <input
          id="ct-desc"
          v-model="form.description"
          class="ds-input"
          maxlength="500"
        >
      </div>
      <label class="ds-check">
        <input
          v-model="form.isActive"
          type="checkbox"
        >
        Ativa na vitrine
      </label>
      <p
        v-if="save.error.value && !fieldMessage(save.error.value, 'slug', CONFLICTS)"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ messageOf(save.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="form = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="category-form"
        class="ds-btn ds-btn--primary"
        :disabled="save.isPending.value"
        :aria-busy="save.isPending.value"
      >
        <span
          v-if="save.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Salvar categoria
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="deactivating"
    :title="`Desativar ${deactivating.name}?`"
    @close="deactivating = null"
  >
    <p class="ds-text-secondary">
      As subcategorias e os produtos deste ramo somem da vitrine. Os cadastros continuam no painel e voltam quando você reativar.
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
        :disabled="setActive.isPending.value"
        @click="setActive.run(deactivating, false)"
      >
        Desativar
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="removing"
    :title="`Excluir ${removing.node.name}?`"
    @close="removing = null"
  >
    <form
      id="remove-form"
      class="ds-stack--4"
      @submit.prevent="remove.run()"
    >
      <p class="ds-text-secondary">
        {{ removing.node.children.length ? `A categoria e as ${subtreeIds(removing.node).length - 1} subcategorias abaixo dela serão excluídas.` : 'A categoria será excluída.' }}
      </p>
      <div
        v-if="removing.products"
        class="ds-field"
      >
        <label
          class="ds-label"
          for="rm-destination"
        >Levar {{ removing.products }} {{ removing.products === 1 ? 'produto' : 'produtos' }} para</label>
        <select
          id="rm-destination"
          v-model="removing.destinationId"
          class="ds-input"
          required
        >
          <option
            :value="null"
            disabled
          >
            Escolha uma categoria ativa
          </option>
          <option
            v-for="r in destinations"
            :key="r.node.id"
            :value="r.node.id"
          >
            {{ indent(r.level) }}{{ r.node.name }}
          </option>
        </select>
      </div>
      <p
        v-if="remove.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ messageOf(remove.error.value) }}
      </p>
    </form>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="removing = null"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="remove-form"
        class="ds-btn ds-btn--danger"
        :disabled="remove.isPending.value"
        :aria-busy="remove.isPending.value"
      >
        <span
          v-if="remove.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Excluir
      </button>
    </template>
  </ModalDialog>
</template>
