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
const legendModeOrder = () => [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')]
  .map((input) => input.dataset.wheelHarmonyMode).join(',');
const majorDefaultModes = ['ionian'];
const allWheelModes = ['ionian', 'aeolian', 'harmonic-minor', 'melodic-minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
w.eval(`
  globalKey = 'C';
  keyMode = 'auto';
  autoDetectedKey = null;
  activeChordInput = null;
  activeSectionKey = null;
  sections = [];
  wheelMode = '7';
  document.getElementById('showDegrees').checked = true;
  localStorage.removeItem('struchord-wheel-harmony-visibility-v1');
  wheelHarmonyModeVisibilityLoaded = false;
  wheelHarmonyDisabledModes = new Set();
  drawWheel();
  bindWheelHarmonyLegend();
`);
const noKeyState = w.eval(`(() => {
  const inputs = [...document.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
  const coloredProfiles = [...DOM.circleSvg.querySelectorAll('[data-harmony-profile]')]
    .filter((node) => WHEEL_HARMONY_MODE_IDS.has(node.dataset.harmonyProfile));
  return {
    key: getActiveWheelHarmonyEffectiveKey(),
    effectiveKey: getEffectiveKey(),
    detectedKey: autoDetectedKey,
    baseDiatonicCount: DOM.circleSvg.querySelectorAll('.wheel-sector[data-wheel-diatonic="true"]').length,
    visibilityLoaded: wheelHarmonyModeVisibilityLoaded,
    enabledCheckboxes: inputs.filter((input) => input.checked).length,
    disabledCheckboxes: inputs.filter((input) => input.disabled).length,
    unmutedProfiles: coloredProfiles.filter((node) => !node.classList.contains('wheel-harmony-mode-muted')).length,
    paneGroups: DOM.circleSvg.querySelectorAll('.wheel-mode-diagram').length,
    stored: localStorage.getItem('struchord-wheel-harmony-visibility-v1'),
  };
})()`);
ok('без выбранной тональности авто-режим не определяет C и не даёт базовую подсветку',
  noKeyState.key === null && noKeyState.effectiveKey === null && noKeyState.detectedKey === null &&
  noKeyState.baseDiatonicCount === 0 && !noKeyState.visibilityLoaded && noKeyState.enabledCheckboxes === 0 &&
  noKeyState.disabledCheckboxes === 9 && noKeyState.unmutedProfiles === 0 &&
  noKeyState.paneGroups === 0 && noKeyState.stored === null, JSON.stringify(noKeyState));
w.eval("DOM.rootKey.value = 'C'; onKeyChange();");
const firstKeyModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('первый выбранный мажор применяет только Ionian (Натуральный мажор)',
  majorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && firstKeyModesSaved.includes(mode)) &&
  majorDefaultModes.every((mode) => !firstKeyModesSaved.includes(mode)),
  JSON.stringify({ enabled: majorDefaultModes, savedDisabled: firstKeyModesSaved }));
const majorLegendOrder = legendModeOrder();
ok('легенда ? переставляет существующие флажки в контекстный мажорный порядок',
  majorLegendOrder === w.eval('getWheelHarmonyModeOrderForKey("C").join(",")') &&
  majorLegendOrder.startsWith('ionian,mixolydian,lydian,aeolian'), majorLegendOrder);
const legendCheckboxesBeforeMinorTransition = [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
const previousMajorDefaults = ['ionian', 'lydian', 'mixolydian'];
const previousMajorDisabled = allWheelModes.filter((mode) => !previousMajorDefaults.includes(mode));
w.localStorage.setItem('struchord-wheel-harmony-visibility-v1', JSON.stringify(previousMajorDisabled));
w.eval(`
  wheelHarmonyModeVisibilityLoaded = false;
  wheelHarmonyDisabledModes = new Set();
  keyMode = 'manual';
  globalKey = 'C';
  autoDetectedKey = null;
  activeChordInput = null;
  activeSectionKey = null;
  sections = [];
`);
const migratedMajorEnabled = allWheelModes.filter((mode) => w.isWheelHarmonyModeEnabled(mode));
const migratedMajorDisabled = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('обновление заменяет прежний сохранённый набор defaults мажора новым точным набором',
  migratedMajorEnabled.sort().join(',') === [...majorDefaultModes].sort().join(',') &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && migratedMajorDisabled.includes(mode)),
  JSON.stringify({ enabled: majorDefaultModes, savedDisabled: migratedMajorDisabled }));
w.eval(`
  localStorage.removeItem('struchord-wheel-harmony-visibility-v1');
  wheelHarmonyModeVisibilityLoaded = false;
  wheelHarmonyDisabledModes = new Set();
  keyMode = 'auto';
  globalKey = 'C';
  autoDetectedKey = null;
  activeChordInput = null;
  activeSectionKey = null;
  sections = [{ id: 30, type: 'Verse', key: null, timeSig: '4/4', squares: [{
    id: 31, events: [{ chord: 'C', span: 1 }]
  }]}];
  refreshAutoDetectedKey();
`);
const firstAutoModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('первый автоопределённый ключ включает только Ionian, даже если совпал с fallback C',
  w.eval('autoDetectedKey') === 'C' &&
  majorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && firstAutoModesSaved.includes(mode)),
  JSON.stringify({ key: w.eval('autoDetectedKey'), savedDisabled: firstAutoModesSaved }));
