#!/usr/bin/env node
// B-99 UI phase: keep V/x analysis/text semantics, major/minor wheel-entry
// defaults, distinct mode colors and the circle-only scope; preserve editor,
// timeline, selected markers and all manual choices outside entry profiles.
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
ok('редактор сохраняет классификацию V/x, а Bb остаётся без неподтверждённого профиля',
  grid(0)?.dataset.harmonyGroup === 'diatonic' && grid(0)?.dataset.harmonyProfile === 'ionian' &&
  grid(1)?.dataset.harmonyGroup === 'secondary-function' && grid(1)?.dataset.harmonyProfile === 'secondary-function' &&
  grid(3)?.dataset.harmonyGroup === undefined && grid(3)?.dataset.harmonyProfile === undefined &&
  grid(3)?.querySelector('.chord-input')?.getAttribute('aria-label') === null &&
  !grid(1)?.querySelector('.harmony-visible-label'),
  [0, 1, 3].map((ei) => `${grid(ei)?.dataset.harmonyGroup}/${grid(ei)?.dataset.harmonyProfile}`).join(', '));
ok('V/x остаётся доступен текстом без цветового маркера',
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
ok('круг сохраняет функциональную классификацию V/V для D7 → G без отдельного цветового режима',
  d7?.dataset.harmonyGroup === 'secondary-function' && /V\/V/.test(d7?.getAttribute('aria-label') || ''),
  d7?.getAttribute('aria-label') || d7?.outerHTML || 'D7 sector absent');
ok('выбранный аккорд сохраняет сильный established selected marker',
  d7?.classList.contains('is-wheel-selected') && /\.wheel-sector\.is-wheel-selected/.test(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8')),
  d7?.className.baseVal || '');

w.eval('bindWheelHarmonyLegend(); document.getElementById("wheelHarmonyLegendToggle").click();');
const legend = d.getElementById('wheelHarmonyLegend');
const toggle = d.getElementById('wheelHarmonyLegendToggle');
const legendModes = [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
const helpSurface = toggle.querySelector(':scope > .wheel-harmony-legend-toggle-surface');
ok('кнопка ? открывает компактную палитру с изменениями ступеней и переключателями',
  !legend.hidden && toggle.getAttribute('aria-expanded') === 'true' && legendModes.length === 9 &&
  /Ионийский/.test(legend.textContent) && /Эолийский/.test(legend.textContent) &&
  /♯VII/.test(legend.textContent) && /♯VI/.test(legend.textContent) &&
  /Дорийский/.test(legend.textContent) && /♭II/.test(legend.textContent) &&
  /Лидийский/.test(legend.textContent) && /♭VII/.test(legend.textContent) &&
  /Локрийский/.test(legend.textContent) && !/[↑↓]/.test(legend.textContent) && !/V\/x/.test(legend.textContent) &&
  legendModes.every((input) => input.checked) && !d.getElementById('wheelHarmonyLegendCurrent'),
  legend.textContent.replace(/\s+/g, ' ').trim());
ok('? floats on its own inner surface using the circle depth timing',
  helpSurface?.textContent === '?' && helpSurface.classList.contains('wheel-surface-stone') &&
  helpSurface.style.getPropertyValue('--wheel-surface-rise-delay') === '52ms' &&
  helpSurface.style.getPropertyValue('--wheel-surface-sink-delay') === '68ms' && toggle.getAttribute('aria-label') === 'Показать палитру ладов и настроек подсветки круга',
  `${helpSurface?.className} / ${helpSurface?.style.getPropertyValue('--wheel-surface-rise-delay')}`);
ok('secondary-function is not an enabled wheel scale-color mode, even if passed directly',
  w.eval('getEnabledWheelHarmonyModes(["secondary-function"]).length') === 0 &&
  w.eval('WHEEL_HARMONY_LEGEND_MODES.some(({ id }) => id === "secondary-function")') === false,
  'V/x analysis stays separate from the nine wheel scale colors');

w.eval('document.getElementById("showDegrees").checked = false; updateCellsDegrees();');
ok('выключенные «Ступени» выключают подсветку и скрывают кнопку ? вместе с палитрой',
  !d.body.classList.contains('is-harmony-highlights-on') &&
  !d.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on') &&
  grid(1)?.querySelector('.chord-input')?.getAttribute('aria-label') === null &&
  toggle.hidden && legend.hidden && toggle.getAttribute('aria-expanded') === 'false',
  `${d.body.className} | hidden=${toggle.hidden}, legend=${legend.hidden}`);
toggle.click();
ok('скрытая кнопка ? не открывает палитру', toggle.hidden && legend.hidden && toggle.getAttribute('aria-expanded') === 'false');

w.eval('document.getElementById("showDegrees").checked = true; updateCellsDegrees();');
ok('повторное включение «Ступени и цвета круга» возвращает кнопку ?', !toggle.hidden);
toggle.click();
ok('поясняющая строка удалена, палитра остаётся доступной',
  !legend.hidden && !d.querySelector('.wheel-harmony-legend-note') &&
  toggle.getAttribute('aria-label') === 'Показать палитру ладов и настроек подсветки круга');
w.eval('setWheelHarmonyLegendOpen(false);');

const minorDefaultModes = ['aeolian', 'dorian', 'phrygian', 'locrian', 'harmonic-minor', 'melodic-minor'];
w.eval(`${JSON.stringify(minorDefaultModes)}.forEach((mode) => setWheelHarmonyModeEnabled(mode, false));
` +
  "setWheelHarmonyModeEnabled('ionian', false); setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false);");
ok('ручное выключение сохраняет минорные, мажорные и ионийский флажки выключенными',
  minorDefaultModes.every((mode) => !w.isWheelHarmonyModeEnabled(mode)) &&
  !w.isWheelHarmonyModeEnabled('ionian') && !w.isWheelHarmonyModeEnabled('lydian') && !w.isWheelHarmonyModeEnabled('mixolydian'));
w.eval("DOM.rootKey.value = 'Am'; onKeyChange();");
const minorModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('при входе в минор включаются/сохраняются шесть минорных ладов, но не Ионийский и не мажорная пара',
  minorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode) && !minorModesSaved.includes(mode)) &&
  !w.isWheelHarmonyModeEnabled('ionian') && !w.isWheelHarmonyModeEnabled('lydian') &&
  !w.isWheelHarmonyModeEnabled('mixolydian') &&
  ['ionian', 'lydian', 'mixolydian'].every((mode) => minorModesSaved.includes(mode)),
  JSON.stringify({ enabledMinor: minorDefaultModes, savedDisabled: minorModesSaved }));
w.eval(`${JSON.stringify(minorDefaultModes)}.forEach((mode) => setWheelHarmonyModeEnabled(mode, false)); enableWheelHarmonyModesOnTransition('Am', 'Em');`);
ok('смена минорного корня не сбрасывает ручное выключение минорных профилей',
  minorDefaultModes.every((mode) => !w.isWheelHarmonyModeEnabled(mode)));
w.eval("DOM.rootKey.value = 'C'; onKeyChange();");
const lydianToggle = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="lydian"]');
const mixolydianToggle = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="mixolydian"]');
const majorModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('переход из минора в мажор включает/сохраняет Лидийский + Миксолидийский, не меняя прочие флажки',
  w.isWheelHarmonyModeEnabled('lydian') && w.isWheelHarmonyModeEnabled('mixolydian') &&
  lydianToggle?.checked && mixolydianToggle?.checked &&
  !w.isWheelHarmonyModeEnabled('ionian') && !w.isWheelHarmonyModeEnabled('aeolian') &&
  majorModesSaved.includes('ionian') && majorModesSaved.includes('aeolian') &&
  !majorModesSaved.includes('lydian') && !majorModesSaved.includes('mixolydian'),
  JSON.stringify({ checked: [lydianToggle?.checked, mixolydianToggle?.checked], savedDisabled: majorModesSaved }));
