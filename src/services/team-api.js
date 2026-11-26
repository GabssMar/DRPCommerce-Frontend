import { STORE_BASE } from './config';
import { request } from './http';
import { REALMS } from './session';

// Equipe e acessos (task 40). Gestão de acesso é só do dono principal; o aceite
// de convite e de transferência vale para qualquer conta logada (sem loja).
//   permissions/get-all · access-roles · access-role-permissions
//   enterprise-memberships · membership-access-roles · employees/{id}/deactivate
//   invitations · ownership-transfers · identity/*/accept

const realm = REALMS.backoffice;
const store = (path) => `${STORE_BASE}/${path}`;
const opts = (body) => ({ realm, body });

// ------------------------------------------------------------- PERFIS ---

// [{ id, code, name, description, module, isActive }]
export const listPermissions = () => request('GET', store('permissions/get-all'), opts());

// [{ id, name, description, isActive }] · vínculos [{ accessRoleId, permissionId }]
export const listAccessRoles = () => request('GET', store('access-roles/get-all'), opts());
export const listRolePermissions = () => request('GET', store('access-role-permissions/get-all'), opts());

// O PUT substitui todas as permissões do perfil.
const rolePayload = ({ name, description, isActive, permissionIds }) => ({
  name: name.trim(), description: description?.trim() ?? '', isActive, permissionIds,
});
export const createAccessRole = (role) => request('POST', store('access-roles/add'), opts(rolePayload(role)));
export const updateAccessRole = (id, role) => request('PUT', store(`access-roles/${id}`), opts(rolePayload(role)));
// Perfil com membros ou convites pendentes: 409 Access.RoleInUse (desative em vez de excluir).
export const deleteAccessRole = (id) => request('DELETE', store(`access-roles/${id}`), opts());

// ------------------------------------------------------------ MEMBROS ---

// [{ id, userId, kindId, isActive, joinedAt }] · perfis [{ enterpriseMembershipId, accessRoleId }]
export const listMemberships = () => request('GET', store('enterprise-memberships/get-all'), opts());
export const listMembershipRoles = () => request('GET', store('membership-access-roles/get-all'), opts());

// kindId 2 (sócio) ou 3 (funcionário). O dono principal só muda por transferência.
export const updateMembership = (id, { kindId, isActive }) =>
  request('PUT', store(`enterprise-memberships/${id}`), opts({ kindId, isActive }));
export const setMembershipRoles = (id, accessRoleIds) =>
  request('PUT', store(`enterprise-memberships/${id}/access-roles`), opts({ accessRoleIds }));

// Pelo id do funcionário: desativa o funcionário e o vínculo (o acesso cai na próxima requisição).
export const deactivateEmployee = (employeeId) => request('PUT', store(`employees/${employeeId}/deactivate`), opts());

// ----------------------------------------------------------- CONVITES ---

// [{ id, email, kindId, expiresAt, acceptedAt, revokedAt }]
export const listInvitations = () => request('GET', store('invitations'), opts());
// { id, token, expiresAt }: o token só vem nesta resposta.
export const inviteMember = ({ email, kindId, accessRoleIds }) =>
  request('POST', store('invitations'), opts({ email: email.trim(), kindId, accessRoleIds }));
export const revokeInvitation = (id) => request('DELETE', store(`invitations/${id}`), opts());
export const acceptInvitation = (token) => request('POST', store('identity/invitations/accept'), opts({ token: token.trim() }));

// ------------------------------------------------------ PROPRIEDADE ---

// { id, token, expiresAt } (30 min). O back não lista transferências pendentes.
export const startOwnershipTransfer = ({ recipientMembershipId, currentPassword }) =>
  request('POST', store('ownership-transfers'), opts({ recipientMembershipId, currentPassword }));
export const cancelOwnershipTransfer = (id) => request('DELETE', store(`ownership-transfers/${id}`), opts());
export const acceptOwnershipTransfer = ({ token, currentPassword }) =>
  request('POST', store('identity/ownership-transfers/accept'), opts({ token: token.trim(), currentPassword }));