w.eval(`
  localStorage.removeItem('struchord-wheel-harmony-visibility-v1');
  wheelHarmonyModeVisibilityLoaded = false;
  wheelHarmonyDisabledModes = new Set();
  keyMode = 'manual';
  globalKey = 'Am';
  autoDetectedKey = null;
  activeChordInput = null;
  activeSectionKey = null;
  sections = [];
`);
const firstMinorDefaultModes = ['aeolian', 'harmonic-minor'];
const firstMinorEnabled = firstMinorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode));
const firstMinorModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('первый выбранный минор включает только натуральный и гармонический минор',
  firstMinorEnabled &&
  allWheelModes.filter((mode) => !firstMinorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && firstMinorModesSaved.includes(mode)) &&
  firstMinorDefaultModes.every((mode) => !firstMinorModesSaved.includes(mode)),
  JSON.stringify({ enabled: firstMinorDefaultModes, savedDisabled: firstMinorModesSaved }));
const previousMinorDefaults = ['aeolian', 'dorian', 'phrygian', 'locrian', 'harmonic-minor', 'melodic-minor'];
const previousMinorDisabled = allWheelModes.filter((mode) => !previousMinorDefaults.includes(mode));
w.localStorage.setItem('struchord-wheel-harmony-visibility-v1', JSON.stringify(previousMinorDisabled));
w.eval(`
  wheelHarmonyModeVisibilityLoaded = false;
  wheelHarmonyDisabledModes = new Set();
  keyMode = 'manual';
  globalKey = 'Am';
  autoDetectedKey = null;
  activeChordInput = null;
  activeSectionKey = null;
  sections = [];
`);
const migratedMinorEnabled = allWheelModes.filter((mode) => w.isWheelHarmonyModeEnabled(mode));
const migratedMinorDisabled = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('обновление заменяет прежний сохранённый набор defaults минора натуральным и гармоническим минором',
  migratedMinorEnabled.sort().join(',') === [...firstMinorDefaultModes].sort().join(',') &&
  allWheelModes.filter((mode) => !firstMinorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && migratedMinorDisabled.includes(mode)),
  JSON.stringify({ enabled: firstMinorDefaultModes, savedDisabled: migratedMinorDisabled }));
const customDisabledModes = ['dorian', 'mixolydian'];
w.localStorage.setItem('struchord-wheel-harmony-visibility-v1', JSON.stringify(customDisabledModes));
w.eval('wheelHarmonyModeVisibilityLoaded = false; wheelHarmonyDisabledModes = new Set();');
const customModeStatePreserved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('обновление сохраняет пользовательский набор ладов, отличный от прежних defaults',
  customDisabledModes.every((mode) => !w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !customDisabledModes.includes(mode)).every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  customModeStatePreserved.sort().join(',') === [...customDisabledModes].sort().join(','),
  JSON.stringify({ disabled: customModeStatePreserved }));
w.eval(`DOM.rootKey.value = 'C'; onKeyChange();`);
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

