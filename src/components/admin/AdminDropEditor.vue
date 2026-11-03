<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { AlertCircle, ArrowLeft, ImageOff, Plus, Trash2 } from '@lucide/vue';
import { useAsync, useAction } from '../../composables/useAsync';
import { href, navigate } from '../../router';
import { admin, listEventCoupons, listEventVariants, listMyEnterprises, setDropStatus } from '../../services/admin-api';
import { COUPON_TYPE, DROP_EVENT_STATUS, options } from '../../services/status';
import { brl, formatDate, formatNumber, fromLocalInput, toLocalInput } from '../../services/format';
import DropTabs from './DropTabs.vue';
import LoadState from '../ui/LoadState.vue';
import ModalDialog from '../ui/ModalDialog.vue';
import StatusBadge from '../ui/StatusBadge.vue';
import StepsBar from '../ui/StepsBar.vue';

// E2 · Editor de drop. Rotas: POST drop-events/add · PUT drop-events/update (fase =
// dropEventStatusId, objeto inteiro) · drop-products add-range/update-range/delete-range ·
// drop-coupons add/update/delete · GET products/get-all (produto base).
const props = defineProps({ params: { type: Object, default: () => ({}) } });

const eventId = computed(() => Number(props.params.id) || null);
const isNew = computed(() => !eventId.value);

const data = useAsync(async () => {
  const [products, enterprises] = await Promise.all([admin.products.getAll(), listMyEnterprises().catch(() => [])]);
  const enterpriseId = enterprises[0]?.enterpriseId ?? 1;
  if (isNew.value) return { event: null, variants: [], coupons: [], products, enterpriseId };
  const [event, variants, coupons] = await Promise.all([
    admin.dropEvents.getById(eventId.value), listEventVariants(eventId.value), listEventCoupons(eventId.value),
  ]);
  return { event, variants, coupons, products, enterpriseId };
});

const event = computed(() => data.data.value?.event ?? null);
const products = computed(() => (data.data.value?.products ?? []).filter((p) => !p.isDeleted));

// ------------------------------------------------------------- formulário ---
const HOUR = 3600e3;
const blank = () => {
  const start = Math.ceil((Date.now() + 7 * 24 * HOUR) / HOUR) * HOUR;
  return {
    name: '', slug: '', productId: '', price: '', description: '', coverImageUrl: '', bannerImageUrl: '',
    requiresRegistration: true, isPublic: true,
    registrationStartsAt: toLocalInput(Date.now() + HOUR), registrationEndsAt: toLocalInput(start - 24 * HOUR),
    queueOpensAt: toLocalInput(start - 0.25 * HOUR), dropStartsAt: toLocalInput(start), dropEndsAt: toLocalInput(start + 2 * HOUR),
  };
};
const form = reactive(blank());
const variants = ref([]);
const removedVariantIds = ref([]);
const slugTouched = ref(false);

watch(() => data.data.value, (value) => {
  if (!value) return;
  const e = value.event;
  Object.assign(form, e ? {
    name: e.name, slug: e.slug, productId: e.productId, price: e.price, description: e.description,
    coverImageUrl: e.coverImageUrl, bannerImageUrl: e.bannerImageUrl,
    requiresRegistration: e.requiresRegistration, isPublic: e.isPublic,
    registrationStartsAt: toLocalInput(e.registrationStartsAt), registrationEndsAt: toLocalInput(e.registrationEndsAt),
    queueOpensAt: toLocalInput(e.queueOpensAt), dropStartsAt: toLocalInput(e.dropStartsAt), dropEndsAt: toLocalInput(e.dropEndsAt),
  } : blank());
  slugTouched.value = Boolean(e);
  variants.value = value.variants.map((v) => ({ ...v }));
  removedVariantIds.value = [];
}, { immediate: true });

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
watch(() => form.name, (name) => {
  if (!slugTouched.value) form.slug = slugify(name);
});

