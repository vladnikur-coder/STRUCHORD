// B-24 (ступень 1): единый Store песни — dispatch, подписки, лог, история.
//
// Контракт ступени 1 (см. журнал README, волна B-24):
//   1. songStore.dispatch(label, mutator) — единственная точка правок
//      модели песни; метка пишется в кольцевой лог (100 записей).
//   2. Единственный подписчик — планировщик истории (дебаунс 400 мс):
//      любая команда сама попадает в undo/redo, без ручных вызовов.
//   3. СТУПЕНЬ 2: dispatch сам зовёт requestRender (подписчик рендера);
//      render остаётся в rAF-кадре (B-27), тихие команды {quiet:true}
//      рендер пропускают (FLIP-потоки посадки drag зовут его сами),
//      история пишется всегда. Прямые вызовы requestRender у
//      непомигрированных потоков остаются на местах.
//   4. Подписчик не имеет права ронять правку: ошибка логируется,
//      остальные подписчики получают уведомление.
//   5. Мигрированные потоки (addSection, cloneSection, applySectionOrder,
//      clearAll, loadSong, undo/restore) оставляют метки в логе.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;

  // --- 1. API Store существует и подписан на страницу ---
  console.log('=== 1. API Store ===');
  ok('window.songStore доступен', typeof w.songStore === 'object' && w.songStore !== null);
  ok('dispatch — функция', typeof w.songStore.dispatch === 'function');
  ok('subscribe — функция', typeof w.songStore.subscribe === 'function');
  ok('log — функция', typeof w.songStore.log === 'function');

  // --- 2. dispatch: мутатор, результат, лог ---
  console.log('=== 2. dispatch: мутатор, результат, лог ===');
  const before = w.songStore.log().length;
  const ret = w.songStore.dispatch('test/noop', () => 42);
  ok('dispatch возвращает результат мутатора', ret === 42);
  const entries = w.songStore.log();
  ok('метка записана в лог', entries.length === before + 1 && entries[entries.length - 1].label === 'test/noop');
  ok('запись лога несёт метку и время', entries[entries.length - 1].t > 0);
  ok('dispatch без функции — безвреден', w.songStore.dispatch('test/bad', 'не функция') === undefined);

  // --- 3. Кольцевой лог: не длиннее 100 ---
  console.log('=== 3. кольцевой лог 100 ===');
  for (let i = 0; i < 130; i++) w.songStore.dispatch('test/flood-' + i, () => {});
  ok('лог обрезан до 100 записей', w.songStore.log().length === 100);
  ok('в логе остались ПОСЛЕДНИЕ метки', w.songStore.log()[0].label === 'test/flood-30');

  // --- 4. контракт ступени 2: dispatch планирует рендер, render — в кадре ---
  console.log('=== 4. авто-рендер и quiet ===');
  const c1 = w.eval(`(() => {
    window.__c1 = { render: 0, reqRender: 0, hist: 0 };
    const origRender = window.render;
    window.render = (...a) => { window.__c1.render++; return origRender(...a); };
    const origReq = window.requestRender;
    window.requestRender = (...a) => { window.__c1.reqRender++; return origReq(...a); };
    const origHist = window.scheduleHistorySnapshot;
    window.scheduleHistorySnapshot = (...a) => { window.__c1.hist++; return origHist(...a); };
    return window.__c1;
  })()`);
  await sleep(80); // дренируем отложенные кадры загрузки страницы
  c1.render = c1.reqRender = c1.hist = 0;
  w.songStore.dispatch('test/silent', () => {});
  // СИНХРОННО: рендер только ЗАПЛАНИРОВАН (rAF), сам render() — в кадре.
  ok('requestRender вызван подписчиком рендера', c1.reqRender === 1, 'reqRender=' + c1.reqRender);
  ok('render синхронно не вызван', c1.render === 0, 'render=' + c1.render);
  ok('планировщик истории вызван', c1.hist >= 1, 'hist=' + c1.hist);
  await sleep(80); // кадр отработал
  ok('render отработал в следующем кадре', c1.render >= 1, 'render=' + c1.render);
  c1.render = c1.reqRender = c1.hist = 0;
  // Тихая команда: рендер пропускает, история — нет.
  w.songStore.dispatch('test/quiet', () => {}, { quiet: true });
  ok('тихая команда: requestRender не вызван', c1.reqRender === 0, 'reqRender=' + c1.reqRender);
  ok('тихая команда: история пишется', c1.hist >= 1, 'hist=' + c1.hist);
  await sleep(80);
  ok('тихая команда: render не сработал', c1.render === 0, 'render=' + c1.render);

  // --- 5. подписки: уведомление, отписка, изоляция ошибок ---
  console.log('=== 5. подписки ===');
  let got = 0;
  const off = w.songStore.subscribe(() => { got++; });
  w.songStore.dispatch('test/sub', () => {});
  ok('подписчик уведомлён', got === 1);
  off();
  w.songStore.dispatch('test/sub-off', () => {});
  ok('после отписки — тишина', got === 1);
  let second = 0;
  const offErr = w.songStore.subscribe(() => { throw new Error('падший подписчик'); });
  w.songStore.subscribe(() => { second++; });
  w.songStore.dispatch('test/err-sub', () => {});
  ok('ошибка подписчика не роняет dispatch', true);
  ok('остальные подписчики получили уведомление', second === 1);
  offErr();

  // --- 6. мигрированные потоки оставляют метки ---
  console.log('=== 6. метки мигрированных потоков ===');
  const loadBefore = w.songStore.log().length;
  w.addSection('Verse');
  const labels = w.songStore.log().map((e) => e.label);
  ok('addSection → section/add', labels.includes('section/add'));
  ok('addSection добавил секцию', w.eval('sections.length') === 1);

  w.cloneSection(w.eval('sections[0].id'));
  ok('cloneSection → section/clone', w.songStore.log().some((e) => e.label === 'section/clone'));
  ok('секций стало две', w.eval('sections.length') === 2);

  w.applySectionOrder([w.eval('sections[1].id'), w.eval('sections[0].id')]);
  ok('applySectionOrder → section/reorder-songmap', w.songStore.log().some((e) => e.label === 'section/reorder-songmap'));
  ok('порядок секций изменился', w.eval('sections[0].id') > w.eval('sections[1].id'));

  w.confirm = () => true; // clearAll спрашивает подтверждение
  w.clearAll();
  ok('clearAll → song/clear', w.songStore.log().some((e) => e.label === 'song/clear'));
  ok('песня пуста', w.eval('sections.length') === 0);

  // --- 7. история: dispatch сам попадает в undo ---
  console.log('=== 7. dispatch и история ===');
  await sleep(500); // дебаунс 400 мс
  const hist0 = w.historyDebugState();
  w.addSection('Chorus');
  await sleep(500); // ждём захвата снимка
  const hist1 = w.historyDebugState();
  ok('правка через dispatch вошла в историю', hist1.length === hist0.length + 1, JSON.stringify(hist0) + ' → ' + JSON.stringify(hist1));
  w.undoEdit();
  await sleep(300);
  ok('undo откатил правку', w.eval('sections.length') === 0);
  ok('восстановление прошло через Store (song/load)', w.songStore.log().some((e) => e.label === 'song/load'));

  // --- 8. загрузка песни — команда song/load ---
  console.log('=== 8. загрузка песни ===');
  const song = {
    schemaVersion: 2, name: 'B-24', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);
  ok('loadSong → song/load', w.songStore.log().some((e) => e.label === 'song/load'));
  ok('песня загружена (1 секция)', w.eval('sections.length') === 1);
  ok('история перезапущена под новую песню', w.historyDebugState().length === 1);

  // --- 9. правка модели мимо dispatch невозможна для мигрированных путей ---
  console.log('=== 9. рендер-контракт сохранён ===');
  const c2 = w.eval(`window.__c1`);
  w.addSection('Bridge');
  await sleep(50);
  ok('addSection завершается рендером (свой вызов + подписчик Store)', c2.reqRender >= 1, 'reqRender=' + c2.reqRender);
  ok('render выполнен через rAF', c2.render >= 1, 'render=' + c2.render);

  // --- 10. ступень 3: глубокие сеттеры — команды Store (все тихие) ---
  console.log('=== 10. ступень 3: сеттеры пишут команды ===');
  w.eval(`
    globalTimeSig = '4/4';
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
  // Лог кольцевой (100 записей) и уже насыщен секцией 3 — длина не
  // растёт, поэтому сравниваем КОЛИЧЕСТВО конкретной метки до/после.
  const cmd = (lbl, fn) => {
    const n0 = w.songStore.log().filter((e) => e.label === lbl).length;
    fn();
    return w.songStore.log().filter((e) => e.label === lbl).length > n0;
  };
  ok('setSectionKey → section/key', cmd('section/key', () => w.setSectionKey(1, 'G')));
  ok('setSectionBpm → section/bpm', cmd('section/bpm', () => w.setSectionBpm(1, 140)));
  ok('setSectionRepeat → section/repeat', cmd('section/repeat', () => w.setSectionRepeat(1, 2)));
  ok('renameSection → section/rename', cmd('section/rename', () => w.renameSection(1, 'Куплет 1')));
  ok('setSquareRepeat → square/repeat', cmd('square/repeat', () => w.setSquareRepeat(1, 2, 2)));
  ok('addSquare → square/add', cmd('square/add', () => w.addSquare(1)));
  ok('cloneLastSquare → square/clone', cmd('square/clone', () => w.cloneLastSquare(1)));
  ok('addChordAfter → cell/add', cmd('cell/add', () => w.addChordAfter(1, 2, 0)));
  ok('removeChordAt → cell/remove', cmd('cell/remove', () => w.removeChordAt(1, 2, 0)));
  ok('changeChordSpanDirect → cell/span', cmd('cell/span', () => w.changeChordSpanDirect(1, 2, 0, 2)));
  ok('setEventTimeSig → cell/timesig', cmd('cell/timesig', () => w.setEventTimeSig(1, 2, 0, '3/4')));
  ok('setEventChord → cell/chord', cmd('cell/chord', () => w.setEventChord(w.eval('sections[0].squares[0].events[0]'), 'Dm', {})));
  ok('setSectionTimeSig → section/timesig', cmd('section/timesig', () => w.setSectionTimeSig(1, '3/4')));
  ok('removeSquare → square/remove', cmd('square/remove', () => w.removeSquare(1, 3)));
  ok('removeSection → section/remove', cmd('section/remove', () => w.removeSection(1)));

  // --- 11. гард вложенности: один notify на составной сценарий ---
  console.log('=== 11. вложенные команды ===');
  let seen = [];
  const offNested = w.songStore.subscribe((cmd) => { seen.push(cmd && cmd.label); });
  w.songStore.dispatch('test/outer', () => {
    w.songStore.dispatch('test/inner', () => {});
  });
  ok('вложенная команда пишет метку в лог', w.songStore.log().some((e) => e.label === 'test/inner'));
  ok('подписчики оповещены ОДИН раз — внешней командой', seen.length === 1 && seen[0] === 'test/outer', JSON.stringify(seen));
  offNested();

  console.log(`\n${bad ? 'СБОЕВ: ' + bad : 'ALL OK — ' + 'Store ступени 3 работает по контракту'}`);
  process.exit(bad ? 1 : 0);
});
