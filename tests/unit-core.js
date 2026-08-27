// Unit-тесты чистой логики, наиболее уязвимой при рефакторинге:
//   - миграции схемы песни (migrateSongData + sanitizeSongData)
//   - пересчёт длительностей при смене размера такта
//   - скоринг аппликатур
// Эти функции не трогают DOM, но у них нетривиальные инварианты, поэтому
// проверяем их отдельно от UI-тестов — так поломка сразу видна по имени.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html', 'utf8'), {
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
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`   ok   ${name}`); }
  else { failed++; console.log(`   FAIL ${name}\n        ожидалось ${e}\n        получено  ${a}`); }
}
function checkTrue(name, cond, note) {
  if (cond) { pass++; console.log(`   ok   ${name}`); }
  else { failed++; console.log(`   FAIL ${name}${note ? ' — ' + note : ''}`); }
}

function run() {
  const ev = (code) => w.eval(code);

  console.log('=== convertSpanBetweenTimeSigs (пересчёт длительностей) ===');
  check('4/4 -> 4/4 без изменений', ev("convertSpanBetweenTimeSigs(2,'4/4','4/4')"), 2);
  check('4/4 -> 3/4 сжимает', ev("convertSpanBetweenTimeSigs(4,'4/4','3/4')"), 3);
  check('3/4 -> 4/4 растягивает', ev("convertSpanBetweenTimeSigs(3,'3/4','4/4')"), 4);
  check('4/4 -> 6/8 (числитель 6)', ev("convertSpanBetweenTimeSigs(4,'4/4','6/8')"), 6);
  // Инвариант: туда-обратно возвращает исходное значение.
  checkTrue('обратимость 4/4 <-> 3/4',
    ev("Math.abs(convertSpanBetweenTimeSigs(convertSpanBetweenTimeSigs(4,'4/4','3/4'),'3/4','4/4') - 4) < 1e-9"));
  checkTrue('обратимость 5/4 <-> 7/8',
    ev("Math.abs(convertSpanBetweenTimeSigs(convertSpanBetweenTimeSigs(5,'5/4','7/8'),'7/8','5/4') - 5) < 1e-9"));
  check('битый размер не роняет', ev("convertSpanBetweenTimeSigs(2,'мусор','4/4')"), 2);

  console.log('\n=== sanitizeSongData (защита импорта) ===');
  const base = {
    schemaVersion: 2, name: 'x', bpm: 100, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', notes: '', nextId: 5, userFingerings: [], preferredFingerings: [],
    date: '2026-01-01T00:00:00.000Z',
    sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: 'Am', span: 2, timeSig: null, strumPattern: null }] }] }],
  };
  // sanitizeSongData живёт внутри IIFE, снаружи её нет. Идём штатным
  // путём импорта: кладём песню в localStorage и грузим через loadSong —
  // санитайзер отработает по дороге. Так тест ещё и ближе к реальности.
  const san = (patch) => {
    const song = JSON.parse(JSON.stringify(base));
    Object.assign(song, patch);
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    const ok = w.loadSong(0) !== false;
    const loaded = ev(`(function(){
      if (!sections || !sections.length) return null;
      return JSON.stringify({
        bpm: parseInt(DOM.bpmInput.value, 10),
        globalTimeSig: globalTimeSig,
        name: DOM.songTitle.value,
        sections: sections.map(s => ({ type: s.type, strumPattern: s.strumPattern })),
      });
    })()`);
    return loaded;
  };
  // Отдельно: принял ли загрузчик песню вообще.
  const accepted = (patch) => {
    const song = JSON.parse(JSON.stringify(base));
    Object.assign(song, patch);
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    ev('sections = []');
    w.loadSong(0);
    return ev('sections.length > 0');
  };

  checkTrue('валидная песня проходит', accepted({}));
  check('битый bpm ограничивается', JSON.parse(san({ bpm: 99999 })).bpm <= 400, true);
  check('неизвестный размер -> 4/4', JSON.parse(san({ globalTimeSig: '13/16' })).globalTimeSig, '4/4');
  check('неизвестный тип секции -> Custom',
    JSON.parse(san({ sections: [{ ...base.sections[0], type: 'Хакер' }] })).sections[0].type, 'Custom');
  checkTrue('песня без sections отбрасывается', !accepted({ sections: null }));
  checkTrue('слишком много секций отбрасывается',
    !accepted({ sections: new Array(500).fill(base.sections[0]) }));
  check('длинное имя обрезается до лимита',
    JSON.parse(san({ name: 'я'.repeat(5000) })).name.length, 200);
  // Пункт из код-ревью: date раньше копировалась без лимита.
  checkTrue('длинная date не роняет импорт', accepted({ date: 'д'.repeat(5000) }));
  checkTrue('date объектом не роняет импорт', accepted({ date: { evil: 1 } }));

  console.log('\n=== cloneSafePattern через sanitize (ритмы) ===');
  const withPattern = (p) => {
    const song = JSON.parse(JSON.stringify(base));
    song.sections[0].strumPattern = p;
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    ev('sections = []');
    w.loadSong(0);
    return ev('sections.length ? JSON.stringify(sections[0].strumPattern) : "null"') === 'null'
      ? null : JSON.parse(ev('JSON.stringify(sections[0].strumPattern)'));
  };
  check('валидный бой сохраняется',
    withPattern({ mode: 'strum', subdivision: 2, steps: ['D', null, 'U', 'X'] }),
    { mode: 'strum', subdivision: 2, steps: ['D', null, 'U', 'X'] });
  check('басовые токены переживают импорт',
    withPattern({ mode: 'pick', subdivision: 1, steps: [['B'], ['A']] }),
    { mode: 'pick', subdivision: 1, steps: [['B'], ['A']] });
  check('мусорные символы вычищаются',
    withPattern({ mode: 'strum', subdivision: 1, steps: ['D', '<script>', 'Z'] }),
    { mode: 'strum', subdivision: 1, steps: ['D', null, null] });
  check('струна вне 1..6 отбрасывается',
    withPattern({ mode: 'pick', subdivision: 1, steps: [[99], [3]] }),
    { mode: 'pick', subdivision: 1, steps: [null, [3]] });
  check('неизвестный subdivision -> паттерн отброшен',
    withPattern({ mode: 'strum', subdivision: 7, steps: ['D'] }), null);

  console.log('\n=== scoreShape (подбор аппликатур) ===');
  const score = (shape, notes, root) =>
    ev(`scoreShape(${JSON.stringify(shape)}, ${JSON.stringify(notes)}, '${root}', null)`);
  const openAm = score(['x', 0, 2, 2, 1, 0], ['A', 'C', 'E'], 'A');
  const barreAm = score([5, 7, 7, 5, 5, 5], ['A', 'C', 'E'], 'A');
  checkTrue('открытая Am оценена выше баррэ', openAm > barreAm,
    `открытая=${openAm}, баррэ=${barreAm}`);
  const openE = score([0, 2, 2, 1, 0, 0], ['E', 'G#', 'B'], 'E');
  const highE = score([12, 14, 14, 13, 12, 12], ['E', 'G#', 'B'], 'E');
  checkTrue('низкая позиция предпочтительнее высокой', openE > highE,
    `низкая=${openE}, высокая=${highE}`);
  checkTrue('оценка — конечное число', Number.isFinite(openAm));
  // Инвариант стабильности: одинаковый вход даёт одинаковый результат.
  check('детерминированность', score(['x', 0, 2, 2, 1, 0], ['A', 'C', 'E'], 'A'), openAm);

  console.log('\n=== getPluckBuffer (LRU-кэш) ===');
  const lru = ev(`(function(){
    pluckBufferCache.clear();
    const ctx = getAudioContext();
    // Заполняем кэш сверх лимита и проверяем, что он не обнуляется.
    for (let i = 0; i < PLUCK_CACHE_LIMIT + 20; i++) getPluckBuffer(ctx, 100 + i, 1, 0.5);
    const sizeAfter = pluckBufferCache.size;
    // Самый свежий ключ обязан остаться.
    const freshKey = [...pluckBufferCache.keys()].pop();
    return JSON.stringify({ sizeAfter, limit: PLUCK_CACHE_LIMIT, hasFresh: !!freshKey });
  })()`);
  const l = JSON.parse(lru);
  checkTrue('кэш не сбрасывается в ноль при переполнении', l.sizeAfter >= l.limit - 1,
    `размер после переполнения = ${l.sizeAfter}`);
  checkTrue('кэш не растёт бесконечно', l.sizeAfter <= l.limit, `размер = ${l.sizeAfter}`);
  const reuse = ev(`(function(){
    pluckBufferCache.clear();
    const ctx = getAudioContext();
    const a = getPluckBuffer(ctx, 220, 1, 0.5);
    const b = getPluckBuffer(ctx, 220, 1, 0.5);
    return a === b;
  })()`);
  checkTrue('повторный запрос возвращает тот же буфер', reuse);

  console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
  if (failed) process.exitCode = 1;
}

w.addEventListener('load', () => {
  try { run(); }
  catch (e) { console.error('ОШИБКА:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); process.exitCode = 1; }
});