const baseProduct = computed(() => products.value.find((p) => p.id === Number(form.productId)) ?? null);
watch(baseProduct, (p) => {
  if (p && !form.coverImageUrl) form.coverImageUrl = p.imageUrls?.split(',')[0] ?? '';
});

// Ordem da agenda: inscrição → fila → início → fim.
const scheduleError = computed(() => {
  const t = (field) => Date.parse(form[field]);
  if (form.requiresRegistration && !(t('registrationStartsAt') < t('registrationEndsAt'))) return 'As inscrições precisam encerrar depois de abrir.';
  if (form.requiresRegistration && !(t('registrationEndsAt') <= t('queueOpensAt'))) return 'A fila precisa abrir depois do fim das inscrições.';
  if (!(t('queueOpensAt') <= t('dropStartsAt'))) return 'A fila precisa abrir antes (ou no início) do drop.';
  if (!(t('dropStartsAt') < t('dropEndsAt'))) return 'O drop precisa terminar depois de começar.';
  return '';
});

const allocated = computed(() => variants.value.reduce((s, v) => s + (Number(v.unitsAllocated) || 0), 0));

const addVariant = () => {
  variants.value.push({ id: null, sku: `${form.slug.slice(0, 8).toUpperCase() || 'DROP'}-${variants.value.length + 1}`, unitsAllocated: 0, unitsSold: 0, maxPerCustomer: 1 });
};
const removeVariant = (index) => {
  const [removed] = variants.value.splice(index, 1);
  if (removed.id) removedVariantIds.value.push(removed.id);
};

const eventPayload = () => {
  const base = event.value ?? {
    enterpriseId: data.data.value.enterpriseId, dropEventStatusId: 1, unitsReserved: 0, unitsSold: 0,
    effectiveAppearanceRevisionId: null,
  };
  return {
    ...base,
    name: form.name.trim(),
    slug: form.slug.trim(),
    productId: Number(form.productId),
    price: Number(form.price),
    description: form.description.trim(),
    coverImageUrl: form.coverImageUrl.trim(),
    bannerImageUrl: form.bannerImageUrl.trim(),
    requiresRegistration: form.requiresRegistration,
    isPublic: form.isPublic,
    registrationStartsAt: fromLocalInput(form.registrationStartsAt),
    registrationEndsAt: fromLocalInput(form.registrationEndsAt),
    queueOpensAt: fromLocalInput(form.queueOpensAt),
    dropStartsAt: fromLocalInput(form.dropStartsAt),
    dropEndsAt: fromLocalInput(form.dropEndsAt),
    totalUnitsAvailable: allocated.value,
  };
};

const save = useAction(async () => {
  if (scheduleError.value) throw new Error(scheduleError.value);
  const payload = eventPayload();
  const saved = isNew.value ? await admin.dropEvents.add(payload) : await admin.dropEvents.update(payload);
  const toVariant = (v) => ({
    ...v,
    dropEventId: saved.id,
    productId: saved.productId,
    sku: v.sku.trim(),
    unitsAllocated: Number(v.unitsAllocated) || 0,
    maxPerCustomer: Number(v.maxPerCustomer) || 1,
    price: saved.price,
    isActive: v.isActive ?? true,
  });
  const fresh = variants.value.filter((v) => !v.id);
  const existing = variants.value.filter((v) => v.id);
  if (fresh.length) await admin.dropProducts.addRange(fresh.map(toVariant));
  if (existing.length) await admin.dropProducts.updateRange(existing.map(toVariant));
  if (removedVariantIds.value.length) await admin.dropProducts.removeRange(removedVariantIds.value);
  if (isNew.value) navigate(`/admin/drops/${saved.id}`);
  else await data.reload();
});

