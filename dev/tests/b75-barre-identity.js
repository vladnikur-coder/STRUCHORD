// B-75: баррэ как часть ИДЕНТИЧНОСТИ аппликатуры. Те же лады, зажатые
// баррэ и разжатые вручную — две разные формы: два варианта в листалке
// и две записи в библиотеке форм песни (userFingerings). Физика (звук,
// оценка, транспонирование) по-прежнему смотрит только на лады.
//
// Проверяем инварианты модели (жест сохранения принимается визуально):
//   1. fingeringIdentity — ключ = лады+баррэ; без баррэ бит-в-бит старый;
//   2. upsertUserFingering — разжатая версия = отдельная запись, дубли
//      по композитному ключу схлопываются, последняя = умолчание;
//   3. ufEntryShape/ufEntryBarre — читают и голый массив, и {shape,barreOff};
//   4. round-trip userFingerings через сохранение/загрузку сохраняет пару;
//   5. getFingeringVariants отдаёт parallel-массив barreOffs той же длины.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
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

  console.log('=== fingeringIdentity (ключ = лады + баррэ) ===');
  // Без разжатого баррэ ключ обязан совпадать со старой строкой формы
  // бит-в-бит — иначе ломается совместимость со старыми preferred/файлами.
  check('без баррэ = прежняя строка ладов',
    ev("fingeringIdentity([1,3,3,2,1,1], null)"), '1,3,3,2,1,1');
  check('баррэ добавляет хвост ~bo',
    ev("fingeringIdentity([1,3,3,2,1,1], [1])"), '1,3,3,2,1,1~bo1');
  check('несколько ладов баррэ сортируются в хвосте',
    ev("fingeringIdentity([1,3,3,2,1,1], [5,1])"), '1,3,3,2,1,1~bo1.5');
  checkTrue('зажатая и разжатая формы РАЗЛИЧНЫ по идентичности',
    ev("fingeringIdentity([1,3,3,2,1,1], null) !== fingeringIdentity([1,3,3,2,1,1], [1])"));
  check('пустой barreOff трактуется как «нет баррэ»',
    ev("fingeringIdentity([1,3,3,2,1,1], [])"), '1,3,3,2,1,1');

  console.log('\n=== ufEntryShape / ufEntryBarre (два формата записи) ===');
  check('голый массив -> лады', ev("ufEntryShape([1,3,3,2,1,1])"), [1,3,3,2,1,1]);
  check('голый массив -> баррэ null', ev("ufEntryBarre([1,3,3,2,1,1])"), null);
  check('пара {shape} -> лады', ev("ufEntryShape({shape:[1,3,3,2,1,1],barreOff:[1]})"), [1,3,3,2,1,1]);
  check('пара {barreOff} -> баррэ', ev("ufEntryBarre({shape:[1,3,3,2,1,1],barreOff:[1]})"), [1]);
  check('пара без баррэ -> null', ev("ufEntryBarre({shape:[1,3,3,2,1,1],barreOff:null})"), null);

  console.log('\n=== upsertUserFingering (отдельная запись на разжатую форму) ===');
  // Разжатая версия тех же ладов НЕ вытесняет зажатую — это вторая форма.
  check('зажатая + разжатая = две записи',
    ev(`(function(){
      const l = [];
      upsertUserFingering(l, [1,3,3,2,1,1], [1]);
      upsertUserFingering(l, [1,3,3,2,1,1], null);
      return l.map(e => fingeringIdentity(ufEntryShape(e), ufEntryBarre(e)));
    })()`),
    ['1,3,3,2,1,1~bo1', '1,3,3,2,1,1']);
  // Повторный upsert той же композитной формы схлопывает дубль и поднимает
  // запись в конец (последняя = умолчание для новых ячеек аккорда).
  check('дубль по композитному ключу схлопывается, всплывает в конец',
    ev(`(function(){
      const l = [];
      upsertUserFingering(l, [1,3,3,2,1,1], [1]);
      upsertUserFingering(l, ['x',0,2,2,1,0], null);
      upsertUserFingering(l, [1,3,3,2,1,1], [1]);
      return l.map(e => fingeringIdentity(ufEntryShape(e), ufEntryBarre(e)));
    })()`),
    ['x,0,2,2,1,0', '1,3,3,2,1,1~bo1']);

  console.log('\n=== getFingeringVariants: parallel barreOffs[] ===');
  const shapes = ev("(window.getFingeringVariants('F','C')||{}).shapes || []");
  const barreOffs = ev("(window.getFingeringVariants('F','C')||{}).barreOffs || []");
  checkTrue('barreOffs той же длины, что shapes',
    shapes.length > 0 && shapes.length === barreOffs.length,
    `shapes=${shapes.length}, barreOffs=${barreOffs.length}`);

  console.log('\n=== импорт: userFingerings как {shape,barreOff} через санитайзер ===');
  // Библиотека форм уровня песни. Файловый формат — массив пар
  // [ключ, список форм]; санитайзер принимает и голый массив ладов
  // (старый формат), и {shape, barreOff}, приводит лады к числам,
  // чистит битый barreOff до null, а форму без баррэ держит в памяти
  // голым массивом. Ключ на стандартном строе (e-std) не штампуется.
  const base = {
    schemaVersion: 2, name: 'x', bpm: 100, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', notes: '', nextId: 9, preferredFingerings: [],
    date: '2026-01-01T00:00:00.000Z', tuning: 'e-std',
    userFingerings: [],
    sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: 'F', span: 2, timeSig: null, strumPattern: null,
          fingering: '1,3,3,2,1,1' }] }] }],
  };
  // Возвращаем то, что реально осело в in-memory Map для ключа 'F'.
  const loadWithUF = (list) => {
    const song = JSON.parse(JSON.stringify(base));
    song.userFingerings = [['F', list]];
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    ev('sections = []');
    w.loadSong(0);
    return JSON.parse(ev("JSON.stringify(userFingerings.get('F') || null)"));
  };
  check('старый формат (голый массив ладов) грузится числами',
    loadWithUF([['1','3','3','2','1','1']]),
    [[1,3,3,2,1,1]]);
  check('новый формат {shape,barreOff} грузится с баррэ',
    loadWithUF([{ shape: ['1','3','3','2','1','1'], barreOff: [1] }]),
    [{ shape: [1,3,3,2,1,1], barreOff: [1] }]);
  check('мусор в barreOff вычищается, форма остаётся',
    loadWithUF([{ shape: ['1','3','3','2','1','1'], barreOff: [0, 99, 1, 'x'] }]),
    [{ shape: [1,3,3,2,1,1], barreOff: [1] }]);
  check('пустой barreOff схлопывается в голый массив',
    loadWithUF([{ shape: ['1','3','3','2','1','1'], barreOff: [] }]),
    [[1,3,3,2,1,1]]);

  console.log('\n=== round-trip: пара {shape,barreOff} переживает сохранение ===');
  w.confirm = () => true;
  const roundTrip = ev(`(function(){
    sections = [];
    localStorage.removeItem('struchord_songs');
    localStorage.setItem('struchord_songs', JSON.stringify([${JSON.stringify(base)}]));
    loadSong(0);
    DOM.songTitle.value = 'B75 roundtrip ' + Date.now();
    userFingerings.clear();
    userFingerings.set('F', [ { shape: [1,3,3,2,1,1], barreOff: [1] }, ['x',0,2,2,1,0] ]);
    saveCurrentSong();
    const raw = JSON.parse(localStorage.getItem('struchord_songs'));
    const saved = raw[raw.length - 1];
    const entry = (saved.userFingerings || []).find((p) => p[0] === 'F');
    return JSON.stringify(entry ? entry[1] : null);
  })()`);
  check('в файл уходят обе формы (пара с баррэ + голый массив)',
    JSON.parse(roundTrip),
    [{ shape: [1,3,3,2,1,1], barreOff: [1] }, ['x',0,2,2,1,0]]);

  console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
  if (failed) process.exitCode = 1;
}

w.addEventListener('load', () => {
  try { run(); }
  catch (e) { console.error('ОШИБКА:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); process.exitCode = 1; }
});
