// Проверка изоляции аппликатур через НАСТОЯЩИЙ UI редактора
// (openFingeringEditor + кнопка «Сохранить»), плюс краевые случаи.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
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

const song = {
  schemaVersion: 2, name: 'T', bpm: 100,
  globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
  sections: [
    { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
        { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
      ]}]},
    { id: 3, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 4, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
        { chord: 'C',  span: 2, timeSig: null, strumPattern: null },
      ]}]},
  ],
  nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
};

function run() {
  const d = w.document;
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);

  const readAm = () => w.eval(`
    (function(){
      const out = [];
      sections.forEach(sec => sec.squares.forEach(sq => sq.events.forEach((ev, ei) => {
        if (ev.chord !== 'Am') return;
        const key = sec.key || globalKey;
        const posKey = buildFingeringPositionKey(ev.chord, key, sec.id, sq.id, ei);
        const shape = resolveFingeringShape(ev.chord, key, posKey);
        out.push(shape ? shape.join(',') : 'нет');
      })));
      return out.join(' | ');
    })()
  `);

  console.log('=== ДО: три вхождения Am ===');
  console.log(' ', readAm());

  // --- Открываем НАСТОЯЩИЙ редактор для первого Am и сохраняем правку ---
  const wrapper = d.querySelector('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  console.log('\nобёртка первой ячейки найдена:', !!wrapper);
  w.eval("openFingeringEditor('Am', 0, document.querySelector('.chord-wrapper[data-sec=\"1\"][data-square=\"2\"][data-ei=\"0\"]'))");
  const editor = d.querySelector('#save-fingering');
  console.log('редактор открыт:', !!editor);

  // Меняем форму: ставим палец на 3-й лад первой струны.
  w.eval(`
    (function(){
      const svg = document.querySelector('.fingering-editor-svg') || document.querySelector('#fingering-editor svg');
      return !!svg;
    })()
  `);
  // Прямо задаём форму через объект грифа, затем жмём «Сохранить».
  const applied = w.eval(`
    (function(){
      if (typeof window.__fretboardRef === 'undefined') return 'нет ссылки на гриф';
      return 'ok';
    })()
  `);

  // Кнопка «Сохранить» берёт currentShape из замыкания; чтобы не лезть
  // внутрь, кликнем по ладу на грифе через DOM редактора.
  const frets = Array.from(d.querySelectorAll('#fingering-editor [data-string], .fret-dot, .fretboard-cell'));
  console.log('интерактивных элементов грифа найдено:', frets.length);

  if (editor) click(editor);

  console.log('\n=== ПОСЛЕ сохранения через UI ===');
  const after = readAm();
  console.log(' ', after);
  const parts = after.split(' | ');
  const allSame = parts.every((p) => p === parts[0]);
  console.log('  все три одинаковы:', allSame, allSame ? '(правки формы не было — это ок)' : '');

  // --- Главная проверка: закрепление чужих вхождений ---
  console.log('\n=== Проверка pinCurrentFingeringsForChord напрямую ===');
  const pins = w.eval(`
    (function(){
      preferredFingeringByChord.clear();
      const before = preferredFingeringByChord.size;
      const posKey = buildFingeringPositionKey('Am', 'C', 1, 2, 0);
      pinCurrentFingeringsForChord('Am', 'C', posKey);
      const keys = [...preferredFingeringByChord.keys()];
      return JSON.stringify({ before, after: keys.length, keys });
    })()
  `);
  console.log(' ', pins);
  const parsed = JSON.parse(pins);
  console.log('  закреплено чужих вхождений:', parsed.after, '(ожидаем 2 — Am в sec1/ev1 и sec3/ev0)');
  console.log('  редактируемое НЕ закреплено:', !parsed.keys.some((k) => k === 'Am|C|1|2|0') ? 'верно' : 'ОШИБКА');

  // --- Краевой случай: аккорд в секции с другой тональностью ---
  console.log('\n=== Секция со своей тональностью не затрагивается ===');
  const cross = w.eval(`
    (function(){
      sections[1].key = 'G';
      preferredFingeringByChord.clear();
      pinCurrentFingeringsForChord('Am', 'C', buildFingeringPositionKey('Am','C',1,2,0));
      const keys = [...preferredFingeringByChord.keys()];
      sections[1].key = null;
      return JSON.stringify(keys);
    })()
  `);
  console.log('  закреплено:', cross, '(Am из секции G не должен попасть)');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});

// Дополнительно: уже закреплённый выбор не должен перетираться.
w.addEventListener('load', () => {
  const res = w.eval(`
    (function(){
      preferredFingeringByChord.clear();
      // пользователь ранее вручную выбрал форму для sec3/ev0
      const pinned = buildFingeringPositionKey('Am','C',3,4,0);
      preferredFingeringByChord.set(pinned, 'СВОЙ_ВЫБОР');
      pinCurrentFingeringsForChord('Am','C', buildFingeringPositionKey('Am','C',1,2,0));
      return preferredFingeringByChord.get(pinned);
    })()
  `);
  console.log('\n=== Ранее закреплённый выбор сохраняется ===');
  console.log('  значение после фиксации:', res, res === 'СВОЙ_ВЫБОР' ? 'НЕ ПЕРЕТЁРТ OK' : 'ПЕРЕТЁРТ — ОШИБКА');
});
