// Аудит иконочных систем: где Tabler (ti-*), а где сырые юникод-глифы.
const fs = require('fs');
const src = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
const body = src.slice(src.indexOf('<body'), src.indexOf('</body>'));

const GLYPHS = ['▶', '⏸', '■', '↶', '↷', '⋮', '✕', '×', '−', '⌕', '♩', '♪', '⏹'];
const found = {};
for (const g of GLYPHS) {
  // Ищем глиф как ВИДИМЫЙ текст кнопки/элемента разметки, не в комментариях JS.
  const re = new RegExp('>\\s*' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<', 'g');
  const n = (body.match(re) || []).length;
  if (n) found[g] = n;
}
console.log('=== сырые юникод-глифы в разметке (как содержимое элемента) ===');
for (const [g, n] of Object.entries(found)) console.log(`  ${g}  ${n} шт.`);

const ti = [...body.matchAll(/class="ti ti-([a-z0-9-]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(ti)];
console.log(`\n=== Tabler-иконки: ${ti.length} использований, ${uniq.length} уникальных ===`);
console.log('  ' + uniq.join(', '));

// Где именно глифы — покажем контекст кнопок транспорта и тулбара
console.log('\n=== контекст: строки с глифами ===');
const lines = src.split('\n');
lines.forEach((l, i) => {
  for (const g of Object.keys(found)) {
    if (new RegExp('>\\s*' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<').test(l)) {
      const cls = /class="([^"]+)"/.exec(l);
      const id = /id="([^"]+)"/.exec(l);
      console.log(`  ${String(i + 1).padStart(6)}: ${g}  ${cls ? cls[1].slice(0, 40) : ''} ${id ? '#' + id[1] : ''}`);
      break;
    }
  }
});
