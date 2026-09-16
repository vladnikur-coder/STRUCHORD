// B-41: Модель пальцев (1..4, T) в аппликатурах аккордов.
// Проверяет:
// 1. asSafeFingers: валидация и санитайзинг массива пальцев.
// 2. computeFingersForShape: расчёт номеров пальцев (1=указательный, 2=средний,
//    3=безымянный, 4=мизинец, T=большой) для стандартных и баррэ аккордов.
// 3. customFingers: перекрытие расчёта кастомной раскладкой.
// 4. renderFingeringSVG: отрисовка номеров пальцев внутри точек и баррэ-капсулы.
// 5. upsertUserFingering / ufEntryFingers: поддержка кастомных пальцев в библиотеке.
// 6. Round-trip через loadSong / saveCurrentSong: сохранение и загрузка fingers.
// 7. setPreferredFingering / fingersForEventShape: привязка пальцев к ячейкам песни.

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

const ev = (code) => w.eval(code);

let pass = 0, failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`   ok   ${name}`); }
  else { failed++; console.log(`   FAIL ${name}\n        ожидалось ${e}\n        получено  ${a}`); }
}

function checkTrue(name, condition, extra = '') {
  if (condition) { pass++; console.log(`   ok   ${name}`); }
  else { failed++; console.log(`   FAIL ${name} ${extra}\n        условие не выполнено`); }
}

console.log('=== 1. asSafeFingers (валидация раскладки пальцев) ===');
check('валидный массив 6 элементов', w.asSafeFingers(['x', 1, 2, 3, 4, 'T']), ['x', 1, 2, 3, 4, 'T']);
check('строковые цифры нормализуются в числа', w.asSafeFingers(['x', '0', '1', '2', '3', '4']), ['x', 0, 1, 2, 3, 4]);
check('маленькая буква "t" становится "T"', w.asSafeFingers(['t', 'x', 1, 2, 3, 4]), ['T', 'x', 1, 2, 3, 4]);
check('невалидная длина массива дает null', w.asSafeFingers([1, 2, 3]), null);
check('невалидные символы дают null', w.asSafeFingers(['x', 5, 1, 2, 3, 4]), null);
check('null / undefined дает null', w.asSafeFingers(null), null);

console.log('\n=== 2. computeFingersForShape (авторасчет пальцев) ===');
// Open Am: x, 0, 2, 2, 1, 0 -> 2 лад 4я струна(2), 2 лад 3я струна(3), 1 лад 2я струна(1)
const fAm = w.computeFingersForShape(['x', 0, 2, 2, 1, 0]);
check('Am открытый: струны 0 и 1', [fAm[0], fAm[1], fAm[5]], ['x', 0, 0]);
check('Am открытый: пальцы на зажатых струнах', [fAm[2], fAm[3], fAm[4]], [2, 3, 1]);

// Open C: x, 3, 2, 0, 1, 0
const fC = w.computeFingersForShape(['x', 3, 2, 0, 1, 0]);
check('C открытый: x, 3, 2, 0, 1, 0', fC, ['x', 3, 2, 0, 1, 0]);

// Open D: x, x, 0, 2, 3, 2
const fD = w.computeFingersForShape(['x', 'x', 0, 2, 3, 2]);
check('D открытый: x, x, 0, 1, 3, 2', fD, ['x', 'x', 0, 1, 3, 2]);

// Barre F: 1, 3, 3, 2, 1, 1
const fF = w.computeFingersForShape([1, 3, 3, 2, 1, 1]);
check('F баррэ на 1 ладу: палец 1 на 1 ладу', [fF[0], fF[4], fF[5]], [1, 1, 1]);
check('F баррэ: палец 2 на 2 ладу, 3 и 4 на 3 ладу', [fF[1], fF[2], fF[3]], [3, 4, 2]);

// Barre F#m: 2, 4, 4, 2, 2, 2 -> 5-я струна (палец 3), 4-я струна (палец 4), баррэ на 2 ладу (палец 1)
const fFsm = w.computeFingersForShape([2, 4, 4, 2, 2, 2]);
check('F#m минорное баррэ: пальцы 1, 3, 4', fFsm, [1, 3, 4, 1, 1, 1]);

