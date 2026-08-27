// Новый в этой версии файла санитайзер импорта (sanitizeSongData) фильтрует
// входящие песни. Проверяем, что он не режет басовые токены Б/Б₂ и вообще
// корректно пропускает ритмы всех трёх уровней.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
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
          { chord: 'F', span: 2, timeSig: null, strumPattern: null },
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
  const sqPat = w.eval('JSON.stringify(sections[0].squares[0].strumPattern)');
  const evPat = w.eval('JSON.stringify(sections[0].squares[0].events[0].strumPattern)');
  console.log('\nбой секции   :', secPat);
  console.log('перебор квадр:', sqPat);
  console.log('перебор ячейк:', evPat);

  const hasB = sqPat.includes('"B"') && sqPat.includes('"A"');
  console.log('\nбасовые токены Б/Б₂ пережили импорт:', hasB ? 'ДА OK' : 'НЕТ — ТОКЕНЫ ПОТЕРЯНЫ');
  console.log('аккордовый щипок [1,2,3] цел:', evPat.includes('[1,2,3]') ? 'ДА OK' : 'НЕТ');

  // Проверяем, что бас действительно живой после загрузки.
  const played = w.eval(`
    (function(){
      const p = sections[0].squares[0].strumPattern;
      const shape = resolveFingeringShape('Am','C');
      return p.steps.map(s => s ? resolvePickStepStrings(s, shape, 'Am').join('+') : '.').join(' ');
    })()
  `);
  console.log('перебор квадрата на Am звучит как:', played);

  // Сериализация обратно — круг замкнулся?
  // serializeCurrentSong живёт внутри IIFE — идём через публичный saveCurrentSong.
  w.saveCurrentSong();
  const stored = JSON.parse(w.localStorage.getItem('struchord_songs'));
  const round = JSON.stringify(stored[stored.length - 1].sections[0].squares[0].strumPattern);
  console.log('\nпосле обратной сериализации:', round);
  console.log('совпадает с загруженным:', round === sqPat ? 'ДА OK' : 'РАСХОЖДЕНИЕ');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
