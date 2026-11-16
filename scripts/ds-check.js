// Trava do Design System (task 09): falha se o tema antigo ou valores
// literais voltarem para os componentes. Roda no pre-commit e em `npm run ds:check`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const ROOT = join(import.meta.dirname, '..', 'src');

const RULES = [
  { name: 'cor hex literal', files: /\.vue$/, pattern: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'bloco <style>', files: /\.vue$/, pattern: /<style[\s>]/g },
  {
    name: 'token ou classe do tema antigo',
    files: /\.(vue|js|css)$/,
    pattern: /var\(--(color|bg|border|shadow|font)-|glass-card|shadow-neon|backdrop-filter/g,
  },
];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const problems = [];
for (const file of walk(ROOT)) {
  const rules = RULES.filter((rule) => rule.files.test(file));
  if (!rules.length) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    for (const rule of rules) {
      for (const match of line.matchAll(rule.pattern)) {
        problems.push(`${relative(process.cwd(), file)}:${index + 1}  ${rule.name}: ${match[0]}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`Design System: ${problems.length} problema(s)\n${problems.join('\n')}`);
  console.error('Use classes ds-* e tokens var(--ds-*). Veja design-system/CLAUDE.md.');
  process.exit(1);
}
console.log('DS OK');
