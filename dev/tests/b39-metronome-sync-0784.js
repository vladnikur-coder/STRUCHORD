'use strict';
// 0.784 · B-112: pad и метроном на одних часах.
//
// Диагностика до правки (только чтение, /tmp/pad-metronome-audit.js):
//   * при одном темпе граница аккорда и сильный щелчок совпадали ровно (0 мс),
//     но pad НАЧИНАЛ перетекать за 0,35 с до щелчка — при 120 BPM это
//     ~18 % ячейки (в видео-эталоне ~9 %). Владелец слышит это как «pad
//     опережает метроном»;
//   * при смене BPM секции 120 -> 140 сетка щелчков не перевешивалась:
//     расхождение 214,3 мс уже на первом такте;
//   * включение метронома / смена доли на ходу планировали все прошедшие
//     клики в прошлом («залп»).
//
// 0.785 (B-113) перенёс сам переход ПОСЛЕ щелчка; часы метронома от этого
// не изменились, поэтому ниже проверяется уже новое окно перехода.
// Проверяется без браузера: реальные функции извлекаются из STRUCHORD.html и
// keyboard-accompaniment.js и гоняются в vm-песочнице с управляемыми часами
// Web Audio и mock'ом requestAnimationFrame. НЕ заменяет слуховую проверку
// владельцем с включённым метрономом.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACCOMP = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
const AUDIO = fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };

// ---------------------------------------------------------------------------
// 1. Статический контракт: патч на месте, запрещённые зоны не тронуты
// ---------------------------------------------------------------------------
// 0.785: контракт «версия и кэш парой» не привязан к номеру релиза.
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert(VER, 'версия в шапке');
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  .includes('struchord-v' + VER.split('.')[1]),
  'R7: кэш выложен парой с версией ' + VER);
assert(HTML.includes('let metronomeGridKey = null;'), 'ключ часов объявлен');
assert(HTML.includes('return [ts, bpm, metronomeSubdivision, playbackStartTime].join'),
  'ключ часов включает темп, размер, долю и точку запуска');
assert(HTML.includes('metronomeGridKey = null;\n}\nlet metronomeSubdivision = 1;'),
  'любая остановка сбрасывает часы');
assert(HTML.includes('metronomeGridKey = metronomeKeyFor(ts, bpm);'),
  'планировщик запоминает свои часы');
assert(HTML.includes('const key = metronomeKeyFor(ts, bpm);') &&
  HTML.includes('if (key !== metronomeGridKey)'),
  'перевес сетки — по ключу, а не только по смене размера');
assert(!HTML.includes('if (tsChanged && !playbackState.metronomeMuted)'),
  'старый перевес только по размеру удалён');
assert((HTML.match(/scheduleMetronomeEvents\(ctx, playbackState\.squareAnchorTime, ts, bpm, true\)/g) || []).length === 3,
  'перевес сетки, включение на ходу и смена доли получили resumeAtNow');
assert(HTML.includes('  metronomeGridKey = null;\n}\nfunction applyBpmChange()'),
  'смена темпа на ходу больше не вешает сетку на старый якорь');
assert(HTML.includes('playbackState.squareAnchorTime = evStart - getSquareEventOffsetSeconds'),
  'якорь фазы такта по-прежнему считается из факта (0.783 не тронут)');
assert(HTML.includes('const padNext = previewEvent ?'),
  'реальный следующий аккорд от плеера (0.783) не тронут');
ok('статический контракт: версия/кэш, ключ часов, resumeAtNow, 0.783 не сломан');

// ---------------------------------------------------------------------------
// 2. Заход слайда: 1/3 доли, предел 0,35 с, составной размер
// ---------------------------------------------------------------------------
function grab(text, name, from) {
  const start = text.indexOf('function ' + name + '(', from || 0);
  if (start < 0) throw Error('нет функции ' + name);
  let i = text.indexOf('{', start), depth = 0, j = i;
  for (; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') { depth--; if (!depth) break; }
  }
  return text.slice(start, j + 1);
}

