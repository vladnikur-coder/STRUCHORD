// Проверяем исправления вооружения кнопок ячейки.
// jsdom не считает вёрстку, поэтому тестируем НЕ пиксели, а инварианты
// механики: инвалидацию кэша, отсутствие «мёртвых» узлов и то, что
// невидимые кнопки соседа больше не перехватывают наведение.
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
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };

function run() {
  const d = w.document;
  const song = {
    schemaVersion: 2, name: 'T', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [{
      id: 1, type: 'Verse', customName: null, key: null, shift: null,
      timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'Am', span: 1, timeSig: null, strumPattern: null },
        { chord: 'F',  span: 1, timeSig: null, strumPattern: null },
        { chord: 'C',  span: 1, timeSig: null, strumPattern: null },
        { chord: 'G',  span: 1, timeSig: null, strumPattern: null },
      ]}],
    }],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  w.eval('render()');

  const move = (x, y) => d.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));

  console.log('=== 1. Появились ли новые механизмы ===');
  console.log('   invalidateChordWrapperRects:', w.eval('typeof invalidateChordWrapperRects'));
  console.log('   ensureChordWrapperRects   :', w.eval('typeof ensureChordWrapperRects'));
  console.log('   ResizeObserver подключён  :', w.eval('typeof ResizeObserver !== "undefined"'));

  console.log('\n=== 2. Кэш помечается устаревшим при resize/scroll ===');
  w.eval('refreshChordWrapperRects()');
  console.log('   после refresh, dirty =', w.eval('chordWrapperRectsDirty'));
  w.dispatchEvent(new w.Event('resize'));
  console.log('   после resize,  dirty =', w.eval('chordWrapperRectsDirty'), '(ожидаем true)');
  w.eval('refreshChordWrapperRects()');
  d.dispatchEvent(new w.Event('scroll', { bubbles: true }));
  console.log('   после scroll,  dirty =', w.eval('chordWrapperRectsDirty'), '(ожидаем true)');

  console.log('\n=== 3. mousemove пересчитывает устаревший кэш ===');
  w.eval('chordWrapperRectsDirty = true; chordWrapperRectCache = [];');
  move(10, 10);
  console.log('   элементов в кэше после движения:', w.eval('chordWrapperRectCache.length'), '(ожидаем 4)');
  console.log('   dirty сброшен:', w.eval('chordWrapperRectsDirty === false'));

  console.log('\n=== 4. Вооружение снимается с удалённого узла ===');
  const res = w.eval(`
    (function(){
      const first = document.querySelector('.chord-wrapper');
      setArmedChordWrapper(first);
      const wasArmed = !!armedChordWrapper;
      // перерисовка заменяет узлы на новые
      render();
      const stillOld = armedChordWrapper && !armedChordWrapper.isConnected;
      return JSON.stringify({ wasArmed, orphanAfterRender: !!stillOld });
    })()
  `);
  console.log('  ', res);
  move(10, 10);
  const afterMove = w.eval('JSON.stringify({ armedIsConnected: armedChordWrapper ? armedChordWrapper.isConnected : null })');
  console.log('   после движения мыши:', afterMove, '(мёртвый узел не должен остаться вооружённым)');

  console.log('\n=== 5. Класс не остаётся висеть на старых узлах ===');
  const leftovers = w.eval("document.querySelectorAll('.chord-wrapper.is-buttons-armed').length");
  console.log('   узлов с классом is-buttons-armed:', leftovers, '(не больше 1)');

  console.log('\n=== 6. Кнопки невооружённой ячейки не перехватывают наведение ===');
  console.log('   проверка в коде: учитываются только кнопки ячейки с классом');
  console.log('   is-buttons-armed и с ненулевым прямоугольником —',
    w.eval(`(function(){
      const src = document.documentElement.innerHTML;
      return src.includes("armedChordWrapper.classList.contains('is-buttons-armed')") &&
             src.includes('btnRect.width > 0');
    })()`) ? 'ДА OK' : 'НЕТ');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
