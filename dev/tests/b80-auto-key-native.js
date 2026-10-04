#!/usr/bin/env node
// B-80 follow-up: native #rootKey remains the source of truth in Auto mode, while the
// editor and timeline pills must immediately mirror its dynamic "X (авто)"
// option after a committed model refresh. No full render is allowed as the
// adapter is also used by incremental B-25 commit paths.
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
      font: '', measureText: () => ({ width: 10 }),
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

let failed = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failed += 1;
}

const d = w.document;
const state = () => ({
  globalKey: w.eval('globalKey'),
  rootValue: d.getElementById('rootKey').value,
  rootAuto: d.getElementById('autoKeyOption').textContent.trim(),
  editorPill: d.getElementById('keyPillName').textContent.trim(),
  timelineValue: d.getElementById('tlRootKey').value,
  timelineAuto: d.querySelector('#tlRootKey option[value="auto"]')?.textContent.trim(),
  timelinePill: d.getElementById('tlKeyPillName').textContent.trim(),
});

w.eval(`
  sections = [];
  globalTimeSig = '4/4';
  globalKey = 'C';
  keyMode = 'auto';
  autoDetectedKey = null;
  DOM.rootKey.value = 'auto';
  timelineMode = true;
  refreshAutoDetectedKey();
  updateAutoKeyBadge();
  syncTimelineSongBar();
`);
const emptyAutoState = state();
ok('empty auto mode stays unresolved instead of displaying fallback C',
  emptyAutoState.rootValue === 'auto' && emptyAutoState.timelineValue === 'auto' &&
  emptyAutoState.rootAuto === 'Автоматически' && emptyAutoState.editorPill === 'Автоматически' &&
  emptyAutoState.timelineAuto === 'Автоматически' && emptyAutoState.timelinePill === 'Автоматически' &&
  w.eval('autoDetectedKey === null && getEffectiveKey() === null && getEffectiveKeyForCurrentPosition() === null && detectKeyFromChords() === null'),
  JSON.stringify(emptyAutoState));

w.eval(`
  sections = [];
  globalKey = 'C';
  keyMode = 'auto';
  autoDetectedKey = null;
  DOM.rootKey.value = 'auto';
  addSection('Verse');
  render();
  activeChordInput = document.querySelector('.chord-input');
  activeChordInput.value = 'G';
  saveCurrentChord();
`);
const firstChordAutoState = w.eval(`({
  chord: sections[0]?.squares[0]?.events[0]?.chord,
  detectedKey: autoDetectedKey,
  effectiveKey: getEffectiveKey(),
  rootLabel: document.getElementById('autoKeyOption').textContent.trim(),
})`);
ok('the first chord is not Nashville-converted through the unresolved fallback C',
  firstChordAutoState.chord === 'G' && !!firstChordAutoState.detectedKey &&
  firstChordAutoState.effectiveKey === firstChordAutoState.detectedKey &&
  firstChordAutoState.rootLabel === `${firstChordAutoState.detectedKey} (авто)`,
  JSON.stringify(firstChordAutoState));

w.eval(`
  sections = [];
  globalTimeSig = '4/4';
  addSection('Verse');
  sections[0].squares[0].events[0].chord = 'C';
  globalKey = 'G';
  keyMode = 'auto';
  autoDetectedKey = null;
  DOM.rootKey.value = 'auto';
  timelineMode = true;
  syncTimelineSongBar();
  refreshAutoDetectedKey();
`);

let current = state();
ok('авто-режим сохраняет нативное значение auto', current.rootValue === 'auto' && current.timelineValue === 'auto', JSON.stringify(current));
ok('первый авто-ключ сразу виден в пилюлях редактора и ленты',
  current.globalKey === 'C' && current.rootAuto === 'C (авто)' && current.editorPill === 'C (авто)' &&
  current.timelineAuto === 'C (авто)' && current.timelinePill === 'C (авто)', JSON.stringify(current));

// Simulate the shared committed-model refresh used by sector choice/manual
// commit: the detector changes C -> D but no render() is invoked here.
w.eval(`
  sections[0].squares[0].events[0].chord = 'D';
  refreshAutoDetectedKey();
`);
current = state();
ok('изменённый ключ сразу синхронизирует editor + timeline без полного render',
  current.globalKey === 'D' && current.rootAuto === 'D (авто)' && current.editorPill === 'D (авто)' &&
  current.timelineAuto === 'D (авто)' && current.timelinePill === 'D (авто)', JSON.stringify(current));

w.eval(`
  sections[0].squares[0].events[0].chord = '';
  refreshAutoDetectedKey();
`);
current = state();
ok('после удаления последнего аккорда авто-тональность снова не определена',
  current.globalKey === 'D' && current.rootValue === 'auto' && current.timelineValue === 'auto' &&
  current.rootAuto === 'Автоматически' && current.editorPill === 'Автоматически' &&
  current.timelineAuto === 'Автоматически' && current.timelinePill === 'Автоматически' &&
  w.eval('autoDetectedKey === null && getEffectiveKey() === null && getEffectiveKeyForCurrentPosition() === null'), JSON.stringify(current));

// The dropdowns are built from the same native source only when opened; this
// catches stale cloned option text after the adapter has synchronised it.
w.eval(`toggleMetaPicker('key', true);`);
ok('список редактора получает актуальный auto-label при открытии',
  d.querySelector('#keyPickerList .meta-pill-item[data-value="auto"]')?.textContent.trim() === 'Автоматически');
w.eval(`toggleMetaPicker('tlKey', true);`);
ok('список ленты получает тот же актуальный auto-label при открытии',
  d.querySelector('#tlKeyPickerList .meta-pill-item[data-value="auto"]')?.textContent.trim() === 'Автоматически');

console.log(failed ? `\n${failed} FAIL` : '\nALL OK — B-80 native auto-key presentation');
process.exit(failed ? 1 : 0);
