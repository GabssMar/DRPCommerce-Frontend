<script setup>
import { computed, reactive, watch } from 'vue';
import { AlertCircle, ArrowLeft, CheckCircle } from '@lucide/vue';
import { useAction, useAsync } from '../../composables/useAsync';
import { usePermissions } from '../../composables/usePermissions';
import { href, navigate } from '../../router';
import { admin } from '../../services/admin-api';
import {
  createProduct, getProduct, setProductActive, updateProductCategory, updateProductDetails, updateProductDimensions,
  updateProductPricing,
} from '../../services/admin-catalog-api';
import { fieldMessage } from '../../services/api-error';
import { brl } from '../../services/format';
import LoadState from '../ui/LoadState.vue';
import AdminProductVariants from './AdminProductVariants.vue';
import AdminProductStock from './AdminProductStock.vue';

// E7 · Editor de produto (task 33), uma aba por seção, cada uma com o seu salvar
// e a sua permissão. #/admin/catalogo/produtos/novo cria; /:id/:tab edita.
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const { can, denied } = usePermissions();

const TABS = [
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'preco', label: 'Preço' },
  { id: 'dimensoes', label: 'Dimensões' },
  { id: 'categoria', label: 'Categoria' },
  { id: 'variantes', label: 'Variantes' },
  { id: 'estoque', label: 'Estoque' },
];
const CONFLICTS = { 'Product.DuplicateSlug': 'slug', 'Product.DuplicateSku': 'sku' };

const isNew = computed(() => props.params.id === 'novo');
const productId = computed(() => Number(props.params.id));
// Produto no Drop não tem aba de estoque: o saldo é do catálogo do Drop (task 44).
const inDrop = computed(() => Boolean(product.data.value?.isTransferredToDrop));
const tabs = computed(() => (inDrop.value ? TABS.filter((t) => t.id !== 'estoque') : TABS));
const tab = computed(() => tabs.value.find((t) => t.id === props.params.tab)?.id ?? 'detalhes');
const tabHref = (id) => href(`/admin/catalogo/produtos/${props.params.id}/${id}`);

const product = useAsync(() => (isNew.value ? null : getProduct(productId.value)));
const p = computed(() => product.data.value);

const lookups = useAsync(async () => {
  const [categories, suppliers] = await Promise.all([admin.categories.getAll(), admin.suppliers.getAll()]);
  return { categories: categories.filter((c) => !c.isDeleted && c.isActive), suppliers };
});
const categories = computed(() => lookups.data.value?.categories ?? []);
const suppliers = computed(() => lookups.data.value?.suppliers ?? []);

// Formulários por seção, recarregados a cada resposta do back.
const details = reactive({ name: '', slug: '', description: '', sku: '', barCode: '', brand: '', imageUrls: '', isDigital: false });
const pricing = reactive({ price: '', costPrice: '' });
const dimensions = reactive({ weight: '', height: '', width: '', length: '' });
const placement = reactive({ categoryId: null, supplierId: null });
const creating = reactive({ isActive: true });

// Cada seção recarrega só o seu formulário: salvar uma não descarta o que está digitado nas outras.
const fillDetails = (value) => {
  Object.keys(details).forEach((k) => { details[k] = value[k] ?? ''; });
  details.isDigital = Boolean(value.isDigital);
};
const fillPricing = (value) => Object.assign(pricing, { price: value.price, costPrice: value.costPrice });
const fillDimensions = (value) => Object.assign(dimensions, { weight: value.weight, height: value.height, width: value.width, length: value.length });
const fillPlacement = (value) => Object.assign(placement, { categoryId: value.categoryId, supplierId: value.supplierId ?? null });
watch(() => p.value?.id, () => {
  if (!p.value) return;
  [fillDetails, fillPricing, fillDimensions, fillPlacement].forEach((fill) => fill(p.value));
}, { immediate: true });
watch(categories, (list) => {
  if (isNew.value && !placement.categoryId) placement.categoryId = list[0]?.id ?? null;
});

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const detailsPayload = () => ({
  ...details,
  name: details.name.trim(),
  slug: details.slug.trim() || slugify(details.name),
  sku: details.sku.trim(),
});
const numbers = (form) => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]));

