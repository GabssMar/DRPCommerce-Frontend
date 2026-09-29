# Design System — DRPCommerce

Sistema de design do front-end, derivado por análise sistêmica do projeto
[Stratus CRM](https://www.behance.net/gallery/215887035/Stratus-CRM-SaaS-UX-UI-Dashboard-Design) (Rondesignlab, 2024)
e adaptado ao domínio de **drop com fila prioritária de checkout**.

> **Agentes (Claude Code): comecem por [`CLAUDE.md`](./CLAUDE.md).** É o contrato.
> **Pessoas: abram [`preview.html`](./preview.html)** no navegador para ver o sistema renderizado.

## Em uma tela

| | |
|---|---|
| **Superfície** | canvas `#EDEEF0` + card branco. A hierarquia vem do contraste, não de bordas. |
| **Marca** | periwinkle `#83A2DB` — cor de **bloco**, nunca de texto. |
| **Ação** | tinta `#2A292E`. O botão mais importante da tela é quase-preto. |
| **Urgência** | coral `#FD8E8C` (fundo) / `#C5453F` (texto). |
| **Forma** | raio 24px em card, pill em badge, círculo em botão de ícone. |
| **Tipografia** | Poppins (display) + Inter (UI). Hierarquia por tamanho e cor, nunca por peso. |
| **Profundidade** | sombra difusa neutra. Sem glow, sem glass, sem gradiente. |

## Mapa dos arquivos

```
design-system/
├── CLAUDE.md                  ← contrato: regras, checklist, anti-padrões
├── ANALYSIS.md                ← a análise sistêmica (método, princípios, lacunas)
├── preview.html               ← teste de fumaça visual (abra no navegador)
│
├── tokens/
│   ├── tokens.json            ← FONTE DA VERDADE
│   ├── tokens.css             ← custom properties (light + dark)
│   └── tokens.js              ← paletas para gráficos + troca de tema
│
├── styles/
│   ├── index.css              ← ponto de entrada (importe este)
│   ├── base.css               ← reset, tipografia, foco, motion reduzido
│   ├── components.css         ← classes .ds-*
│   └── utilities.css          ← layout e composição
│
├── foundations/               ← color · typography · space-layout ·
│                                radius-elevation · motion · iconography
├── components/                ← uma spec por componente (+ _template.md)
├── patterns/                  ← app-shell · drop-page · states
├── migration/                 ← from-neon-glass.md
└── reference/                 ← evidências da análise (cores medidas, peças)
```

## Instalação no app

```js
// src/main.js
import '../design-system/styles/index.css';
```

```html
<!-- index.html -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

O tema padrão é **claro** (o da referência): `initTheme()` aplica `data-theme="light"` mesmo com o sistema operacional em modo escuro. O escuro só entra se o usuário escolher, com `setTheme('dark')` de `tokens/tokens.js`.

O CSS legado do app (`src/index.css`, tema neon/glass) ainda está ativo — o plano de substituição está em [`migration/from-neon-glass.md`](./migration/from-neon-glass.md).

## Como usar no dia a dia

```vue
<article class="ds-card">
  <header class="ds-card__header">
    <h3 class="ds-card__title">Sua posição na fila</h3>
    <span class="ds-badge ds-badge--waiting">
      <span class="ds-badge__dot" />Aguardando
    </span>
  </header>

  <div class="ds-stat ds-stat--lg">
    <div class="ds-stat__value">127<span class="ds-stat__unit">º</span></div>
    <div class="ds-stat__label">de 1.842 na fila</div>
  </div>

  <footer class="ds-card__footer">
    <button class="ds-btn ds-btn--primary ds-btn--block">Entrar na fila</button>
  </footer>
</article>
```

## Regra de ouro

Se você precisou escrever um hex, um `px` de espaçamento ou uma sombra no componente, **falta um token** — crie-o em `tokens/tokens.json` e replique. Nunca resolva no componente.

## Verificação rápida

```bash
# nenhum literal de cor fora do design system
grep -rnE "#[0-9a-fA-F]{3,8}" src/ --include=*.vue --include=*.css

# nenhum resquício do tema legado
grep -rn "glass-card\|shadow-neon\|backdrop-filter" src/
```
