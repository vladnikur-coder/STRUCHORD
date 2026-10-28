/* Тесты этапа 4 (STAGE 4 / клавишные аппликатуры) для STRUCHORD.
   Запуск: node test_stage4.js [базовый.html] [пропатченный.html]
   DOM-тесты требуют jsdom; без них пропускаются. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage4', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРА ----------
console.log('\nСтруктура: блок, 4 хука, расширения модели и звука');
const needles = [
  ['маркер STAGE4', '// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<'],
  ['маркер /STAGE4', '// <<< B-39 STAGE4 END (KEYS VOICING UI) <<<'],
  ['неймспейс StruChordKeys', 'HOST.StruChordKeys = api;'],
  ['обёртка renderFingeringSVG', 'HOST.renderFingeringSVG = function (fingers, bottomPad, opts)'],
  ['хук тултипа', 'chord: chordName, cellKey: b39CellKey'],
  ['хук pinned now', 'customFingers: pinnedFingers, chord: name'],
  ['хук pinned next', 'customFingers: nextFingers, chord: pos.chord'],
  ['хук панели Сейчас', 'customFingers: fingers, chord: chord, cellKey: b39CellKey'],
  ['модель: voicingForChord', 'function voicingForChord(id, chord)'],
  ['модель: v: ключи', "var chordKey = !!allowChordKeys && /^v:.{1,80}$/.test(k);"],
  ['звук: провайдер голосов', 'function setVoicingProvider(fn)'],
  ['звук: notifier', 'function setEventNotifier(fn)'],
  ['приоритет тонов', 'function toneRank(degree)'],
  ['панель клавиатуры', "id = 'b39KeysPanel'"],
  ['селектор размера', "aria-label', 'Размер клавиатуры'"],
  ['селектор тембра', "aria-label', 'Тембр'"],
  ['листание вариантов', 'function stepVariant(delta)'],
];
for (const [name, needle] of needles) ok(name, patched.includes(needle));
ok('базовый файл без STAGE4', !base.includes('B-39 STAGE4 BEGIN'));
ok('прежние части на месте', ['B-39 STAGE0 BEGIN','B-39 STAGE1 BEGIN','B-39 STAGE2 BEGIN','B-39 STAGE3 BEGIN']
  .every(x => patched.includes(x)));
ok('4 хука с chord:', (patched.match(/chord: (chordName|name|pos\.chord|chord), cellKey|chord: (name|pos\.chord)/g) || []).length >= 3);

// ---------- 2. МОДУЛИ В ПЕСОЧНИЦЕ ----------
function markerBlock(src, begin, end) {
  const i = src.indexOf(begin), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('маркер не найден: ' + begin);
  return src.slice(i, j + end.length);
}
const b0 = markerBlock(patched,'// >>> B-39 STAGE0 BEGIN (B-102) <<<','// <<< B-39 STAGE0 END (B-102) <<<');
const b1 = markerBlock(patched,'// >>> B-39 STAGE1 BEGIN (TRACKS) <<<','// <<< B-39 STAGE1 END (TRACKS) <<<');
const b3 = markerBlock(patched,'// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<','// <<< B-39 STAGE3 END (KEYS AUDIO) <<<');
const b4 = markerBlock(patched,'// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<','// <<< B-39 STAGE4 END (KEYS VOICING UI) <<<');

function makeAudioCtx() {
  const made = { oscillators: [], buffers: [], started: [], stopped: [] };
  const param = v => ({ value: v, setValueAtTime(x){this.value=x;}, exponentialRampToValueAtTime(x){this.value=x;}, linearRampToValueAtTime(x){this.value=x;} });
  const node = k => ({ kind:k, gain:param(1), frequency:param(440), pan:param(0), Q:param(1), type:'', buffer:null, onended:null,
    connect(n){return n;}, disconnect(){}, start(t){made.started.push(this);}, stop(){made.stopped.push(this); if(this.onended)this.onended();} });
  return { made, ctx: {
    currentTime:0, sampleRate:44100, state:'running', destination:node('dest'),
    createGain(){return node('gain');}, createOscillator(){const n=node('osc');made.oscillators.push(n);return n;},
    createBufferSource(){const n=node('buf');made.buffers.push(n);return n;},
    createBiquadFilter(){return node('flt');}, createStereoPanner(){return node('pan');},
    createConvolver(){return node('conv');},
    createBuffer(c,l,sr){return {length:l,sampleRate:sr,getChannelData:()=>new Float32Array(l)};},
    resume(){return Promise.resolve();}
  }};
}
const channels = [];
const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date, Float32Array,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout(){return 0;}, clearTimeout(){},
  __b39Sections: [], document: undefined,
  songStore: { dispatch(l,m){return m();}, subscribe(){return ()=>{};}, log(){return [];} },
  normalizeAccidentals: v => String(v).replace(/♭/g,'b').replace(/♯/g,'#'),
  normalizeChordCase: v => String(v), getKeyStyle: k => (/b/i.test(String(k))?'flat':'sharp'),
  chordNameForReadablePreference: v => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: {'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',B:'Cb'},
  FLAT_TO_SHARP: {Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B'},
  expandChordName: v => String(v),
  mixerChannelForVoice(ctx,id){ const c={__ctx:ctx,input:{gain:{value:1}},dry:{},wet:{},filters:[]}; channels.push({ctx,id,channel:c}); return c; },
  renderFingeringSVG: function(){ return 'GUITAR_SVG'; }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' + b0 + '\n' + b1 + '\n' + b3 + '\n' + b4, sandbox,
  { filename: 'b39-stage0+1+3+4.js' });
const T = sandbox.StruChordTracks, F = sandbox.StruChordFormula, A = sandbox.StruChordAudio, K = sandbox.StruChordKeys;

console.log('\nМодули загрузились');
ok('StruChordKeys существует', !!K && typeof K.generateKeysVoicings === 'function');
ok('StruChordAudio получил провайдер', typeof A.setVoicingProvider === 'function');
ok('StruChordTracks получил v: варианты', typeof T.setVoicingForChord === 'function');

function song() {
  return { schemaVersion:9, globalKey:'C', sections:[
    { id:1, squares:[{ id:10, events:[{chord:'Cmaj7',span:1},{chord:'Am7',span:1}] }] }
  ]};
}
function setup() {
  A.reset(); channels.length = 0;
  const s = song(), secs = JSON.parse(JSON.stringify(s.sections));
  sandbox.sections = secs; sandbox.__b39Sections = secs;
  T.load(T.attach(s,s));
  const gid = T.mainTrack().id;
  const kid = T.addTrack('keys');
  T.setActive(kid);
  return { secs, sec:secs[0], sq:secs[0].squares[0], kid, gid };
}
const st = setup();
const r61 = T.ranges()[61];

// ---------- 3. ПРИОРИТЕТ ТОНОВ ----------
console.log('\nПриоритет тонов (R12)');
ok('корень важнее терции', K.toneRank('1') < K.toneRank('3'));
ok('терция важнее септимы', K.toneRank('3') < K.toneRank('b7'));
ok('септима важнее расширений', K.toneRank('b7') < K.toneRank('9'));
ok('квинта уходит раньше расширений', K.toneRank('9') < K.toneRank('5'));
ok('ундецима уходит первой', K.toneRank('5') < K.toneRank('11'));
ok('handLimit: 25 -> 5, 61 -> 8', K.handLimit(25) === 5 && K.handLimit(61) === 8);

// ---------- 4. ВАРИАНТЫ ----------
console.log('\nВарианты позиций');
const variants = K.generateKeysVoicings('C13','C',r61,null,{});
ok('C13 даёт несколько вариантов', variants.length >= 2 && variants.length <= 5, variants.length);
ok('все варианты непустые', variants.every(v => v.length > 0));
ok('все ноты внутри диапазона 61 клавиш', variants.every(v => v.every(m => m >= r61.low && m <= r61.high)), variants[0]);
ok('в варианте есть корень C', variants[0].some(m => m % 12 === 0));
ok('в варианте есть терция E', variants[0].some(m => m % 12 === 4));
ok('в варианте есть септима A#', variants[0].some(m => m % 12 === 10));
ok('C13 полный: есть и квинта, и ундецима', variants[0].some(m=>m%12===7) && variants[0].some(m=>m%12===5), variants[0]);
const limited = K.generateKeysVoicings('C13','C',r61,null,{ maxTones:5 });
ok('при лимите 5 квинта и ундецима отброшены',
  !limited[0].some(m=>m%12===7) && !limited[0].some(m=>m%12===5), limited[0]);
ok('при лимите 5 корень/терция/септима остались',
  [0,4,10].every(pc => limited[0].some(m=>m%12===pc)), limited[0]);
const slash = K.generateKeysVoicings('C/E','C',r61,null,{});
ok('C/E: бас E во всех вариантах', slash.every(v => v[0] % 12 === 4), slash[0]);
const withPrev = K.generateKeysVoicings('F','C',r61,variants[0],{});
ok('голосоведение с prev не ломает варианты', withPrev.length >= 2 && withPrev[0].length > 0);
ok('все варианты уникальны', new Set(variants.map(v=>v.join(','))).size === variants.length, variants.map(v=>v.join(',')));
ok('нераспознанный аккорд -> пусто', K.generateKeysVoicings('мусор','C',r61,null,{}).length === 0);
let sizesOk = true, bad = [];
for (const size of T.sizes()) {
  const r = T.ranges()[size];
  const v = K.generateKeysVoicings('Cmaj9','C',r,null,{});
  if (!v.length || v.some(x => x.some(m=>m<r.low||m>r.high))) { sizesOk=false; bad.push(size); }
}
ok('все 6 размеров клавиатуры корректны', sizesOk, bad);

// ---------- 5. SVG ----------
console.log('\nРендер клавиатуры');
const kb = K.keyboardSVG(60, 84, [60,64,67], { whiteW:16, whiteH:68, showFingers:true, rootPc:0 });
ok('keyboardSVG вернул <svg>', kb.svg.startsWith('<svg') && kb.svg.includes('</svg>'));
ok('2 октавы = 15 белых клавиш', kb.whites === 15, kb.whites);
ok('есть белые и чёрные прямоугольники', (kb.svg.match(/<rect/g)||[]).length > 20);
ok('подсвеченные ноты окрашены акцентом', kb.svg.includes('var(--color-accent'));
ok('пальцы нарисованы цифрами', /font-weight="700"/.test(kb.svg) && kb.svg.includes('>1</text>'));
ok('корень отмечен кружком', kb.svg.includes('<circle'));
const noFingers = K.keyboardSVG(60,84,[60],{showFingers:false});
ok('showFingers=false убирает пальцы', !noFingers.svg.includes('font-weight="700"'));
const compact = K.renderKeysVoicingSVG('Cmaj7', st.kid, { cellKey:'1:10:0' });
ok('renderKeysVoicingSVG вернул клавиатуру', compact.includes('<svg') && compact.includes('b39-keys-svg'));
ok('компактная схема показывает окно/бас', /Окно|Бас/.test(compact));

// ---------- 6. ОБЁРТКА renderFingeringSVG ----------
console.log('\nПодмена грифа на клавиатуру');
K.installRenderer();
ok('при активной клавишной -> клавиатура',
  sandbox.renderFingeringSVG([0,0,0,0,0,0], 24, { chord:'Cmaj7', cellKey:'1:10:0' }).includes('<svg'));
ok('без chord -> остаётся гриф',
  sandbox.renderFingeringSVG([0,0,0,0,0,0], 24, {}) === 'GUITAR_SVG');
T.setActive(st.gid);
ok('при активной гитаре -> гриф',
  sandbox.renderFingeringSVG([0,0,0,0,0,0], 24, { chord:'Cmaj7' }) === 'GUITAR_SVG');
T.setActive(st.kid);

// ---------- 7. ВАРИАНТЫ В МОДЕЛИ ----------
console.log('\nСохранение выбранного варианта');
ok('изначально вариант 0', K.variantIndex(st.kid,'Cmaj7',null) === 0);
K.setVariantIndex(st.kid,'Cmaj7','1:10:0',2,5);
ok('после листания вариант 2', K.variantIndex(st.kid,'Cmaj7',null) === 2);
ok('модель помнит v:Cmaj7', T.voicingForChord(st.kid,'Cmaj7') === 2);
ok('setVoicingForChord отклоняет мусор', T.setVoicingForChord(st.kid,'Cmaj7',-1) === false);
const saved = T.exportForSave();
const round = Object.assign({}, song(), saved);
T.load(T.attach(round, round));
ok('после сохранить→загрузить вариант на месте', T.voicingForChord(st.kid,'Cmaj7') === 2, T.state().tracks);
ok('v: ключ не выброшен санитайзером', JSON.stringify(saved).includes('v:Cmaj7'));

// ---------- 8. СВЯЗЬ СО ЗВУКОМ ----------
console.log('\nСвязь со звуком');
const st8 = setup();
let notified = null;
A.setEventNotifier(info => { notified = info; });
K.installRenderer();
// провайдер ставим вручную (в браузере это делает boot)
A.setVoicingProvider((chord,key,range,prev,trackId) => {
  const v = K.generateKeysVoicings(chord,key,range,prev,{});
  return v.length ? v[K.variantIndex(trackId,chord,null) % v.length] : null;
});
const audio = makeAudioCtx();
A.scheduleEvent(audio.ctx, st8.sec, st8.sq, st8.sq.events[0], 0, 0.1, 0.5, 120, '4/4');
ok('notifier получил событие', !!notified && notified.cell === '1:10:0', notified && notified.cell);
ok('звук запланирован с вариантом', audio.made.oscillators.length > 0, audio.made.oscillators.length);
const before = audio.made.oscillators.length;
A.setVoicingProvider(() => [60]);          // одна нота
const audio2 = makeAudioCtx();
A.scheduleEvent(audio2.ctx, st8.sec, st8.sq, st8.sq.events[0], 0, 0.1, 0.5, 120, '4/4');
ok('провайдер реально меняет звук', audio2.made.oscillators.length < before,
  { before, after: audio2.made.oscillators.length });
ok('звук не использует getChordNotes', !/getChordNotes\s*\(/.test(b4.split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n')));

// ---------- 9. DOM (jsdom) ----------
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {}
if (!JSDOM) console.log('\nDOM-тесты пропущены: jsdom не найден.');
else {
  console.log('\nDOM: кнопка, панель, размер, тембр, варианты');
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="transport-bar"><button id="btnPlay"></button>
    <button id="b39MixerBtn"></button>
    <div class="transport-dock-hint" id="transportDockHint"></div></div>
    <input type="checkbox" id="showFingers" checked></body></html>`,
    { runScripts:'outside-only', url:'http://localhost/' });
  const w = dom.window, d = w.document;
  const secs = [{id:1,squares:[{id:10,events:[{chord:'Cmaj7',span:1},{chord:'Am7',span:1}]}]}];
  w.__b39Sections = secs;
  w.songStore = { dispatch(l,m){return m();}, subscribe(fn){w.__sub=fn;return ()=>{};}, log(){return [];} };
  w.normalizeAccidentals = v=>String(v).replace(/♭/g,'b').replace(/♯/g,'#');
  w.normalizeChordCase = v=>String(v); w.getKeyStyle = k=>'sharp'; w.chordNameForReadablePreference = v=>v;
  w.CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  w.SHARP_TO_FLAT = {'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',B:'Cb'};
  w.FLAT_TO_SHARP = {Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B'};
  w.expandChordName = v=>String(v);
  w.mixerChannelForVoice = ()=>({input:{gain:{value:1}},dry:{},wet:{},filters:[]});
  w.renderFingeringSVG = ()=>'GUITAR_SVG';
  w.eval('var sections = window.__b39Sections; var globalKey = "C";');
  w.eval(b0); w.eval(b1); w.eval(b3); w.eval(b4);
  const KK = w.StruChordKeys, TT = w.StruChordTracks;
  KK.boot();
  TT.load(TT.attach({schemaVersion:9,globalKey:'C',sections:secs},{schemaVersion:9,globalKey:'C',sections:secs}));
  const gid = TT.mainTrack().id, kid = TT.addTrack('keys'); TT.setActive(kid);
  const $ = s=>d.querySelector(s), $$ = s=>Array.from(d.querySelectorAll(s));
  const click = n=>n.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok('стили STAGE4 вставлены', !!d.getElementById('b39KeysCss'));
  ok('кнопка «Клавиатура» создана', !!d.getElementById('b39KeysBtn'));
  ok('панель скрыта по умолчанию', KK.panel().hidden === true);
  click(d.getElementById('b39KeysBtn'));
  ok('клик открыл панель', KK.panel().hidden === false);
  KK.render();
  ok('панель показывает клавиатуру', KK.panel().querySelector('svg.b39-keys-svg') !== null);
  ok('счётчик вариантов вида 1/N', /\d+\/\d+/.test($('.b39-keys-count').textContent), $('.b39-keys-count').textContent);
  const size = $$('.b39-keys-head select')[0];
  size.value = '88'; size.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('смена размера дошла до модели', TT.keyRange(kid).size === 88, TT.keyRange(kid));
  const nav = $$('.b39-keys-nav button');
  const c0 = $('.b39-keys-count').textContent;
  click(nav[1]);
  ok('листание вариантов меняет счётчик', $('.b39-keys-count').textContent !== c0,
    { before:c0, after:$('.b39-keys-count').textContent });
  const timbre = $$('.b39-keys-head select')[1];
  timbre.value = 'simple'; timbre.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('тембр переключил звук в простой режим', w.StruChordAudio.getMode() === 'simple');
  TT.setActive(gid); KK.render();
  ok('при гитаре панель показывает подсказку', KK.panel().textContent.includes('гитара'));
  ok('обёртка рендера работает в DOM',
    w.renderFingeringSVG([0,0,0,0,0,0],24,{chord:'Cmaj7'}) === 'GUITAR_SVG');
  TT.setActive(kid);
  ok('после возврата на клавиши снова клавиатура',
    w.renderFingeringSVG([0,0,0,0,0,0],24,{chord:'Cmaj7'}).includes('<svg'));
  dom.window.close();
}

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ЭТАПА 4 ПРОЙДЕНЫ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} ok / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
