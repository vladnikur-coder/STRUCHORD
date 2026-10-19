#!/usr/bin/env node
/*
 * b12-views-gpview.js — B-12.11 «Виды»: GP-вид (alphaTab) строки
 * аккомпанемента.
 *
 * Проверяем модель партитуры alphaTab (без отрисовки):
 *  1. Первая дорожка — «Песня (аккорды)», ноты на месте.
 *  2. Подписи аккордов: staff.chords содержат имена ячеек, beat'ы в
 *     местах смены ячеек несут chordId.
 *  3. Удары боя D/U дают beat.brushType (Brush ↓/↑).
 *  4. Записанные ноты ячейки (шаг 2) попадают в GP-вид как есть.
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

  const info = w.eval(`(function () {
    togglePartsMode(true);
    const at = partsEnsureAlphaTab();
    const built = buildPartsAlphaScore(at);
    const score = built.score;
    const track0 = score.tracks[0];
    const staff0 = track0.staves[0];
    let noteCount = 0;
    let chordBeats = 0;
    const chordIds = new Set();
    staff0.bars.forEach((bar) => (bar.voices || []).forEach((v) => (v.beats || []).forEach((b) => {
      noteCount += (b.notes || []).length;
      if (b.chordId) { chordBeats++; chordIds.add(b.chordId); }
    })));
    const chordNames = [];
    if (staff0.chords) staff0.chords.forEach((c) => chordNames.push(c.name));
    return {
      trackNames: score.tracks.map((t) => t.name),
      noteCount, chordBeats, chordNames: Array.from(new Set(chordNames)),
      barCount: built.barCount,
    };
  })()`);
  check('gp: первая дорожка — аккомпанемент', info.trackNames[0] === 'Песня (аккорды)', JSON.stringify(info.trackNames));
  check('gp: ноты аккомпанемента на месте', info.noteCount > 500, 'нот ' + info.noteCount);
  check('gp: подписи аккордов определены (Aadd9, Dsus2)', info.chordNames.includes('Aadd9') && info.chordNames.includes('Dsus2'), JSON.stringify(info.chordNames));
  check('gp: beat\'ы несут chordId в местах смены ячеек', info.chordBeats >= 4, 'beats=' + info.chordBeats);

  // Записанные ноты ячейки (шаг 2) — в GP-виде как есть.
  const rec = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    ev.notes = [
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 0, dur: 1, string: 5, fret: 2 },
    ];
    accompInvalidate();
    const at = partsEnsureAlphaTab();
    const built = buildPartsAlphaScore(at);
    const staff0 = built.score.tracks[0].staves[0];
    const frets = [];
    (staff0.bars[0].voices || []).forEach((v) => (v.beats || []).forEach((b) => (b.notes || []).forEach((n) => frets.push(n.fret))));
    delete ev.notes;
    accompInvalidate();
    return { firstFrets: frets.slice(0, 4), has3: frets.includes(3), has2: frets.includes(2) };
  })()`);
  check('gp: записанные ноты ячейки показаны как есть', rec.has3 && rec.has2, JSON.stringify(rec));

  // Бой D/U — знаки Brush.
  const brush = w.eval(`(function () {
    const song = {
      schemaVersion: 3, artist: 'T', title: 'brush', bpm: 120, globalKey: 'C', globalTimeSig: '4/4',
      sections: [{ id: 1, type: 'куплет', key: 'C', bpm: 120, timeSig: '4/4', repeat: 1, squares: [{ id: 1, customBeats: null, events: [{
        chord: 'C', span: 4, fingering: 'x,3,2,0,1,0', strumPattern: { mode: 'strum', subdivision: 2, steps: ['D', '_', 'U', '_', 'D', '_', 'U', '_'] },
      }] }] }],
      parts: [],
    };
    localStorage.setItem('struchord_songs', JSON.stringify([song]));
    loadSong(0);
    togglePartsMode(true);
    const at = partsEnsureAlphaTab();
    const built = buildPartsAlphaScore(at);
    const staff0 = built.score.tracks[0].staves[0];
    const brushes = [];
    (staff0.bars[0].voices || []).forEach((v) => (v.beats || []).forEach((b) => { if (b.brushType) brushes.push(b.brushType); }));
    return { brushes };
  })()`);
  check('gp: удары боя дают Brush (down=2, up=1)', brush.brushes.includes(2) && brush.brushes.includes(1), JSON.stringify(brush));

  console.log('\nИТОГО: ' + pass + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