const sectionSnapshotForDegree = JSON.parse(w.eval('JSON.stringify(sections.find((item) => item.id === 41))'));
w.eval(`
  sections = [{ id: 41, type: 'Verse', key: 'D', timeSig: '4/4', squares: [{
    id: 42, events: [{ chord: 'F', span: 1 }]
  }]}];
  render();
`);
const neutralEditorF = grid(0);
ok('редактор согласует F в D с круговым ♭III, не окрашивая неподтверждённый заимствованный аккорд',
  neutralEditorF?.querySelector('.degree-hint')?.textContent === '♭III' &&
  !neutralEditorF?.dataset.harmonyGroup && !neutralEditorF?.dataset.harmonyProfile &&
  !neutralEditorF?.querySelector('.chord-input')?.getAttribute('aria-label'),
  `${neutralEditorF?.querySelector('.degree-hint')?.textContent || '—'} / ${neutralEditorF?.dataset.harmonyProfile || 'нейтрально'}`);
const sharpKeyDegreeCases = [
  ['E', 'D', '♭VII'], ['B', 'A', '♭VII'], ['F#', 'E', '♭VII'], ['C#', 'B', '♭VII'],
];
const sharpKeyCellDegrees = sharpKeyDegreeCases.map(([key, chord]) => {
  w.eval(`sections = [{ id: 41, type: 'Verse', key: ${JSON.stringify(key)}, timeSig: '4/4', squares: [{
    id: 42, events: [{ chord: ${JSON.stringify(chord)}, span: 1 }]
  }]}]; render();`);
  const cell = grid(0);
  return {
    key,
    chord,
    degree: cell?.querySelector('.degree-hint')?.textContent || '',
    profile: cell?.dataset.harmonyProfile || '',
  };
});
ok('редактор показывает ♭VII, а не ♯VI, в тональностях с диезами и сохраняет неподтверждённый аккорд нейтральным',
  sharpKeyCellDegrees.every(({ degree, profile }) => degree === '♭VII' && !profile),
  JSON.stringify(sharpKeyCellDegrees));
w.eval(`sections = [${JSON.stringify(sectionSnapshotForDegree)}]; render();`);

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
ok('кнопка ? открывает компактную палитру с изменениями ступеней и объяснениями натуральных ладов',
  !legend.hidden && toggle.getAttribute('aria-expanded') === 'true' && legendModes.length === 9 &&
  /Ионийский/.test(legend.textContent) && /Натуральный мажор/.test(legend.textContent) &&
  /Эолийский/.test(legend.textContent) && /Натуральный минор/.test(legend.textContent) &&
  /Натуральный мажор/.test(d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="ionian"]')?.getAttribute('aria-label') || '') &&
  /Натуральный минор/.test(d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="aeolian"]')?.getAttribute('aria-label') || '') &&
  /♯VII/.test(legend.textContent) && /♯VI/.test(legend.textContent) &&
  /Дорийский/.test(legend.textContent) && /♭II/.test(legend.textContent) &&
  /Лидийский/.test(legend.textContent) && /♭VII/.test(legend.textContent) &&
  /Локрийский/.test(legend.textContent) && !/[↑↓]/.test(legend.textContent) && !/V\/x/.test(legend.textContent) &&
  legendModes.every((input) => input.checked === majorDefaultModes.includes(input.dataset.wheelHarmonyMode)) &&
  !legendModes.some((input) => input.disabled) && !d.getElementById('wheelHarmonyLegendCurrent'),
  legend.textContent.replace(/\s+/g, ' ').trim());
const naturalMajorLabel = w.eval('getHarmonyModeLabel("ionian")');
const naturalMinorLabel = w.eval('getHarmonyModeLabel("aeolian")');
ok('текстовые описания ладов называют Ионийский натуральным мажором, а Эолийский — натуральным минором',
  naturalMajorLabel === 'Ионийский (Натуральный мажор)' &&
  naturalMinorLabel === 'Эолийский (Натуральный минор)',
  `${naturalMajorLabel} / ${naturalMinorLabel}`);
const ionianLegendCheckbox = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="ionian"]');
w.eval("globalKey = 'Am'; applyWheelHarmonyModeVisibility();");
const minorIonianChange = ionianLegendCheckbox?.closest('.wheel-harmony-mode-option')
  ?.querySelector('.wheel-harmony-mode-change')?.textContent || '';
