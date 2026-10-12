#!/usr/bin/env node
/*
 * B-101 follow-up, 0.617: readable enharmonic chord names.
 * Names shown/stored as chords use Cb→B, E#→F, B#→C, Fb→E;
 * scale spelling and pitch/harmony calculations remain unchanged.
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
const pcs = (chord, style) => ev(
  `getChordNotes(${JSON.stringify(chord)}, ${JSON.stringify(style)}).map((note) => toSharpNote(note.replace(/\\d+$/, "")))`
);

async function main() {
  check('B5 в Ebm отображается как B5, а теоретическая коррекция сохраняет Cb5',
    ev('correctDisplayedChordName("B5", "flat", "Ebm")') === 'B5' &&
      ev('correctChordName("B5", "flat", "Ebm")') === 'Cb5',
    `${ev('correctDisplayedChordName("B5", "flat", "Ebm")')} / ${ev('correctChordName("B5", "flat", "Ebm")')}`);
  check('все четыре корня и слэш-басы приводятся к читаемым именам',
    ev('normalizeReadableChordName("Cb5/E#/B#/Fb")') === 'B5/F/C/E',
    ev('normalizeReadableChordName("Cb5/E#/B#/Fb")'));
  const rendered = ev('renderChordDisplayHtml("Cb5/E#")');
  check('читаемые имена доходят до HTML-подписи ячейки',
    rendered.includes('>B<') && rendered.includes('5/F') && !rendered.includes('Cb') && !rendered.includes('E#'),
    rendered);
  check('правило действует после написания по любой тональности',
    ev('correctDisplayedChordName("E#dim/B#", "sharp", "F#")') === 'Fdim/C' &&
      ev('correctDisplayedChordName("Fb/Cb", "flat", "Ebm")') === 'E/B',
    `${ev('correctDisplayedChordName("E#dim/B#", "sharp", "F#")')} / ${ev('correctDisplayedChordName("Fb/Cb", "flat", "Ebm")')}`);
  check('теоретический спеллинг ступени не меняется (E# в F#, Cb в Ebm)',
    ev('spellRootByDegree("F", "F#")') === 'E#' &&
      ev('spellRootByDegree("B", "Ebm")') === 'Cb',
    `${ev('spellRootByDegree("F", "F#")')} / ${ev('spellRootByDegree("B", "Ebm")')}`);
  check('гамма Ebm по-прежнему содержит теоретическую ноту Cb',
    ev('getScaleNotes("Ebm").includes("Cb4")') === true,
    JSON.stringify(ev('getScaleNotes("Ebm")')));
  check('B5 в Ebm сохраняет VI и классы высот B/F#',
    ev('getScaleDegree("B5", "Ebm")') === 'VI' &&
      JSON.stringify(pcs('B5', 'flat')) === JSON.stringify(['B', 'F#']),
    `${ev('getScaleDegree("B5", "Ebm")')} / ${JSON.stringify(pcs('B5', 'flat'))}`);

  check('звучащие октавы B5 в Ebm остаются B4 и F#5',
    ev('noteToFrequency(getChordNotes("B5", "flat")[0]) === noteToFrequency("B4") && noteToFrequency(getChordNotes("B5", "flat")[1]) === noteToFrequency("F#5")') === true,
    JSON.stringify(ev('getChordNotes("B5", "flat")')));

  const legacy = {
    sections: [{ squares: [{ events: [
      { chord: 'Cb5', span: 1 }, { chord: 'E#/B#', span: 1 }, { chord: 'Fb', span: 1 },
    ] }] }],
    userFingerings: [
      ['Cb5|Ebm', [['x', 2, 4, 4, 'x', 'x']]],
      ['B5|Ebm', [['x', 2, 4, 4, 'x', 'x']]],
    ],
    preferredFingerings: [['Cb5|Ebm|1|2|0', 'x,2,4,4,x,x']],
  };
  w.__readableLegacySong = legacy;
  ev('normalizeReadableSongChordNames(window.__readableLegacySong)');
  check('старые имена аккордов мигрируют при загрузке',
    JSON.stringify(w.__readableLegacySong.sections[0].squares[0].events.map((event) => event.chord)) ===
      JSON.stringify(['B5', 'F/C', 'E']),
    JSON.stringify(w.__readableLegacySong.sections[0].squares[0].events.map((event) => event.chord)));
  check('миграция переносит ключи аппликатур на читаемое имя и объединяет алиасы',
    w.__readableLegacySong.userFingerings.length === 1 &&
      w.__readableLegacySong.userFingerings[0][0] === 'B5|Ebm' &&
      w.__readableLegacySong.userFingerings[0][1].length === 2 &&
      w.__readableLegacySong.preferredFingerings[0][0] === 'B5|Ebm|1|2|0',
    JSON.stringify({ user: w.__readableLegacySong.userFingerings, preferred: w.__readableLegacySong.preferredFingerings }));

  // Exercise the actual import/sanitization route, not only the migration helper.
  const importedSong = {
    schemaVersion: ev('SONG_SCHEMA_VERSION'),
    metadata: { artist: 'Тест', title: 'Читаемые имена' },
    bpm: 100, globalKey: 'Ebm', keyMode: 'manual', globalTimeSig: '4/4',
    sections: [{ id: 1, type: 'Verse', squares: [{ id: 2, events: [
      { chord: 'Cb5', span: 1 }, { chord: 'E#/B#', span: 1 }, { chord: 'Fb', span: 1 },
    ] }] }],
    nextId: 3, userFingerings: [['Cb5|Ebm', [['x', 2, 4, 4, 'x', 'x']]]],
    preferredFingerings: [['Cb5|Ebm|1|2|0', 'x,2,4,4,x,x']],
  };
  let importResolved = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('import timeout')), 5000);
    const poll = () => {
      const firstChord = ev('sections[0]?.squares?.[0]?.events?.[0]?.chord');
      if (firstChord) {
        importResolved = true;
        clearTimeout(timeout);
        resolve();
      } else setTimeout(poll, 15);
    };
    w.importSong(new w.Blob([JSON.stringify(importedSong)], { type: 'application/json' }));
    poll();
  });
  check('импорт старого файла открывает Cb5 как B5',
    importResolved && ev('sections[0].squares[0].events[0].chord') === 'B5',
    ev('sections[0]?.squares?.[0]?.events?.[0]?.chord'));
  check('импорт переносит пользовательские аппликатуры со старого ключа Cb5',
    ev('userFingerings.has("B5|Ebm")') === true &&
      ev('preferredFingeringByChord.has("B5|Ebm|1|2|0")') === true,
    `${ev('JSON.stringify([...userFingerings.keys()])')} / ${ev('JSON.stringify([...preferredFingeringByChord.keys()])')}`);

  // The common write gate must apply the same rule to a newly typed chord.
  const setterName = ev('(function(){ const event = { chord: "C" }; setEventChord(event, "Cb5"); return event.chord; })()');
  check('новый аккорд через setEventChord также сохраняется как B5', setterName === 'B5', setterName);

  console.log(`\nB-101 readable chord names: ${pass} passed, ${fail} failed`);
  dom.window.close();
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  dom.window.close();
  process.exitCode = 1;
});
