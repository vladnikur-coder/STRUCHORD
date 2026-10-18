#!/usr/bin/env node
/*
 * b12-gp-view.js — B-12.11: GP-вид (alphaTab только рисует).
 *
 * Проверяем конвертер «наша модель → alphaTab» напрямую (не через GP-экспорт):
 * такты из секций/квадратов, ноты с инверсией струн, тональность, темп;
 * и что ветка GP-вида в renderPartsScreen не падает и показывает хост.
 * Настоящая отрисовка в Chromium — dev/bench/b12-11-gp-view-check.js.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, closePath(){},
      save(){}, restore(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }) });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

const song = {
  schemaVersion: 5, metadata: { artist: 'A', title: 'GP-view' }, bpm: 96, globalKey: 'C', keyMode: 'manual',
  globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null,
    repeat: 1, strumPattern: null, bpm: 96,
    squares: [{ id: 11, repeat: 1, customBeats: 4, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] },
      { id: 12, repeat: 1, customBeats: 4, events: [{ chord: 'G', span: 4, timeSig: null, strumPattern: null }] }] }],
  parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
    rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 3 },
      { start: 1, dur: 0.5, string: 4, fret: 0, pm: true },
      { start: 4, dur: 1, string: 0, fret: 0 },
    ] } }],
  nextId: 50, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
};

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

w.addEventListener('load', () => {
  try {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    w.eval('render()');
    w.confirm = () => true;
    w.eval('togglePartsMode(true)');

    const built = w.eval(`(() => {
      const at = partsEnsureAlphaTab();
      const b = buildPartsAlphaScore(at);
      const score = b.score;
      const notes = [];
      score.tracks[0].staves[0].bars.forEach((bar) => bar.voices.forEach((v) =>
        v.beats.forEach((beat) => beat.notes.forEach((n) => notes.push({ fret: n.fret, string: n.string, pm: n.isPalmMute })))));
      return { bars: b.barCount, master: score.masterBars.length, tracks: score.tracks.length,
        tempo: score.tempo, notes, cursorBar: b.cursorBarIndex,
        section: score.masterBars[0].section ? score.masterBars[0].section.text : null };
    })()`);
    check('конвертер: 2 такта из двух квадратов', built.bars === 2 && built.master === 2, JSON.stringify(built));
    check('конвертер: одна дорожка, темп задан', built.tracks === 1 && built.tempo >= 30, JSON.stringify(built));
    check('конвертер: секция подписана на первом такте', !!built.section, JSON.stringify(built.section));
    check('конвертер: 3 ноты, струны инвертированы (5→1, 4→2, 0→6)',
      built.notes.length === 3 && built.notes[0].string === 1 && built.notes[1].string === 2 && built.notes[2].string === 6,
      JSON.stringify(built.notes));
    check('конвертер: palm mute перенесён', built.notes[1].pm === true, JSON.stringify(built.notes));

    // Ветка GP-вида: хост показан, родной трек скрыт, падения нет.
    w.eval('setPartsScoreEngine("alphatab")');
    check('GP-вид: хост alphaTab показан', w.document.getElementById('partsAlphaTab').hidden === false);
    check('GP-вид: родная лента скрыта', w.document.getElementById('partsTrack').hidden === true);
    w.eval('setPartsScoreEngine("native")');
    check('обратно: родная лента видна', w.document.getElementById('partsTrack').hidden === false);

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    // alphaTab в jsdom держит шрифтовые таймеры — выходим явно.
    process.exit(fail ? 1 : 0);
  } catch (error) {
    console.error('ОШИБКА:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
});
