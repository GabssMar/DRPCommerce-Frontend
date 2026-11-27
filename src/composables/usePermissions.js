import { computed } from 'vue';
import { IS_MOCK } from '../services/config';
import { getAccessToken, REALMS, tokenClaims } from '../services/session';

// Permissões da equipe na loja escolhida, lidas do access token: o back não tem
// rota de "minhas permissões". Claims `membership_kind` e `permission` (texto
// quando é uma só). O dono principal não recebe `permission` e pode tudo; no
// mock, a equipe entra como dono. O back continua sendo a autoridade (403).
const claims = computed(() => tokenClaims(getAccessToken(REALMS.backoffice) ?? '') ?? {});
const isOwner = computed(() => IS_MOCK || claims.value.membership_kind === 'primary_owner');
const granted = computed(() => new Set([].concat(claims.value.permission ?? [])));

const can = (code) => isOwner.value || granted.value.has(code);

// Texto do botão bloqueado: "Você não tem permissão para estornar pedidos."
const denied = (code, action) => (can(code) ? undefined : `Você não tem permissão para ${action}.`);

export function usePermissions() {
  return { can, denied, isOwner };
}
