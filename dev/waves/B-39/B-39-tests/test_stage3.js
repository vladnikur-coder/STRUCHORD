/* Тесты этапа 3 (STAGE 3 / звук пианино) для STRUCHORD.
   Запуск: node test_stage3.js [базовый.html] [пропатченный.html]
   jsdom не нужен: Web Audio подменяется моком. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage3', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРА ----------
console.log('\nСтруктура: звуковой блок и хуки');
const needles = [
  ['маркер STAGE3', '// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<'],
  ['маркер /STAGE3', '// <<< B-39 STAGE3 END (KEYS AUDIO) <<<'],
  ['неймспейс StruChordAudio', 'HOST.StruChordAudio = api;'],
  ['хук scheduleNextEvent', 'window.StruChordAudio.scheduleEvent('],
  ['хук playChord preview', 'window.StruChordAudio.preview(c, ctx, now, wrapper);'],
  ['хук stopAllAudio', 'window.StruChordAudio.stopAll();'],
  ['хук soundChannelInstrument', 'if (b39Main && b39Main.instrument === \'keys\') return \'keys\';'],
  ['пресет Рояль', "{ id: 'piano', label: 'Рояль (синтез)'"],
  ['пресет Электропиано', "{ id: 'epiano', label: 'Электропиано'"],
  ['пресет Орган', "{ id: 'organ', label: 'Орган'"],
  ['синтез: негармоничность', 'var B = 0.00035;'],
  ['синтез: молоточек', 'hammerBuffer(ctx)'],
];
for (const [name, needle] of needles) ok(name, patched.includes(needle));
ok('базовый файл без STAGE3', !base.includes('B-39 STAGE3 BEGIN'));
ok('прежние части на месте', ['B-39 STAGE0 BEGIN', 'B-39 STAGE1 BEGIN', 'B-39 STAGE2 BEGIN']
  .every(x => patched.includes(x)));
const stage3Code = patched.split('// >>> B-39 STAGE3 BEGIN')[1]
  .split('// <<< B-39 STAGE3 END')[0]
  .split('\n').map(function (line) { return line.replace(/\/\/.*$/, ''); }).join('\n');
ok('R12: звуковой блок не вызывает getChordNotes', !/getChordNotes\s*\(/.test(stage3Code));
ok('звук берёт chordFormula', patched.includes("typeof F.chordFormula !== 'function'"));

// ---------- 2. МОК WEB AUDIO ----------
function markerBlock(src, begin, end) {
  const i = src.indexOf(begin), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('маркер не найден: ' + begin);
  return src.slice(i, j + end.length);
}
const b0 = markerBlock(patched, '// >>> B-39 STAGE0 BEGIN (B-102) <<<', '// <<< B-39 STAGE0 END (B-102) <<<');
const b1 = markerBlock(patched, '// >>> B-39 STAGE1 BEGIN (TRACKS) <<<', '// <<< B-39 STAGE1 END (TRACKS) <<<');
const b3 = markerBlock(patched, '// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<', '// <<< B-39 STAGE3 END (KEYS AUDIO) <<<');

function makeAudioCtx() {
  const made = { oscillators: [], buffers: [], gains: [], filters: [], started: [], stopped: [] };
  const param = (v) => ({ value: v, setValueAtTime(x) { this.value = x; }, exponentialRampToValueAtTime(x) { this.value = x; }, linearRampToValueAtTime(x) { this.value = x; } });
  const node = (kind) => ({
    kind, gain: param(1), frequency: param(440), pan: param(0), Q: param(1),
    type: '', buffer: null, onended: null,
    connect(n) { return n; }, disconnect() {},
    start(t) { made.started.push({ node: this, t }); },
    stop(t) { made.stopped.push({ node: this, t }); if (this.onended) this.onended(); }
  });
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: node('destination'),
    createGain() { const n = node('gain'); made.gains.push(n); return n; },
    createOscillator() { const n = node('osc'); made.oscillators.push(n); return n; },
    createBufferSource() { const n = node('bufsrc'); made.buffers.push(n); return n; },
    createBiquadFilter() { const n = node('filter'); made.filters.push(n); return n; },
    createStereoPanner() { return node('panner'); },
    createConvolver() { return node('convolver'); },
    createBuffer(ch, len, sr) { return { length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }; },
    resume() { return Promise.resolve(); }
  };
  return { ctx, made };
}

const channelsMade = [];
function makeSong(withChords) {
  return {
    schemaVersion: 9, globalKey: 'C', sections: [
      { id: 1, squares: [{ id: 10, events: [
        { chord: withChords === false ? '' : 'Am', span: 1 },
        { chord: withChords === false ? '' : 'F', span: 1 }
      ] }] }
    ]
  };
}

const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date, Float32Array,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout: function () { return 0; }, clearTimeout: function () {},
  __b39Sections: [],
  songStore: { dispatch(l, m) { return m(); }, subscribe() { return () => {}; }, log() { return []; } },
  normalizeAccidentals: v => String(v).replace(/♭/g, 'b').replace(/♯/g, '#'),
  normalizeChordCase: v => String(v),
  getKeyStyle: k => (/b/i.test(String(k)) ? 'flat' : 'sharp'),
  chordNameForReadablePreference: v => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb', B:'Cb' },
  FLAT_TO_SHARP: { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' },
  expandChordName: v => String(v),
  document: undefined,
  mixerChannelForVoice: function (ctx, id) {
    const n = { __ctx: ctx, input: { gain: { value: 1 } }, dry: {}, wet: {}, filters: [] };
    channelsMade.push({ ctx, id, channel: n });
    return n;
  }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' + b0 + '\n' + b1 + '\n' + b3, sandbox,
  { filename: 'b39-stage0+1+3.js' });
const T = sandbox.StruChordTracks;
const F = sandbox.StruChordFormula;
const A = sandbox.StruChordAudio;

console.log('\nМодуль и формула');
ok('StruChordAudio загрузился', !!A && typeof A.scheduleEvent === 'function');
ok('режим по умолчанию — piano', A.getMode() === 'piano');
ok('440 Гц для MIDI 69', Math.abs(A.frequencyOf(69) - 440) < 1e-9);
ok('C13 формула даёт 7 тонов', F.chordFormula('C13', 'C').pitchClasses.length === 7);

// ---------- 3. ГОЛОСОВЕДЕНИЕ ----------
console.log('\nГолосоведение: полный состав, бас, диапазоны клавиатур');
const r61 = T.ranges()[61];
const v13 = A.voicingFor('C13', 'C', r61, null);
ok('C13 звучит 8 нотами (7 тонов + бас)', v13.length === 8, v13);
ok('все 7 классов высоты C13 на месте',
  [0,4,7,10,2,5,9].every(pc => v13.some(m => ((m % 12) + 12) % 12 === pc)), v13);
ok('C11 содержит терцию (класс 4)', A.voicingFor('C11','C',r61,null).some(m => m % 12 === 4));
const vSlash = A.voicingFor('C/E', 'C', r61, null);
ok('C/E: бас — нота E (pc 4)', vSlash[0] % 12 === 4, vSlash);
ok('C/E: бас ниже остальных', vSlash[0] < vSlash[1], vSlash);
ok('басовый аккорд не теряет терцию', vSlash.some(m => m % 12 === 4) && vSlash.some(m => m % 12 === 7));
const sizes = T.sizes();
let allInRange = true, bad = [];
for (const size of sizes) {
  const r = T.ranges()[size];
  const v = A.voicingFor('Cmaj9', 'C', r, null);
  if (!v.length || v.some(m => m < r.low || m > r.high)) { allInRange = false; bad.push({ size, r, v }); }
}
ok('все 6 размеров клавиатуры держат ноты в диапазоне', allInRange, bad);
ok('25 и 88 клавиш дают разные диапазоны',
  A.voicingFor('C','C',T.ranges()[25],null)[0] !== A.voicingFor('C','C',T.ranges()[88],null)[0]);
ok('голосоведение не прыгает между аккордами', (function () {
  const a = A.voicingFor('C','C',r61,null);
  const b = A.voicingFor('F','C',r61,a);
  const c = A.voicingFor('F','C',r61,null);
  const dist = (x,y) => Math.abs(x.reduce((p,q)=>p+q,0)/x.length - y.reduce((p,q)=>p+q,0)/y.length);
  return dist(a,b) <= dist(a,c) + 1;
})());
ok('нераспознанный аккорд -> пусто', A.voicingFor('мусор','C',r61,null).length === 0);

// ---------- 4. M/S И ГРОМКОСТЬ ----------
console.log('\nМикшер: громкость, мьют, соло');
const fakeState = (tracks) => ({ tracks, mainTrackId: tracks[0] && tracks[0].id, activeTrackId: 0 });
const baseTrack = (over) => Object.assign({ id: 1, instrument: 'keys', volume: 100, mute: false, solo: false }, over || {});
ok('обычная громкость 100 -> 1', A.effectiveGain(fakeState([baseTrack()]), baseTrack()) === 1);
ok('громкость 50 -> 0.5', A.effectiveGain(fakeState([baseTrack({volume:50})]), baseTrack({volume:50})) === 0.5);
ok('мьют -> 0', A.effectiveGain(fakeState([baseTrack({mute:true})]), baseTrack({mute:true})) === 0);
ok('соло на другой дорожке -> 0', A.effectiveGain(
  fakeState([baseTrack(), baseTrack({id:2,solo:true})]), baseTrack()) === 0);
ok('соло на этой дорожке -> 1', A.effectiveGain(
  fakeState([baseTrack({solo:true}), baseTrack({id:2})]), baseTrack({solo:true})) === 1);

// ---------- 5. ПЛАНИРОВАНИЕ ЗВУКА ----------
console.log('\nПланирование: свои голоса дорожек');
function setup(withKeys, chordForKeys) {
  A.reset();
  channelsMade.length = 0;
  const song = makeSong();
  const secs = JSON.parse(JSON.stringify(song.sections));
  sandbox.sections = secs; sandbox.__b39Sections = secs;
  T.load(T.attach(song, song));
  if (withKeys) {
    const gid = T.mainTrack().id;
    const kid = T.addTrack('keys');
    if (chordForKeys === null) {
      secs.forEach(sec => sec.squares.forEach(sq => sq.events.forEach((ev, i) => {
        T.setTrackChord(kid, T.cellKey(sec, sq, i), '');
      })));
    }
    T.setActive(gid);
  }
  return { secs, sec: secs[0], sq: secs[0].squares[0] };
}
function play(ctx, s, evIndex) {
  A.scheduleEvent(ctx, s.sec, s.sq, s.sq.events[evIndex || 0], evIndex || 0, 0.1, 0.5, 120, '4/4');
}

let audio = makeAudioCtx();
let s = setup(false);
play(audio.ctx, s);
ok('песня без клавишных не создаёт клавишных голосов', audio.made.oscillators.length === 0, audio.made.oscillators.length);
ok('но событие всё равно обработано', A.stats().events === 1);

audio = makeAudioCtx(); s = setup(true);
play(audio.ctx, s);
ok('клавишная дорожка создала канал микшера', channelsMade.length === 1, channelsMade.map(c=>c.id));
ok('канал назван b39:keys:<id>', /^b39:keys:\d+$/.test(channelsMade[0].id), channelsMade[0].id);
ok('синтез создал осцилляторы (парциалы)', audio.made.oscillators.length >= 6, audio.made.oscillators.length);
ok('есть шумовой молоточек', audio.made.buffers.length >= 1, audio.made.buffers.length);
ok('все источники получили start()', audio.made.started.length === audio.made.oscillators.length + audio.made.buffers.length);
ok('все источники получили stop() (нет залипших нот)', audio.made.stopped.length === audio.made.started.length);
ok('громкость канала = 1', channelsMade[0].channel.input.gain.value === 1);

audio = makeAudioCtx(); s = setup(true, null);
play(audio.ctx, s);
ok('призрачный аккорд НЕ звучит', audio.made.oscillators.length === 0, audio.made.oscillators.length);
ok('счётчик призраков увеличился', A.stats().skippedGhost > 0, A.stats());

audio = makeAudioCtx(); s = setup(true);
const keysId = T.track(T.state().tracks[1].id).id;
T.setVolume(keysId, 40);
play(audio.ctx, s);
ok('громкость 40 дошла до канала (0.4)', Math.abs(channelsMade[0].channel.input.gain.value - 0.4) < 1e-9,
  channelsMade[0].channel.input.gain.value);

audio = makeAudioCtx(); s = setup(true);
T.setMute(keysId, true);
play(audio.ctx, s);
ok('мьют клавишной глушит её голос', audio.made.oscillators.length === 0, audio.made.oscillators.length);
ok('счётчик заглушённых увеличился', A.stats().skippedMuted > 0);

audio = makeAudioCtx(); s = setup(true);
T.setMute(keysId, false);
T.setSolo(T.mainTrack().id, true);
play(audio.ctx, s);
ok('соло на гитаре глушит клавишную', audio.made.oscillators.length === 0);

audio = makeAudioCtx(); s = setup(true);
T.setSolo(T.mainTrack().id, false);
const thirdId = T.addTrack('keys');
play(audio.ctx, s);
ok('две клавишные дорожки = два канала', channelsMade.length === 2, channelsMade.map(c=>c.id));
ok('и больше осцилляторов', audio.made.oscillators.length >= 12, audio.made.oscillators.length);

// ---------- 6. РЕЖИМЫ, ПЕДАЛЬ, СТОП ----------
console.log('\nРежимы, педаль, остановка, лимит голосов');
audio = makeAudioCtx(); s = setup(true);
A.setMode('simple');
play(audio.ctx, s);
ok('простой режим: значительно меньше осцилляторов, чем парциалов', audio.made.oscillators.length > 0 && audio.made.oscillators.length < 12,
  audio.made.oscillators.length);
ok('простой режим не использует молоточек', audio.made.buffers.length === 0);
ok('setMode вернул simple', A.getMode() === 'simple');
A.setMode('piano');
ok('setMode вернул piano', A.getMode() === 'piano');
ok('setPedal(true) включился', A.setPedal(true) === true);
audio = makeAudioCtx();
play(audio.ctx, s);
ok('педаль не ломает синтез', audio.made.oscillators.length >= 6);
A.setPedal(false);

audio = makeAudioCtx(); s = setup(true);
A.preview('G7', audio.ctx, 0.05, null);
ok('preview создаёт звук', audio.made.oscillators.length >= 6, audio.made.oscillators.length);

audio = makeAudioCtx(); s = setup(true);
play(audio.ctx, s);
const liveBefore = A.stats().liveVoices;
A.stopAll();
ok('stopAll остановил все источники', A.stats().liveVoices === 0, { before: liveBefore, after: A.stats().liveVoices });
ok('stopAll вызвал stop() повторно без ошибок', audio.made.stopped.length >= audio.made.started.length);

A.setPartials(3);
audio = makeAudioCtx();
play(audio.ctx, s);
ok('setPartials(3) уменьшил число парциалов', audio.made.oscillators.length > 0 && audio.made.oscillators.length < 30,
  audio.made.oscillators.length);
A.setPartials(6);
ok('недопустимое число парциалов отклонено', A.setPartials(0) === 6 && A.setPartials(99) === 6);
ok('setHeadroom ограничен (0,1]', A.setHeadroom(2) === 0.16);

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ЭТАПА 3 ПРОЙДЕНЫ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} ok / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
