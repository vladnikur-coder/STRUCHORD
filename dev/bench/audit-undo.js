// Бенч-аудит B-24 (ступени 1–3): каждая глубокая правка модели —
// команда Store: применяется, ложится в историю (указатель +1) и
// откатывается undo в исходное состояние бит-в-бит. Живой Chromium,
// 16 операций + живой жест edge-resize. Запуск как у undo-redo.js:
//   LD_LIBRARY_PATH=/tmp/libs/al2023/lib PUPPETEER_EXECUTABLE_PATH=/tmp/chromium node dev/bench/audit-undo.js
const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const pg = await b.newPage();
  pg.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await pg.goto('http://127.0.0.1:8000/STRUCHORD.html');
  const evl = (s) => pg.evaluate(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let bad = 0;
  const ok = (n, c, x) => { if (!c) bad++; console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); };

  await evl(`
    globalTimeSig = '4/4'; DOM.globalTimeSig.value = '4/4';
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    render();
    0`);
  // Калибровка: рукописный сетап ≠ состоянию после serialize→load
  // (нормализация полей). Прогоняем сетап через undo-круг — базовое
  // состояние становится нормализованным, «до правки» и «после undo»
  // сравнимы. Затем история сброшена детерминированно: стек = [сетап].
  await evl('scheduleHistorySnapshot()');
  await sleep(500); // сетап зафиксирован в стеке
  await evl('setSectionBpm(1, 120)');
  await sleep(500);
  await evl('undoEdit()');
  await sleep(300); // восстановлен сериализованный (=нормализованный) сетап
  await evl('resetHistory()');

  const snap = () => evl(`(() => {
    const out = { k: globalKey, s: [] };
    for (const x of sections) {
      const sx = { id: x.id, key: x.key, bpm: x.bpm, rep: x.repeat, ts: x.timeSig, n: x.customName, sq: [] };
      for (const q of x.squares) {
        sx.sq.push({ id: q.id, cb: q.customBeats, rep: q.repeat, ev: q.events.map((e) => [e.chord, e.span, e.timeSig]) });
      }
      out.s.push(sx);
    }
    return JSON.stringify(out);
  })()`);
  const histIdx = () => evl('historyDebugState().index');
  const histLen = () => evl('historyDebugState().length');

  async function undoCase(name, fn) {
    const before = await snap();
    const i0 = await histIdx();
    await fn();
    await sleep(500); // дебаунс 400 мс
    const i1 = await histIdx();
    const changed = await snap();
    ok(`${name}: правка применилась`, changed !== before);
    ok(`${name}: состояние легло в историю`, i1 === i0 + 1, `index ${i0} → ${i1}`);
    ok(`${name}: указатель на вершине`, await evl('historyDebugState().index === historyDebugState().length - 1'), 'нет');
    await evl('undoEdit()');
    await sleep(300);
    const after = await snap();
    ok(`${name}: undo вернул состояние`, after === before, 'состояние отличается');
  }

  console.log('=== undo глубоких правок (живой Chromium) ===');
  await undoCase('section/key', () => evl('setSectionKey(1, "G")'));
  await undoCase('section/bpm', () => evl('setSectionBpm(1, 140)'));
  await undoCase('section/repeat', () => evl('setSectionRepeat(1, 3)'));
  await undoCase('section/rename', () => evl('renameSection(1, "Куплет")'));
  await undoCase('section/timesig', () => evl('setSectionTimeSig(1, "3/4")'));
  await undoCase('square/clone', () => evl('cloneLastSquare(1)'));
  await undoCase('square/repeat', () => evl('setSquareRepeat(1, 2, 2)'));
  await undoCase('square/beats (коммит края)', () => evl('setSquareCustomBeats(1, 2, 12)'));
  await undoCase('cell/add', () => evl('addChordAfter(1, 2, 0)'));
  await undoCase('cell/remove', () => evl('removeChordAt(1, 2, 0)'));
  await undoCase('cell/span', () => evl('changeChordSpanDirect(1, 2, 0, 2)'));
  await undoCase('cell/timesig', () => evl('setEventTimeSig(1, 2, 0, "3/4")'));
  await undoCase('cell/chord', () => evl('setEventChord(sections[0].squares[0].events[0], "Dm", {})'));
  await undoCase('square/add', () => evl('addSquare(1)'));
  await undoCase('square/remove', () => evl('removeSquare(1, 2)')); // кв. 2 существует после откатов
  await undoCase('section/remove', () => evl('removeSection(1)'));

  // журнал: метки реального жеста правого края
  console.log('=== метки живого жеста (edge-resize) ===');
  await evl('addSection("Verse")'); await sleep(450);
  await pg.evaluate(() => {
    const handle = document.querySelector('.square .square-resize-handle');
    if (!handle) return;
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: 400, clientY: 20, buttons: 1, isPrimary: true }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 300, clientY: 20, buttons: 1, isPrimary: true }));
  });
  await sleep(80);
  await pg.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 300, clientY: 20, isPrimary: true })));
  await sleep(500);
  const labels = await evl('songStore.log().slice(-6).map(e => e.label)');
  console.log('   последние метки:', JSON.stringify(labels));
  ok('живой edge-жест оставил square/beats', labels.includes('square/beats'));

  console.log(bad ? `\nСБОЕВ: ${bad}` : '\nALL OK — undo и журнал живых правок целы');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