// ------------------------------------------------------------------ fases ---
const PHASES = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ label: `${id} · ${DROP_EVENT_STATUS[id].label}` }));
const NEXT = {
  1: { to: 2, label: 'Abrir inscrições' },
  2: { to: 3, label: 'Encerrar inscrições' },
  3: { to: 4, label: 'Abrir a fila' },
  4: { to: 5, label: 'Iniciar o drop' },
  5: { to: 7, label: 'Encerrar o drop' },
  6: { to: 7, label: 'Encerrar o drop' },
};
const nextPhase = computed(() => {
  const step = NEXT[event.value?.dropEventStatusId];
  if (step?.to === 3 && !event.value.requiresRegistration) return { to: 4, label: 'Abrir a fila' };
  if (step?.to === 2 && !event.value.requiresRegistration) return { to: 3, label: 'Publicar' };
  return step ?? null;
});
const advance = useAction(async () => {
  await setDropStatus(event.value, nextPhase.value.to);
  await data.reload();
});

const showCancelModal = ref(false);
const cancelDrop = useAction(async () => {
  await setDropStatus(event.value, 8);
  showCancelModal.value = false;
  await data.reload();
});

// ---------------------------------------------------------------- cupons ---
const coupons = computed(() => data.data.value?.coupons ?? []);
const couponForm = ref(null);
const openCoupon = (coupon = null) => {
  couponForm.value = coupon ? { ...coupon, startsAt: toLocalInput(coupon.startsAt), expiresAt: toLocalInput(coupon.expiresAt) } : {
    id: null, code: '', dropCouponTypeId: 1, discountValue: 10, maxDiscountCap: 0, minOrderValue: 0,
    maxUses: allocated.value || 100, usedCount: 0, isActive: true, isSingleUse: true, isExclusiveToRegistered: false,
    startsAt: form.dropStartsAt, expiresAt: form.dropEndsAt,
  };
};
const saveCoupon = useAction(async () => {
  const c = couponForm.value;
  const payload = {
    ...c,
    dropEventId: eventId.value,
    code: c.code.trim().toUpperCase(),
    discountValue: Number(c.discountValue),
    maxDiscountCap: Number(c.maxDiscountCap) || 0,
    minOrderValue: Number(c.minOrderValue) || 0,
    maxUses: Number(c.maxUses) || 0,
    startsAt: fromLocalInput(c.startsAt),
    expiresAt: fromLocalInput(c.expiresAt),
  };
  if (c.id) await admin.dropCoupons.update(payload);
  else await admin.dropCoupons.add(payload);
  couponForm.value = null;
  await data.reload();
});
const deleteCoupon = useAction(async () => {
  await admin.dropCoupons.remove(couponForm.value.id);
  couponForm.value = null;
  await data.reload();
});
const discountLabel = (c) => (c.dropCouponTypeId === 1
  ? `${formatNumber(c.discountValue)}%${c.maxDiscountCap ? ` · teto ${brl(c.maxDiscountCap)}` : ''}`
  : brl(c.discountValue));
</script>

