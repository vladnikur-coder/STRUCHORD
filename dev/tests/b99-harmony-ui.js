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
ok('редактор показывает только подтверждённый профиль и V/x; Bb остаётся нейтральным',
  grid(0)?.dataset.harmonyGroup === 'diatonic' && grid(0)?.dataset.harmonyProfile === 'ionian' &&
  grid(1)?.dataset.harmonyGroup === 'secondary-function' && grid(1)?.dataset.harmonyProfile === 'secondary-function' &&
  grid(3)?.dataset.harmonyGroup === undefined && grid(3)?.dataset.harmonyProfile === undefined &&
  grid(3)?.querySelector('.chord-input')?.getAttribute('aria-label') === null &&
  !grid(1)?.querySelector('.harmony-visible-label'),
  [0, 1, 3].map((ei) => `${grid(ei)?.dataset.harmonyGroup}/${grid(ei)?.dataset.harmonyProfile}`).join(', '));
ok('цветовой маркер имеет текстовую альтернативу для скринридера',
  /вторичная доминанта V\/V/.test(grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') || ''),
  grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') || '');

w.eval('timelineMode = true; renderTimeline();');
const timeline = (ei) => d.querySelector(`.tl-cell[data-sec="41"][data-square="42"][data-ei="${ei}"]`);
ok('лента несёт те же подтверждённые profiles, а неоднозначный Bb не маркирует',
  timeline(0)?.dataset.harmonyGroup === 'diatonic' && timeline(0)?.dataset.harmonyProfile === 'ionian' &&
  timeline(1)?.dataset.harmonyGroup === 'secondary-function' && timeline(1)?.dataset.harmonyProfile === 'secondary-function' &&
  timeline(3)?.dataset.harmonyGroup === undefined && timeline(3)?.dataset.harmonyProfile === undefined &&
  !timeline(3)?.querySelector('.harmony-a11y'),
  [0, 1, 3].map((ei) => `${timeline(ei)?.dataset.harmonyGroup}/${timeline(ei)?.dataset.harmonyProfile}`).join(', '));
ok('лента содержит скрытое текстовое описание, а не полагается только на цвет',
  /Прикладная функция/.test(timeline(1)?.querySelector('.harmony-a11y')?.textContent || ''),
  timeline(1)?.querySelector('.harmony-a11y')?.textContent || '');

w.eval(`
  activeChordInput = document.querySelector('.chord-input[data-sec="41"][data-square="42"][data-ei="1"]');
  activeSectionKey = null;
  wheelMode = '7';
  drawWheel();
`);
const d7 = d.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"]');
ok('круг получает отдельную прикладную V/V для D7 в контексте следующего G',
  d7?.dataset.harmonyGroup === 'secondary-function', d7?.outerHTML || 'D7 sector absent');
ok('выбранный аккорд сохраняет сильный established selected marker',
  d7?.classList.contains('is-wheel-selected') && /\.wheel-sector\.is-wheel-selected/.test(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8')),
  d7?.className.baseVal || '');

w.eval('bindWheelHarmonyLegend(); document.getElementById("wheelHarmonyLegendToggle").click();');
const legend = d.getElementById('wheelHarmonyLegend');
const toggle = d.getElementById('wheelHarmonyLegendToggle');
const legendModes = [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
ok('кнопка ? открывает компактную палитру с изменениями ступеней и переключателями',
  !legend.hidden && toggle.getAttribute('aria-expanded') === 'true' && legendModes.length === 10 &&
  /Ионийский/.test(legend.textContent) && /Эолийский/.test(legend.textContent) &&
  /↑VII/.test(legend.textContent) && /↑VI/.test(legend.textContent) &&
  /Дорийский/.test(legend.textContent) && /↓II/.test(legend.textContent) &&
  /Лидийский/.test(legend.textContent) && /↓VII/.test(legend.textContent) &&
  /Локрийский/.test(legend.textContent) && /V\/x/.test(legend.textContent) &&
  legendModes.every((input) => input.checked) && !d.getElementById('wheelHarmonyLegendCurrent'),
  legend.textContent.replace(/\s+/g, ' ').trim());

w.eval('document.getElementById("showDegrees").checked = false; updateCellsDegrees();');
ok('выключенные «Ступени» выключают и расширенную гармоническую подсветку',
  !d.body.classList.contains('is-harmony-highlights-on') &&
  !d.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on') &&
  grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') === null,
  `${d.body.className} | ${grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label')}`);

w.eval('document.getElementById("wheelHarmonyLegendToggle").click();');
const legendNote = d.querySelector('.wheel-harmony-legend-note');
ok('при выключенной общей карте ? остаётся доступен и объясняет независимые переключатели',
  !legend.hidden && /Ступени и цвета круга/.test(legendNote?.textContent || '') &&
  /только круг/.test(legendNote?.textContent || '') &&
  toggle.getAttribute('aria-label') === 'Показать палитру ладов и настроек подсветки круга',
  `${toggle.getAttribute('aria-label')} | ${legendNote?.textContent}`);

w.eval(`
  globalKey = 'Am';
  document.getElementById('showDegrees').checked = true;
  sections = [{ id: 51, type: 'Verse', key: null, timeSig: '4/4', squares: [{ id: 52, events: [
    { chord: 'Am', span: 1 }, { chord: 'C', span: 1 }, { chord: 'D', span: 1 }, { chord: 'E', span: 1 }
  ] }]}];
  render();
`);
const minorGrid = (ei) => d.querySelector(`.chord-wrapper[data-sec="51"][data-square="52"][data-ei="${ei}"]`);
ok('Am–C–D–E раскрашивает эолийский, мелодический и гармонический минор раздельно',
  [0, 1, 2, 3].map((ei) => minorGrid(ei)?.dataset.harmonyProfile).join(',') ===
    'aeolian,aeolian,melodic-minor,harmonic-minor' &&
  /Гармонический минор/.test(minorGrid(3)?.querySelector('.chord-input')?.getAttribute('aria-label') || ''),
  [0, 1, 2, 3].map((ei) => minorGrid(ei)?.dataset.harmonyProfile).join(','));

const wheelPaletteIndependentOfOwner = w.eval(`(() => [0, 1, 2, 3].map((ei) => {
  activeChordInput = document.querySelector('.chord-input[data-sec="51"][data-square="52"][data-ei="' + ei + '"]');
  activeSectionKey = null;
  wheelMode = 'triads';
  drawWheel();
  return {
    legendCurrentAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
    paletteCount: document.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]').length,
    menuProfile: getBorrowingMenuProfile(activeChordInput.value, 'Am')?.modes.join(',') || '',
  };
}))()`);
ok('единая компактная палитра не превращается в анализ owner-аккорда',
  wheelPaletteIndependentOfOwner.every((item) => item.legendCurrentAbsent && item.paletteCount === 10) &&
  wheelPaletteIndependentOfOwner.map((item) => item.menuProfile).join('|') ===
    'aeolian,harmonic-minor,melodic-minor,dorian,phrygian|aeolian,dorian,phrygian|melodic-minor,dorian,mixolydian|harmonic-minor,melodic-minor,lydian',
  JSON.stringify(wheelPaletteIndependentOfOwner));

const strictWheelCandidates = w.eval(`(() => {
  const owner = document.querySelector('.chord-input[data-sec="51"][data-square="52"][data-ei="2"]');
  activeChordInput = owner;
  activeSectionKey = null;
  wheelMode = 'triads';
  drawWheel();
  const candidateFm = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
  const candidateE = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"]');
  // Это тот же маршрут, что и выбор Fm из круга: владельцу подставляется
  // Fm, а музыкальный контекст секции (следующий E) остаётся реальным.
  owner.value = 'Fm';
  drawWheel();
  const ownerFm = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
  return {
    candidateFm: candidateFm?.dataset.wheelModes || '',
    candidateFmAria: candidateFm?.getAttribute('aria-label') || '',
    candidateE: candidateE?.dataset.wheelModes || '',
    candidateEAria: candidateE?.getAttribute('aria-label') || '',
    ownerFm: ownerFm?.dataset.wheelModes || '',
    ownerSelected: ownerFm?.classList.contains('is-wheel-selected'),
    ownerLegendAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
  };
})()`);
ok('в Am Fm остаётся нейтральным и как кандидат, и как owner; E остаётся настоящим V гармонического минора',
  strictWheelCandidates.candidateFm === '' && strictWheelCandidates.ownerFm === '' &&
  strictWheelCandidates.candidateFmAria === '' &&
  strictWheelCandidates.ownerSelected && strictWheelCandidates.ownerLegendAbsent &&
  strictWheelCandidates.candidateE === 'harmonic-minor,melodic-minor,lydian' &&
  /гармонический минор/.test(strictWheelCandidates.candidateEAria),
  JSON.stringify(strictWheelCandidates));

const source = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
ok('сектора имеют контрастный fallback без color-mix и усиленное смешение в современных браузерах',
  /fill: var\(--harmony-profile-color, var\(--color-accent\)\);/.test(source) &&
  /@supports \(color: color-mix\(in srgb, red 50%, blue\)\)/.test(source) &&
  /var\(--wheel-segment-fill-out\) 58%/.test(source),
  'fallback + color-mix 58/42');

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 modal-profile UI');
process.exit(failures ? 1 : 0);
