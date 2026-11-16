# [Admin · Front-end] Domínio próprio da loja: cadastro, verificação TXT e publicação

**Depende de:** 27, 40 · Fonte: Authentication.md, "Domínio próprio"

## Funcionalidade nova

O dono conecta **o domínio da marca** (`loja.minhamarca.com.br`) à vitrine, prova que é dono do domínio pelo DNS e escolhe qual domínio é o principal.

## Estado atual

Não existe. A loja só responde no subdomínio da plataforma (`loja-a.stores.localhost` em dev). Como a vitrine resolve a loja **pelo Host**, o domínio é o que define qual loja o cliente vê.

## Como implementar

1. `POST enterprise-domains/add` `{ host }`: só o host, sem `https://` nem caminho. Valide no cliente.
2. A resposta traz `recordName` e `recordValue`: mostre um passo a passo "crie um registro **TXT**", com botões Copiar.
3. `POST enterprise-domains/{id}/verify`: botão "Verificar agora", com estados pendente, verificado e falhou (com a dica "o DNS pode levar alguns minutos").
4. `PUT enterprise-domains/{id}/publication` `{ isPrimary, isActive }`: só habilita após verificar. Marcar outro como principal rebaixa o anterior; releia a lista.
5. `DELETE enterprise-domains/{id}`: indisponível no principal.
6. Avise: "Verificar prova que o domínio é seu. Apontar o DNS para a plataforma e o certificado HTTPS são configurados pela equipe."

## Critérios de aceite

- [ ] Do cadastro à publicação sem sair da tela, no mock
- [ ] O domínio principal não pode ser excluído pela tela

## Para o Claude Code

> Nova aba "Domínios" em Configurações. Rotas restritas ao dono principal: use `usePermissions` da task 40.
