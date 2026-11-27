import { localDayKey } from './format';

// Exportação em CSV para o Excel: separador ";", todo campo entre aspas e BOM
// para o Excel abrir em UTF-8 sem estragar os acentos.
const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

// Valor monetário no formato do Excel em português: 1234,50.
export const csvMoney = (value) => (Number(value) || 0).toFixed(2).replace('.', ',');

/**
 * Baixa um CSV. `name` sem extensão: o arquivo sai como `<name>-<dia>.csv`.
 * @param {string} name
 * @param {string[]} header
 * @param {unknown[][]} lines
 */
export function downloadCsv(name, header, lines) {
  const csv = [header, ...lines].map((line) => line.map(cell).join(';')).join('\n');
  const BOM = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${localDayKey(Date.now())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