function bootAccomp() {
  const win = {};
  win.window = win; win.document = undefined;
  win.setTimeout = () => 0; win.clearTimeout = () => {}; win.console = console;
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ pad: [] }) });
  win.songStore = { subscribe: () => {} };
  const TRACK = {
    id: 1, instrument: 'keys', timbre: 'pad', volume: 100, mute: false, solo: false,
    linkedVoicings: true, voicings: {}, patterns: {}, chords: {}, bassRoles: {}
  };
  win.__track = TRACK;
  win.StruChordTracks = {
    state: () => ({ mainTrackId: 1, activeTrackId: 1, tracks: [TRACK] }),
    track: () => TRACK,
    cellKey: (s, q, i) => s.id + ':' + q.id + ':' + i,
    trackChord: () => 'C', keyRange: () => ({ low: 36, high: 84, size: 49 }),
    exactNotes: () => null, voicingForChord: () => null, bassRole: () => 'legacy'
  };
  win.StruChordKeys = { linkedSelection: () => ({ chord: 'C', notes: [48, 55, 60, 64] }), voiceLead: () => null };
  win.mixerChannelForVoice = () => ({ input: { gain: { value: 0 } }, dry: {} });
  const sandbox = vm.createContext(win);
  vm.runInContext(ACCOMP, sandbox, { filename: 'keyboard-accompaniment.js' });
  vm.runInContext(AUDIO, sandbox, { filename: 'keyboard-audio.js' });
  win.__b39Modules.accomp(); win.__b39Modules.audio();
  win.StruChordAudio.setPatternPlanner(win.StruChordAccomp.plan);
  return win.StruChordAccomp;
}
const A = bootAccomp();
const lead = (o) => A.padGlideLeadFor(o);
assert.equal(A.padGlideLead(), 0.35, 'исторический предел 0,35 с сохранён для превью/старых вызовов');
assert(Math.abs(lead({ bpm: 120, ts: '4/4', dur: 2 }) - 1 / 6) < 1e-12,
  '120 BPM: 1/3 четверти = 0,1667 с, а не 0,35 с');
assert(Math.abs(lead({ bpm: 180, ts: '4/4', dur: 1.3333333333333333 }) - 1 / 9) < 1e-12,
  '180 BPM: заход 0,1111 с');
assert(Math.abs(lead({ bpm: 60, ts: '4/4', dur: 4 }) - 1 / 3) < 1e-12,
  '60 BPM: заход 0,3333 с, всё ещё короче предела');
assert.equal(lead({ bpm: 40, ts: '4/4', dur: 6 }), 0.35,
  'медленнее 60 BPM упёрлись в предел 0,35 с из видео');
assert(Math.abs(lead({ bpm: 120, ts: '6/8', dur: 1.5 }) - 0.25) < 1e-12,
  '6/8: пульс метронома — пунктирная четверть, заход 0,25 с');
assert.equal(lead({ bpm: 120, ts: '4/4', dur: 0.5 }), 0.1,
  'короткая ячейка: заход ограничен 20 % ячейки');
assert.equal(lead({ ts: '4/4', dur: 2 }), 1 / 6, 'без BPM в превью — запасные 120 ударов');
ok('padGlideLeadFor: 1/3 доли, предел 0,35 с, 6/8, короткая ячейка, превью');

const planLead = (bpm, ts, dur) => A.plan({
  trackId: 1, chord: 'C', key: 'C', range: { low: 36, high: 84, size: 49 },
  notes: [48, 55, 60, 64], ts, span: 4, dur, bpm,
  ev: { span: 4 }, sec: { id: 'A', key: 'C' }, sq: { id: 'q1' }, ei: 0,
  cell: 'A:q1:0', noHighlight: true
})[0].pad.lead;
assert(Math.abs(planLead(120, '4/4', 2) - 1 / 6) < 1e-12, 'plan(): заход 0,1667 с');
assert(Math.abs(planLead(120, '6/8', 1.5) - 0.25) < 1e-12, 'plan(): 6/8 заход 0,25 с');
ok('plan()[0].pad.lead берётся из padGlideLeadFor, а не из константы');

