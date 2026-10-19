#!/usr/bin/env node
/*
 * b12-views-step3.js — B-12.11 «Виды», шаг 3.
 *
 * Проверяем:
 *  1. Плашка «♪ ноты» в Редакторе у ячейки с ручными нотами, подпись
 *     которой не соответствует нотам; у обычных ячеек её нет.
 *  2. Диалог: смена аккорда поверх невыразимых нот — отказ (аккорд и
 *     ноты целы) / согласие (аккорд новый, ноты заменены); выразимые
 *     ноты снимаются молча, без диалога.
 *  3. Транспонирование двигает записанные ноты вместе с аккордом.
 *  4. Растяжение/усадка (вариант A): ноты остаются на своих долях;
 *     усадка не показывает ноты за новой границей ячейки.
 *  5. Сдвиг ноты аккомпанемента (время и высота) — тот же вход, что
 *     у партий.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {},
      fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' — ' + details : '')); }
}

w.addEventListener('load', async () => {
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'uploads', 'Police - Every breath you take.struchord-2.json'), 'utf8'));
  w.localStorage.setItem('struchord_songs', JSON.stringify([parsed]));
  w.loadSong(0);
  w.eval('render()');

  // ---------- 1. Плашка ----------
  const plate = w.eval(`(function () {
    const ev = sections[0].squares[0].events[0];
    ev.notes = [
      { start: 0, dur: 0.5, string: 2, fret: 9 },
      { start: 0.5, dur: 0.5, string: 2, fret: 4 },
    ];
    accompInvalidate();
    render();
    const plates = document.querySelectorAll('.accomp-notes-plate').length;
    const ev2 = sections[0].squares[0].events[1];
    delete ev.notes;
    accompInvalidate();
    render();
    const platesAfter = document.querySelectorAll('.accomp-notes-plate').length;
    return { plates, platesAfter, hasEv2: !!ev2 };
  })()`);
  check('шаг3: плашка «♪ ноты» показана у ручной ячейки', plate.plates >= 1, JSON.stringify(plate));
  check('шаг3: без записи плашки нет', plate.platesAfter === 0, JSON.stringify(plate));

  // ---------- 2. Диалог ----------
  const dlg = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    ev.notes = [
      { start: 0, dur: 0.5, string: 2, fret: 9 },
      { start: 0.5, dur: 0.5, string: 2, fret: 4 },
    ];
    let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return false; };
    const changedDeclined = setEventChord(ev, 'E', { secId: sec.id, sqId: sq.id, ei: 0 });
    const afterDecline = { chord: ev.chord, notes: ev.notes.length };
    window.confirm = () => { confirmCalls++; return true; };
    const changedAccepted = setEventChord(ev, 'E', { secId: sec.id, sqId: sq.id, ei: 0 });
    const afterAccept = { chord: ev.chord, notes: Array.isArray(ev.notes) ? ev.notes.length : 0, confirmCalls };
    return { changedDeclined, afterDecline, changedAccepted, afterAccept };
  })()`);
  check('шаг3: отказ в диалоге — аккорд и ноты целы', dlg.changedDeclined === false
    && dlg.afterDecline.chord === 'Aadd9' && dlg.afterDecline.notes === 2, JSON.stringify(dlg));
  check('шаг3: согласие — аккорд заменён, ноты сняты, диалог был', dlg.changedAccepted === true
    && dlg.afterAccept.chord === 'E' && dlg.afterAccept.notes === 0 && dlg.afterAccept.confirmCalls >= 2, JSON.stringify(dlg));

  const silent = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    // Запись целиком выразима: ноты — сам хват ячейки.
    ev.notes = accompCellNotes(sec, sq, ev, 0).map((n) => {
      const win = partEventWindowUnits(sec, sq, 0);
      return { start: Math.round((n.start - win.start) * 10000) / 10000, dur: n.dur, string: n.string, fret: n.fret };
    });
    let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return false; };
    const changed = setEventChord(ev, 'Am', { secId: sec.id, sqId: sq.id, ei: 0 });
    return { changed, chord: ev.chord, notes: Array.isArray(ev.notes) ? ev.notes.length : 0, confirmCalls };
  })()`);
  check('шаг3: выразимые ноты снимаются молча, без диалога', silent.changed === true
    && silent.chord === 'Am' && silent.notes === 0 && silent.confirmCalls === 0, JSON.stringify(silent));

  // ---------- 3. Транспонирование ----------
  const transp = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    ev.chord = 'Am';
    ev.notes = [
      { start: 0, dur: 0.5, string: 1, fret: 5 },
      { start: 0.5, dur: 0.5, string: 0, fret: 29 },
    ];
    transposeAllGlobal(2);
    return { frets: (ev.notes || []).map((n) => n.fret), len: (ev.notes || []).length };
  })()`);
  check('шаг3: транспонирование сдвинуло ноты, заграничная отпала', transp.frets.join(',') === '7', JSON.stringify(transp));

  // ---------- 4. Растяжение/усадка (вариант A) ----------
  const stretch = w.eval(`(function () {
    loadSong(0);
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    ev.notes = [
      { start: 0, dur: 0.5, string: 0, fret: 5 },
      { start: 6, dur: 0.5, string: 0, fret: 5 },
    ];
    const before = accompSectionRoll(sec).filter((n) => n.start < 8).map((n) => n.start);
    setSquareCustomBeats(sec.id, sq.id, 48);
    const afterStretch = accompSectionRoll(sec).filter((n) => n.start < 8).map((n) => n.start);
    ev.span = 4;
    const rollShrunk = accompSectionRoll(sec).filter((n) => n.start < 8).map((n) => n.start);
    return { before, afterStretch, rollShrunk, span: ev.span };
  })()`);
  check('шаг3: растяжение квадрата — ноты на своих долях', JSON.stringify(stretch.afterStretch) === JSON.stringify(stretch.before), JSON.stringify(stretch));
  check('шаг3: усадка ячейки не показывает ноты за границей', stretch.rollShrunk.filter((x) => x < 4).length === 1 && stretch.rollShrunk[0] === 0, JSON.stringify(stretch));

  // ---------- 5. Сдвиг ноты ----------
  const move = w.eval(`(function () {
    loadSong(0);
    const sec = sections[0];
    togglePartsMode(true);
    partsCursor = { partId: 'accomp', secId: sec.id, pass: 0, string: 0, pos: 0, pitch: null, staffPitch: null, staffClef: null };
    const okTime = moveSelectedPartNote('time', 1);
    const ev = sec.squares[0].events[0];
    // Сдвиг момента выразим боем: запись нормализуется в кастомный
    // ритм, а нота в звучащем рулоне стоит на новом месте.
    const roll = accompCellNotes(sec, sec.squares[0], ev, 0).filter((n) => n.string === 0);
    const firstStart = roll.length ? roll[0].start : -1;
    return { okTime, firstStart };
  })()`);
  check('шаг3: сдвиг ноты по времени работает на аккомпанементе', move.okTime === true && move.firstStart > 0.01, JSON.stringify(move));

  console.log('\nИТОГО: ' + pass + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
