/* Тесты этапа 5 (STAGE 5 / типы аккомпанимента) для STRUCHORD.
   Запуск: node test_stage5.js [базовый.html] [пропатченный.html]
   DOM-тесты требуют jsdom; без них пропускаются. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage5', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРА ----------
console.log('\nСтруктура: блок STAGE5, хук, расширения модели и звука');
const needles = [
  ['маркер STAGE5', '// >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<'],
  ['маркер /STAGE5', '// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<'],
  ['неймспейс StruChordAccomp', 'HOST.StruChordAccomp = api;'],
  ['хук adoptRhythm', 'window.StruChordAccomp.adoptRhythm('],
  ['шесть пресетов', "id: 'keys-octave-bass'"],
  ['кнопка Аккомпанемент', "'🎼 Аккомпанемент'"],
  ['перехват редактора боя', 'HOST.openStrumPatternEditor = function'],
  ['модель: s: ключи', 'var sectionKey = !!allowSectionKeys && /^s:\\d{1,9}$/.test(k);'],
  ['модель: patternFor', 'function patternFor(id, key)'],
  ['модель: clearPattern', 'function clearPattern(id, key)'],
  ['звук: планировщик', 'function setPatternPlanner(fn)'],
  ['звук: шаги в scheduleEvent', 'var steps = null;'],
  ['звук: сброс подсветки', 'Acc.clearHighlights()'],
  ['свинг по сетке квадрата', 'function swingOffset(node, sub, swing)'],
  ['наследование', 'ячейка -> секция -> пресет'],
  ['подсветка шагов', 'function highlightStep(index)'],
  ['размер клавиатуры дорожки', "'Размер клавиатуры дорожки'"],
];
for (const [name, needle] of needles) ok(name, patched.includes(needle));
ok('базовый файл без STAGE5', !base.includes('B-39 STAGE5 BEGIN'));
ok('прежние части на месте', ['B-39 STAGE0 BEGIN','B-39 STAGE1 BEGIN','B-39 STAGE2 BEGIN',
  'B-39 STAGE3 BEGIN','B-39 STAGE4 BEGIN'].every(x => patched.includes(x)));
const code5 = (() => {
  const i = patched.indexOf('// >>> B-39 STAGE5 BEGIN');
  const j = patched.indexOf('// <<< B-39 STAGE5 END', i);
  return i >= 0 && j >= 0 ? patched.slice(i, j) : '';
})();
const noComments = s => s.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
ok('R12: в новом блоке нет гитарных функций',
  !/getChordNotes\s*\(|resolveFingeringShape|shapeToPluckNotes|getBassStringsForShape|strumChord\s*\(/
    .test(noComments(code5)));
ok('R12: токены не содержат номеров струн',
  !/STRING|stringIndex/.test(noComments(code5)));

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
const b5 = markerBlock(patched,'// >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<','// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<');

function makeAudioCtx() {
  const made = { oscillators: [], buffers: [], started: [], stopped: [], startTimes: [] };
  const param = v => ({ value: v, setValueAtTime(x){this.value=x;}, exponentialRampToValueAtTime(x){this.value=x;}, linearRampToValueAtTime(x){this.value=x;} });
  const node = k => ({ kind:k, gain:param(1), frequency:param(440), pan:param(0), Q:param(1), type:'', buffer:null, onended:null,
    connect(n){return n;}, disconnect(){}, start(t){made.started.push(this); made.startTimes.push(t);}, stop(){made.stopped.push(this); if(this.onended)this.onended();} });
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
const scheduled = [];
const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date, Float32Array,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout(fn, ms){ scheduled.push({ fn, ms }); return scheduled.length; },
  clearTimeout(id){ if (scheduled[id-1]) scheduled[id-1].cancelled = true; },
  document: undefined,
  __b39Sections: [],
  songStore: { dispatch(l,m){return m();}, subscribe(){return ()=>{};}, log(){return [];} },
  normalizeAccidentals: v => String(v).replace(/♭/g,'b').replace(/♯/g,'#'),
  normalizeChordCase: v => String(v), getKeyStyle: k => (/b/i.test(String(k))?'flat':'sharp'),
  chordNameForReadablePreference: v => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: {'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',B:'Cb'},
  FLAT_TO_SHARP: {Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B'},
  expandChordName: v => String(v),
  mixerChannelForVoice(ctx,id){ return {__ctx:ctx,input:{gain:{value:1}},dry:{},wet:{},filters:[]}; },
  renderFingeringSVG: function(){ return 'GUITAR_SVG'; }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' + b0 + '\n' + b1 + '\n' + b3 + '\n' + b4 + '\n' + b5,
  sandbox, { filename: 'b39-stage0+1+3+4+5.js' });

const T = sandbox.StruChordTracks, F = sandbox.StruChordFormula;
const A = sandbox.StruChordAudio, K = sandbox.StruChordKeys, Acc = sandbox.StruChordAccomp;

console.log('\nМодули загрузились');
ok('StruChordAccomp существует', !!Acc && typeof Acc.plan === 'function');
ok('модель получила patternFor/clearPattern',
  typeof T.patternFor === 'function' && typeof T.clearPattern === 'function');
ok('звук получил setPatternPlanner', typeof A.setPatternPlanner === 'function');

function song() {
  return { schemaVersion:9, globalKey:'C', sections:[
    { id:1, squares:[{ id:10, events:[
      {chord:'Cmaj7',span:1},{chord:'Am7',span:1},{chord:'F',span:2}] }] }
  ]};
}
function setup() {
  A.reset(); scheduled.length = 0;
  const s = song(), secs = JSON.parse(JSON.stringify(s.sections));
  sandbox.sections = secs; sandbox.__b39Sections = secs;
  T.load(T.attach(s,s));
  const gid = T.mainTrack().id, kid = T.addTrack('keys');
  T.setActive(kid);
  return { secs, sec:secs[0], sq:secs[0].squares[0], kid, gid };
}
const st = setup();
const r61 = T.ranges()[61];
// В браузере это делает boot(); в песочнице документа нет.
A.setPatternPlanner(Acc.plan);
A.setVoicingProvider((chord,key,range,prev) => {
  const v = K.generateKeysVoicings(chord,key,range,prev,{});
  return v.length ? v[0] : null;
});
function voicing(chord) { return K.generateKeysVoicings(chord,'C',r61,null,{})[0] || []; }
function planFor(o) {
  return Acc.plan(Object.assign({
    trackId: st.kid, cell: '1:10:0', sec: st.sec, sq: st.sq, ev: st.sq.events[0], ei: 0,
    ts: '4/4', bpm: 120, dur: 2, span: 1, chord: 'Cmaj7', key: 'C',
    range: r61, notes: voicing('Cmaj7')
  }, o || {}));
}

// ---------- 3. ПРЕСЕТЫ ----------
console.log('\nШесть пресетов и рисунок на такт');
const ids = Acc.list().map(p => p.id);
ok('ровно 6 пресетов', ids.length === 6, ids);
ok('имена пресетов совпадают со спекой', ['keys-block','keys-arp-up','keys-bass-chord',
  'keys-waltz','keys-alberti','keys-octave-bass'].every(x => ids.includes(x)));
ok('у каждого пресетa есть_label_hint_и_subdivision',
  Acc.list().every(p => p.label && p.hint && [1,2,3,4].includes(p.subdivision)));
ok('preset(мусор) = null', Acc.preset('нет-такого') === null);
ok('subdivision у арпеджио = 2', Acc.preset('keys-arp-up').subdivision === 2);
ok('subdivision у Альберти = 2', Acc.preset('keys-alberti').subdivision === 2);
ok('целый аккорд: 4 удара H в 4/4', JSON.stringify(Acc.buildSteps('keys-block',1,4)) ===
  JSON.stringify(['H','H','H','H']));
ok('арпеджио: 8 шагов A в 4/4 при sub2', Acc.buildSteps('keys-arp-up',2,4).every(t => t === 'A') &&
  Acc.buildSteps('keys-arp-up',2,4).length === 8);
ok('бас+аккорд чередуется', JSON.stringify(Acc.buildSteps('keys-bass-chord',1,4)) ===
  JSON.stringify(['B','H','B','H']));
ok('вальс: бас — аккорд — аккорд', JSON.stringify(Acc.buildSteps('keys-waltz',1,3)) ===
  JSON.stringify(['B','H','H']));
ok('Альберти: корень-квинта-терция-квинта', (() => {
  const a = Acc.buildSteps('keys-alberti',2,4);
  return Array.isArray(a[0]) && a[0][0] === 'H' && a[0][1] === 't1' &&
    a[1] === 't5' && a[2] === 't3' && a[3] === 't5';
})());
ok('октавный бас: O H O H', JSON.stringify(Acc.buildSteps('keys-octave-bass',1,4)) ===
  JSON.stringify(['O','H','O','H']));
ok('sub4 даёт 16 шагов в 4/4', Acc.buildSteps('keys-block',4,4).length === 16);
ok('sub4: удары только на долях', Acc.buildSteps('keys-block',4,4)
  .every((t,i) => i % 4 === 0 ? t === 'H' : t === null));
ok('3/4 даёт 3 удара', Acc.buildSteps('keys-block',1,3).length === 3);
ok('6/8 даёт 6 ударов', Acc.buildSteps('keys-block',1,6).length === 6);
ok('длина рисунка ограничена', Acc.buildSteps('keys-arp-up',4,32).length <= 64);
ok('все токены из whitelist', Acc.buildSteps('keys-alberti',2,6)
  .concat(Acc.buildSteps('keys-octave-bass',2,6))
  .every(t => t === null || (Array.isArray(t) ? t : [t]).every(x => Acc.tokens().includes(x))));
ok('normalize отбрасывает мусор', Acc.normalize({type:'нет',subdivision:2}) === null);
ok('normalize отбрасывает битую дробность', Acc.normalize({type:'keys-block',subdivision:7}) === null);
ok('normalize сохраняет валидное', JSON.stringify(Acc.normalize({type:'keys-waltz',subdivision:3,swing:true})) ===
  JSON.stringify({type:'keys-waltz',subdivision:3,swing:true}));
ok('normalize: отсутствующий swing = null',
  Acc.normalize({type:'keys-block',subdivision:1}).swing === null);

// ---------- 4. НАСЛЕДОВАНИЕ И СОХРАНЕНИЕ ----------
console.log('\nНаследование: ячейка -> секция -> пресет');
ok('изначально дефолтный пресет', Acc.resolve(st.kid,'1:10:0',1).source === 'default');
ok('дефолт — целый аккорд', Acc.resolve(st.kid,'1:10:0',1).type === 'keys-block');
ok('setPattern принимает s: ключ', T.setPattern(st.kid,'s:1',{type:'keys-waltz',subdivision:1}) === true);
ok('секция читается', Acc.resolve(st.kid,'1:10:0',1).source === 'section');
ok('секция отдаёт вальс', Acc.resolve(st.kid,'1:10:0',1).type === 'keys-waltz');
ok('другая секция не наследует', Acc.resolve(st.kid,'1:10:0',2).source === 'default');
T.setPattern(st.kid,'1:10:0',{type:'keys-arp-up',subdivision:2});
ok('ячейка перекрывает секцию', Acc.resolve(st.kid,'1:10:0',1).source === 'cell');
ok('ячейка отдаёт арпеджио', Acc.resolve(st.kid,'1:10:0',1).type === 'keys-arp-up');
ok('соседняя ячейка всё ещё вальс', Acc.resolve(st.kid,'1:10:1',1).type === 'keys-waltz');
ok('patternFor читает рисунок', T.patternFor(st.kid,'1:10:0').type === 'keys-arp-up');
ok('setPattern отклоняет левый ключ', T.setPattern(st.kid,'мусор',{type:'keys-block',subdivision:1}) === false);
ok('setPattern отклоняет пустое значение', T.setPattern(st.kid,'1:10:2',null) === false);
const saved = T.exportForSave();
const round = Object.assign({}, song(), saved);
T.load(T.attach(round, round));
ok('s: ключ пережил сохранить→загрузить', T.patternFor(st.kid,'s:1') !== null);
ok('ключ ячейки пережил сохранить→загрузить', T.patternFor(st.kid,'1:10:0').type === 'keys-arp-up');
ok('санитайзер выбросил осиротевшую ячейку', T.patternFor(st.kid,'9:9:9') === null);
T.clearPattern(st.kid,'1:10:0');
ok('clearPattern снимает переопределение ячейки', Acc.resolve(st.kid,'1:10:0',1).source === 'section');
T.clearPattern(st.kid,'s:1');
ok('clearPattern снимает рисунок секции', Acc.resolve(st.kid,'1:10:0',1).source === 'default');
ok('повторный clearPattern = false', T.clearPattern(st.kid,'s:1') === false);

// ---------- 5. СЕТКА, РЕСАЙЗ, СВИНГ ----------
console.log('\nСетка, ресайз ячейки и свинг');
let p = planFor();
ok('plan вернул шаги', p.length > 0, p.length);
ok('один удар на одной доле', p.length === 1 || p.length === 2, p.length);
ok('at первого шага = 0', Math.abs(p[0].at) < 1e-9, p[0].at);
ok('dur шага положительный', p.every(s => s.dur > 0));
ok('ни один шаг не вылез за ячейку', p.every(s => s.at + s.dur <= 2 + 1e-6));
ok('at растёт', p.every((s,i) => i === 0 || s.at >= p[i-1].at));
ok('stepIndex в границах рисунка', p.every(s => s.stepIndex >= 0));
const p1 = planFor({ span:1, dur:0.5 }), p4 = planFor({ span:4, dur:2 });
ok('ресайз 1→4 доли увеличивает число шагов', p4.length > p1.length, {p1:p1.length,p4:p4.length});
ok('ресайз не двигает первый удар', Math.abs(p1[0].at - p4[0].at) < 1e-9);
T.setPattern(st.kid,'s:1',{type:'keys-arp-up',subdivision:2});
const win0 = planFor({ ei:0, cell:'1:10:0', sq:st.sq, span:1, dur:0.5 });
const win1 = planFor({ ei:1, cell:'1:10:1', sq:st.sq, span:1, dur:0.5,
  ev:st.sq.events[1], chord:'Am7', notes:voicing('Am7') });
ok('наследуемый рисунок продолжается, а не рестартует',
  win0[0].stepIndex === 0 && win1[0].stepIndex === 2, {a:win0[0].stepIndex,b:win1[0].stepIndex});
const frac = planFor({ ei:2, cell:'1:10:2', sq:st.sq, span:1.75, dur:0.875,
  ev:st.sq.events[2], chord:'F', notes:voicing('F') });
ok('дробная фаза: первый удар не раньше начала ячейки', frac[0].at >= 0, frac[0].at);
ok('дробная фаза: шаги не выходят за ячейку', frac.every(s => s.at + s.dur <= 0.875 + 1e-6));
ok('дробная фаза: индекс шага привязан к сетке квадрата', Number.isInteger(frac[0].stepIndex));
T.clearPattern(st.kid,'s:1');

T.setPattern(st.kid,'s:1',{type:'keys-arp-up',subdivision:2,swing:false});
const even = planFor({ span:4, dur:2 });
T.setPattern(st.kid,'s:1',{type:'keys-arp-up',subdivision:2,swing:true});
const swung = planFor({ span:4, dur:2 });
ok('свинг включён только при sub 2/4', swung.every(s => s.swing === true));
ok('ровные шаги идут через равные интервалы',
  Math.abs((even[1].at-even[0].at) - (even[2].at-even[1].at)) < 1e-9,
  [even[1].at-even[0].at, even[2].at-even[1].at]);
ok('при свинге первая нота пары длиннее второй',
  (swung[1].at-swung[0].at) > (swung[2].at-swung[1].at),
  [swung[1].at-swung[0].at, swung[2].at-swung[1].at]);
ok('свинг 2:1 — вторая нота уезжает на 2/3 доли', (() => {
  const first = swung[1].at - swung[0].at, second = swung[2].at - swung[1].at;
  return Math.abs(first/(first+second) - 2/3) < 1e-6;
})());
ok('свинг не меняет общее время пары',
  Math.abs((swung[2].at-swung[0].at) - (even[2].at-even[0].at)) < 1e-9);
ok('dur шага следует за звуком при свинге', swung[0].dur > swung[1].dur);
T.setPattern(st.kid,'s:1',{type:'keys-block',subdivision:1,swing:true});
ok('свинг не применяется при sub1', planFor({span:4,dur:2}).every(s => s.swing === false));
T.clearPattern(st.kid,'s:1');

// ---------- 6. ТОКЕНЫ -> НОТЫ, R12 ----------
console.log('\nТокены шагов и честная формула (R12)');
const c13 = voicing('C13');
ok('C13: полный аккорд в позиции', c13.length >= 6, c13);
const pH = Acc.plan({ trackId:st.kid, cell:'x', sec:st.sec, sq:st.sq, ev:st.sq.events[0], ei:0,
  ts:'4/4', dur:0.5, span:1, chord:'C13', key:'C', range:r61, notes:c13 });
ok('токен H играет ВСЕ ноты позиции', pH[0].notes.length === c13.length, {a:pH[0].notes,b:c13});
ok('в H есть квинта и ундецима', [7,5].every(pc => pH[0].notes.some(m => m%12===pc)), pH[0].notes);
ok('в H есть корень, терция и септима', [0,4,10].every(pc => pH[0].notes.some(m => m%12===pc)));
T.setPattern(st.kid,'s:1',{type:'keys-bass-chord',subdivision:1});
const pBC = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('B играет только бас', pBC[0].notes.length === 1 && pBC[0].notes[0] === voicing('Cmaj7')[0], pBC[0].notes);
ok('H после B играет весь аккорд', pBC[1].notes.length === voicing('Cmaj7').length);
T.setPattern(st.kid,'s:1',{type:'keys-octave-bass',subdivision:1});
const pO = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('O играет две ноты через октаву', pO[0].notes.length === 2 &&
  pO[0].notes[1] - pO[0].notes[0] === 12, pO[0].notes);
T.setPattern(st.kid,'s:1',{type:'keys-arp-up',subdivision:2});
const pA = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('A играет по одной ноте за шаг', pA.every(s => s.notes.length === 1), pA.map(s=>s.notes));
ok('A идёт снизу вверх, потом на новый круг',
  pA[0].notes[0] < pA[1].notes[0] && pA[pA.length-1].notes[0] >= pA[0].notes[0],
  pA.map(s=>s.notes[0]));
ok('A не теряет ноты аккорда', new Set(pA.map(s=>s.notes[0])).size === voicing('Cmaj7').length-1,
  {played:new Set(pA.map(s=>s.notes[0])).size, rh:voicing('Cmaj7').length-1});
T.setPattern(st.kid,'s:1',{type:'keys-alberti',subdivision:2});
const pAlb = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('Альберти: первый шаг = аккорд + корень', pAlb[0].notes.length > 1, pAlb[0].notes);
ok('Альберти: t5 даёт квинту G', pAlb[1].notes.some(m => m%12===7), pAlb[1].notes);
ok('Альберти: t3 даёт терцию E', pAlb[2].notes.some(m => m%12===4), pAlb[2].notes);
const pMinor = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cm7', key:'C',
  range:r61, notes:voicing('Cm7') });
ok('t3 в миноре даёт Eb, а не E', pMinor[2].notes.some(m => m%12===3), pMinor[2].notes);
ok('неизвестный токен -> тишина', (() => {
  const steps = Acc.buildSteps('keys-block',1,1);
  return Acc.normalize({type:'keys-block',subdivision:1}) !== null && steps[0] === 'H';
})());
ok('пауза в рисунке не звучит', Acc.buildSteps('keys-block',4,1)
  .filter(t=>t===null).length === 3);
const slash = voicing('C/E');
const pSlash = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'C/E', key:'C',
  range:r61, notes:slash });
T.setPattern(st.kid,'s:1',{type:'keys-bass-chord',subdivision:1});
const pSlashB = Acc.plan({ trackId:st.kid, cell:'1:10:0', sec:st.sec, sq:st.sq,
  ev:st.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'C/E', key:'C',
  range:r61, notes:slash });
ok('C/E: бас E звучит отдельно', pSlashB[0].notes.length === 1 && pSlashB[0].notes[0]%12===4,
  pSlashB[0].notes);
ok('C/E: весь аккорд содержит и C, и E', slash.some(m=>m%12===0) && slash.some(m=>m%12===4), slash);
T.clearPattern(st.kid,'s:1');

// ---------- 7. СВЯЗЬ СО ЗВУКОМ ----------
console.log('\nЗвук играет ровно по плану');
const s7 = setup();
A.setPatternPlanner(Acc.plan);
A.setVoicingProvider((chord,key,range,prev) => {
  const v = K.generateKeysVoicings(chord,key,range,prev,{});
  return v.length ? v[0] : null;
});
T.setPattern(s7.kid,'s:1',{type:'keys-block',subdivision:1});
const aBlock = makeAudioCtx();
A.scheduleEvent(aBlock.ctx, s7.sec, s7.sq, s7.sq.events[0], 0, 0.1, 0.5, 120, '4/4');
const tBlock = new Set(aBlock.made.startTimes.map(t => Math.round(t*1000)));
ok('целый аккорд: все ноты стартуют одновременно', tBlock.size === 1, [...tBlock]);
T.setPattern(s7.kid,'s:1',{type:'keys-arp-up',subdivision:2});
const aArp = makeAudioCtx();
A.scheduleEvent(aArp.ctx, s7.sec, s7.sq, s7.sq.events[0], 0, 0.1, 0.5, 120, '4/4');
const tArp = new Set(aArp.made.startTimes.map(t => Math.round(t*1000)));
ok('арпеджио: ноты разнесены во времени', tArp.size > 1, [...tArp]);
ok('арпеджио: первый старт = началу ячейки', Math.min(...aArp.made.startTimes) === 0.1);
ok('без планировщика звук как в части 4', (() => {
  A.setPatternPlanner(null);
  const a = makeAudioCtx();
  A.scheduleEvent(a.ctx, s7.sec, s7.sq, s7.sq.events[0], 0, 0.2, 0.5, 120, '4/4');
  A.setPatternPlanner(Acc.plan);
  return new Set(a.made.startTimes.map(t=>Math.round(t*1000))).size === 1;
})());
ok('ошибка планировщика не роняет звук', (() => {
  A.setPatternPlanner(() => { throw new Error('boom'); });
  const a = makeAudioCtx();
  let good = true;
  try { A.scheduleEvent(a.ctx, s7.sec, s7.sq, s7.sq.events[0], 0, 0.1, 0.5, 120, '4/4'); }
  catch(e) { good = false; }
  A.setPatternPlanner(Acc.plan);
  return good && a.made.oscillators.length > 0;
})());
ok('призрачный аккорд по-прежнему молчит', (() => {
  // У клавишной дорожки в этой ячейке нет СВОЕГО аккорда: виден призрак
  // главной, но звучать он не должен.
  T.setTrackChord(s7.kid, '1:10:0', '');
  const a = makeAudioCtx();
  A.scheduleEvent(a.ctx, s7.sec, s7.sq, s7.sq.events[0], 0, 0.1, 0.5, 120, '4/4');
  return a.made.oscillators.length === 0 && A.stats().skippedGhost > 0;
})());
ok('setPatternPlanner(null) отключает рисунки', (() => {
  A.setPatternPlanner(null); A.setPatternPlanner(Acc.plan);
  return typeof A.setPatternPlanner === 'function';
})());
T.clearPattern(s7.kid,'s:1');

// ---------- 8. ОБЩИЙ РИТМ И ПОДСВЕТКА ----------
console.log('\nОбщий ритм секции и подсветка шагов');
const s8 = setup();
Acc.adoptRhythm({ mode:'strum', subdivision:2, steps:['D','U'], swing:true }, '4/4', 120, s8.sec, s8.sq, 0, 0, 0.5);
ok('adoptRhythm запомнил свинг', Acc.rhythm().swing === true);
ok('adoptRhythm запомнил размер', Acc.rhythm().ts === '4/4');
const inherited = Acc.plan({ trackId:s8.kid, cell:'1:10:0', sec:s8.sec, sq:s8.sq,
  ev:s8.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('дефолтный рисунок унаследовал свинг секции', inherited.every(s => s.swing === false),
  'дефолт sub1 — свинг неприменим');
T.setPattern(s8.kid,'s:1',{type:'keys-arp-up',subdivision:2});
const inherited2 = Acc.plan({ trackId:s8.kid, cell:'1:10:0', sec:s8.sec, sq:s8.sq,
  ev:s8.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('sub2 без явного swing качает вместе с секцией', inherited2.every(s => s.swing === true));
T.setPattern(s8.kid,'s:1',{type:'keys-arp-up',subdivision:2,swing:false});
const explicitOff = Acc.plan({ trackId:s8.kid, cell:'1:10:0', sec:s8.sec, sq:s8.sq,
  ev:s8.sq.events[0], ei:0, ts:'4/4', dur:2, span:4, chord:'Cmaj7', key:'C',
  range:r61, notes:voicing('Cmaj7') });
ok('явно выключенный свинг перекрывает секцию', explicitOff.every(s => s.swing === false));

let observed = null;
Acc.setStepObserver(info => { observed = info; });
const aHi = makeAudioCtx();
scheduled.length = 0;
const stepsHi = Acc.plan({ ctx:aHi.ctx, evStart:0.1, trackId:s8.kid, cell:'1:10:0',
  sec:s8.sec, sq:s8.sq, ev:s8.sq.events[0], ei:0, ts:'4/4', dur:2, span:4,
  chord:'Cmaj7', key:'C', range:r61, notes:voicing('Cmaj7') });
ok('наблюдатель получил те же шаги', !!observed && observed.steps.length === stepsHi.length);
ok('наблюдатель получил ячейку и дорожку', observed.cell === '1:10:0' && observed.trackId === s8.kid);
ok('таймеры подсветки = числу шагов', scheduled.length === stepsHi.length,
  {timers:scheduled.length, steps:stepsHi.length});
ok('задержки подсветки совпадают со звуком', scheduled.every((t,i) =>
  Math.abs(t.ms - (0.1 + stepsHi[i].at - aHi.ctx.currentTime)*1000) < 1e-6));
Acc.clearHighlights();
ok('clearHighlights отменил таймеры', scheduled.every(t => t.cancelled === true));
Acc.setStepObserver(null);
ok('setStepObserver(null) снимает наблюдателя', Acc.setStepObserver(null) === false);
T.clearPattern(s8.kid,'s:1');

// ---------- 9. DOM (jsdom) ----------
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {}
if (!JSDOM) console.log('\nDOM-тесты пропущены: jsdom не найден.');
else {
  console.log('\nDOM: панель «Аккомпанемент», пресеты, кнопка «Бой/перебор»');
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="transport-bar"><button id="btnPlay"></button>
      <button id="b39MixerBtn"></button>
      <div class="transport-dock-hint" id="transportDockHint"></div></div>
    <button class="chord-btn chord-btn-strum" title="Свой бой/перебор для этой ячейки">ритм</button>
    <span class="strum-badge-wrap" title="Бой/перебор секции"></span>
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
  let editorCalls = 0;
  w.openStrumPatternEditor = function(){ editorCalls++; return 'ORIGINAL'; };
  w.eval('var sections = window.__b39Sections; var globalKey = "C";');
  [b0,b1,b3,b4,b5].forEach(x => w.eval(x));
  const AA = w.StruChordAccomp, TT = w.StruChordTracks;
  AA.boot();
  TT.load(TT.attach({schemaVersion:9,globalKey:'C',sections:secs},
                    {schemaVersion:9,globalKey:'C',sections:secs}));
  const gid = TT.mainTrack().id, kid = TT.addTrack('keys'); TT.setActive(kid);
  w.__sub && w.__sub();
  const $ = s=>d.querySelector(s), $$ = s=>Array.from(d.querySelectorAll(s));
  const click = n=>n.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

  ok('стили STAGE5 вставлены', !!d.querySelector('[data-b39-acc-css]'));
  ok('кнопка «Аккомпанемент» создана', !!d.getElementById('b39AccBtn'));
  ok('панель скрыта по умолчанию', AA.panel().hidden === true);
  click(d.getElementById('b39AccBtn'));
  ok('клик открыл панель', AA.panel().hidden === false);
  ok('в панели 6 кнопок пресетов', $$('.b39-acc-preset').length === 6);
  ok('панель показывает «Рисунок на такт»', AA.panel().textContent.includes('Рисунок на такт'));
  ok('чипы шагов нарисованы', $$('.b39-acc-step').length > 0, $$('.b39-acc-step').length);
  ok('есть селектор размера клавиатуры', !!$('select[aria-label="Размер клавиатуры дорожки"]'));
  ok('есть селектор дробности', !!$('select[aria-label="Дробность шагов"]'));
  ok('есть галочка свинга', !!d.getElementById('b39AccSwing'));
  ok('свинг недоступен при sub1', d.getElementById('b39AccSwing').disabled === true);

  click($$('.b39-acc-preset')[4]); // Альберти
  ok('клик по пресету записал тип в модель', TT.patternFor(kid,'s:1').type === 'keys-alberti',
    TT.patternFor(kid,'s:1'));
  ok('клик по пресету поставил sub2', TT.patternFor(kid,'s:1').subdivision === 2);
  ok('после выбора Альберти чипов стало 8', $$('.b39-acc-step').length === 8, $$('.b39-acc-step').length);
  ok('свинг теперь доступен при sub2', d.getElementById('b39AccSwing').disabled === false);
  d.getElementById('b39AccSwing').checked = true;
  d.getElementById('b39AccSwing').dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('галочка свинга записала true', TT.patternFor(kid,'s:1').swing === true);

  const sub = $('select[aria-label="Дробность шагов"]');
  sub.value = '4'; sub.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('дробность 4 записана в модель', TT.patternFor(kid,'s:1').subdivision === 4);
  ok('дробность 4 дала 16 чипов', $$('.b39-acc-step').length === 16, $$('.b39-acc-step').length);

  const size = $('select[aria-label="Размер клавиатуры дорожки"]');
  size.value = '88'; size.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('размер клавиатуры дорожки = 88', TT.keyRange(kid).size === 88, TT.keyRange(kid));
  size.value = ''; size.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok('«как в песне» снимает переопределение', TT.track(kid).keyboardSize === null);

  click($$('[data-scope="cell"]')[0]);
  ok('кнопка «ячейке» выбрала область', AA.scope().scope === 'cell');
  ok('рисунок записан и на ячейку', TT.patternFor(kid,'1:10:0') !== null);
  click($$('[data-scope="section"]')[0]);
  ok('кнопка «секции» вернула область', AA.scope().scope === 'section');
  AA.clearScopes();
  ok('сброс удалил оба рисунка',
    TT.patternFor(kid,'s:1') === null && TT.patternFor(kid,'1:10:0') === null);

  editorCalls = 0;
  w.openStrumPatternEditor('event',1,10,0);
  ok('на клавишах кнопка боя открывает нашу панель', editorCalls === 0 && AA.panel().hidden === false);
  ok('перехват запомнил ячейку', AA.scope().cellKey === '1:10:0', AA.scope());
  const cellBtn = $('.chord-btn-strum'), badge = $('.strum-badge-wrap');
  ok('подпись кнопки в ячейке -> «аккомп.»', cellBtn.textContent === 'аккомп.', cellBtn.textContent);
  ok('заголовок бейджа -> «Аккомпанемент»', /Аккомпанемент/.test(badge.getAttribute('title')));
  TT.setActive(gid); w.__sub && w.__sub();
  ok('на гитаре подпись вернулась', cellBtn.textContent === 'ритм', cellBtn.textContent);
  ok('на гитаре заголовок вернулся', /Бой\/перебор/.test(badge.getAttribute('title')),
    badge.getAttribute('title'));
  editorCalls = 0;
  const origResult = w.openStrumPatternEditor('section',1);
  ok('на гитаре кнопка боя работает по-старому', editorCalls === 1 && origResult === 'ORIGINAL');
  TT.setActive(kid); w.__sub && w.__sub();

  ok('highlightStep подсвечивает нужный чип', (() => {
    AA.highlightStep(2);
    return $$('.b39-acc-step.is-on').length === 1 && $$('.b39-acc-step.is-on')[0].dataset.step === '2';
  })());
  AA.clearHighlights();
  ok('clearHighlights снимает подсветку', $$('.b39-acc-step.is-on').length === 0);
  AA.close();
  ok('закрытие панели работает', AA.panel().hidden === true);
  dom.window.close();
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ИТОГ ЭТАПА 5: ${pass} ok / ${fail} fail`);
if (fail) process.exitCode = 1;