// ---------------------------------------------------------------------------
// 3. Реальные часы метронома в песочнице
// ---------------------------------------------------------------------------
const HELPERS = [
  grab(HTML, 'parseTimeSig', HTML.indexOf('function parseTimeSig(ts) {')),
  grab(HTML, 'isCompoundMeter'),
  grab(HTML, 'getBeatGrouping'),
  grab(HTML, 'getGridUnitDurationSeconds'),
  grab(HTML, 'getEventDurationForTimeSig'),
  grab(HTML, 'getEventOwnTimeSig'),
  grab(HTML, 'getSquareEventOffsetSeconds'),
].join('\n');
const METRO_START = HTML.indexOf('let metronomeGridKey = null;');
const METRO_END = HTML.indexOf('// В момент первой грозовой ачивки', METRO_START);
assert(METRO_START > 0 && METRO_END > METRO_START, 'блок планировщика метронома найден');
const METRO = HTML.slice(METRO_START, METRO_END);

function makeClock() {
  const clicks = [];
  const ctx = { currentTime: 0 };
  let frameId = 0, pending = null;
  const sandbox = {
    playbackState: { isPlaying: true, metronomeMuted: false },
    playbackStartTime: 0, globalTimeSig: '4/4', ctx,
    metronomeFrameId: null,
    metronomeScheduledOscillators: new Set(),
    PLAYBACK_SCHEDULER_LOOKAHEAD_MS: 500,
    requestAnimationFrame(fn) { pending = fn; return ++frameId; },
    cancelAnimationFrame(id) { if (id === frameId) pending = null; },
    scheduleClick(c, t, acc, mid) { clicks.push({ t, acc: !!acc, mid: !!mid, at: c.currentTime }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(HELPERS + '\n' + METRO, sandbox, { filename: 'metronome-from-0784.html' });
  const E = (code) => vm.runInContext(code, sandbox);
  function tick(to) {
    // Кадры ~10 мс, как rAF. check() сам добирает все клики до текущего
    // времени, поэтому одного вызова на кадр достаточно.
    let guard = 0;
    while (ctx.currentTime < to - 1e-9 && guard++ < 20000) {
      ctx.currentTime = Math.min(to, ctx.currentTime + 0.01);
      const fn = pending; pending = null;
      if (fn) fn();
    }
  }
  return { sandbox, E, ctx, clicks, tick };
}

function duration(clock, c) {
  clock.sandbox.__span = c.span; clock.sandbox.__bpm = c.bpm; clock.sandbox.__ts = c.ts;
  return clock.E('getEventDurationForTimeSig(__span, __bpm, __ts)');
}
function anchor(clock, cells, i) {
  const c = cells[i];
  const sqEvents = cells.filter(x => x.sq === c.sq).map(x => ({ span: x.span, timeSig: x.ts }));
  clock.sandbox.__sq = { events: sqEvents };
  clock.sandbox.__ei = c.ei; clock.sandbox.__bpm = c.bpm; clock.sandbox.__ts = c.ts;
  return clock.E('getSquareEventOffsetSeconds(__sq, __ei, __bpm, __ts)');
}
function cell(span, bpm, ts, sq, ei) { return { span, bpm, ts: ts || '4/4', sq: sq || 'q' + span, ei: ei || 0 }; }
function row(n, span, bpm, ts) {
  return Array.from({ length: n }, (_, i) => cell(span, bpm, ts, 'sq' + i, 0));
}

// Эмуляция patched-блока scheduleNextEvent; сам блок проверен статически выше.
function simulate(cells, opts) {
  opts = opts || {};
  const clock = makeClock();
  clock.sandbox.playbackStartTime = opts.startTime || 0;
  if (opts.sub) clock.E('metronomeSubdivision = ' + opts.sub);
  let t = 0;
  const timeline = cells.map((c, i) => {
    const dur = duration(clock, c);
    const item = Object.assign({}, c, { start: t, end: t + dur, dur });
    t += dur;
    return item;
  });
  let maxLegacy = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], ev = timeline[i];
    clock.tick(Math.max(0, ev.start - 0.12));
    if (opts.onWake) opts.onWake(clock, i, ev);
    const st = ev.start - anchor(clock, cells, i);
    const key = clock.E('metronomeKeyFor(' + JSON.stringify(c.ts) + ', ' + c.bpm + ')');
    if (!opts.metronomeOff && key !== clock.E('metronomeGridKey')) {
      clock.E('stopMetronomeScheduler()');
      clock.E('scheduleMetronomeEvents(ctx, ' + st + ', ' + JSON.stringify(c.ts) + ', ' + c.bpm + ', true)');
    }
    clock.tick(Math.max(0, ev.end - 0.12));
  }
  clock.tick(t + 0.01);
  // «До правки»: одна сетка на всю песню от первого якоря и первого темпа.
  const first = cells[0], cdLegacy = 60 / first.bpm;
  for (const ev of timeline) {
    const n = Math.round(ev.end / cdLegacy);
    maxLegacy = Math.max(maxLegacy, Math.abs(ev.end - n * cdLegacy));
  }
  return { clock, timeline, maxLegacy, clicks: clock.clicks };
}
function maxDrift(run) {
  let worst = 0;
  for (const ev of run.timeline) {
    const near = run.clicks.reduce((best, c) =>
      Math.abs(c.t - ev.end) < Math.abs(best - ev.end) ? c.t : best, Infinity);
    worst = Math.max(worst, Math.abs(ev.end - near));
  }
  return worst;
}
// 0.785 (B-113): переход лежит ПОСЛЕ щелчка — окно (граница, граница + span).
function clicksAfterClick(run, span) {
  let n = 0;
  for (const ev of run.timeline)
    n += run.clicks.filter(c => c.t > ev.end + 1e-9 && c.t < ev.end + span - 1e-9).length;
  return n;
}
// Для справки: как считалось до 0.785 — окно ДО щелчка.
function clicksBeforeClick(run, span) {
  let n = 0;
  for (const ev of run.timeline)
    n += run.clicks.filter(c => c.t > ev.end - span + 1e-9 && c.t < ev.end - 1e-9).length;
  return n;
}

// 3.1 Ровный темп: 0 мс; окно перехода после щелчка не задевает кликов.
let run = simulate(row(4, 4, 120));
assert(maxDrift(run) < 1e-9, 'ровный 4/4 @120: граница аккорда ровно на щелчке');
assert.equal(clicksAfterClick(run, 1 / 6), 0, '0.785: переход 1/3 доли после щелчка чистый');
ok('ровный темп: 0 мс расхождения, сильный щелчок на границе');

// 3.2 Восьмые: до 0.785 окно 0,35 с ДО щелчка накрывало лишний клик;
//     после 0.785 окно 1/3 доли ПОСЛЕ щелчка его не задевает.
run = simulate(row(2, 4, 120), { sub: 2 });
assert(maxDrift(run) < 1e-9, 'subdivision=2: границы всё ещё на акценте');
assert(clicksBeforeClick(run, 0.35) > 0, 'диагноз: до 0.785 заход 0,35 с накрывал щелчок восьмой');
assert(clicksAfterClick(run, 0.35) > 0, 'контроль: будь переход 0,35 с, он задевал бы восьмую и после щелчка');
assert.equal(clicksAfterClick(run, 1 / 6), 0, '0.785: окно 1/3 доли после щелчка чистое');
ok('0.785: переход перенесён за щелчок, внутри окна нет лишнего клика');

// 3.3 Смена BPM секции: было 214 мс, стало 0 мс.
run = simulate(row(2, 4, 120).concat(row(2, 4, 140)), {});
assert(run.maxLegacy > 0.2, 'диагноз: старые часы уезжали более чем на 0,2 с');
assert(maxDrift(run) < 1e-9, 'после правки смена BPM секции не сбивает часы');
console.log('       до: ' + (run.maxLegacy * 1000).toFixed(1) + ' мс → после: 0,0 мс');
ok('смена BPM секции 120 → 140: дрейф устранён');

// 3.4 Составной размер 6/8: пульс метронома — пунктирная четверть.
run = simulate([cell(6, 120, '6/8', 'a', 0), cell(6, 120, '6/8', 'b', 0), cell(6, 120, '6/8', 'c', 0)]);
assert(maxDrift(run) < 1e-9, '6/8: граница аккорда на сильном щелчке');
assert.equal(clicksAfterClick(run, 0.25), 0, '6/8: переход 0,25 с после щелчка не задевает кликов');
ok('6/8 @120: 0 мс, доля метронома и pad совпадают');

// 3.5 Смена темпа на ходу: invalidation ключа, без залпа, новый темп
//     вступает со следующего аккорда.
run = simulate([cell(4, 120, '4/4', 'sq', 0), cell(4, 140, '4/4', 'sq', 1),
  cell(4, 140, '4/4', 'sq', 2)], {
  onWake(clock, i) {
    if (i === 1) clock.E('metronomeGridKey = null');   // reanchorMetronomeForTempo
  }
});
assert(maxDrift(run) < 1e-9, 'смена темпа на ходу: pad и щелчки снова вместе');
const burst = run.clicks.filter(c => c.t < c.at - 0.05);
assert.equal(burst.length, 0, 'нет залпа запоздалых щелчков при смене темпа');
ok('смена темпа на ходу: новый темп со следующего аккорда, без залпа');

// 3.6 Включение метронома на ходу: resumeAtNow убирает «залп».
{
  const clock = makeClock();
  clock.sandbox.playbackStartTime = 0;
  const st = 0;   // якорь квадрата в прошлом
  clock.tick(3.0);
  // Старое поведение (без пятого аргумента) для сравнения.
  const legacy = makeClock();
  legacy.tick(3.0);
  legacy.E('scheduleMetronomeEvents(ctx, 0, "4/4", 120)');
  assert(legacy.clicks.length >= 6, 'до правки включение на ходу выдавало залп');
  clock.E('scheduleMetronomeEvents(ctx, ' + st + ', "4/4", 120, true)');
  clock.tick(3.5);
  assert(clock.clicks.length > 0, 'после включения щелчки идут');
  assert.equal(clock.clicks.filter(c => c.t < 3.0 - 1e-9).length, 0,
    'после правки ни одного запоздалого щелчка');
  console.log('       до: ' + legacy.clicks.length + ' кликов залпом → после: ' + clock.clicks.length + ' по сетке');
  ok('включение метронома на ходу: залп устранён, фаза сохранена');
}

// 3.7 Ключ часов устойчив внутри квадрата (якорь не включён в ключ):
//     планировщик не перезапускается на каждой ячейке.
{
  const clock = makeClock();
  const before = clock.E('metronomeGridKey');
  assert.equal(before, null, 'до старта часов нет');
  clock.E('scheduleMetronomeEvents(ctx, 0, "4/4", 120, true)');
  const k0 = clock.E('metronomeGridKey');
  assert.equal(clock.E('metronomeKeyFor("4/4", 120)'), k0,
    'внутри квадрата ключ не меняется — rAF не дёргается');
  assert.notEqual(clock.E('metronomeKeyFor("4/4", 140)'), k0, 'смена BPM меняет ключ');
  assert.notEqual(clock.E('metronomeKeyFor("3/4", 120)'), k0, 'смена размера меняет ключ');
  clock.E('metronomeSubdivision = 2');
  assert.notEqual(clock.E('metronomeKeyFor("4/4", 120)'), k0, 'смена доли меняет ключ');
  clock.E('metronomeSubdivision = 1');
  clock.sandbox.playbackStartTime = 42;
  assert.notEqual(clock.E('metronomeKeyFor("4/4", 120)'), k0, 'перемотка меняет ключ');
  clock.E('stopMetronomeScheduler()');
  assert.equal(clock.E('metronomeGridKey'), null, 'Стоп/пауза сбрасывают часы');
  ok('ключ часов: темп / размер / доля / перемотка / Стоп');
}

console.log('\n0.784 · B-112: ' + groups + ' групп — ВСЕ ЗЕЛЁНЫЕ');
