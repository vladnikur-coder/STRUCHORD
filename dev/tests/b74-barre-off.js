// B-74: выключатель баррэ («разжать баррэ») в редакторе аппликатур.
// Проверяем не UI-жест (это принимается визуально в живом превью), а
// три инварианта модели, которые легко сломать рефакторингом:
//   1. renderFingeringSVG(opts.barreOff) — при выключенном баррэ капсулы
//      нет, а на её струнах появляются отдельные точки;
//   2. normalizeBarreOffSet / barreOffForEventShape — вспомогательная
//      логика привязки флага к КОНКРЕТНОЙ форме события;
//   3. флаг ev.barreOff переживает импорт (санитайзер) и чистится от
//      мусора; старые файлы без поля грузятся как «баррэ авто».
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

  console.log('=== normalizeBarreOffSet ===');
  check('массив ладов -> Set',
    ev('Array.from(normalizeBarreOffSet([1,5,5])).sort((a,b)=>a-b)'), [1, 5]);
  check('строка "1,3" -> Set', ev('Array.from(normalizeBarreOffSet("1,3"))'), [1, 3]);
  check('пусто -> null', ev('normalizeBarreOffSet([])'), null);
  check('null -> null', ev('normalizeBarreOffSet(null)'), null);
  check('мусор вне 1..24 отброшен', ev('Array.from(normalizeBarreOffSet([0,25,3,"x"]))'), [3]);

  console.log('\n=== barreOffForEventShape (привязка к форме) ===');
  // Флаг относится только к той форме, что реально стоит в ячейке.
  check('форма совпадает — флаг применяется',
    ev("barreOffForEventShape({ fingering: '1,3,3,2,1,1', barreOff: [1] }, [1,3,3,2,1,1])"),
    [1]);
  check('форма НЕ совпадает — флаг не липнет',
    ev("barreOffForEventShape({ fingering: '1,3,3,2,1,1', barreOff: [1] }, ['x',0,2,2,1,0])"),
    null);
  check('нет barreOff — null',
    ev("barreOffForEventShape({ fingering: '1,3,3,2,1,1' }, [1,3,3,2,1,1])"), null);

  console.log('\n=== renderFingeringSVG (капсула vs точки) ===');
  // F-мажор баррэ на 1 ладу: 1,3,3,2,1,1 (числовые лады — как их отдаёт
  // resolveFingeringShape, единственный вид, что доходит до отрисовки).
  const F = "[1,3,3,2,1,1]";
  const withBarre = ev(`renderFingeringSVG(${F}, 30)`);
  const noBarre = ev(`renderFingeringSVG(${F}, 30, { barreOff: [1] })`);
  checkTrue('обычно баррэ рисуется капсулой',
    /class="fingering-barre"/.test(withBarre), 'нет rect.fingering-barre');
  checkTrue('при barreOff капсулы нет',
    !/class="fingering-barre"/.test(noBarre), 'капсула осталась');
  // На 1 ладу баррэ прижимает 3 струны (1,5,6 индексы 0,4,5). Без капсулы
  // на них должны появиться отдельные точки: у формы F всего 6 нажатий,
  // из них 4 не на баррэ-струнах + 3 на баррэ-струнах = все шесть точками.
  const circlesBarre = (withBarre.match(/<circle/g) || []).length;
  const circlesNoBarre = (noBarre.match(/<circle/g) || []).length;
  checkTrue('без капсулы точек больше (струны баррэ разошлись)',
    circlesNoBarre > circlesBarre, `с капсулой=${circlesBarre}, без=${circlesNoBarre}`);
  // Разжатие несуществующего баррэ ничего не ломает: чужой лад в наборе
  // просто игнорируется, капсула остаётся.
  const otherFret = ev(`renderFingeringSVG(${F}, 30, { barreOff: [7] })`);
  checkTrue('чужой лад в barreOff не гасит капсулу',
    /class="fingering-barre"/.test(otherFret));

  console.log('\n=== импорт: ev.barreOff через санитайзер ===');
  const base = {
    schemaVersion: 2, name: 'x', bpm: 100, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', notes: '', nextId: 9, userFingerings: [], preferredFingerings: [],
    date: '2026-01-01T00:00:00.000Z',
    sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: 'F', span: 2, timeSig: null, strumPattern: null,
          fingering: '1,3,3,2,1,1' }] }] }],
  };
  const loadWithEvent = (patchEvent) => {
    const song = JSON.parse(JSON.stringify(base));
    Object.assign(song.sections[0].squares[0].events[0], patchEvent);
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    ev('sections = []');
    w.loadSong(0);
    return JSON.parse(ev('JSON.stringify(sections[0].squares[0].events[0].barreOff || null)'));
  };
  check('валидный barreOff переживает импорт', loadWithEvent({ barreOff: [1] }), [1]);
  check('мусор в barreOff вычищается', loadWithEvent({ barreOff: [0, 99, 1, 'x'] }), [1]);
  check('пустой barreOff -> null', loadWithEvent({ barreOff: [] }), null);
  check('старый файл без поля -> баррэ авто (null)', loadWithEvent({}), null);
  check('barreOff не массивом -> null', loadWithEvent({ barreOff: 'evil' }), null);

  console.log('\n=== сохранение -> загрузка (round-trip) ===');
  // Ставим флаг в модель, сериализуем песню целиком (exportSong читает
  // serializeCurrentSong, но пишет в Blob; проще пройти через сохранение
  // в localStorage под уникальным именем — confirm не сработает).
  w.confirm = () => true;
  const roundTrip = ev(`(function(){
    sections = [];
    localStorage.removeItem('struchord_songs');
    localStorage.setItem('struchord_songs', JSON.stringify([${JSON.stringify(base)}]));
    loadSong(0);
    DOM.songTitle.value = 'B74 roundtrip ' + Date.now();
    sections[0].squares[0].events[0].barreOff = [1];
    saveCurrentSong();
    const raw = JSON.parse(localStorage.getItem('struchord_songs'));
    const saved = raw[raw.length - 1];
    return JSON.stringify(saved.sections[0].squares[0].events[0].barreOff || null);
  })()`);
  check('barreOff уходит в файл при сохранении', JSON.parse(roundTrip), [1]);

  // И обратно: сохранённый файл, загруженный заново, восстанавливает флаг.
  const reloaded = ev(`(function(){
    const raw = JSON.parse(localStorage.getItem('struchord_songs'));
    const idx = raw.length - 1;
    sections = [];
    loadSong(idx);
    return JSON.stringify(sections[0].squares[0].events[0].barreOff || null);
  })()`);
  check('barreOff восстанавливается при загрузке', JSON.parse(reloaded), [1]);

  console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
  if (failed) process.exitCode = 1;
}

w.addEventListener('load', () => {
  try { run(); }
  catch (e) { console.error('ОШИБКА:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n')); process.exitCode = 1; }
});
