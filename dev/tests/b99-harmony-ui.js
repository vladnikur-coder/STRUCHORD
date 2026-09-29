#!/usr/bin/env node
// B-99 UI phase: keep the visual marker semantic, present on editor/timeline/
// wheel, and subordinate to the established selected-chord accent marker.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    w.cancelAnimationFrame = (id) => clearTimeout(id);
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: (text) => ({ width: String(text).length * 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    w.HTMLElement.prototype.scrollIntoView = function () {};
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

let failures = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const d = w.document;
w.eval(`
  globalKey = 'C';
  globalTimeSig = '4/4';
  keyMode = 'manual';
  document.getElementById('showDegrees').checked = true;
  sections = [{
    id: 41, type: 'Verse', customName: '', key: null, timeSig: '4/4', squares: [{
      id: 42,
      events: [
        { chord: 'C', span: 1 },
        { chord: 'D7', span: 1 },
        { chord: 'G', span: 1 },
        { chord: 'Bb', span: 1 }
      ]
    }]
  }];
  render();
`);

const grid = (ei) => d.querySelector(`.chord-wrapper[data-sec="41"][data-square="42"][data-ei="${ei}"]`);
ok('ячейки редактора получают все три группы без текстовых плашек',
  grid(0)?.dataset.harmonyGroup === 'diatonic' &&
  grid(1)?.dataset.harmonyGroup === 'chromatic' &&
  grid(3)?.dataset.harmonyGroup === 'modal-borrowed' &&
  !grid(1)?.querySelector('.harmony-visible-label'),
  [0, 1, 3].map((ei) => grid(ei)?.dataset.harmonyGroup).join(', '));
ok('цветовой маркер имеет текстовую альтернативу для скринридера',
  /вторичная доминанта V\/V/.test(grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') || ''),
  grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') || '');

w.eval('timelineMode = true; renderTimeline();');
const timeline = (ei) => d.querySelector(`.tl-cell[data-sec="41"][data-square="42"][data-ei="${ei}"]`);
ok('лента несёт те же semantic groups',
  timeline(0)?.dataset.harmonyGroup === 'diatonic' &&
  timeline(1)?.dataset.harmonyGroup === 'chromatic' &&
  timeline(3)?.dataset.harmonyGroup === 'modal-borrowed',
  [0, 1, 3].map((ei) => timeline(ei)?.dataset.harmonyGroup).join(', '));
ok('лента содержит скрытое текстовое описание, а не полагается только на цвет',
  /Хроматическая функция/.test(timeline(1)?.querySelector('.harmony-a11y')?.textContent || ''),
  timeline(1)?.querySelector('.harmony-a11y')?.textContent || '');

w.eval(`
  activeChordInput = document.querySelector('.chord-input[data-sec="41"][data-square="42"][data-ei="1"]');
  activeSectionKey = null;
  wheelMode = '7';
  drawWheel();
`);
const d7 = d.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"]');
ok('круг получает chromatic для D7 в контексте следующего G',
  d7?.dataset.harmonyGroup === 'chromatic', d7?.outerHTML || 'D7 sector absent');
ok('выбранный аккорд сохраняет сильный established selected marker',
  d7?.classList.contains('is-wheel-selected') && /\.wheel-sector\.is-wheel-selected/.test(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8')),
  d7?.className.baseVal || '');

w.eval('bindWheelHarmonyLegend(); document.getElementById("wheelHarmonyLegendToggle").click();');
const legend = d.getElementById('wheelHarmonyLegend');
const toggle = d.getElementById('wheelHarmonyLegendToggle');
ok('кнопка ? раскрывает текстовую легенду трёх цветов',
  !legend.hidden && toggle.getAttribute('aria-expanded') === 'true' &&
  /Диатоника/.test(legend.textContent) && /Модально/.test(legend.textContent) && /Хроматика/.test(legend.textContent),
  legend.textContent.replace(/\s+/g, ' ').trim());

w.eval('document.getElementById("showDegrees").checked = false; updateCellsDegrees();');
ok('выключенные «Ступени» выключают и расширенную гармоническую подсветку',
  !d.body.classList.contains('is-harmony-highlights-on') &&
  !d.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on') &&
  grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') === null,
  `${d.body.className} | ${grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label')}`);

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 harmony UI');
process.exit(failures ? 1 : 0);
