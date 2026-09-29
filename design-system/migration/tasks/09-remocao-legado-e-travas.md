# [DS] Remover o tema legado e travar o sistema contra regressão

**Depende de:** tasks 02 a 08 (todas as telas migradas) · **Última da série**

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | CSS puro + Design System (`design-system/`: classes `ds-*` e tokens `var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` (`<X :size="20" :stroke-width="1.5" />`), tamanhos 16/20/24 |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API (MediatR, FluentValidation, EF Core + PostgreSQL), em `../backend` |
| Integração | HTTP/JSON com a API do back-end via `src/services/api.js` (JS puro, independente de framework) |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

A camada de estilo global e o pipeline de verificação. Nenhuma tela muda de comportamento: esta task apaga o que sobrou do tema antigo e cria as travas para o sistema não se degradar na próxima sprint.

## Estado atual (antes desta task)

`src/index.css` ainda contém todo o tema **dark neon glassmorphism**: tokens `--color-primary` (roxo), `--bg-card-glass`, `--shadow-neon`, e as classes `.glass-card`, `.btn`, `.badge`, `.input-field`, `.pulse-glow`, `.pulse-scale`, `.slide-up`, `.container`, `.header`, `.main-grid`, `.logo-area`. Com as tasks 02–08 concluídas, nada mais consome essas regras.

## Como implementar

### 1. Confirmar que o legado está órfão

Para cada classe e token legado, confirme zero uso em `src/`:

```bash
for c in glass-card glass-card-interactive btn-primary btn-secondary badge-live \
         badge-waiting badge-success badge-ended input-field pulse-glow pulse-scale \
         slide-up logo-area main-grid; do
  echo "$c: $(grep -rl "$c" src/ --include=*.vue | wc -l) arquivo(s)"
done
```

Tudo precisa dar `0`. O que não der volta para a task da tela correspondente: **não migre pontualmente aqui**.

### 2. Esvaziar `src/index.css`

O arquivo fica só com o que for realmente específico da aplicação e não couber no DS (idealmente, nada). Se ficar vazio, apague-o e remova o `import './index.css'` de `src/main.js`. Os imports do sistema já estão em `main.js` desde a task 01.

### 3. Medir o resultado

```bash
# literais de cor nos componentes — meta: 0 (eram 74)
grep -rhoE "#[0-9a-fA-F]{3,8}" src/ --include=*.vue | wc -l

# estilos inline — meta: <= 20 (eram 226), todos com valor calculado
grep -rcE ':?style="' src/ --include=*.vue | awk -F: '{s+=$2} END {print s}'

# blocos <style> em SFC — meta: 0
grep -rl "<style" src/ --include=*.vue | wc -l

# resquícios do tema antigo — meta: 0
grep -rn "glass-card\|shadow-neon\|backdrop-filter\|var(--color-" src/
```

Registre os números finais no comentário da issue: eles são a linha de base da próxima auditoria.

### 4. Criar as travas

**a) Script de verificação** em `package.json`:

```json
"scripts": {
  "ds:check": "! grep -rqE '#[0-9a-fA-F]{3,8}|<style' src/ --include=*.vue && echo 'DS OK'"
}
```

**b) Hook de pre-commit**: o projeto já usa husky (`.husky/pre-commit`). Adicionar `npm run ds:check`.

**c) Regra de lint** (opcional, avaliar custo): `stylelint` com `declaration-property-value-allowed-list` para exigir `var(--ds-*)` em `color`, `background`, `box-shadow` e `border-radius` nos CSS do projeto, e a regra `vue/no-restricted-static-attribute` / `vue/no-restricted-v-bind` do `eslint-plugin-vue` para barrar `style` estático nos templates.

### 5. Fechar a documentação

- Atualizar a seção 7 de `design-system/CLAUDE.md` ("Estado atual do projeto"): o tema legado deixou de existir
- Atualizar `design-system/migration/from-neon-glass.md` marcando a migração como concluída
- Conferir `design-system/preview.html` contra o app real: se divergirem, o preview está desatualizado

## Critérios de aceite

- [ ] Zero uso das 14 classes legadas em `src/`
- [ ] `src/index.css` sem tokens e sem classes do tema antigo (ou removido)
- [ ] Zero hex literal em `.vue`
- [ ] ≤ 20 estilos inline no projeto inteiro, todos com valor calculado
- [ ] Zero bloco `<style>` em `.vue`
- [ ] `npm run ds:check` existe e passa; hook de pre-commit chamando o script
- [ ] `npm run lint` e `npm run build` passam
- [ ] Documentação do DS atualizada (CLAUDE.md seção 7 e migration/)
- [ ] Varredura visual final: portal, drop, fila, checkout e simulação, em light e dark, a 360px e 1440px

## Referências do Design System

- `design-system/migration/from-neon-glass.md`: passo 4 (verificação)
- `design-system/CLAUDE.md`: seção 5 (checklist) e seção 7 (estado do projeto)

## Para o Claude Code

```
Leia design-system/CLAUDE.md e migration/from-neon-glass.md (passo 4).
Execute a task 09: confirme que nenhuma classe legada é usada nos .vue de src/, esvazie o
tema antigo de src/index.css (se ficar vazio, apague e remova o import de src/main.js),
meça os indicadores finais (hex literais, estilos inline, blocos <style>), crie o script
npm run ds:check e ligue-o no .husky/pre-commit, e atualize a seção 7 do
design-system/CLAUDE.md. Se alguma classe legada ainda estiver em uso, PARE e reporte
qual arquivo; não migre pontualmente.
```