const minorIonianAria = ionianLegendCheckbox?.getAttribute('aria-label') || '';
const minorLegendOrderAfterIonianUpdate = legendModeOrder();
w.eval("globalKey = 'C'; applyWheelHarmonyModeVisibility();");
const majorIonianChange = ionianLegendCheckbox?.closest('.wheel-harmony-mode-option')
  ?.querySelector('.wheel-harmony-mode-change')?.textContent || '';
ok('Ionian legend details update by key: natural major in minor, natural-major alias in major',
  minorIonianChange === 'Натуральный мажор · ♯III · ♯VI · ♯VII от нат. минора' &&
  /Натуральный мажор · ♯III · ♯VI · ♯VII от нат\. минора/.test(minorIonianAria) &&
  minorLegendOrderAfterIonianUpdate.startsWith('aeolian,harmonic-minor') &&
  majorIonianChange === 'Натуральный мажор · без альтераций' &&
  d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="ionian"]') === ionianLegendCheckbox,
  JSON.stringify({ minorIonianChange, minorIonianAria, minorLegendOrder: minorLegendOrderAfterIonianUpdate, majorIonianChange }));
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

const minorDefaultModes = ['aeolian', 'harmonic-minor'];
w.eval(`${JSON.stringify(minorDefaultModes)}.forEach((mode) => setWheelHarmonyModeEnabled(mode, false));
` +
  "setWheelHarmonyModeEnabled('ionian', false); setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false);");
ok('ручные выключения сохраняются до перехода в другую тональность',
  minorDefaultModes.every((mode) => !w.isWheelHarmonyModeEnabled(mode)) &&
  !w.isWheelHarmonyModeEnabled('ionian') && !w.isWheelHarmonyModeEnabled('lydian') && !w.isWheelHarmonyModeEnabled('mixolydian'));
w.eval("DOM.rootKey.value = 'Am'; onKeyChange();");
const minorLegendOrder = legendModeOrder();
const legendCheckboxNodesPreserved = legendCheckboxesBeforeMinorTransition.every((input) =>
  d.querySelector(`#wheelHarmonyModeList [data-wheel-harmony-mode="${input.dataset.wheelHarmonyMode}"]`) === input);
ok('легенда ? при смене тональности переставляет существующие флажки без пересоздания',
  minorLegendOrder === w.eval('getWheelHarmonyModeOrderForKey("Am").join(",")') &&
  minorLegendOrder.startsWith('aeolian,harmonic-minor,dorian,melodic-minor') && legendCheckboxNodesPreserved,
  JSON.stringify({ order: minorLegendOrder, sameNodes: legendCheckboxNodesPreserved }));
const minorModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('при входе в минор включаются только натуральный и гармонический минор',
  minorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode) && !minorModesSaved.includes(mode)) &&
  !w.isWheelHarmonyModeEnabled('ionian') && !w.isWheelHarmonyModeEnabled('lydian') &&
  !w.isWheelHarmonyModeEnabled('mixolydian') &&
  ['ionian', 'lydian', 'mixolydian'].every((mode) => minorModesSaved.includes(mode)),
  JSON.stringify({ enabledMinor: minorDefaultModes, savedDisabled: minorModesSaved }));
w.eval(`${JSON.stringify(minorDefaultModes)}.forEach((mode) => setWheelHarmonyModeEnabled(mode, false)); enableWheelHarmonyModesOnTransition('Am', 'Em');`);
ok('смена минорного корня не сбрасывает ручное выключение минорных профилей',
  minorDefaultModes.every((mode) => !w.isWheelHarmonyModeEnabled(mode)));
w.eval("DOM.rootKey.value = 'C'; onKeyChange();");
const majorModesSaved = JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]');
ok('переход из минора в мажор включает только Ionian (Натуральный мажор)',
  majorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) =>
    !w.isWheelHarmonyModeEnabled(mode) && majorModesSaved.includes(mode)) &&
  majorDefaultModes.every((mode) => !majorModesSaved.includes(mode)),
  JSON.stringify({ checked: majorDefaultModes, savedDisabled: majorModesSaved }));
w.eval("setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false); DOM.rootKey.value = 'Am'; onKeyChange();");
ok('повторный вход в минор включает только натуральный и гармонический минор',
  minorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !minorDefaultModes.includes(mode)).every((mode) => !w.isWheelHarmonyModeEnabled(mode)));
