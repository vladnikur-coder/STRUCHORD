#!/usr/bin/env node
'use strict';
// 0.871 · B-39 Этап 3, волна 2: укулельная таб-вставка в экспорте и Ленте.
//
// Проверяем на настоящих байтах: GPX (score.gpif читается независимым
// alphaTab), GP5 (тот же alphaTab), MIDI (midi-file), а также карточки Ленты
// в живом jsdom. Гитара обязана остаться прежней: одна дорожка «Табы»,
// 6 струн, без новых свойств.
//
// Запуск: node dev/tests/b39-ukulele-tab-0871.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parseMidi } = require('midi-file');
const { readScore, gpifZip, notes } = require('./helpers/export-oracle');
const codec = require('../gpx-bcfz-runtime');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const GPIF_SRC = fs.readFileSync(path.join(ROOT, 'dev', 'gpif-writer.js'), 'utf8');
const GP5_SRC = fs.readFileSync(path.join(ROOT, 'dev', 'gp5-writer.js'), 'utf8');

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

// =====================================================================
// 1. Статические инварианты 0.871
// =====================================================================
{
  assert(HTML.includes('ver 0.879'), 'STRUCHORD.html header is ver 0.879');
  assert(SW.includes("const CACHE_NAME = 'struchord-v879';"), 'sw.js CACHE_NAME is struchord-v879');
  assert(README.includes('`0.879`'), 'README header is 0.879');
  assert(ROADMAP.includes('**0.879**'), 'ROADMAP header is 0.879');

  assert(HTML.includes('function gpExportBuildTabParts(songData, plans, report, nativeRepeats = false) {'),
    'tab inserts are built per domain');
  assert(!HTML.includes('gpExportBuildTabPart(songData, plans, report)'),
    'old single-part builder call is gone');
  assert(HTML.includes("name: 'Табы (укулеле' + (short ? ', ' + short : '') + ')'"),
    'ukulele tab track is named with its tuning');
  assert(HTML.includes("if (domain.instrument === 'ukulele') {") && HTML.includes("instrument: 'ukulele', viewMode: 'tab', capo: 0, gmProgram: 24,"),
    'ukulele tab part is 4-string ukulele with GM 24 and no capo');
  assert(HTML.includes('const ukeTabTracks = new Map(ukeTabTunings.map((tuning) => [tuning, makeTrack(\'Табы (укулеле)\', \'ukulele\', songData.mix, 24,'),
    'MIDI gets its own ukulele tab tracks');
  assert(HTML.includes("const notes = tabInsertCleanNotes(sq.type === 'tab' ? sq.notes : ev.tabNotes, tabSpan, ts, tabDomain);"),
    'MIDI cleans tab notes by their domain');
  assert(HTML.includes("else if (!legacyTrack.programs.length || legacyTrack.programs[legacyTrack.programs.length - 1].program !== program) legacyTrack.programs.push({ at, program });"),
    'ukulele MIDI track keeps a fixed GM 24 timbre');

  // Рантайм и исходники писателей должны совпадать: 0.866–0.871 правили только
  // встроенный блок, и повторная вставка теряла укулеле.
  assert(GPIF_SRC.includes("if (instrument === 'ukulele') return ['G4', 'C4', 'E4', 'A4'];"), 'gpif source knows the ukulele tuning');
  assert(GPIF_SRC.includes("track.part.instrument === 'ukulele' ? 'ukulele' :"), 'gpif source writes the ukulele instrument');
  assert(GPIF_SRC.includes('<Property name="FretCount">'), 'gpif source writes FretCount for ukulele');
  assert(GP5_SRC.includes('ukulele: [67, 60, 64, 69],'), 'gp5 source knows the ukulele tuning');
  assert(GP5_SRC.includes("? 15 : 24); // ладов"), 'gp5 source writes 15 frets for ukulele');
  const rtStart = HTML.indexOf('<script id="gpifWriterRuntime" type="text/plain">');
  const rtEnd = HTML.indexOf('</script>', rtStart);
  const runtime = HTML.slice(rtStart, rtEnd).replace(/<\\\//g, '</');
  assert(runtime.includes('<Property name="FretCount">') && runtime.includes("track.part.instrument === 'ukulele' ? 'ukulele'"),
    'embedded GPIF runtime matches its source');
  ok('Статические инварианты 0.871: версия, дорожки по домену, MIDI-дорожки укулеле, FretCount 15, рантайм = исходник');
}

// =====================================================================
// Живой стенд: те же байты, что отдаёт приложение
// =====================================================================
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(HTML, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
  beforeParse(w) {
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
    w.URL.createObjectURL = () => 'blob:export-test';
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = () => {};
    w.confirm = () => true;
  },
});
const w = dom.window;
const doc = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UKE_NOTES = [
  { start: 0, dur: 1, string: 0, fret: 0 }, // G4
  { start: 1, dur: 1, string: 1, fret: 2 }, // C4+2 = 62
  { start: 2, dur: 1, string: 2, fret: 3 }, // E4+3 = 67
  { start: 3, dur: 1, string: 3, fret: 2 }, // A4+2 = 71
];

