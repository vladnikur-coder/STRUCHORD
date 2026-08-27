// Воспроизводим баг: один аккорд встречается в песне несколько раз,
// правим аппликатуру у ОДНОГО вхождения — проверяем, не изменилась ли она
// у остальных.
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

function run() {
  // Песня: Am встречается ТРИЖДЫ — в двух разных секциях.
  const song = {
    schemaVersion: 2, name: 'Тест аппликатур', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
          { chord: 'F',  span: 2, timeSig: null, strumPattern: null },
        ]}]},
      { id: 3, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 4, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
        ]}]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);

  // Что играет каждое вхождение Am сейчас (до правки).
  const readAll = () => w.eval(`
    (function(){
      const out = [];
      sections.forEach(sec => sec.squares.forEach(sq => sq.events.forEach((ev, ei) => {
        if (ev.chord !== 'Am') return;
        const key = sec.key || globalKey;
        const posKey = buildFingeringPositionKey(ev.chord, key, sec.id, sq.id, ei);
        const shape = resolveFingeringShape(ev.chord, key, posKey);
        out.push('sec' + sec.id + '/ev' + ei + ': ' + (shape ? shape.join(',') : 'нет'));
      })));
      return out.join('\\n');
    })()
  `);

  console.log('=== ДО правки (три вхождения Am) ===');
  console.log(readAll());

  // Правим аппликатуру ТОЛЬКО у первого Am (секция 1, событие 0).
  // Эмулируем ровно то, что делает кнопка «Сохранить» в редакторе:
  // добавляет пользовательскую форму под ключом chord|key и пинит её
  // для конкретной позиции.
  console.log('\n>>> правим аппликатуру у Am в секции 1 (ставим свою форму x,0,2,2,1,3)');
  w.eval(`
    (function(){
      const custom = ['x',0,2,2,1,3];
      const key = 'C';
      const ck = 'Am|' + key;
      const posKey = buildFingeringPositionKey('Am', key, 1, 2, 0);
      // ровно та последовательность, что выполняется в openFingeringEditor
      // при нажатии «Сохранить» (с новой фиксацией чужих вхождений)
      pinCurrentFingeringsForChord('Am', key, posKey);
      const list = userFingerings.get(ck) || [];
      list.push(custom);
      userFingerings.set(ck, list);
      fingeringCache.delete(ck);
      preferredFingeringByChord.set(posKey, custom.join(','));
    })()
  `);

  console.log('\n=== ПОСЛЕ правки ===');
  const after = readAll();
  console.log(after);

  const lines = after.split('\n');
  const edited = lines[0];
  const others = lines.slice(1);
  const custom = 'x,0,2,2,1,3';
  console.log('\nотредактированное вхождение имеет свою форму:', edited.includes(custom) ? 'ДА (ожидаемо)' : 'НЕТ');
  const leaked = others.filter((l) => l.includes(custom));
  console.log('чужих вхождений «протекло»:', leaked.length, leaked.length ? '<<< БАГ ВОСПРОИЗВЁЛСЯ' : 'нет — всё изолировано');
  if (leaked.length) leaked.forEach((l) => console.log('   ' + l));
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
