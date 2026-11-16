# [Aparência · Front-end] Temas: renderer por tema/versão e editor com sessão, preview, publicação e rollback

**Depende de:** 27, 40 · Fonte: [Appearance.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Shared/Appearance.md)

## Funcionalidade nova

O lojista **personaliza a aparência** da vitrine e dos drops dentro dos temas oferecidos pela plataforma (cores, fonte, logo, destaques), vê uma prévia, publica e pode voltar a uma versão anterior. O cliente vê a loja com o tema publicado.

## Estado atual

O back terminou o módulo de aparência (sessão de edição com bloqueio, If-Match, preview, publicação imutável, histórico, rollback e migração de versões). **O front não tem nada:** nem os temas, nem o renderer, nem o editor. O back espera que **a plataforma defina os temas no projeto do front** e os publique via `POST /api/internal/appearance-themes`, com `X-Service-Key`, **pelo servidor e nunca pelo navegador**.

## Como implementar

### 1. Catálogo de temas (projeto do front, sem tela)
- `src/themes/<key>/<version>/`: `schema.json` (JSON Schema 2020-12, `additionalProperties: false`, sem `$ref`), `defaults.json` e os metadados `x-ui` dos controles. Pelo menos um tema `store` e um `drop` na versão `1.0.0`, com `rendererContract: 1`.
- Script `scripts/publish-themes.mjs` que lê esses arquivos e faz o POST com a chave vinda do ambiente (CI ou máquina da plataforma). **Nunca** a chave no bundle e nunca `VITE_`.

### 2. Renderer (vitrine e drop)
- Leitura pública: `GET storefront/appearance` (Store) · `GET storefront/drop/appearance` · `GET storefront/drop/events/{slug}/appearance`. Use `ETag`/`If-None-Match`.
- Escolha o componente por `theme.key + theme.version`. Os `settings` viram **custom properties sobrepostas aos tokens do DS** num escopo (`[data-theme-scope]`), nunca estilo inline solto. Cores do lojista passam por verificação de contraste: se falhar, use o token padrão e registre aviso.
- 404 (evento ativo sem aparência publicada): use o visual padrão do DS.

### 3. Editor (painel, dono principal)
| Passo | Rota (base `appearances` ou `drop-events/{id}/appearance`) |
|---|---|
| Status | `GET` |
| Sessão aberta | `GET edit-session` (204 = nenhuma) |
| Começar | `POST edit-sessions` `{ themeKey, themeVersion, useDefaults }` |
| Autosave | `PUT edit-sessions/{sid}/settings` `{ settings }` + `If-Match` |
| Preview | `POST …/preview` + `If-Match` (gera ETag novo) |
| Publicar, cancelar ou liberar | `POST …/publish` · `…/cancel` · `…/release` + `If-Match` |
| Histórico e rollback | `GET revisions?beforeNumber=` · `POST revisions/{rid}/rollback` `{ expectedRevisionId }` |

- Formulário **gerado do schema** e do `x-ui` (cor, fonte da lista aprovada, booleano, raio limitado, produtos em destaque).
- Autosave com debounce de 1 s, sempre com o **último ETag**. 412 = outra aba salvou: recarregue a sessão. 428 = bug (faltou `If-Match`). 409 = outra pessoa editando: ofereça "liberar" ao dono.
- Preview ao lado, renderizado pelo mesmo renderer.
- Upload de logo **ainda não existe** no back (`logoAssetId` = null): esconda o campo.

## Critérios de aceite

- [ ] O tema é publicado no back pelo script, sem chave no bundle
- [ ] O lojista edita, vê a prévia, publica e faz rollback pelo painel
- [ ] A vitrine aplica o tema publicado sem quebrar o contraste do DS
- [ ] Nenhum `X-Service-Key` em `src/`

## Verificação

```bash
grep -rn "X-Service-Key\|InternalServiceKey" src   # 0
```

## Para o Claude Code

> Task grande: divida em 3 PRs (catálogo + script, renderer, editor). Leia `design-system/foundations/color.md` antes de aplicar cores do lojista.
