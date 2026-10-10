#!/usr/bin/env node
/*
 * b603-chain-display.js — версия 0.604 (отображение длинных цепочек вторичных доминант).
 *  1. В ячейке подпись длиннее трёх звеньев усекается: V/V/V/V → «V/V/V…».
 *     Подписи до трёх звеньев не меняются: V/V/vi, V/V.
 *  2. Полная цепочка выводится в подсказке (getHarmonyChainTooltip) от первого звена до цели.
 *  3. Диатоничный аккорд без цепочки подсказки не имеет.
 *  4. Анализ (function/degree) не меняется: проверено b599 и b601.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {}, fill() {},
      stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {},
      rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' (' + details + ')' : '')); }
}
const ev = (code) => w.eval(code);
const sectionOf = (chords) => ({ key: 'C', squares: [{ id: 1, events: chords.map((c) => ({ chord: c, span: 4 })) }] });
const S = (chords) => JSON.stringify(sectionOf(chords));

console.log('=== 1. усечение подписи ===');
check('V/V/V/V → V/V/V…', ev(`getShortChainDegreeLabel('V/V/V/V')`) === 'V/V/V…');
check('V/V/vi не меняется (три звена)', ev(`getShortChainDegreeLabel('V/V/vi')`) === 'V/V/vi');
check('V/V не меняется', ev(`getShortChainDegreeLabel('V/V')`) === 'V/V');
check('V не меняется', ev(`getShortChainDegreeLabel('V')`) === 'V');
check('пустая подпись → пустая строка', ev(`getShortChainDegreeLabel('')`) === '');

console.log('=== 2. подсказка с полной цепочкой ===');
check('E A D G: подсказка от E до G', ev(`getHarmonyChainTooltip(${S(['E', 'A', 'D', 'G'])}, 'C', 1, 0)`).includes('E → A → D → G'));
check('E A D G: подсказка одинакова для каждого звена цепочки', [0, 1, 2].every((i) =>
  ev(`getHarmonyChainTooltip(${S(['E', 'A', 'D', 'G'])}, 'C', 1, ${i})`) === ev(`getHarmonyChainTooltip(${S(['E', 'A', 'D', 'G'])}, 'C', 1, 0)`)));
check('B7 E7 Am: подсказка B7 → E7 → Am', ev(`getHarmonyChainTooltip(${S(['B7', 'E7', 'Am'])}, 'C', 1, 0)`).includes('B7 → E7 → Am'));
check('B Em: одно звено и цель — B → Em (V/iii)', ev(`getHarmonyChainTooltip(${S(['B', 'Em'])}, 'C', 1, 0)`).includes('B → Em'));

console.log('=== 3. без цепочки подсказки нет ===');
check('цель цепочки G (V) — подсказки нет', ev(`getHarmonyChainTooltip(${S(['E', 'A', 'D', 'G'])}, 'C', 1, 3)`) === '');
check('диатоничное I в C — подсказки нет', ev(`getHarmonyChainTooltip(${S(['C', 'G', 'C'])}, 'C', 1, 0)`) === '');

console.log('=== 4. анализ не меняется ===');
const deg = ev(`analyzeSectionHarmony(${S(['E', 'A', 'D', 'G'])}, 'C')[0].function`);
check('E в цепочке остаётся V/V/V/V (короткая подпись только в отображении)', deg === 'V/V/V/V', deg);

console.log('=== 5. ячейка показывает корневую ступень, не V/x (0.607) ===');
const cellLabel = (chords, i) => ev(`(() => { const sec = ${S(chords)}; const a = analyzeSectionHarmony(sec, 'C')[${i}]; return getCellDegreeLabel(a, sec.squares[0].events[${i}].chord, 'C'); })()`);
check('E→A→D→G: E = III (не V/V/V/V)', cellLabel(['E', 'A', 'D', 'G'], 0) === 'III', cellLabel(['E', 'A', 'D', 'G'], 0));
check('E→A→D→G: A = VI', cellLabel(['E', 'A', 'D', 'G'], 1) === 'VI', cellLabel(['E', 'A', 'D', 'G'], 1));
check('E→A→D→G: D = II', cellLabel(['E', 'A', 'D', 'G'], 2) === 'II', cellLabel(['E', 'A', 'D', 'G'], 2));
check('E→A→D→G: G = V (без изменений)', cellLabel(['E', 'A', 'D', 'G'], 3) === 'V', cellLabel(['E', 'A', 'D', 'G'], 3));
check('B7→E7→Am: B7 = VII', cellLabel(['B7', 'E7', 'Am'], 0) === 'VII', cellLabel(['B7', 'E7', 'Am'], 0));
check('E7→Am: E7 = III, Am = vi без изменений', cellLabel(['E7', 'Am'], 0) === 'III' && cellLabel(['E7', 'Am'], 1) === 'vi', cellLabel(['E7', 'Am'], 0) + '/' + cellLabel(['E7', 'Am'], 1));
check('подсказка цепочки сохранилась', ev(`getHarmonyChainTooltip(${S(['E', 'A', 'D', 'G'])}, 'C', 1, 0)`).includes('E → A → D → G'));

console.log('=== 6. подсказка ячейки: прикладная функция одиночного аккорда (0.608) ===');
const tip = (chords, i) => ev(`getHarmonyCellTooltip(${S(chords)}, 'C', 1, ${i})`);
check('одиночный E в C: подсказка V/vi', tip(['E'], 0).includes('V/vi'), tip(['E'], 0));
check('одиночный A в C: подсказка V/ii', tip(['A'], 0).includes('V/ii'), tip(['A'], 0));
check('одиночный B в C: подсказка V/iii', tip(['B'], 0).includes('V/iii'), tip(['B'], 0));
check('C (I) в C: подсказки нет', tip(['C'], 0) === '', tip(['C'], 0));
check('E→A→D→G: подсказка — цепочка, а не одиночная функция', tip(['E', 'A', 'D', 'G'], 0).includes('E → A → D → G'));

console.log(`\nИТОГО: пройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);