w.eval("setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false); DOM.rootKey.value = 'Am'; onKeyChange();");
ok('повторный вход в минор снова включает все шесть ладов, не меняя мажорную пару',
  minorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  !w.isWheelHarmonyModeEnabled('lydian') && !w.isWheelHarmonyModeEnabled('mixolydian'));
w.eval("DOM.rootKey.value = 'G'; onKeyChange();");
ok('повторный вход в мажор снова включает оба мажорных профиля',
  w.isWheelHarmonyModeEnabled('lydian') && w.isWheelHarmonyModeEnabled('mixolydian'));
w.eval("setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false); globalKey = 'Am'; DOM.rootKey.value = 'Am'; sections[0].key = 'Am'; activeSectionKey = 'Am';");
w.eval("DOM.rootKey.value = 'C'; onKeyChange();");
ok('смена общей тональности не включает мажорные флажки, пока активная секция остаётся в миноре',
  w.eval("globalKey === 'C'") && !w.isWheelHarmonyModeEnabled('lydian') && !w.isWheelHarmonyModeEnabled('mixolydian'),
  w.eval('JSON.stringify({ key: globalKey, sectionKey: sections[0]?.key, activeSectionKey, disabled: [...wheelHarmonyDisabledModes] })'));
w.eval('setSectionKey(41, null);');
ok('переход активной секции с минорной модуляции на общий мажор включает оба мажорных лада',
  w.isWheelHarmonyModeEnabled('lydian') && w.isWheelHarmonyModeEnabled('mixolydian'));

w.eval(`
  globalKey = 'Am';
  DOM.rootKey.value = 'Am';
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
  wheelPaletteIndependentOfOwner.every((item) => item.legendCurrentAbsent && item.paletteCount === 9) &&
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
  /E: ступень V в Am/.test(strictWheelCandidates.candidateEAria) &&
  /Гармонический минор/.test(strictWheelCandidates.candidateEAria),
  JSON.stringify(strictWheelCandidates));

const source = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
ok('сектора имеют контрастный fallback без color-mix и усиленное смешение в современных браузерах',
  /fill: var\(--harmony-profile-color, var\(--color-accent\)\);/.test(source) &&
  /@supports \(color: color-mix\(in srgb, red 50%, blue\)\)/.test(source) &&
  /var\(--wheel-segment-fill-out\) 58%/.test(source),
  'fallback + color-mix 58/42');

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 modal-profile UI');
process.exit(failures ? 1 : 0);
