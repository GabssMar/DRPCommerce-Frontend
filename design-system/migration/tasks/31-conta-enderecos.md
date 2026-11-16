# [Conta · Front-end] Endereços de entrega do cliente

**Depende de:** 27, 28 · Fonte: Endpoints.md, "Endereços do próprio cliente"

## Funcionalidade nova

Em **Minha conta**, o cliente guarda vários endereços de entrega, escolhe o padrão e os usa no checkout sem redigitar.

## Estado atual

A conta tem perfil, pedidos e notificações. O endereço vem só do cadastro (`addressLine`, `city`, `stateId`, `zipCode`) e o checkout pede tudo de novo.

## Como implementar

| Ação | Rota |
|---|---|
| Listar (padrão primeiro) | `GET storefront/me/addresses` |
| Criar | `POST storefront/me/addresses` |
| Editar | `PUT storefront/me/addresses/{id}` |
| Tornar padrão | `PUT storefront/me/addresses/{id}/default` |
| Excluir | `DELETE storefront/me/addresses/{id}` |

Corpo: `label`, `recipientName`, `addressLine`, `city`, `stateId`, `zipCode`, `country` (omitido = Brasil), `isDefault`.

1. Rota `#/conta/enderecos`, entrada no `AccountNav`.
2. Lista em cards (`.ds-card`): rótulo, destinatário, endereço e badge "Padrão". Ações: editar, tornar padrão e excluir (com `ModalDialog` de confirmação).
3. O formulário usa UF de `State` (lista estática), máscara de CEP e validação no cliente, sem substituir a do servidor.
4. Comportamentos do back que a tela precisa refletir: o primeiro endereço vira padrão; ao excluir o padrão, o mais recente vira padrão (releia a lista); editar não muda pedidos já feitos (diga isso no formulário).
5. Exponha `listAddresses()` para o checkout (task 32).

## Critérios de aceite

- [ ] CRUD completo e troca de padrão funcionando no mock e no http
- [ ] Excluir o padrão mostra o novo padrão sem F5
- [ ] Funciona em 360 px, com alvos de 44 px

## Para o Claude Code

> Crie `src/components/account/AccountAddresses.vue` e as funções em `client-api.js`. Não invente busca de CEP: é integração pendente no back.