w.eval("DOM.rootKey.value = 'G'; onKeyChange();");
ok('повторный вход в мажор включает только натуральный мажор',
  majorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) => !w.isWheelHarmonyModeEnabled(mode)));
w.eval("setWheelHarmonyModeEnabled('lydian', false); setWheelHarmonyModeEnabled('mixolydian', false); globalKey = 'Am'; DOM.rootKey.value = 'Am'; sections[0].key = 'Am'; activeSectionKey = 'Am';");
w.eval("DOM.rootKey.value = 'C'; onKeyChange();");
ok('смена общей тональности не включает мажорные флажки, пока активная секция остаётся в миноре',
  w.eval("globalKey === 'C'") && !w.isWheelHarmonyModeEnabled('lydian') && !w.isWheelHarmonyModeEnabled('mixolydian'),
  w.eval('JSON.stringify({ key: globalKey, sectionKey: sections[0]?.key, activeSectionKey, disabled: [...wheelHarmonyDisabledModes] })'));
w.eval('setSectionKey(41, null);');
ok('переход активной секции на общий мажор устанавливает точный мажорный набор',
  majorDefaultModes.every((mode) => w.isWheelHarmonyModeEnabled(mode)) &&
  allWheelModes.filter((mode) => !majorDefaultModes.includes(mode)).every((mode) => !w.isWheelHarmonyModeEnabled(mode)));

w.eval(`
  globalKey = 'Am';
  keyMode = 'manual';
  DOM.rootKey.value = 'Am';
  enableWheelHarmonyModesOnTransition('C', 'Am');
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
    'aeolian,harmonic-minor,melodic-minor,dorian,phrygian|aeolian,dorian,phrygian|ionian,melodic-minor,dorian,mixolydian|ionian,harmonic-minor,melodic-minor,lydian',
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
    candidateFmDegree: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Fm"] .wheel-degree-label')?.textContent || '',
    candidateFmProfile: candidateFm?.dataset.harmonyProfile || '',
    candidateFmBadge: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Fm"] .wheel-outside-orbit-label')?.textContent || '',
    candidateE: candidateE?.dataset.wheelModes || '',
    candidateEAria: candidateE?.getAttribute('aria-label') || '',
    ownerFm: ownerFm?.dataset.wheelModes || '',
    ownerSelected: ownerFm?.classList.contains('is-wheel-selected'),
    ownerLegendAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
  };
})()`);
ok('в Am Fm без подходящего профиля не получает поясняющий текст/ступень; выбранный owner сохраняется',
  strictWheelCandidates.candidateFm === '' && strictWheelCandidates.ownerFm === '' &&
  strictWheelCandidates.candidateFmProfile === '' && strictWheelCandidates.candidateFmAria === '' &&
  strictWheelCandidates.candidateFmDegree === '' && strictWheelCandidates.candidateFmBadge === '' &&
  strictWheelCandidates.ownerSelected && strictWheelCandidates.ownerLegendAbsent &&
  strictWheelCandidates.candidateE === 'ionian,harmonic-minor,melodic-minor,lydian' &&
  /E: ступень V в Am/.test(strictWheelCandidates.candidateEAria) &&
  /Гармонический минор/.test(strictWheelCandidates.candidateEAria) &&
  !/Мелодический минор|Лидийский/.test(strictWheelCandidates.candidateEAria),
  JSON.stringify(strictWheelCandidates));

