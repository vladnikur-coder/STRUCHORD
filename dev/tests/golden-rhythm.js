// Контрактный тест волны-1 «пул рулонов» (2026-08): миграция старого формата
// (встроенные strumPattern + rhythmGroup) в пул рулонов даёт то же звучание
// и тот же показ, что зафиксировал золотой слепок dev/fixtures/rhythm-golden.json
// (сгенерирован с заведомо зелёного файла, dev/probe/golden-fixtures.js).
//
// Проверки:
//   - selfCheck: перенарезка в пул поударно равна старому фасаду на всех
//     состояниях слепка (звук и показ = одна формула планировщика);
//   - displayed: каждая покрытая пулом ячейка показывает ровно то, что в
//     слепке (окно на рулон == getSlicedPatternForEvent до рефакторинга);
//   - красный путь: испорченный слепок обязан давать расхождение, а загрузка
//     такой песни — безопасный откат (songRhythmRolls=null);
//   - структурный: старый сейв связки собирается в один рулон с общим якорем.
//
// Запускается из run-tests.sh.
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

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
evl('requestRender = function(){}; showToast = function(){}; window.confirm = function(){return true}; return 0');

const golden = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/rhythm-golden.json', 'utf8'));

const parseSteps = (text) => {
  if (text.includes('+')) throw new Error('слепок с массивными шагами не ждали — расширить разбор');
  return text.split('');
};
const buildSections = (state) => {
  const events = state.stored.map((row, i) => {
    const ev = { chord: 'C', span: state.spans[i], timeSig: null };
    if (row) {
      ev.strumPattern = { mode: 'strum', subdivision: row.sub, steps: parseSteps(row.steps) };
      if (row.g) ev.strumPattern.rhythmGroup = row.g;
    }
    return ev;
  });
  return [{
    id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0,
    strumPattern: state.secPattern
      ? { mode: 'strum', subdivision: state.secPattern.sub, steps: parseSteps(state.secPattern.steps) }
      : null,
    squares: [{ id: 2, timeSig: null, strumPattern: null, customBeats: null, events }],
  }];
};

console.log('контракт волны-1: миграция в пул рулонов vs золотой слепок (' + file + ')');

let stateCount = 0, coveredCells = 0;
for (const sc of golden.scenarios) {
  for (const state of sc.states) {
    stateCount++;
    const verdict = evl(`
      sections = ${JSON.stringify(buildSections(state))};
      const storage = migrateSectionsToRhythmPool(sections);
      const diffs = rhythmStorageSelfCheck(sections, storage);
      const views = [];
      let covered = 0;
      sections[0].squares[0].events.forEach((ev, ei) => {
        const win = rhythmRollWindowFor(1, sections[0].squares[0], ei, storage);
        if (!win) return;
        covered++;
        views.push({ ei, sub: win.subdivision,
          steps: win.steps.map((s)=>Array.isArray(s)?s.join('+'):s).join('') });
      });
      return JSON.stringify({ diffs, views, covered });`);
    const { diffs, views, covered } = JSON.parse(verdict);
    coveredCells += covered;
    ok(`${sc.name} / ${state.name}: самопроверка без расхождений`, diffs.length === 0,
      diffs.slice(0, 2).join(' ; '));
    let dispBad = 0;
    for (const v of views) {
      const g = state.displayed[v.ei];
      if (!g || g.sub !== v.sub || g.steps !== v.steps) dispBad++;
    }
    ok(`${sc.name} / ${state.name}: показ покрытых ячеек == слепку (${views.length} шт)`, dispBad === 0);
  }
}
ok(`прогнано состояний: ${stateCount} (покрытых пулом ячеек: ${coveredCells})`, stateCount === golden.meta.states);

// Красный путь: расхождение МЕЖДУ представлениями (именно его ловит
// самопроверка: старый фасад vs окно на рулон). Портим ПРОДУКТ миграции —
// шаг в рулоне — и ждём, что сверка его найдёт; а загрузчик, получив
// битую формулу окна, обязан откатиться на старый путь.
{
  const leg = golden.scenarios.find((s) => s.name === 'legacy-saves').states[0];
  const r = JSON.parse(evl(`
    sections = ${JSON.stringify(buildSections(leg))};
    const storage = migrateSectionsToRhythmPool(sections);
    storage.pool['rrh-1'].steps[2] = 'U'; // испортили рулон ПОСЛЕ миграции
    const diffs = rhythmStorageSelfCheck(sections, storage);
    return JSON.stringify(diffs)`));
  ok('красный путь: битый рулон найден самопроверкой', r.length > 0, JSON.stringify(r));
  const rolled = evl(`
    sections = ${JSON.stringify(buildSections(leg))};
    const orig = rhythmRollWindowFor;
    rhythmRollWindowFor = function () { return { mode: 'strum', subdivision: 1, steps: ['U'] }; };
    migrateRhythmStorageToPool();
    const res = songRhythmRolls === null ? 1 : 0;
    rhythmRollWindowFor = orig;
    return res`);
  ok('красный путь: загрузчик откатывает песню на старый путь (songRhythmRolls=null)', rolled === 1);
  const restored = evl(`
    sections = ${JSON.stringify(buildSections(leg))};
    migrateRhythmStorageToPool();
    return songRhythmRolls === null ? 0 : 1`);
  ok('после отката следующая честная загрузка работает', restored === 1);
}

// Структурный контракт: старая связка D_DU|_UDU — один рулон, общий якорь.
{
  const leg = golden.scenarios.find((s) => s.name === 'legacy-saves').states[0];
  const r = JSON.parse(evl(`
    sections = ${JSON.stringify(buildSections(leg))};
    const storage = migrateSectionsToRhythmPool(sections);
    const a = storage.refs.get('1:2:0'), b = storage.refs.get('1:2:1');
    return JSON.stringify({
      same: a && b && a.roll === b.roll && a.anchor === 0 && b.anchor === 0,
      rollSteps: a ? storage.pool[a.roll].steps.join('') : '',
      poolKeys: Object.keys(storage.pool).length });`));
  ok('структурный: связка в одном рулоне, якорь общий = 0', r.same === true && r.rollSteps === 'D_DU_UDU',
    JSON.stringify(r));
  ok('структурный: лишних рулонов не наплодили (пул из одного)', r.poolKeys === 1, String(r.poolKeys));
}

console.log(`\nИТОГ: ${bad === 0 ? 'все проверки зелёные' : 'FAIL ' + bad}`);
process.exitCode = bad ? 1 : 0;