// Preço abaixo do custo: o back recusa; a tela avisa antes de enviar.
const priceError = computed(() => (Number(pricing.costPrice) > Number(pricing.price) ? 'O custo não pode ser maior que o preço.' : ''));

const applied = (updated, fill) => {
  product.data.value = updated;
  fill?.(updated);
};

const saveDetails = useAction(async () => applied(await updateProductDetails(productId.value, detailsPayload()), fillDetails));
const savePricing = useAction(async () => applied(await updateProductPricing(productId.value, numbers(pricing)), fillPricing));
const saveDimensions = useAction(async () => applied(await updateProductDimensions(productId.value, numbers(dimensions)), fillDimensions));
const savePlacement = useAction(async () => applied(await updateProductCategory(productId.value, placement), fillPlacement));
const toggleActive = useAction(async () => applied(await setProductActive(productId.value, !p.value.isActive)));

const create = useAction(async () => {
  const created = await createProduct({
    ...detailsPayload(), ...numbers(pricing), ...numbers(dimensions), ...placement,
    supplierId: placement.supplierId || null, isActive: creating.isActive, hasVariants: false,
  });
  navigate(`/admin/catalogo/produtos/${created.id}/detalhes`);
});

const saved = (action) => action.done.value && !action.error.value;
</script>

