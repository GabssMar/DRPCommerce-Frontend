# Evidências da análise

Rastro do que foi medido, para que qualquer pessoa (ou agente) possa refazer a verificação.

## Fonte

- **Projeto:** Stratus CRM — SaaS & UX UI Dashboard Design
- **URL:** https://www.behance.net/gallery/215887035/Stratus-CRM-SaaS-UX-UI-Dashboard-Design
- **Estúdio:** Rondesignlab (Cracóvia/PL, São Francisco, Los Angeles) — 16+ colaboradores
- **Ano / categoria:** 2024 · SaaS, CRM · Califórnia
- **Escopo declarado:** UX Design, UI Design, Logo Design
- **Ferramentas declaradas:** Adobe Photoshop, Adobe Illustrator
- **Descrição oficial:** *"Stratus CRM is a robust solution designed to streamline and optimize your customer interactions. With advanced features like lead tracking, and customer segmentation, Stratus CRM empowers businesses to drive growth and enhance customer satisfaction."*
- **Problema declarado na peça 02:** *"Users struggle with complex data and navigation, making it difficult to quickly find and understand key information."*
- **Soluções declaradas:** reorganizar o layout de dados para legibilidade; simplificar a apresentação com gráficos minimalistas.

A galeria **não publica** tokens, escala tipográfica, grid ou nome da fonte. Tudo abaixo foi medido.

## Peças analisadas

17 módulos baixados em 1400px. Sete lidos visualmente:

| Peça | Conteúdo |
|---|---|
| 01 — capa | dashboard "Customer Journeys" em monitor + app mobile com calendário escuro |
| 02 — problema/solução | diagrama circular azul/coral, tipografia do sistema |
| 03 — mobile | seis telas do app: cards, alocação, calendário, chips de status |
| 04 — dashboard | tela cheia: rail de ícones, nav pill, cards de journey, tabela, donuts |
| 05 — landing | hero azul, seções, footer, logotipo grande |
| 06 — branding | cartão, brandbook, outdoor — confirma azul como cor de bloco |
| 07 — overview | ficha do projeto, citação, mobile em mão |

## Cores medidas

Histograma exato (sem quantização), amostragem 1 em 2 pixels, sobre as peças de UI:

| Hex | Papel |
|---|---|
| `#FFFFFF` | superfície de card |
| `#EDEEF0` | canvas da aplicação |
| `#83A2DB` | azul-periwinkle de marca |
| `#2A292E` | tinta (CTA, nav ativa, card escuro) |
| `#CAD0DC` | borda/sombra azulada |
| `#FD8E8C` | coral (urgência, "Active") |
| `#FFE880` | âmbar de apoio |

Reprodução (PowerShell + System.Drawing, sem dependências):

```powershell
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($path)
# LockBits -> Format24bppRgb -> histograma de '{0:X2}{1:X2}{2:X2}' -f R,G,B
```

## Contrastes verificados (WCAG 2.1, sobre `#FFFFFF`)

| Cor | Razão | Veredito |
|---|---|---|
| `#2A292E` | 14.45:1 | AAA |
| `#6B6B73` | 5.32:1 | AA |
| `#4A6FB5` | 4.97:1 | AA |
| `#C5453F` | 4.91:1 | AA |
| `#1F7A5C` | 5.25:1 | AA |
| `#8A6508` | 5.32:1 | AA |
| `#83A2DB` | **2.58:1** | reprova — só superfície |
| `#FD8E8C` | **2.23:1** | reprova — só superfície |

Sobre canvas escuro `#17171A`: `#83A2DB` = 6.6:1 (aprovado como texto no tema escuro).

## Limites desta análise

- Nenhuma medida de espaçamento é exata: os mockups estão em perspectiva e escala variável. A escala de 4px foi inferida das proporções, não medida.
- A fonte original não foi identificada; Poppins + Inter são substitutos escolhidos por semelhança estrutural.
- Não há evidência de movimento, estados de foco, erro, vazio ou responsividade — tudo isso foi projetado, não derivado.
- O verde de sucesso não existe na referência; é extensão deste sistema.
