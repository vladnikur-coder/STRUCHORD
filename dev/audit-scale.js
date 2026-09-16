#!/usr/bin/env node
/*
 * audit-scale.js — сторож масштабируемости UI (волна B-79).
 *
 * ЗАЧЕМ. Базовый масштаб интерфейса задаётся ОДНИМ токеном --ui-scale в :root
 * через html{font-size:calc(100% * var(--ui-scale))}. Тянется всё, что задано
 * в rem (CSS) или em (SVG). А вот ЖЁСТКИЕ px этот токен игнорируют — такой
 * элемент останется прежнего размера и на 125% будет выглядеть мелким.
 *
 * Блок <style> уже переведён в rem. Но размеры можно задать ещё и ИНЛАЙНОМ —
 * прямо в разметке (style="...") или из JS (.style.xxx='...px', SVG width=).
 * Эти места скрипт и находит: сканирует STRUCHORD.html МИМО блока <style> и
 * выводит все «немасштабируемые px» с номерами строк.
 *
 * КАТЕГОРИИ (по важности для масштаба):
 *   font-size   — РАЗМЕР текста/иконок. Жёсткий px тут = мелкая иконка/кнопка.
 *                 Должен быть в rem. Это главный источник жалоб.
 *   svg-size    — width/height у <svg>. Должен быть в em, иначе графика мелкая.
 *   geometry    — прочие размеры/отступы/тени/radius в инлайн-стилях и JS.
 *                 Часть из них декоративная (1-2px тени, radius) — масштабировать
 *                 не обязательно; смотри глазами.
 *
 * Запуск:  node dev/audit-scale.js            — сводка + детали
 *          node dev/audit-scale.js --count    — только числа (для теста-сторожа)
 *          node dev/audit-scale.js --json      — машиночитаемо
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'STRUCHORD.html');
const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// --- Определяем границы блоков <style>...</style>, чтобы их ПРОПУСТИТЬ ---
// (CSS в <style> уже в rem; сторож следит за инлайном и JS вне стилей).
const styleRanges = [];
{
  const re = /<style\b[^>]*>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const closeIdx = src.indexOf('</style>', re.lastIndex);
    const end = closeIdx === -1 ? src.length : closeIdx + '</style>'.length;
    styleRanges.push([start, end]);
    re.lastIndex = end;
  }
}
function offsetToLine(off) {
  // 1-based номер строки для смещения в символах
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}
const lineStarts = [];
{
  let acc = 0;
  for (const l of lines) { lineStarts.push(acc); acc += l.length + 1; }
}
function inStyle(off) {
  return styleRanges.some(([s, e]) => off >= s && off < e);
}

// --- Правила поиска ---
const rules = [
  {
    cat: 'font-size',
    // Размер шрифта в px — двумя синтаксисами:
    //   CSS:       font-size: 22px  /  font-size:13px   (инлайн-стили, cssText)
    //   JS camel:  .style.fontSize = '13px'  /  fontSize:'12px'
    // Второй раньше пропускался — иконки/кнопки, заданные из JS, оставались мелкими.
    re: /(?:font-size:\s*|fontSize\s*[:=]\s*['"`]?)([0-9]*\.?[0-9]+)px/gi,
  },
  {
    cat: 'svg-size',
    // <svg ... width="24" height="24" ...> — числовые размеры (без em/px-суффикса это px).
    // (?<!-) отсекает stroke-width/-height — это толщина линии, не размер.
    re: /<svg\b[^>]*?(?<!-)\b(?:width|height)\s*=\s*"([0-9]*\.?[0-9]+)"/gi,
  },
  {
    cat: 'geometry',
    // всё прочее «Npx» вне <style>: инлайн style="...px", .style.x='...px', и т.п.
    re: /([0-9]*\.?[0-9]+)px/gi,
  },
];

const hits = { 'font-size': [], 'svg-size': [], 'geometry': [] };
const seen = new Set(); // чтобы geometry не дублировала font-size на той же позиции

// Сначала специфичные категории, geometry — последней (исключая уже помеченное)
for (const rule of rules) {
  let m;
  rule.re.lastIndex = 0;
  while ((m = rule.re.exec(src)) !== null) {
    const off = m.index;
    if (inStyle(off)) continue;
    const key = off + ':' + m[0].length;
    if (rule.cat === 'geometry') {
      // пропускаем px, уже учтённые как font-size (перекрытие диапазонов)
      let overlap = false;
      for (const k of seen) {
        const [o, len] = k.split(':').map(Number);
        if (off >= o && off < o + len + 12) { overlap = true; break; }
      }
      if (overlap) continue;
    } else {
      seen.add(key);
    }
    const ln = offsetToLine(off);
    const raw = lines[ln - 1].trim();
    hits[rule.cat].push({
      line: ln,
      match: m[0],
      value: parseFloat(m[1]),
      snippet: raw.length > 100 ? raw.slice(0, 100) + '…' : raw,
    });
  }
}

const counts = {
  'font-size': hits['font-size'].length,
  'svg-size': hits['svg-size'].length,
  'geometry': hits['geometry'].length,
};
counts.total = counts['font-size'] + counts['svg-size'] + counts['geometry'];

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ counts, hits }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--count')) {
  console.log(JSON.stringify(counts));
  process.exit(0);
}

// --- Человекочитаемый отчёт ---
const labels = {
  'font-size': 'FONT-SIZE в px (иконки/текст остаются мелкими — ЧИНИТЬ: → rem)',
  'svg-size':  'РАЗМЕР SVG в px (графика мелкая — ЧИНИТЬ: → em)',
  'geometry':  'ПРОЧИЕ px (отступы/тени/radius в инлайне и JS — часть декоративная, смотри глазами)',
};
console.log('\n=== АУДИТ МАСШТАБИРУЕМОСТИ (B-79) вне блока <style> ===\n');
for (const cat of ['font-size', 'svg-size', 'geometry']) {
  console.log(`── ${labels[cat]} — ${counts[cat]} шт.`);
  for (const h of hits[cat]) {
    console.log(`   :${h.line}  ${h.match.padEnd(18)} ${h.snippet}`);
  }
  console.log('');
}
console.log('ИТОГО немасштабируемых px вне <style>:', counts.total,
            `(font-size:${counts['font-size']}, svg:${counts['svg-size']}, geometry:${counts['geometry']})`);
console.log('');
