/**
 * DRPCommerce Design System — tokens em JS.
 *
 * Use APENAS onde CSS não alcança: séries de gráfico, canvas, cores passadas
 * como prop para bibliotecas, meta theme-color. Para estilo de componente,
 * use as classes `ds-*` ou `var(--ds-*)`.
 *
 * Espelho de tokens.json. Alterou lá? Altere aqui.
 */

/** Lê um token do CSS em runtime — preferível a duplicar valor. */
export function token(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(`--ds-${name}`).trim();
}

/** Paleta categórica. Máximo 4 séries cromáticas (ver ANALYSIS.md §2.6). */
export const chartColors = ['#83A2DB', '#FD8E8C', '#FFE880', '#A5BCE4', '#2A292E'];

/** Sequencial (uma métrica, do claro ao escuro). */
export const chartSequentialBlue = ['#E4EAF7', '#C7D5EE', '#A5BCE4', '#83A2DB', '#6B8CCB', '#4A6FB5'];

/** Cores por status do domínio drop/fila. */
export const statusColors = {
  live:      { fg: '#C5453F', bg: '#FFE2E1', dot: '#FD8E8C' },
  waiting:   { fg: '#4A6FB5', bg: '#E4EAF7', dot: '#83A2DB' },
  scheduled: { fg: '#8A6508', bg: '#FFF6D6', dot: '#FFE880' },
  done:      { fg: '#6B6B73', bg: '#E7E8E9', dot: '#B4B4BC' },
  success:   { fg: '#1F7A5C', bg: '#DFF3EB', dot: '#5FBF9B' },
};

export const palette = {
  ink: {
    50: '#EDEEF0', 100: '#E7E8E9', 200: '#D4D4DA', 300: '#B4B4BC', 400: '#8A8A93',
    500: '#6B6B73', 600: '#55545C', 700: '#3C3B42', 800: '#2A292E', 900: '#1A1A1F', 950: '#111114',
  },
  blue: {
    50: '#F2F5FB', 100: '#E4EAF7', 200: '#C7D5EE', 300: '#A5BCE4',
    400: '#83A2DB', 500: '#6B8CCB', 600: '#4A6FB5', 700: '#3A5793', 800: '#2B4070',
  },
  coral: {
    50: '#FFF2F2', 100: '#FFE2E1', 200: '#FEC7C6', 300: '#FEAAA9',
    400: '#FD8E8C', 500: '#F26B68', 600: '#C5453F', 700: '#97322D',
  },
  amber: { 100: '#FFF6D6', 300: '#FFE880', 500: '#E8B93F', 700: '#8A6508' },
  green: { 100: '#DFF3EB', 400: '#5FBF9B', 600: '#1F7A5C' },
  white: '#FFFFFF',
};

export const radius = {
  xs: 8, sm: 10, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, pill: 999,
};

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
};

export const duration = { instant: 80, fast: 120, base: 180, slow: 240, slower: 320 };

export const breakpoint = { sm: 480, md: 768, lg: 1024, xl: 1280, '2xl': 1440 };

/** Alterna e persiste o tema. Retorna o tema aplicado. */
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('ds-theme', theme);
  } catch {
    /* modo privado / storage bloqueado — tema vale só para esta sessão */
  }
  return theme;
}

/**
 * Aplica o tema: claro por padrão (é o da referência), escuro só se o usuário
 * escolheu com setTheme('dark'). A preferência do SO não é seguida.
 */
export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('ds-theme');
  } catch {
    /* ignora */
  }
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}