function ukeSong() {
  return {
    schemaVersion: 9, metadata: { title: 'B39 ukulele export', artist: 'STRUCHORD' }, bpm: 120,
    globalTimeSig: '4/4', globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, repeat: 1, events: [], notes: [{ start: 0, dur: 1, string: 0, fret: 0 }, { start: 2, dur: 1, string: 5, fret: 3 }] },
        { id: 103, type: 'tab', beats: 4, repeat: 1, events: [], notes: UKE_NOTES, tabInstrument: 'ukulele', tabTuning: 'uke-high-g' },
        { id: 104, repeat: 1, events: [
          { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: [{ start: 0, dur: 1, string: 1, fret: 5 }], tabInstrument: 'ukulele', tabTuning: 'uke-baritone' },
          { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: [{ start: 0, dur: 1, string: 2, fret: 1 }] },
        ] },
      ],
    }],
  };
}

function guitarSong() {
  const song = ukeSong();
  song.metadata.title = 'B39 guitar only';
  song.sections[0].squares = [song.sections[0].squares[0]];
  return song;
}

async function load(value) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([value]));
  w.loadSong(0);
  await sleep(150);
}

function gpifXml(result) {
  const files = codec.readContainer(Uint8Array.from(result.bytes)).entries;
  const file = files.find((f) => f.name === 'score.gpif');
  return new TextDecoder().decode(file.data || file.bytes);
}

// midi-file отдаёт текст как latin1 — собираем исходный UTF-8.
function midiName(text) {
  try { return Buffer.from(String(text || ''), 'latin1').toString('utf8'); } catch (_) { return String(text || ''); }
}

function midiNotes(bytes) {
  const midi = parseMidi(bytes);
  const out = [];
  midi.tracks.forEach((track, index) => {
    let at = 0;
    track.forEach((e) => {
      at += e.deltaTime;
      if (e.type === 'noteOn') out.push({ track: index, pitch: e.noteNumber, at });
    });
  });
  return out;
}

function midiPrograms(bytes) {
  const midi = parseMidi(bytes);
  const out = [];
  midi.tracks.forEach((track, index) => track.forEach((e) => { if (e.type === 'programChange') out.push({ track: index, program: e.programNumber }); }));
  return out;
}

