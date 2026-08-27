// ============================================================================
// ГЕНЕРАТОР ЗОЛОТОГО СЛЕПКА звука и показа ритма (2026-08, до рефакторинга
// «Рулон и окна»). Пишет dev/fixtures/rhythm-golden.json.
//
// Контракт будущего: после замены хранилища/планировщика/показов для КАЖДОГО
// сценария и состояния из слепка обязаны совпасть:
//   - displayed[i] — что показывает ячейка (getSlicedPatternForEvent: та же
//     формула, что у планировщика, по комментариям в коде);
//   - sound        — звучащие события (время в юнитах + символ);
//   - stored[i]    — хранимый паттерн ячейки (для этапа миграции JSON).
//
// Запуск: node dev/probe/golden-fixtures.js
// Перезаписывает слепок; запускать только на ЗАВЕДОМО зелёном файле.
// ============================================================================
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
evl('requestRender = function(){}; showToast = function(){}; window.confirm = function(){return true}; return 0');

const strum = (sub, text) => ({ mode: 'strum', subdivision: sub, steps: text.split('') });
const D = (pat, span) => { const o = { chord: 'C', span, timeSig: null }; if (pat) o.strumPattern = pat; return o; };

const scene = (events, secPattern) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0,
    strumPattern: ${JSON.stringify(secPattern || null)},
    squares: [{ id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }] }];
  sections[0].squares[0].events = ${JSON.stringify('EVENTS')};
  return 0`.replace('"EVENTS"', JSON.stringify(events)));

const setSpans = (arr, dragIdx) => evl(
  `const arr=${JSON.stringify(arr)}; const sq=sections[0].squares[0];
   const start=sq.events.map(e=>e.span); arr.forEach((v,i)=>{ sq.events[i].span=v; });
   resliceSharedRhythmsInSquare(sq, "4/4", sections[0], ${dragIdx || 0}, start); return 0`);

// Слепок одного состояния.
const snap = (name) => {
  const rows = evl(`
    const sec=sections[0], sq=sec.squares[0];
    const out={sound:[], stored:[], displayed:[], spans:sq.events.map(e=>e.span||1),
      secPattern: sec.strumPattern
        ? { sub: sec.strumPattern.subdivision||1, steps: sec.strumPattern.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') }
        : null};
    let off=0;
    sq.events.forEach((ev,ei)=>{
      const span=ev.span||1;
      const p=getSlicedPatternForEvent(sec,sq,ev,ei);
      out.displayed.push(p ? { sub: p.subdivision||1, steps: p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') } : null);
      const sub=p ? Math.max(1, p.subdivision||1) : 1;
      const steps=(p && p.steps) ? p.steps : plainHitRhythm(span,1,'strum').steps;
      steps.forEach((s,k)=>{
        if (s!=='_' && !(Array.isArray(s) && s.length===0))
          out.sound.push((off + k/sub).toFixed(3) + '=' + (Array.isArray(s) ? s.join('+') : s));
      });
      out.stored.push(ev.strumPattern
        ? { sub: ev.strumPattern.subdivision||1, steps: ev.strumPattern.steps.map(s=>Array.isArray(s)?s.join('+'):s).join(''), g: ev.strumPattern.rhythmGroup||null }
        : null);
      off+=span;
    });
    return out`);
  return { name, ...rows, sound: rows.sound.join(' ') || '(тишина)' };
};

const scenarios = [];

// --- 1. Спека: вся цепочка ---------------------------------------------------
const st1 = [];
scene([D(strum(2, 'D_DU_UDU'), 4)]);
st1.push(snap('исходник D_DU_UDU'));
evl('return addChordAfter(1,2,0), 0');
st1.push(snap('деление -> D_DU|_UDU'));
setSpans([1.5, 2.5], 0); st1.push(snap('ресайз -1/8 -> D_D|U_UDU'));
setSpans([2, 2], 0); st1.push(snap('назад 2/2'));
setSpans([2.5, 1.5], 0); st1.push(snap('ресайз +1/8'));
setSpans([1.75, 2.25], 0); st1.push(snap('ресайз -1/16 -> sub4'));
scenarios.push({ name: 'spec-chain', states: st1 });

// --- 2. Цепочка из трёх ------------------------------------------------------
const st2 = [];
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0');
evl('return addChordAfter(1,2,1), 0');
setSpans([1.5, 1, 1.5], 0); st2.push(snap('цепочка 3x: 1.5,1,1.5'));
scenarios.push({ name: 'chain-of-three', states: st2 });

// --- 3. Смешанная пара + смена пресета ПОСЛЕ материализации ------------------
const st3 = [];
scene([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], strum(2, 'U_U_U_U_'));
st3.push(snap('смешанная: до'));
setSpans([1.5, 2.5], 0); st3.push(snap('смешанная: граница поехала'));
evl(`sections[0].strumPattern = ${JSON.stringify(strum(2, 'DDDDDDDD'))}; return 0`);
st3.push(snap('после смены боя секции (старая застряла — это поведение волны-3 меняется)'));
scenarios.push({ name: 'mixed-pair-preset', states: st3 });

// --- 4. Минус: связки собираются ---------------------------------------------
const st4 = [];
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0');
evl('return addChordAfter(1,2,1), 0');
st4.push(snap('цепочка до минуса'));
evl('return removeChordAt(1,2,1), 0');
st4.push(snap('минус середины -> D_DU_U|DU'));
scenarios.push({ name: 'minus-merge', states: st4 });

// --- 5. Отдельные режимы: наследие, триоли, чужие, пустое --------------------
const st5 = [];
scene([D(strum(3, 'DU_DU_'), 2), D(null, 1.5)], strum(2, 'D_U_D_U_'));
st5.push(snap('триоли + наследник секции'));
scene([D(null, 2), D(null, 2)]);
st5.push(snap('совсем пустое поле'));
scene([D(strum(2, 'D_D_D_D_'), 4), D(strum(2, 'U_U_U_U_'), 4)]);
setSpans([3, 5], 0); st5.push(snap('чужие соседи после ресайза'));
scenarios.push({ name: 'modes-and-edges', states: st5 });

// --- 6. Сохранение/загрузка: примеры «старых сейвов» (для миграции) ----------
const st6 = [];
scene([
  D({ mode: 'strum', subdivision: 2, steps: 'D_DU'.split(''), rhythmGroup: 'rg-legacy' }, 2),
  D({ mode: 'strum', subdivision: 2, steps: '_UDU'.split(''), rhythmGroup: 'rg-legacy' }, 2),
]);
st6.push(snap('старый сейв связки (встроенные паттерны + метка)'));
scene([
  D({ mode: 'strum', subdivision: 4, steps: 'D___D_U'.split(''), rhythmGroup: 'rg-legacy2' }, 1.75),
  D({ mode: 'strum', subdivision: 4, steps: '___U_D_U_'.split(''), rhythmGroup: 'rg-legacy2' }, 2.25),
]);
st6.push(snap('старый сейв связки на 16-х'));
scenarios.push({ name: 'legacy-saves', states: st6 });

const golden = {
  meta: {
    file,
    note: 'слепок текущего приложения до рефакторинга «Рулон и окна»; displayed=getSlicedPatternForEvent, sound=события планировщика, stored=хранимые паттерны',
    scenarios: scenarios.length,
    states: scenarios.reduce((a, s) => a + s.states.length, 0),
  },
  scenarios,
};
fs.mkdirSync(__dirname + '/../fixtures', { recursive: true });
fs.writeFileSync(__dirname + '/../fixtures/rhythm-golden.json', JSON.stringify(golden, null, 1));
console.log(`золотой слепок записан: dev/fixtures/rhythm-golden.json — сценариев ${golden.meta.scenarios}, состояний ${golden.meta.states}`);
scenarios.forEach((sc) => console.log(`  ${sc.name}: ${sc.states.length} сост.`));
