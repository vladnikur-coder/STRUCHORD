#!/usr/bin/env node
/*
 * B-101 follow-up, 0.618: configurable readable chord-name preference.
 * The setting changes the display spelling, not key/harmony or pitch calculations.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 0);
    win.cancelAnimationFrame = (id) => win.clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {},
      fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', sampleRate: 44100, resume() {},
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, condition, details) {
  if (condition) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ` (${details})` : ''));
  }
}
const ev = (source) => w.eval(source);

try {
  check('по умолчанию включён прежний читаемый вариант', ev('isReadableChordNamesEnabled() === true'));
  check('настройка по умолчанию показывает B5, теоретический корень остаётся Cb5',
    ev('correctDisplayedChordName("B5", "flat", "Ebm")') === 'B5' &&
      ev('correctChordName("B5", "flat", "Ebm")') === 'Cb5');

  ev(`globalKey = 'Ebm';
    sections = [{ id: 1, key: null, squares: [{ id: 2, events: [{ chord: 'B5', span: 1 }] }] }];
    userFingerings.clear();
    userFingerings.set('B5|Ebm', [['x', 2, 4, 4, 'x', 'x']]);`);
  w.setReadableChordNamesEnabled(false);
  check('выключение возвращает теоретическое имя уже открытого аккорда',
    ev('sections[0].squares[0].events[0].chord') === 'Cb5' &&
      ev('userFingerings.has("Cb5|Ebm")') === true &&
      ev('userFingerings.has("B5|Ebm")') === false,
    `${ev('sections[0].squares[0].events[0].chord')} / ${ev('JSON.stringify([...userFingerings.keys()])')}`);
  check('выключенный пункт сохраняется, а общий нормализатор не подменяет имена',
    ev('localStorage.getItem("struchord-readable-chord-names")') === '0' &&
      ev('normalizeReadableChordName("Cb5/E#/B#/Fb")') === 'Cb5/E#/B#/Fb');
  check('теоретические гамма, ступень и высоты не меняются при выключенном правиле',
    ev('spellRootByDegree("B", "Ebm")') === 'Cb' &&
      ev('getScaleNotes("Ebm").includes("Cb4")') === true &&
      ev('getScaleDegree("B5", "Ebm")') === 'VI' &&
      ev('noteToFrequency("Cb4") === noteToFrequency("B3")') === true);

  w.setReadableChordNamesEnabled(true);
  check('повторное включение возвращает B5 и переносит аппликатуру обратно',
    ev('sections[0].squares[0].events[0].chord') === 'B5' &&
      ev('userFingerings.has("B5|Ebm")') === true &&
      ev('userFingerings.has("Cb5|Ebm")') === false &&
      ev('localStorage.getItem("struchord-readable-chord-names")') === '1');

  w.setReadableChordNamesEnabled(false);
  w.__legacyReadableSong = {
    globalKey: 'Ebm',
    sections: [{ squares: [{ events: [{ chord: 'B5', span: 1 }, { chord: 'A#7', span: 1 }] }] }],
    userFingerings: [['B5|Ebm', [['x', 2, 4, 4, 'x', 'x']]], ['Cb5|Ebm', [['x', 2, 4, 4, 'x', 'x']]]],
    preferredFingerings: [['B5|Ebm|1|2|0', 'x,2,4,4,x,x']],
  };
  ev('normalizeReadableSongChordNames(window.__legacyReadableSong)');
  check('импорт и экспорт при выключенном правиле используют теоретическое написание и переносят ключи',
    ev('window.__legacyReadableSong.sections[0].squares[0].events[0].chord') === 'Cb5' &&
      ev('window.__legacyReadableSong.userFingerings.length') === 1 &&
      ev('window.__legacyReadableSong.userFingerings[0][0]') === 'Cb5|Ebm' &&
      ev('window.__legacyReadableSong.preferredFingerings[0][0]') === 'Cb5|Ebm|1|2|0' &&
      ev('window.__legacyReadableSong.sections[0].squares[0].events[1].chord') === 'A#7',
    JSON.stringify(ev('window.__legacyReadableSong')));

  console.log(`\nB-101 configurable readable names: ${pass} passed, ${fail} failed`);
} catch (error) {
  fail++;
  console.error(error);
} finally {
  dom.window.close();
}
if (fail) process.exitCode = 1;