<template>
  <div class="ds-stack--2">
    <a
      class="ds-btn ds-btn--ghost ds-btn--sm ds-self-start"
      :href="href('/admin/catalogo')"
    >
      <ArrowLeft
        class="ds-btn__icon"
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      Catálogo
    </a>
    <div class="ds-cluster ds-cluster--between">
      <h1 class="ds-title ds-title--lg">
        {{ isNew ? 'Novo produto' : p?.name ?? 'Produto' }}
      </h1>
      <div
        v-if="p"
        class="ds-cluster ds-cluster--2"
      >
        <span
          v-if="inDrop"
          class="ds-badge ds-badge--inverse"
        >No Drop</span>
        <span
          v-else
          :class="['ds-badge', p.isActive ? 'ds-badge--success' : 'ds-badge--done']"
        >{{ p.isActive ? 'Ativo na vitrine' : 'Inativo' }}</span>
        <button
          type="button"
          class="ds-btn ds-btn--secondary ds-btn--sm"
          :disabled="inDrop || !can('products.edit') || toggleActive.isPending.value"
          :title="denied('products.edit', 'editar produtos')"
          @click="toggleActive.run()"
        >
          {{ p.isActive ? 'Desativar' : 'Ativar' }}
        </button>
      </div>
    </div>
    <p
      v-if="inDrop"
      class="ds-hint"
    >
      Produto transferido para o Drop: o saldo e a venda ficam no catálogo do Drop, e a vitrine não vende este produto.
    </p>
    <p
      v-if="toggleActive.error.value"
      class="ds-error"
      role="alert"
    >
      {{ toggleActive.error.value.message }}
    </p>
  </div>

  <!-- Novo produto: todas as seções num formulário só -->
  <form
    v-if="isNew"
    class="ds-card ds-stack--5"
    @submit.prevent="create.run()"
  >
    <div class="ds-grid ds-grid--form">
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-name"
        >Nome</label>
        <input
          id="np-name"
          v-model="details.name"
          class="ds-input"
          maxlength="255"
          required
          autofocus
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-slug"
        >Slug</label>
        <input
          id="np-slug"
          v-model="details.slug"
          class="ds-input ds-mono"
          maxlength="255"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          :placeholder="slugify(details.name)"
          aria-describedby="np-slug-hint"
          :aria-invalid="Boolean(fieldMessage(create.error.value, 'slug', CONFLICTS))"
        >
        <span
          id="np-slug-hint"
          :class="fieldMessage(create.error.value, 'slug', CONFLICTS) ? 'ds-error' : 'ds-hint'"
          :role="fieldMessage(create.error.value, 'slug', CONFLICTS) ? 'alert' : undefined"
        >
          <AlertCircle
            v-if="fieldMessage(create.error.value, 'slug', CONFLICTS)"
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ fieldMessage(create.error.value, 'slug', CONFLICTS) || 'Vazio: gerado a partir do nome.' }}
        </span>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-sku"
        >SKU</label>
        <input
          id="np-sku"
          v-model="details.sku"
          class="ds-input ds-mono"
          maxlength="100"
          required
          aria-describedby="np-sku-error"
          :aria-invalid="Boolean(fieldMessage(create.error.value, 'sku', CONFLICTS))"
        >
        <span
          v-if="fieldMessage(create.error.value, 'sku', CONFLICTS)"
          id="np-sku-error"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ fieldMessage(create.error.value, 'sku', CONFLICTS) }}
        </span>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-brand"
        >Marca</label>
        <input
          id="np-brand"
          v-model="details.brand"
          class="ds-input"
          maxlength="200"
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-cat"
        >Categoria</label>
        <select
          id="np-cat"
          v-model.number="placement.categoryId"
          class="ds-input"
          required
        >
          <option
            v-for="c in categories"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-price"
        >Preço (R$)</label>
        <input
          id="np-price"
          v-model="pricing.price"
          class="ds-input"
          type="number"
          min="0.01"
          step="0.01"
          required
        >
      </div>
      <div class="ds-field">
        <label
          class="ds-label"
          for="np-cost"
        >Custo (R$)</label>
        <input
          id="np-cost"
          v-model="pricing.costPrice"
          class="ds-input"
          type="number"
          min="0"
          step="0.01"
          required
          aria-describedby="np-cost-error"
          :aria-invalid="Boolean(priceError)"
        >
        <span
          v-if="priceError"
          id="np-cost-error"
          class="ds-error"
          role="alert"
        >
          <AlertCircle
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          {{ priceError }}
        </span>
      </div>
      <div
        v-for="(label, key) in { weight: 'Peso (kg)', height: 'Altura (cm)', width: 'Largura (cm)', length: 'Comprimento (cm)' }"
        :key="key"
        class="ds-field"
      >
        <label
          class="ds-label"
          :for="`np-${key}`"
        >{{ label }}</label>
        <input
          :id="`np-${key}`"
          v-model="dimensions[key]"
          class="ds-input"
          type="number"
          :min="details.isDigital ? 0 : 0.01"
          step="0.01"
          :required="!details.isDigital"
        >
      </div>
    </div>
    <div class="ds-cluster ds-cluster--2">
      <label class="ds-check">
        <input
          v-model="creating.isActive"
          type="checkbox"
        >
        Ativo na vitrine
      </label>
      <label class="ds-check">
        <input
          v-model="details.isDigital"
          type="checkbox"
        >
        Produto digital
      </label>
    </div>
    <p
      v-if="create.error.value && !fieldMessage(create.error.value, 'slug', CONFLICTS) && !fieldMessage(create.error.value, 'sku', CONFLICTS)"
      class="ds-error"
      role="alert"
    >
      <AlertCircle
        :size="16"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      {{ create.error.value.message }}
    </p>
    <div class="ds-cluster ds-cluster--end">
      <button
        type="submit"
        class="ds-btn ds-btn--primary"
        :disabled="Boolean(priceError) || create.isPending.value || !can('products.create')"
        :title="denied('products.create', 'cadastrar produtos')"
        :aria-busy="create.isPending.value"
      >
        <span
          v-if="create.isPending.value"
          class="ds-spinner"
          aria-hidden="true"
        />
        Criar produto
      </button>
    </div>
  </form>

  <LoadState
    v-else
    :is-loading="product.isLoading.value"
    :error="product.error.value"
    :lines="8"
    @retry="product.reload"
  >
    <nav
      class="ds-nav"
      aria-label="Seções do produto"
    >
      <a
        v-for="t in tabs"
        :key="t.id"
        class="ds-nav__item"
        :href="tabHref(t.id)"
        :aria-current="tab === t.id ? 'page' : undefined"
      >{{ t.label }}</a>
    </nav>

    <!-- Detalhes -->
    <form
      v-if="tab === 'detalhes'"
      class="ds-card ds-stack--5"
      @submit.prevent="saveDetails.run()"
    >
      <fieldset
        class="ds-grid ds-grid--form"
        :disabled="!can('products.edit')"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-name"
          >Nome</label>
          <input
            id="pd-name"
            v-model="details.name"
            class="ds-input"
            maxlength="255"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-slug"
          >Slug</label>
          <input
            id="pd-slug"
            v-model="details.slug"
            class="ds-input ds-mono"
            maxlength="255"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            aria-describedby="pd-slug-error"
            :aria-invalid="Boolean(fieldMessage(saveDetails.error.value, 'slug', CONFLICTS))"
          >
          <span
            v-if="fieldMessage(saveDetails.error.value, 'slug', CONFLICTS)"
            id="pd-slug-error"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ fieldMessage(saveDetails.error.value, 'slug', CONFLICTS) }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-sku"
          >SKU</label>
          <input
            id="pd-sku"
            v-model="details.sku"
            class="ds-input ds-mono"
            maxlength="100"
            required
            aria-describedby="pd-sku-error"
            :aria-invalid="Boolean(fieldMessage(saveDetails.error.value, 'sku', CONFLICTS))"
          >
          <span
            v-if="fieldMessage(saveDetails.error.value, 'sku', CONFLICTS)"
            id="pd-sku-error"
            class="ds-error"
            role="alert"
          >
            <AlertCircle
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ fieldMessage(saveDetails.error.value, 'sku', CONFLICTS) }}
          </span>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-bar"
          >Código de barras</label>
          <input
            id="pd-bar"
            v-model="details.barCode"
            class="ds-input ds-mono"
            maxlength="100"
            inputmode="numeric"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-brand"
          >Marca</label>
          <input
            id="pd-brand"
            v-model="details.brand"
            class="ds-input"
            maxlength="200"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pd-img"
          >Imagens (URLs separadas por vírgula)</label>
          <input
            id="pd-img"
            v-model="details.imageUrls"
            class="ds-input"
            maxlength="500"
          >
        </div>
      </fieldset>
      <div class="ds-field">
        <label
          class="ds-label"
          for="pd-desc"
        >Descrição</label>
        <textarea
          id="pd-desc"
          v-model="details.description"
          class="ds-input"
          rows="3"
          maxlength="500"
          :disabled="!can('products.edit')"
        />
      </div>
      <label class="ds-check">
        <input
          v-model="details.isDigital"
          type="checkbox"
          :disabled="!can('products.edit')"
        >
        Produto digital (sem estoque e sem dimensões)
      </label>
      <p
        v-if="saveDetails.error.value && !fieldMessage(saveDetails.error.value, 'slug', CONFLICTS) && !fieldMessage(saveDetails.error.value, 'sku', CONFLICTS)"
        class="ds-error"
        role="alert"
      >
        {{ saveDetails.error.value.code === 'Inventory.StockInUse' ? 'O produto tem saldo em estoque: zere o saldo antes de mudar para digital.' : saveDetails.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <span
          v-if="saved(saveDetails)"
          class="ds-text-sm ds-text-success"
          role="status"
        ><CheckCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        /> Detalhes salvos.</span>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="!can('products.edit') || saveDetails.isPending.value"
          :title="denied('products.edit', 'editar produtos')"
        >
          Salvar detalhes
        </button>
      </div>
    </form>

    <!-- Preço -->
    <form
      v-else-if="tab === 'preco'"
      class="ds-card ds-stack--5"
      @submit.prevent="savePricing.run()"
    >
      <p
        v-if="!can('products.change_price')"
        class="ds-hint"
      >
        Somente leitura: você não tem permissão para alterar preços.
      </p>
      <fieldset
        class="ds-grid ds-grid--2"
        :disabled="!can('products.change_price')"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="pp-price"
          >Preço (R$)</label>
          <input
            id="pp-price"
            v-model="pricing.price"
            class="ds-input"
            type="number"
            min="0.01"
            step="0.01"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pp-cost"
          >Custo (R$)</label>
          <input
            id="pp-cost"
            v-model="pricing.costPrice"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
            aria-describedby="pp-cost-hint"
            :aria-invalid="Boolean(priceError)"
          >
          <span
            id="pp-cost-hint"
            :class="priceError ? 'ds-error' : 'ds-hint'"
            :role="priceError ? 'alert' : undefined"
          >
            <AlertCircle
              v-if="priceError"
              :size="16"
              :stroke-width="1.5"
              aria-hidden="true"
            />
            {{ priceError || 'O preço não pode ficar abaixo do custo.' }}
          </span>
        </div>
      </fieldset>
      <p
        v-if="p.hasVariants"
        class="ds-hint"
      >
        Variantes sem preço próprio herdam {{ brl(p.price) }}.
      </p>
      <p
        v-if="savePricing.error.value"
        class="ds-error"
        role="alert"
      >
        {{ savePricing.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <span
          v-if="saved(savePricing)"
          class="ds-text-sm ds-text-success"
          role="status"
        ><CheckCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        /> Preço salvo.</span>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="!can('products.change_price') || Boolean(priceError) || savePricing.isPending.value"
          :title="denied('products.change_price', 'alterar preços')"
        >
          Salvar preço
        </button>
      </div>
    </form>

    <!-- Dimensões -->
    <form
      v-else-if="tab === 'dimensoes'"
      class="ds-card ds-stack--5"
      @submit.prevent="saveDimensions.run()"
    >
      <fieldset
        class="ds-grid ds-grid--2"
        :disabled="!can('products.edit')"
      >
        <div
          v-for="(label, key) in { weight: 'Peso (kg)', height: 'Altura (cm)', width: 'Largura (cm)', length: 'Comprimento (cm)' }"
          :key="key"
          class="ds-field"
        >
          <label
            class="ds-label"
            :for="`pdim-${key}`"
          >{{ label }}</label>
          <input
            :id="`pdim-${key}`"
            v-model="dimensions[key]"
            class="ds-input"
            type="number"
            :min="p.isDigital ? 0 : 0.01"
            step="0.01"
            :required="!p.isDigital"
          >
        </div>
      </fieldset>
      <p class="ds-hint">
        {{ p.isDigital ? 'Produto digital: as dimensões podem ficar zeradas.' : 'Produto físico: todas as medidas precisam ser maiores que zero (frete).' }}
      </p>
      <p
        v-if="saveDimensions.error.value"
        class="ds-error"
        role="alert"
      >
        {{ saveDimensions.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <span
          v-if="saved(saveDimensions)"
          class="ds-text-sm ds-text-success"
          role="status"
        ><CheckCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        /> Dimensões salvas.</span>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="!can('products.edit') || saveDimensions.isPending.value"
          :title="denied('products.edit', 'editar produtos')"
        >
          Salvar dimensões
        </button>
      </div>
    </form>

    <!-- Categoria -->
    <form
      v-else-if="tab === 'categoria'"
      class="ds-card ds-stack--5"
      @submit.prevent="savePlacement.run()"
    >
      <fieldset
        class="ds-grid ds-grid--2"
        :disabled="!can('products.edit')"
      >
        <div class="ds-field">
          <label
            class="ds-label"
            for="pc-cat"
          >Categoria</label>
          <select
            id="pc-cat"
            v-model.number="placement.categoryId"
            class="ds-input"
            required
          >
            <option
              v-for="c in categories"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="pc-sup"
          >Fornecedor</label>
          <select
            id="pc-sup"
            v-model="placement.supplierId"
            class="ds-input"
          >
            <option :value="null">
              Sem fornecedor
            </option>
            <option
              v-for="s in suppliers"
              :key="s.id"
              :value="s.id"
            >
              {{ s.companyName }}
            </option>
          </select>
        </div>
      </fieldset>
      <p class="ds-hint">
        Só aparecem categorias ativas: o back recusa categoria inativa (ou com categoria-mãe inativa).
      </p>
      <p
        v-if="savePlacement.error.value"
        class="ds-error"
        role="alert"
      >
        {{ savePlacement.error.value.message }}
      </p>
      <div class="ds-cluster ds-cluster--end">
        <span
          v-if="saved(savePlacement)"
          class="ds-text-sm ds-text-success"
          role="status"
        ><CheckCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        /> Categoria salva.</span>
        <button
          type="submit"
          class="ds-btn ds-btn--primary"
          :disabled="!can('products.edit') || savePlacement.isPending.value"
          :title="denied('products.edit', 'editar produtos')"
        >
          Salvar categoria
        </button>
      </div>
    </form>

    <!-- Variantes -->
    <AdminProductVariants
      v-else-if="tab === 'variantes'"
      :product="p"
      @updated="product.reload"
    />

    <!-- Estoque -->
    <AdminProductStock
      v-else
      :product="p"
      @updated="product.reload"
    />
  </LoadState>
</template>
