// B-76: «Сохранить для всех Am» — массовое применение аппликатуры ко
// всем вхождениям аккорда в песне. UI-жест (кнопка по наведению +
// окно подтверждения) принимается визуально; здесь проверяем модель:
//   1. applyFingeringToAllOccurrences прописывает форму (лады + баррэ)
//      во ВСЕ вхождения имени, кроме исключённой ячейки;
//   2. перекрывает и вручную закреплённые ячейки (на то и «для всех»);
//   3. countPinnedOccurrences считает только ДРУГИЕ вхождения с ручным
//      выбором — по нему решается, показывать ли окно подтверждения;
//   4. чужие аккорды не трогаются.
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

  // Песня: Am Am C Am (три Am в двух секциях + один C). Ключ C.
  const base = {
    schemaVersion: 2, name: 'x', bpm: 100, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', notes: '', nextId: 99, preferredFingerings: [],
    userFingerings: [], date: '2026-01-01T00:00:00.000Z', tuning: 'e-std',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
        bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null,
          events: [
            { chord: 'Am', span: 1, timeSig: null, strumPattern: null },
            { chord: 'Am', span: 1, timeSig: null, strumPattern: null },
            { chord: 'C', span: 1, timeSig: null, strumPattern: null },
          ] }] },
      { id: 3, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null,
        bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 4, repeat: 1, customBeats: null, strumPattern: null,
          events: [
            { chord: 'Am', span: 1, timeSig: null, strumPattern: null },
          ] }] },
    ],
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([base]));
  ev('sections = []');
  w.loadSong(0);

  // Слепок форм всех Am до применения (для сверки, что раньше были иные).
  const amFingerings = () => JSON.parse(ev(`(function(){
    const out = [];
    sections.forEach(sec => (sec.squares||[]).forEach(sq => (sq.events||[]).forEach(e => {
      if ((e.chord||'').trim() === 'Am') out.push({ f: e.fingering || null, b: e.barreOff || null });
    })));
    return JSON.stringify(out);
  })()`));

  console.log('=== countPinnedOccurrences (сколько перекроем) ===');
  // Пока никто вручную не выбирал — перекрывать нечего.
  check('нет ручных выборов -> 0',
    ev("countPinnedOccurrences('Am','C',null)"), 0);

  // Закрепим форму во ВТОРОМ Am (sec1/sq2/ei1) вручную.
  ev(`setPreferredFingering(buildFingeringPositionKey('Am','C',1,2,1), '5,7,7,5,5,5', sections[0].squares[0].events[1], [5])`);
  check('один ручной выбор виден (без исключения)',
    ev("countPinnedOccurrences('Am','C',null)"), 1);
  // Исключив саму эту ячейку — снова 0 (её же и правим).
  check('та же ячейка в exceptPosKey -> 0',
    ev("countPinnedOccurrences('Am','C',buildFingeringPositionKey('Am','C',1,2,1))"), 0);

  console.log('\n=== applyFingeringToAllOccurrences ===');
  // Правим ПЕРВЫЙ Am (sec1/sq2/ei0) и раздаём его форму всем прочим.
  const exceptKey = ev("buildFingeringPositionKey('Am','C',1,2,0)");
  const n = ev(`applyFingeringToAllOccurrences('Am','C','x,0,2,2,1,0',[], ${JSON.stringify(exceptKey)})`);
  checkTrue('применено к 2 другим вхождениям (2-й Am и Am в припеве)', n === 2, `n=${n}`);

  const after = amFingerings();
  // Первый Am (исключён) формы не получил — его правит сам редактор.
  check('исключённая ячейка не тронута', after[0], { f: null, b: null });
  // Второй Am был вручную закреплён барре-формой — перекрыт (на то и «для всех»).
  check('вручную закреплённый Am перекрыт новой формой',
    after[1], { f: 'x,0,2,2,1,0', b: null });
  // Am в припеве получил ту же форму.
  check('Am в припеве получил форму', after[2], { f: 'x,0,2,2,1,0', b: null });

  console.log('\n=== баррэ едет вместе с формой ===');
  ev(`applyFingeringToAllOccurrences('Am','C','5,7,7,5,5,5',[5], ${JSON.stringify(exceptKey)})`);
  const afterB = amFingerings();
  check('форма с баррэ раздана (лады)', afterB[2].f, '5,7,7,5,5,5');
  check('состояние баррэ раздано вместе с ладами', afterB[2].b, [5]);

  console.log('\n=== чужой аккорд не тронут ===');
  const cFing = JSON.parse(ev(`JSON.stringify(sections[0].squares[0].events[2].fingering || null)`));
  check('C остался без навязанной формы Am', cFing, null);

  console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
  if (failed) process.exitCode = 1;
}

w.addEventListener('load', () => {
  try { run(); }
  catch (e) { console.error('ОШИБКА:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); process.exitCode = 1; }
});
