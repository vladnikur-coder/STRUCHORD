#!/usr/bin/env node
/* B-12.12 «Таб-вставка» E1: модель, рендер мини-таба, звук.
 * Проверяем: addTabInsert создаёт квадрат типа 'tab' с полями beats/notes/customBeats;
 * рендер квадрата содержит .tab-insert; playTabNote не выбрасывает ошибку.
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
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, condition, details) {
  if (condition) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' — ' + details : '')); }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(test, label, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (test()) return true;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function baseSong() {
  return {
    schemaVersion: 6,
    metadata: { artist: 'Тест', title: 'Таб-вставка' },
    bpm: 100, globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
    tuning: 'e-std', tuningNotes: null, notes: '', date: '2026-10-14',
    sections: [{
      id: 1, type: 'Verse', customName: null, note: null, key: null, shift: null,
      timeSig: '4/4', bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 101, repeat: 1, customBeats: null, events: [] }],
    }],
    nextId: 1000, rhythmPool: null,
    notes: '', userFingerings: [], preferredFingerings: [], parts: [],
    songSoundAuto: [], songSoundMarks: {},
  };
}

async function main() {
  await waitFor(() => w.document.readyState === 'complete', 'application startup');
  await wait(60);

  // Создаём тестовую секцию напрямую в модели (обходит загрузку из localStorage,
  // которая в jsdom-окружении не всегда срабатывает).
  w.eval(`
    sections.push({
      id: 1, type: 'Verse', customName: null, note: null, key: null, shift: null,
      timeSig: '4/4', bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 101, repeat: 1, customBeats: null, events: [] }],
    });
    nextId = Math.max(nextId || 0, 101) + 1;
  `);
  await wait(100);
  w.render();
  await wait(100);

  const doc = w.document;
  check('addTabInsert существует', typeof w.addTabInsert === 'function');

  const nSec = Number(w.eval('sections.length'));
  console.log('sections after push:', nSec);
  check('есть хотя бы одна секция', nSec > 0, `секций: ${nSec}`);
  if (nSec === 0) {
    console.log(`итого: ${pass} ok, ${fail} FAIL`);
    process.exitCode = fail ? 1 : 0;
    return;
  }
  const sid = Number(w.eval('sections[0].id'));

  // Добавляем таб-вставку.
  w.addTabInsert(sid);
  await wait(400);
  w.render();
  await wait(400);

  const tabSq = w.eval(`
    const s = sections.find(x => x.id === ${sid});
    const q = s && s.squares.find(x => x.type === 'tab');
    q ? { type: q.type, beats: q.beats, notes: q.notes, customBeats: q.customBeats } : null;
  `);
  check('квадрат типа tab создан', tabSq && tabSq.type === 'tab', JSON.stringify(tabSq));
  check('у таба есть beats', tabSq && typeof tabSq.beats === 'number' && tabSq.beats > 0);
  check('у таба есть notes (массив)', tabSq && Array.isArray(tabSq.notes));
  check('у таба есть customBeats', tabSq && 'customBeats' in tabSq);

  // Рендер: есть ли .tab-insert на странице.
  await wait(200);
  const tabEl = doc.querySelector('.tab-insert');
  check('мини-таб отрендерен (.tab-insert)', !!tabEl);
  check('в мини-табе 6 строк', tabEl && tabEl.querySelectorAll('line').length >= 6);

  // Звук: playTabNote не выбрасывает ошибку.
  check('playTabNote существует', typeof w.playTabNote === 'function');
  if (typeof w.playTabNote === 'function') {
    try { w.playTabNote(0, 0); check('playTabNote(0,0) не бросает', true); }
    catch (e) { check('playTabNote(0,0) не бросает', false, e.message); }
  }

  // 0.670: редактор открывается со станом alphaTab и панелью ввода.
  const sqId = Number(w.eval(`(sections.find(x => x.id === ${sid}).squares.find(q => q.type === 'tab') || {}).id`));
  w.openTabInsertEditor(sid, sqId);
  await wait(200);
  const modal = doc.querySelector('.tab-insert-editor');
  check('редактор таба открывается', !!modal);
  if (modal) {
    check('в редакторе есть стан (.tab-at-host)', !!modal.querySelector('.tab-at-host'));
    check('есть место под статус стана', !!modal.querySelector('.tab-at-status'));
    check('без alphaTab показан простой список нот', !!modal.querySelector('[data-tab-fallback]'));
    check('панель длительностей: 1/1…1/64', modal.querySelectorAll('[data-tab-dur]').length === 7);
    check('лад-пад: десять цифр', modal.querySelectorAll('[data-tab-digit]').length === 10);
    check('есть ↑/↓ струны', modal.querySelectorAll('[data-tab-string-step]').length === 2);
    check('есть пауза, удаление, отмена и повтор',
      modal.querySelectorAll('[data-tab-rest],[data-tab-delete],[data-tab-undo],[data-tab-redo]').length === 4);
    check('цифры лада читаются как кнопки', [...modal.querySelectorAll('[data-tab-digit]')].map(b => b.textContent.trim()).join('') === '0123456789');
    const cancel = modal.querySelector('[data-tab-cancel]');
    if (cancel) cancel.click();
    await wait(120);
    check('редактор закрывается по «Отмена»', !doc.querySelector('.tab-insert-editor'));
  }

  console.log(`итого: ${pass} ok, ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error('TESTRUN ERROR', e); process.exitCode = 1; });