// Barre Bm: x, 2, 4, 4, 3, 2 -> 5-я струна баррэ (1), 4-я (3), 3-я (4), 2-я (2)
const fBm = w.computeFingersForShape(['x', 2, 4, 4, 3, 2]);
check('Bm минорное баррэ от 5-й струны: пальцы 1, 3, 4, 2', fBm, ['x', 1, 3, 4, 2, 1]);
console.log('\n=== 3. customFingers (кастомное перекрытие) ===');
// Кастомное задание пальцев для Am: например 4-й палец вместо 3-го
const customAm = ['x', 0, 2, 4, 1, 0];
const fCustomAm = w.computeFingersForShape(['x', 0, 2, 2, 1, 0], customAm);
check('Am с кастомным 4-м пальцем', fCustomAm, ['x', 0, 2, 4, 1, 0]);

console.log('\n=== 4. renderFingeringSVG (отрисовка пальцев в SVG) ===');
const svgAm = w.renderFingeringSVG(['x', 0, 2, 2, 1, 0], 30, { showFingers: true });
checkTrue('SVG содержит метку пальца 1', svgAm.includes('>1<'));
checkTrue('SVG содержит метку пальца 2', svgAm.includes('>2<'));
checkTrue('SVG содержит метку пальца 3', svgAm.includes('>3<'));

const svgBarreF = w.renderFingeringSVG([1, 3, 3, 2, 1, 1], 30, { showFingers: true });
checkTrue('SVG для баррэ F содержит капсулу с пальцем 1', svgBarreF.includes('class="fingering-barre"') && svgBarreF.includes('>1<'));

const svgCustomAm = w.renderFingeringSVG(['x', 0, 2, 2, 1, 0], 30, { showFingers: true, customFingers: customAm });
checkTrue('SVG с кастомными пальцами отображает палец 4', svgCustomAm.includes('>4<'));

console.log('\n=== 5. upsertUserFingering / ufEntryFingers ===');
const userList = [];
w.upsertUserFingering(userList, ['x', 0, 2, 2, 1, 0], null, ['x', 0, 2, 4, 1, 0]);
check('Запись в userList имеет поле fingers', userList[0].fingers, ['x', 0, 2, 4, 1, 0]);

console.log('\n=== 6. Round-trip сохранения и загрузки песни с fingers ===');
const baseSong = {
  schemaVersion: 2,
  name: 'Finger Test Song',
  bpm: 120,
  globalKey: 'Am',
  keyMode: 'manual',
  globalTimeSig: '4/4',
  notes: '',
  nextId: 10,
  preferredFingerings: [],
  date: '2026-01-01T00:00:00.000Z',
  tuning: 'e-std',
  userFingerings: [
    [
      'Am',
      [
        {
          shape: ['x', 0, 2, 2, 1, 0],
          fingers: ['x', 0, 2, 4, 1, 0],
        },
      ],
    ],
  ],
  sections: [
    {
      id: 1,
      type: 'Verse',
      customName: null,
      key: null,
      shift: null,
      timeSig: null,
      bpm: null,
      repeat: 1,
      strumPattern: null,
      squares: [
        {
          id: 2,
          repeat: 1,
          customBeats: null,
          strumPattern: null,
          events: [
            {
              chord: 'Am',
              span: 4,
              timeSig: null,
              strumPattern: null,
              fingering: 'x,0,2,2,1,0',
              fingers: ['x', 0, 2, 4, 1, 0],
            },
          ],
        },
      ],
    },
  ],
};

w.localStorage.setItem('struchord_songs', JSON.stringify([baseSong]));
ev('sections = []');
w.loadSong(0);

const loadedEvent = ev('sections[0].squares[0].events[0]');
check('Событие сохранило fingering', loadedEvent.fingering, 'x,0,2,2,1,0');
check('Событие сохранило кастомные fingers', loadedEvent.fingers, ['x', 0, 2, 4, 1, 0]);

const loadedUf = ev("userFingerings.get('Am')");
checkTrue('Библиотека userFingerings загрузила запись', !!loadedUf && loadedUf.length > 0);
check('Запись userFingerings сохранила custom fingers', loadedUf[0].fingers, ['x', 0, 2, 4, 1, 0]);