<template>
  <LoadState
    :is-loading="data.isLoading.value"
    :error="data.error.value"
    :lines="10"
    @retry="data.reload"
  >
    <form
      v-if="data.data.value"
      class="ds-stack--6"
      novalidate
      @submit.prevent="save.run()"
    >
      <div class="ds-stack--3">
        <a
          class="ds-back-link"
          :href="href('/admin/drops')"
        >
          <ArrowLeft
            :size="16"
            :stroke-width="1.5"
            aria-hidden="true"
          />
          Drops
        </a>
        <div class="ds-cluster ds-cluster--between">
          <div class="ds-cluster ds-cluster--2">
            <h1 class="ds-title ds-title--lg">
              {{ isNew ? 'Novo drop' : event.name }}
            </h1>
            <StatusBadge
              v-if="event"
              :id="event.dropEventStatusId"
              :table="DROP_EVENT_STATUS"
            />
          </div>
          <div class="ds-cluster ds-cluster--2">
            <a
              v-if="event"
              class="ds-btn ds-btn--ghost"
              :href="href(event.requiresRegistration ? `/drops/${event.id}/inscricao` : `/drops/${event.id}`)"
              target="_blank"
              rel="noopener"
            >Visualizar no portal</a>
            <button
              v-if="nextPhase"
              type="button"
              class="ds-btn ds-btn--secondary"
              :disabled="advance.isPending.value"
              @click="advance.run()"
            >
              {{ nextPhase.label }}
            </button>
            <button
              type="submit"
              class="ds-btn ds-btn--primary"
              :disabled="save.isPending.value"
              :aria-busy="save.isPending.value"
            >
              {{ isNew ? 'Criar drop' : 'Salvar alterações' }}
            </button>
          </div>
        </div>
        <DropTabs
          v-if="event"
          :event-id="event.id"
          current="editor"
        />
      </div>

      <p
        v-if="save.error.value || advance.error.value"
        class="ds-error"
        role="alert"
      >
        <AlertCircle
          :size="16"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        {{ (save.error.value || advance.error.value).message }}
      </p>
      <p
        v-else-if="save.done.value"
        class="ds-hint ds-text-success"
        role="status"
      >
        Alterações salvas.
      </p>

      <StepsBar
        v-if="event && event.dropEventStatusId !== 8"
        label="Fases do drop"
        :steps="PHASES"
        :current="event.dropEventStatusId - 1"
        :complete="event.dropEventStatusId === 7"
      />
      <p
        v-else-if="event"
        class="ds-badge ds-badge--done ds-self-start"
      >
        Drop cancelado
      </p>

      <section class="ds-grid ds-grid--sidebar">
        <div class="ds-stack--6">
          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Dados do drop
              </h2>
            </header>
            <div class="ds-grid ds-grid--2">
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-name"
                >Nome</label>
                <input
                  id="d-name"
                  v-model="form.name"
                  class="ds-input"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-slug"
                >Slug</label>
                <input
                  id="d-slug"
                  v-model="form.slug"
                  class="ds-input ds-mono"
                  required
                  aria-describedby="d-slug-hint"
                  @input="slugTouched = true"
                >
                <span
                  id="d-slug-hint"
                  class="ds-hint"
                >Endereço do drop: /drops/{{ form.slug || 'slug' }}</span>
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-product"
                >Produto base (Store)</label>
                <select
                  id="d-product"
                  v-model.number="form.productId"
                  class="ds-input"
                  required
                >
                  <option
                    value=""
                    disabled
                  >
                    Selecione
                  </option>
                  <option
                    v-for="p in products"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }} · SKU {{ p.sku }}
                  </option>
                </select>
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-price"
                >Preço do drop (R$)</label>
                <input
                  id="d-price"
                  v-model="form.price"
                  class="ds-input ds-numeric"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  aria-describedby="d-price-hint"
                >
                <span
                  id="d-price-hint"
                  class="ds-hint"
                >{{ baseProduct ? `Preço de vitrine: ${brl(baseProduct.price)}` : 'Escolha o produto base.' }}</span>
              </div>
            </div>
            <div class="ds-field">
              <label
                class="ds-label"
                for="d-desc"
              >Descrição</label>
              <textarea
                id="d-desc"
                v-model="form.description"
                class="ds-input"
                rows="3"
              />
            </div>
            <div class="ds-grid ds-grid--2">
              <div class="ds-stack--2">
                <label
                  class="ds-label"
                  for="d-cover"
                >Capa (card do portal)</label>
                <img
                  v-if="form.coverImageUrl"
                  class="ds-card__media"
                  :src="form.coverImageUrl"
                  alt="Capa atual"
                >
                <input
                  id="d-cover"
                  v-model="form.coverImageUrl"
                  class="ds-input"
                  placeholder="URL da imagem"
                >
              </div>
              <div class="ds-stack--2">
                <label
                  class="ds-label"
                  for="d-banner"
                >Banner (página do drop)</label>
                <img
                  v-if="form.bannerImageUrl"
                  class="ds-card__media"
                  :src="form.bannerImageUrl"
                  alt="Banner atual"
                >
                <div
                  v-else
                  class="ds-card__media ds-card__media--placeholder ds-stack--2"
                >
                  <ImageOff
                    :size="20"
                    :stroke-width="1.5"
                    aria-hidden="true"
                  />
                  <span class="ds-text-xs">Sem banner: usa a capa</span>
                </div>
                <input
                  id="d-banner"
                  v-model="form.bannerImageUrl"
                  class="ds-input"
                  placeholder="URL da imagem"
                >
              </div>
            </div>
          </article>

          <article class="ds-card ds-stack--5">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Agenda
              </h2>
              <span class="ds-text-xs ds-text-secondary">Horário deste computador · gravado em UTC</span>
            </header>
            <div class="ds-cluster ds-cluster--2">
              <label class="ds-check ds-check--pill">
                <input
                  v-model="form.requiresRegistration"
                  type="checkbox"
                >
                Exige inscrição prévia
              </label>
              <label class="ds-check ds-check--pill">
                <input
                  v-model="form.isPublic"
                  type="checkbox"
                >
                Visível no portal
              </label>
            </div>
            <div class="ds-grid ds-grid--2">
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-rs"
                >Inscrições abrem</label>
                <input
                  id="d-rs"
                  v-model="form.registrationStartsAt"
                  class="ds-input"
                  type="datetime-local"
                  :disabled="!form.requiresRegistration"
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-re"
                >Inscrições encerram</label>
                <input
                  id="d-re"
                  v-model="form.registrationEndsAt"
                  class="ds-input"
                  type="datetime-local"
                  :disabled="!form.requiresRegistration"
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-q"
                >Fila abre</label>
                <input
                  id="d-q"
                  v-model="form.queueOpensAt"
                  class="ds-input"
                  type="datetime-local"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-s"
                >Drop começa</label>
                <input
                  id="d-s"
                  v-model="form.dropStartsAt"
                  class="ds-input"
                  type="datetime-local"
                  required
                >
              </div>
              <div class="ds-field">
                <label
                  class="ds-label"
                  for="d-e"
                >Drop termina</label>
                <input
                  id="d-e"
                  v-model="form.dropEndsAt"
                  class="ds-input"
                  type="datetime-local"
                  required
                >
              </div>
            </div>
            <p
              v-if="scheduleError"
              class="ds-error"
              role="status"
            >
              <AlertCircle
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
              {{ scheduleError }}
            </p>
            <span class="ds-hint">A janela de checkout (5 min após ser chamado) é fixa: o drop ainda não tem esse campo no back-end.</span>
          </article>
        </div>

        <aside class="ds-stack--6">
          <article class="ds-card ds-card--flush">
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Estoque alocado
              </h2>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="addVariant"
              >
                <Plus
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Variante
              </button>
            </header>
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Unidades alocadas por variante
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Variante (SKU)
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Alocado
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Máx./cliente
                    </th>
                    <th scope="col">
                      <span class="ds-sr-only">Remover</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(v, index) in variants"
                    :key="v.id ?? `new-${index}`"
                  >
                    <td>
                      <input
                        v-model="v.sku"
                        class="ds-input ds-mono"
                        :aria-label="`SKU da variante ${index + 1}`"
                      >
                    </td>
                    <td class="ds-table__td--numeric">
                      <input
                        v-model.number="v.unitsAllocated"
                        class="ds-input ds-numeric ds-text-right"
                        type="number"
                        :min="v.unitsSold"
                        :aria-label="`Unidades alocadas de ${v.sku}`"
                      >
                    </td>
                    <td class="ds-table__td--numeric">
                      <input
                        v-model.number="v.maxPerCustomer"
                        class="ds-input ds-numeric ds-text-right"
                        type="number"
                        min="1"
                        :aria-label="`Máximo por cliente de ${v.sku}`"
                      >
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ds-icon-btn ds-icon-btn--ghost"
                        :aria-label="`Remover ${v.sku}`"
                        :disabled="v.unitsSold > 0"
                        :title="v.unitsSold > 0 ? 'Variante com vendas não pode ser removida' : undefined"
                        @click="removeVariant(index)"
                      >
                        <Trash2
                          :size="16"
                          :stroke-width="1.5"
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      class="ds-text-medium"
                    >
                      Total
                    </th>
                    <td class="ds-table__td--numeric ds-text-medium">
                      {{ formatNumber(allocated) }}
                    </td>
                    <td colspan="2" />
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="ds-hint ds-card__note">
              <template v-if="baseProduct?.stockQuantity != null">
                Estoque da vitrine disponível para alocar: {{ formatNumber(baseProduct.stockQuantity) }} un.
              </template>
              <template v-else>
                Variantes salvam junto com o drop.
              </template>
            </p>
          </article>

          <article
            v-if="event"
            class="ds-card ds-card--flush"
          >
            <header class="ds-card__header">
              <h2 class="ds-card__title">
                Cupons do drop
              </h2>
              <button
                type="button"
                class="ds-btn ds-btn--ghost ds-btn--sm"
                @click="openCoupon()"
              >
                <Plus
                  class="ds-btn__icon"
                  :size="16"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
                Cupom
              </button>
            </header>
            <div class="ds-table-scroll">
              <table class="ds-table">
                <caption class="ds-sr-only">
                  Cupons deste drop
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      Código
                    </th>
                    <th scope="col">
                      Desconto
                    </th>
                    <th
                      scope="col"
                      class="ds-table__th--numeric"
                    >
                      Uso
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in coupons"
                    :key="c.id"
                  >
                    <td>
                      <button
                        type="button"
                        class="ds-table__open ds-stack--1"
                        @click="openCoupon(c)"
                      >
                        <span class="ds-mono">{{ c.code }}</span>
                        <span
                          v-if="c.isExclusiveToRegistered"
                          class="ds-badge ds-badge--inverse ds-self-start"
                        >Só inscritos</span>
                      </button>
                    </td>
                    <td class="ds-text-sm">
                      {{ discountLabel(c) }}
                    </td>
                    <td class="ds-table__td--numeric">
                      {{ c.usedCount }} / {{ c.maxUses }}
                    </td>
                  </tr>
                  <tr v-if="!coupons.length">
                    <td
                      colspan="3"
                      class="ds-text-secondary ds-text-sm"
                    >
                      Nenhum cupom ainda.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="ds-hint ds-card__note">
              Validade padrão: a janela do drop.
            </p>
          </article>

          <article class="ds-card ds-card--sunken ds-stack--3">
            <span class="ds-label-caps">Prévia no portal</span>
            <div class="ds-card ds-card--tight ds-stack--2">
              <img
                v-if="form.coverImageUrl"
                class="ds-card__media"
                :src="form.coverImageUrl"
                alt=""
              >
              <span class="ds-cluster ds-cluster--between">
                <strong class="ds-text-medium">{{ form.name || 'Nome do drop' }}</strong>
                <span class="ds-numeric">{{ form.price ? brl(form.price) : '—' }}</span>
              </span>
              <span
                v-if="form.requiresRegistration"
                class="ds-badge ds-badge--scheduled ds-self-start"
              >Inscrições até {{ formatDate(fromLocalInput(form.registrationEndsAt)) }}</span>
              <span
                v-else
                class="ds-badge ds-badge--scheduled ds-self-start"
              >Começa {{ formatDate(fromLocalInput(form.dropStartsAt)) }}</span>
            </div>
            <span
              v-if="!form.isPublic"
              class="ds-hint"
            >Oculto: não aparece no portal.</span>
          </article>

          <button
            v-if="event && event.dropEventStatusId < 7"
            type="button"
            class="ds-btn ds-btn--ghost-danger ds-self-start"
            @click="showCancelModal = true"
          >
            Cancelar drop
          </button>
        </aside>
      </section>
    </form>
  </LoadState>

  <ModalDialog
    v-if="couponForm"
    :title="couponForm.id ? 'Editar cupom' : 'Novo cupom'"
    @close="couponForm = null"
  >
    <form
      id="drop-coupon-form"
      class="ds-stack--4"
      @submit.prevent="saveCoupon.run()"
    >
      <div class="ds-field">
        <label
          class="ds-label"
          for="dc-code"
        >Código</label>
        <input
          id="dc-code"
          v-model="couponForm.code"
          class="ds-input ds-mono ds-uppercase"
          required
          autofocus
        >
      </div>
      <fieldset class="ds-stack--2">
        <legend class="ds-label">
          Tipo de desconto
        </legend>
        <div class="ds-cluster ds-cluster--2">
          <label
            v-for="t in options(COUPON_TYPE)"
            :key="t.id"
            class="ds-check ds-check--pill"
          >
            <input
              v-model="couponForm.dropCouponTypeId"
              type="radio"
              name="dc-type"
              :value="t.id"
            >
            {{ t.label }}
          </label>
        </div>
      </fieldset>
      <div class="ds-grid ds-grid--2">
        <div class="ds-field">
          <label
            class="ds-label"
            for="dc-value"
          >{{ couponForm.dropCouponTypeId === 1 ? 'Desconto (%)' : 'Desconto (R$)' }}</label>
          <input
            id="dc-value"
            v-model="couponForm.discountValue"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="dc-cap"
          >Teto do desconto (R$)</label>
          <input
            id="dc-cap"
            v-model="couponForm.maxDiscountCap"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="dc-max"
          >Limite de usos</label>
          <input
            id="dc-max"
            v-model="couponForm.maxUses"
            class="ds-input"
            type="number"
            min="1"
            required
          >
        </div>
        <div class="ds-field">
          <label
            class="ds-label"
            for="dc-min"
          >Pedido mínimo (R$)</label>
          <input
            id="dc-min"
            v-model="couponForm.minOrderValue"
            class="ds-input"
            type="number"
            min="0"
            step="0.01"
          >
        </div>
      </div>
      <label class="ds-check">
        <input
          v-model="couponForm.isExclusiveToRegistered"
          type="checkbox"
        >
        Só para inscritos
      </label>
      <label class="ds-check">
        <input
          v-model="couponForm.isSingleUse"
          type="checkbox"
        >
        Um uso por cliente
      </label>
      <p
        v-if="saveCoupon.error.value || deleteCoupon.error.value"
        class="ds-error"
        role="alert"
      >
        {{ (saveCoupon.error.value || deleteCoupon.error.value).message }}
      </p>
    </form>
    <template #footer>
      <button
        v-if="couponForm.id"
        type="button"
        class="ds-btn ds-btn--ghost-danger"
        :disabled="deleteCoupon.isPending.value"
        @click="deleteCoupon.run()"
      >
        Excluir
      </button>
      <button
        type="submit"
        form="drop-coupon-form"
        class="ds-btn ds-btn--primary"
        :disabled="saveCoupon.isPending.value"
      >
        Salvar cupom
      </button>
    </template>
  </ModalDialog>

  <ModalDialog
    v-if="showCancelModal"
    title="Cancelar este drop?"
    @close="showCancelModal = false"
  >
    <p class="ds-text-sm">
      O drop sai do portal e ninguém mais entra na fila. Pedidos já feitos continuam valendo e precisam ser reembolsados em Pedidos, se for o caso.
    </p>
    <p
      v-if="cancelDrop.error.value"
      class="ds-error"
      role="alert"
    >
      {{ cancelDrop.error.value.message }}
    </p>
    <template #footer>
      <button
        type="button"
        class="ds-btn ds-btn--ghost"
        @click="showCancelModal = false"
      >
        Manter
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--danger"
        :disabled="cancelDrop.isPending.value"
        @click="cancelDrop.run()"
      >
        Cancelar drop
      </button>
    </template>
  </ModalDialog>
</template>