w.eval(`
  globalKey = 'C'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
  wheelMode = 'triads'; wheelHarmonyModeVisibilityLoaded = true;
  wheelHarmonyDisabledModes = new Set();
  document.getElementById('showDegrees').checked = true;
  drawWheel();
`);
const functionLabel = (identity) => d.querySelector(
  `#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-secondary-function-label`
)?.textContent || '';
const functionData = (identity) => d.querySelector(
  `#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"]`
)?.dataset.wheelSecondaryFunction || '';
const visibleDegree = (identity) => d.querySelector(
  `#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-degree-label`
)?.textContent || '';
const secondaryCircleCandidates = ['A', 'E', 'B', 'D'].map((identity) => {
  const node = d.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"]`);
  return {
    chord: identity,
    function: node?.dataset.wheelSecondaryFunction || '',
    modes: node?.dataset.wheelModes || '',
    harmonyProfile: node?.dataset.harmonyProfile || '',
    degree: visibleDegree(identity),
    label: functionLabel(identity),
    aria: node?.getAttribute('aria-label') || '',
  };
});
ok('secondaryFunction остаётся в данных и tooltip, но сектор показывает только ступень',
  secondaryCircleCandidates.map(({ function: candidateFunction }) => candidateFunction).join(',') ===
    'V/ii,V/vi,V/iii,V/V' &&
  secondaryCircleCandidates.every(({ label }) => label === '') &&
  secondaryCircleCandidates.slice(0, 3).every(({ modes, harmonyProfile, degree, aria }) =>
    !modes && !harmonyProfile && degree === '' && /возможная вторичная доминанта/i.test(aria)) &&
  secondaryCircleCandidates[3].modes.includes('lydian') &&
  !secondaryCircleCandidates[3].harmonyProfile && secondaryCircleCandidates[3].degree === 'II',
  JSON.stringify(secondaryCircleCandidates));
w.eval(`wheelHarmonyDisabledModes = new Set(${JSON.stringify(allWheelModes)}); drawWheel();`);
const allModeColorsOffDegrees = {
  base: visibleDegree('C'),
  possibleFunction: visibleDegree('D'),
  functionLabel: functionLabel('D'),
  functionData: functionData('D'),
  outside: visibleDegree('F#m'),
  outsideAria: d.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="F#m"]')?.getAttribute('aria-label') || '',
};
ok('базовая I остаётся; II скрыта, данные V/V сохранены без sector-label, неразобранный аккорд без ступени',
  allModeColorsOffDegrees.base === 'I' && allModeColorsOffDegrees.possibleFunction === '' &&
  allModeColorsOffDegrees.functionLabel === '' && allModeColorsOffDegrees.functionData === 'V/V' &&
  allModeColorsOffDegrees.outside === '' &&
  allModeColorsOffDegrees.outsideAria === '', JSON.stringify(allModeColorsOffDegrees));
const unprofiledCircleFsm = d.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="F#m"]');
ok('F#m без модального профиля остаётся без дополнительного цвета, ступени и поясняющей метки',
  !unprofiledCircleFsm?.dataset.harmonyProfile && !visibleDegree('F#m') &&
  !unprofiledCircleFsm?.getAttribute('aria-label') &&
  !d.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="F#m"] .wheel-outside-orbit-label'),
  `${visibleDegree('F#m') || 'без ступени'} / ${unprofiledCircleFsm?.getAttribute('aria-label') || 'без ARIA-пояснения'}`);

const source = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
ok('ячейки редактора получают 13/15% профильную заливку без левой цветной рейки',
  /--harmony-cell-neutral-mix:\s*87%/.test(source) &&
  /--harmony-cell-profile-mix:\s*13%/.test(source) &&
  /--harmony-cell-neutral-mix:\s*85%/.test(source) &&
  /--harmony-cell-profile-mix:\s*15%/.test(source) &&
  /#sectionsContainer\.is-degrees-on \.chord-wrapper\[data-harmony-profile\]:not\(\[data-harmony-profile='secondary-function'\]\):not\(\.playback-active\)\s*\{[\s\S]*?background-color:\s*color-mix\(/.test(source) &&
  /#sectionsContainer\.is-degrees-on \.chord-wrapper\[data-harmony-profile\]:not\(\[data-harmony-profile='secondary-function'\]\):not\(\.playback-active\):hover/.test(source) &&
  !/#sectionsContainer\.is-degrees-on \.chord-wrapper\[data-harmony-profile\][^\n]*::before/.test(source),
  'light: 13%, dark: 15%, fill-only; playback state preserved');
ok('сектора имеют контрастный fallback без color-mix и усиленное смешение в современных браузерах',
  /fill: var\(--harmony-profile-color, var\(--color-accent\)\);/.test(source) &&
  /@supports \(color: color-mix\(in srgb, red 50%, blue\)\)/.test(source) &&
  /var\(--wheel-segment-fill-out\) 58%/.test(source),
  'fallback + color-mix 58/42');

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 modal-profile UI');
process.exit(failures ? 1 : 0);
