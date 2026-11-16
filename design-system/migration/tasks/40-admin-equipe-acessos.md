# [Admin · Front-end] Equipe e acessos: perfis, permissões, convites, desativação e transferência de propriedade

**Depende de:** 27, 28 · Fonte: Authentication.md, "Loja e gestão de acesso", "Convites e propriedade" e "Matriz de operações comerciais"

## Funcionalidade alterada

O dono da loja decide **quem acessa o painel e o que cada pessoa pode fazer**, e o painel passa a esconder e bloquear o que o usuário não tem permissão de usar.

## Estado atual

`AdminTeam.vue` lista convites, convida e revoga, e lê `access-roles/get-all`. Não há gestão de perfis, membros, desativação nem transferência. O painel mostra todos os botões para todo mundo; um 403 só aparece como erro genérico.

## Como implementar

| Área | Rotas |
|---|---|
| Membros | `GET enterprise-memberships/get-all` · `PUT enterprise-memberships/{id}` `{ kindId, isActive }` · `PUT …/{id}/access-roles` `{ accessRoleIds }` |
| Perfis | `GET permissions/get-all` · `GET/POST access-roles…` · `PUT/DELETE access-roles/{id}` |
| Desativar funcionário | `PUT employees/{id}/deactivate` → 204 |
| Convites | `POST/GET/DELETE invitations` (já existem) |
| Transferir propriedade | `POST ownership-transfers` `{ recipientMembershipId, currentPassword }` · `DELETE ownership-transfers/{id}` |
| Aceitar (destinatário) | `POST identity/invitations/accept` · `POST identity/ownership-transfers/accept` |

1. **Permissões na UI:** um composable `usePermissions()` com a lista do usuário na loja selecionada e `can('orders.refund')`. Botões sem permissão ficam desabilitados com "Você não tem permissão para…"; itens do rail sem leitura somem. O back continua sendo a autoridade: trate o 403 com a mesma mensagem.
2. **Perfis:** editor com o catálogo de permissões agrupado por módulo (produtos, categorias, cupons, estoque, pedidos, clientes, funcionários, drops, configurações). Só é possível excluir perfil sem vínculos; para os outros, ofereça "desativar".
3. **Membros:** tabela com tipo (dono, sócio, funcionário), perfis e situação. O dono principal não pode ser rebaixado nem removido, então esconda essas ações nele.
4. **Convite:** o token só é devolvido ao emissor, uma vez. Mostre-o com "Copiar" e o aviso "entregue por canal privado; ele não será exibido de novo". Não há e-mail automático.
5. **Tela de aceite** (`#/admin/convite`): o destinatário logado cola o token e aceita.
6. **Transferência de propriedade:** fluxo com senha atual e prazo de 30 minutos, e aceite pelo destinatário.
7. Ações de gestão de acesso são **só do dono principal**: o sócio-proprietário vê tudo em leitura.

## Critérios de aceite

- [ ] Funcionário sem `orders.refund` não vê o cancelamento de pedido pago habilitado
- [ ] Convite emitido, token copiado e aceito em outra conta
- [ ] Desativar funcionário derruba o acesso dele na próxima requisição

## Para o Claude Code

> Crie `src/composables/usePermissions.js` e aplique nos botões das tasks 33–39. Não esconda erros de 403: mostre a mensagem.
