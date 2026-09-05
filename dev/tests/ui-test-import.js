// Санитайзер импорта (sanitizeSongData) фильтрует входящие песни.
// Проверяем, что он не режет басовые токены Б/Б₂ и корректно пропускает
// ритмы двух уровней (секция, ячейка). Третий уровень — «рисунок квадрата»
// — снесён чисткой-4 (B-18, 2026-09-05): поле старого файла отбрасывается.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/', // localStorage недоступен для opaque origin
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

function run() {
  // Песня со всеми тремя уровнями ритма и живыми басовыми токенами.
  const song = {
    schemaVersion: 2,
    name: 'Тест',
    bpm: 100,
    globalKey: 'C',
    keyMode: 'manual',
    globalTimeSig: '4/4',
    notes: '',
    sections: [{
      id: 1, type: 'Verse', customName: null, key: null, shift: null,
      timeSig: null, bpm: null, repeat: 1,
      strumPattern: { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] },
      squares: [{
        id: 2, repeat: 1, customBeats: null,
        strumPattern: { mode: 'pick', subdivision: 2, steps: [['B'], [3], [2], [3], ['A'], [3], [1], [3]] },
        events: [
          { chord: 'Am', span: 2, timeSig: null, strumPattern: { mode: 'pick', subdivision: 1, steps: [['B'], [1, 2, 3]] } },
          { chord: 'F', span: 2, timeSig: null, strumPattern: { mode: 'pick', subdivision: 2, steps: [['B'], [3], ['A'], [3]] } },
        ],
      }],
    }],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };

  // Идём настоящим путём импорта: кладём песню в localStorage и грузим
  // через window.loadSong — так отработает и sanitizeSongData.
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  console.log('песня загружена через штатный импорт');

  const secPat = w.eval('JSON.stringify(sections[0].strumPattern)');
  const sqPat = w.eval('JSON.stringify(sections[0].squares[0].strumPattern ?? null)');
  // Волна-4: рисунок ячейки после загрузки живёт в пуле рулонов, а не в
  // ev.strumPattern — читаем звучащее окно (старый вариант теста смотрел
  // в поле и молча печатал «НЕТ»).
  const evPat = w.eval('JSON.stringify(rhythmSoundingForEvent(sections[0], sections[0].squares[0], sections[0].squares[0].events[0], 0))');
  const ev2Pat = w.eval('JSON.stringify(rhythmSoundingForEvent(sections[0], sections[0].squares[0], sections[0].squares[0].events[1], 1))');
  console.log('\nбой секции   :', secPat);
  console.log('перебор ячейки 1 (звучащее окно):', evPat);
  console.log('перебор ячейки 2 (звучащее окно):', ev2Pat);

  if (sqPat !== 'null') throw new Error('B-18: рисунок квадрата должен отбрасываться при загрузке, а он: ' + sqPat);
  console.log('рисунок квадрата из файла отброшен (B-18): ДА OK');
  const hasB = ev2Pat.includes('"B"') && ev2Pat.includes('"A"');
  if (!hasB) throw new Error('басовые токены Б/Б₂ потеряны: ' + ev2Pat);
  console.log('басовые токены Б/Б₂ пережили импорт: ДА OK');
  if (!evPat.includes('[1,2,3]')) throw new Error('аккордовый щипок [1,2,3] потерян: ' + evPat);
  console.log('аккордовый щипок [1,2,3] цел: ДА OK');

  // Проверяем, что бас действительно живой после загрузки.
  const played = w.eval(`
    (function(){
      const p = rhythmSoundingForEvent(sections[0], sections[0].squares[0], sections[0].squares[0].events[1], 1);
      const shape = resolveFingeringShape('F','C');
      return p.steps.map(s => s ? resolvePickStepStrings(s, shape, 'F').join('+') : '.').join(' ');
    })()
  `);
  console.log('перебор ячейки 2 на F звучит как:', played);

  // Сериализация обратно — круг замкнулся?
  // serializeCurrentSong живёт внутри IIFE — идём через публичный saveCurrentSong.
  w.confirm = () => true;
  w.saveCurrentSong();
  const stored = JSON.parse(w.localStorage.getItem('struchord_songs'));
  const savedSq = stored[stored.length - 1].sections[0].squares[0];
  if ('strumPattern' in savedSq) throw new Error('B-18: поле strumPattern квадрата не должно попадать в сейв');
  console.log('\nв сейве у квадрата нет поля strumPattern (B-18): ДА OK');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