console.log('\n=== 7. setPreferredFingering / fingersForEventShape ===');
const evObj = { chord: 'Am', fingering: 'x,0,2,2,1,0', fingers: ['x', 0, 2, 4, 1, 0] };
check('fingersForEventShape для совпадающей формы', w.eval("fingersForEventShape")({ chord: 'Am', fingering: 'x,0,2,2,1,0', fingers: ['x', 0, 2, 4, 1, 0] }, ['x', 0, 2, 2, 1, 0]), ['x', 0, 2, 4, 1, 0]);
check('fingersForEventShape для несовпадающей формы дает null', w.eval("fingersForEventShape")({ chord: 'Am', fingering: 'x,0,2,2,1,0', fingers: ['x', 0, 2, 4, 1, 0] }, [5, 7, 7, 5, 5, 5]), null);

console.log('\n=== 8. createInteractiveFretboard (ЛКМ ставит/убирает ноту, ПКМ меняет палец) ===');
let lastShape = null, lastFingers = null;
const fb = w.createInteractiveFretboard(['x', 0, 2, 2, 1, 0], (shape, fingers) => {
  lastShape = shape;
  lastFingers = fingers;
});
const zones = fb.container.querySelectorAll('div');
// Первая зона струн (6 зон сверху: 0..5), затем зоны ладов (5 ладов * 6 струн = 30 зон: 6..35)
// На ладу 2 (fret idx 1), струна 3 (индекс 2, '2' лад): zone index = 6 + 1 * 6 + 2 = 14
const noteZoneString3Fret2 = zones[6 + 1 * 6 + 2];

// 1. ЛКМ по уже стоящей ноте -> убирает ноту (становится 'x')
noteZoneString3Fret2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
check('ЛКМ по зажатой ноте убирает её (x)', lastShape[2], 'x');

// 2. ЛКМ по пустой ноте -> ставит ноту (становится 2)
noteZoneString3Fret2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
check('ЛКМ по пустой ноте ставит её (2)', lastShape[2], 2);

// 3. ПКМ (contextmenu) по стоящей ноте -> циклически переключает палец
noteZoneString3Fret2.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true }));
checkTrue('ПКМ по зажатой ноте задает кастомный палец', lastFingers && lastFingers[2] !== null);

console.log('\n=== 9. detectAllBarres (строгое непрерывное баррэ без дырок) ===');
const barres3xx333 = w.eval("detectAllBarres")([3, 'x', 'x', 3, 3, 3]);
check('3xx333: найдено ровно 1 баррэ', barres3xx333.length, 1);
check('3xx333: баррэ покрывает только струны 3..5 (не захватывает 6-ю через x)', [barres3xx333[0].first, barres3xx333[0].last], [3, 5]);

const barresF = w.eval("detectAllBarres")([1, 3, 3, 2, 1, 1]);
check('F (133211): полное баррэ на 1 ладу от струны 0 до 5', [barresF[0].first, barresF[0].last], [0, 5]);

console.log('\n=== 10. showFingers и displayMode (переключение видимости и ступеней) ===');
const svgNoFingers = w.renderFingeringSVG(['x', 0, 2, 2, 1, 0], 30, { showFingers: false });
checkTrue('SVG при showFingers=false не содержит цифр пальцев', !svgNoFingers.includes('>1<') && !svgNoFingers.includes('>2<'));

const svgWithFingers = w.renderFingeringSVG(['x', 0, 2, 2, 1, 0], 30, { showFingers: true });
checkTrue('SVG при showFingers=true содержит цифры пальцев', svgWithFingers.includes('>1<') && svgWithFingers.includes('>2<'));

fb.setDisplayMode('intervals');
fb.setIntervals([{ string: 5, interval: '5' }, { string: 4, interval: '1' }, { string: 3, interval: '5' }, { string: 2, interval: 'b3' }, { string: 1, interval: '1' }]);
checkTrue('Интерактивный гриф в режиме intervals отображает ступени', fb.container.innerHTML.includes('>b3<'));
checkTrue('Интерактивный гриф в режиме intervals отображает ступени на открытых струнах', fb.container.innerHTML.includes('>1<') && fb.container.innerHTML.includes('>5<'));

fb.setDisplayMode('fingers');
checkTrue('Интерактивный гриф в режиме fingers отображает пальцы', fb.container.innerHTML.includes('>1<') || fb.container.innerHTML.includes('>2<'));

console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
if (failed > 0) process.exit(1);