async function main() {
  await sleep(250);

  // -------------------------------------------------------------------
  // 2. Укулельная песня: GPX (GPIF), GP5 и MIDI
  // -------------------------------------------------------------------
  await load(ukeSong());
  const gpx = w.gpExportBytes();
  const xml = gpifXml(gpx);
  const instrumentRefs = xml.match(/<Instrument ref="[^"]*" \/>/g) || [];
  assert.strictEqual(instrumentRefs.length, 3, 'GPX has three tracks: guitar tab + two ukulele tunings');
  assert(instrumentRefs[0].includes('e-gtr6'), 'guitar tab track stays a 6-string guitar');
  assert(instrumentRefs.slice(1).every((ref) => ref.includes('ukulele')), 'ukulele inserts are ukulele tracks');
  assert(xml.includes('<Pitches>40 45 50 55 59 64</Pitches>'), 'guitar tab keeps the song tuning');
  assert(xml.includes('<Pitches>67 60 64 69</Pitches>'), 'High G insert writes <Pitches>67 60 64 69</Pitches>');
  assert(xml.includes('<Pitches>50 55 59 64</Pitches>'), 'baritone cell writes <Pitches>50 55 59 64</Pitches>');
  const fretProps = xml.match(/<Property name="FretCount">[\s\S]{0,40}?<\/Property>/g) || [];
  assert.strictEqual(fretProps.length, 2, 'both ukulele tracks declare a fret limit');
  assert(fretProps.every((block) => block.includes('<Fret>15</Fret>')), 'ukulele fret limit is 15 (0..15)');
  const programs = xml.match(/<Program>\d+<\/Program>/g) || [];
  assert.deepStrictEqual(programs, ['<Program>25</Program>', '<Program>24</Program>', '<Program>24</Program>'], 'GM 25 for guitar, GM 24 for ukulele');
  assert(gpx.report.transferred.some((t) => /Табы \(укулеле/.test(t.label)), 'report names the ukulele tab track');

  // Независимый alphaTab читает наш GPIF: 4 струны и 15 ладов.
  // Имена дорожек oracle декодирует как windows-1251, поэтому опознаём
  // укулельные дорожки по числу струн в строе, а не по названию.
  const gpifScore = readScore(gpifZip(xml));
  const stringsOf = (track) => track.staves[0].tuning.length;
  const ukeStaves = gpifScore.tracks.filter((track) => stringsOf(track) === 4);
  assert.strictEqual(ukeStaves.length, 2, 'alphaTab sees two 4-string ukulele tab tracks');
  assert.strictEqual(gpifScore.tracks.filter((track) => stringsOf(track) === 6).length, 1, 'alphaTab sees the 6-string guitar tab');
  const gpifNotes = notes(gpifScore).filter((n) => n.string >= 1);
  assert(gpifNotes.some((n) => n.pitch === 67), 'alphaTab finds G4 from the High G insert');
  assert(gpifNotes.some((n) => n.pitch === 60), 'alphaTab finds the baritone cell note');

  // GP5: тот же независимый alphaTab.
  const gp5 = w.gpExportBytesGP5();
  const gp5Score = readScore(Uint8Array.from(gp5.bytes));
  assert.strictEqual(gp5Score.tracks.length, 3, 'GP5 has three tracks');
  assert.strictEqual(gp5Score.tracks.filter((track) => stringsOf(track) === 4).length, 2, 'GP5 has two 4-string ukulele tab tracks');
  assert.strictEqual(gp5Score.tracks[0].staves[0].tuning.length, 6, 'GP5 guitar tab keeps 6 strings');
  assert.strictEqual(gp5Score.tracks.filter((track) => stringsOf(track) === 4)[0].staves[0].tuning[0], 69,
    'GP5 High G neck is A4/E4/C4/G4 (alphaTab нормализует строй сверху вниз)');

  // MIDI: свои дорожки, GM 24 и верные высоты (раньше считались по гитаре).
  const midi = w.midiExportBytes();
  const midiTrackNames = parseMidi(midi.bytes).tracks.map((t) => { const e = t.find((x) => x.type === 'trackName'); return e ? midiName(e.text) : ''; });
  assert.strictEqual(midiTrackNames.filter((n) => /укулеле/.test(n)).length, 2, 'MIDI has a track per ukulele tuning');
  const ukePrograms = midiPrograms(midi.bytes).filter((p) => /укулеле/.test(midiTrackNames[p.track]));
  assert(ukePrograms.length >= 2 && ukePrograms.every((p) => p.program === 24), 'ukulele MIDI tracks use GM 24');
  const ukulelePitches = midiNotes(midi.bytes).filter((n) => /укулеле/.test(midiTrackNames[n.track])).map((n) => n.pitch).sort((a, b) => a - b);
  assert.deepStrictEqual(ukulelePitches, [60, 62, 67, 67, 71], 'ukulele MIDI pitches are G4/C4/E4/A4 based, not guitar-based');
  const guitarPitches = midiNotes(midi.bytes).filter((n) => midiTrackNames[n.track] === 'Песня').map((n) => n.pitch).sort((a, b) => a - b);
  assert.deepStrictEqual(guitarPitches, [40, 51, 67], 'guitar inserts keep E2, D3+1 (cell) and E4+3 — прежний строй песни');
  ok('Укулельная песня: GPX (3 дорожки, FretCount 15, GM 24), GP5 (4 струны), MIDI (GM 24 и верные высоты)');
}

main()
  .then(() => {
    // -----------------------------------------------------------------
    // 3. Гитара без укулеле: всё как до 0.871
    // -----------------------------------------------------------------
    return (async () => {
      await load(guitarSong());
      const gpx = w.gpExportBytes();
      const xml = gpifXml(gpx);
      const refs = xml.match(/<Instrument ref="[^"]*" \/>/g) || [];
      assert.deepStrictEqual(refs, ['<Instrument ref="e-gtr6" />'], 'guitar-only song keeps a single tab track');
      assert(!xml.includes('FretCount'), 'guitar-only song gains no new GPIF properties');
      assert(!xml.includes('ukulele'), 'guitar-only song has no ukulele tracks');
      assert(!gpx.report.transferred.some((t) => /укулеле/.test(t.label)), 'report stays clean for guitar-only songs');
      const gp5Score = readScore(Uint8Array.from(w.gpExportBytesGP5().bytes));
      assert.strictEqual(gp5Score.tracks.length, 1, 'GP5 guitar-only keeps one track');
      assert.strictEqual(gp5Score.tracks[0].staves[0].tuning.length, 6, 'GP5 guitar-only keeps 6 strings');
      const midiTrackNames = parseMidi(w.midiExportBytes().bytes).tracks.map((t) => { const e = t.find((x) => x.type === 'trackName'); return e ? midiName(e.text) : ''; });
      assert(!midiTrackNames.some((n) => /укулеле/.test(n)), 'MIDI adds no ukulele track for guitar-only songs');
      ok('Гитара без укулеле: одна дорожка «Табы», 6 струн, без FretCount и без укулельных дорожек');
    })();
  })
  .then(() => {
    // -----------------------------------------------------------------
    // 4. Лента и закреп: карточки вставок живут по домену
    // -----------------------------------------------------------------
    return (async () => {
      await load(ukeSong());
      const T = w.StruChordTracks;
      T.setInstrument(T.state().activeTrackId, 'ukulele');
      w.eval("if (typeof timelineMode !== 'undefined' && !timelineMode) toggleTimelineMode(); renderTimeline();");
      await sleep(150);
      const stage = doc.querySelector('#timelineStage');
      assert(stage, 'timeline stage is rendered');
      const cards = [...stage.querySelectorAll('.tab-insert')];
      assert.strictEqual(cards.length, 4, 'both squares and both inline cells are in the timeline');
      const ukeCards = cards.filter((card) => card.classList.contains('tab-insert--uke'));
      const guitarCards = cards.filter((card) => !card.classList.contains('tab-insert--uke'));
      assert.strictEqual(guitarCards.length, 2, 'guitar square and guitar cell have no ukulele marker');
      assert.strictEqual(ukeCards.length, 2, 'ukulele square and ukulele cell are marked');
      for (const card of guitarCards) {
        assert(card.classList.contains('is-foreign'), 'guitar insert is grey on an ukulele track');
        assert(!card.querySelector('[onclick]') && !card.getAttribute('onclick'), 'grey guitar insert has no click handler');
      }
      for (const card of ukeCards) {
        assert(!card.classList.contains('is-foreign'), 'ukulele insert is editable on an ukulele track');
        assert((card.getAttribute('onclick') || '').length > 0, 'ukulele insert opens its editor');
      }
      assert(ukeCards.some((card) => card.querySelector('[data-tab-counts]')), 'ukulele timeline insert keeps its own beat ruler');
      assert(ukeCards.some((card) => card.classList.contains('tab-insert--cell')), 'inline ukulele cell is rendered as a cell');
      assert(!errors.some((m) => /tabInsert|gpExport|ukulele/i.test(m)), 'no page errors around tab exports');
      ok('Лента: укулельные вставки на месте, с линейкой счёта, гитарная — серая и без клика');
    })();
  })
  .then(() => {
    console.log(`\nB-39 Ukulele tab export 0.871: ${passed} groups passed, 0 failed.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    console.log(`\nB-39 Ukulele tab export 0.871: ${passed} groups passed, 1 failed.`);
    process.exit(1);
  });
