# [Auth · Front-end] Sessão completa: seleção de loja, renovação entre abas, sessões e troca de senha

**Depende de:** 27 · Fonte: [Authentication.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Store/Api/Authentication.md)

## Funcionalidade alterada

Entrar, continuar logado e sair, tanto no **painel** (`/api/auth`) quanto na **loja** (`/api/storefront/auth`), seguindo a sequência que o back-end documentou.

## Estado atual

`auth.js` já busca CSRF, faz login e renova o token, com uma renovação por vez **na mesma aba**. Faltam:

- **Renovação entre abas.** O back trata duas renovações com o mesmo refresh como reutilização e **revoga a família inteira**. Duas abas abertas derrubam a sessão.
- **CSRF por contexto.** O GET de CSRF e o POST seguinte precisam estar no mesmo contexto (os dois sem Bearer ou os dois com o mesmo Bearer). Hoje o CSRF fica em cache por realm e não é renovado quando o token muda.
- **Seleção de loja.** O login devolve `requiresEnterpriseSelection` e `enterprises`. `selectEnterprise` existe, mas nenhuma tela pergunta qual loja abrir, e quem não tem loja não tem caminho para `POST /api/enterprises/register`.
- **Sessões e senha.** `GET sessions`, `DELETE sessions/{familyId}`, `POST logout-all` e `POST change-password` (no painel) não têm tela.
- **Bloqueio de login.** A partir de 5 falhas o login bloqueia de 30 s a 15 min, e as rotas de auth respondem 429 acima de 15/min. A tela mostra só "erro".

## Como implementar

1. **Trava entre abas:** use `navigator.locks.request('drp-refresh-<realm>', …)`, com `BroadcastChannel` para avisar as outras abas do novo token. A aba que não rotacionou espera e reaproveita o token anunciado.
2. **CSRF:** invalide o cache quando o access token mudar (login, refresh, seleção de loja ou logout). Antes do `refresh`, peça o CSRF **sem** Bearer.
3. **Escolha de loja** (`#/admin/entrar/loja`): lista `enterprises` (inclusive lojas pausadas, com badge); ao escolher, chama `select-enterprise` e troca o Bearer. Sem loja, mostra o formulário de criar a primeira (`POST /api/enterprises/register`).
4. **Segurança da conta**, em duas telas: aba "Segurança" em Configurações (painel) e `#/conta/seguranca` (cliente). Cada uma tem a troca de senha (12 a 128 caracteres, com validação no cliente), a lista de sessões com dispositivo e data, "encerrar esta" e "sair de todas".
5. **Erros de login:** com 429, mostre "Muitas tentativas. Tente de novo em N s" usando `Retry-After`. Não exiba contador de tentativas.
6. **Recuperação de senha e confirmação de e-mail** respondem **503** nesta etapa. Esconda os links ou mostre "Indisponível no momento", sem tela que pareça funcionar.

## Critérios de aceite

- [ ] Com duas abas abertas por mais de 10 minutos, a sessão continua nas duas
- [ ] Usuário com duas lojas escolhe uma e o painel abre nela; usuário sem loja consegue criar a primeira
- [ ] O cliente troca a senha e encerra outras sessões
- [ ] O token nunca aparece na URL, no `request-log` nem no console

## Verificação

```bash
grep -rn "accessToken" src/components src/services/request-log.js   # 0
```

Manual: duas abas no painel, esperar o token expirar e conferir que nenhuma volta para o login.

## Para o Claude Code

> Altere `src/services/auth.js`, `session.js` e `http.js`, e crie as telas de escolha de loja e de segurança da conta. Não guarde token em `localStorage`: o refresh fica só no cookie HttpOnly.
