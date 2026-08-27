// Реальная проверка XSS: подсовываем во все пользовательские поля
// импортируемой песни payload и смотрим, выполнится ли он.
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
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };

// Маркер срабатывания XSS
w.__XSS_FIRED = [];
w.eval('window.xssMark = (where) => window.__XSS_FIRED.push(where);');

const PAYLOADS = {
  img: '<img src=x onerror="xssMark(\'img\')">',
  script: '<script>xssMark("script")<\/script>',
  attr: '" onmouseover="xssMark(\'attr\')" x="',
  svg: '<svg onload="xssMark(\'svg\')">',
};

function run() {
  const d = w.document;

  const song = {
    schemaVersion: 2,
    name: PAYLOADS.img,                         // имя песни
    bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
    notes: PAYLOADS.script,                     // заметки
    sections: [{
      id: 1, type: 'Custom',
      customName: PAYLOADS.svg,                 // имя секции
      key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: PAYLOADS.attr, span: 2, timeSig: null, strumPattern: null },  // аккорд
        { chord: PAYLOADS.img, span: 2, timeSig: null, strumPattern: null },
      ]}],
    }],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };

  console.log('=== Импортируем песню с XSS-payload во всех полях ===');
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  w.eval('render()');

  // Открываем список песен — там имя песни попадает в innerHTML
  try { w.openLoadSongDialog(); } catch (e) { console.log('   (диалог списка:', e.message + ')'); }

  console.log('\n=== Результат ===');
  const fired = w.eval('JSON.stringify(window.__XSS_FIRED)');
  console.log('   сработавших payload:', fired);

  // Проверяем, что payload попал в DOM как ТЕКСТ, а не как разметка
  const injected = d.querySelectorAll('img[src="x"], svg, script');
  console.log('   узлов <img>/<svg>/<script> всего:', injected.length);
  // Отделяем ЛЕГИТИМНЫЕ узлы приложения (аппликатуры рисуются в svg)
  // от реально внедрённых payload.
  const hostile = Array.from(injected).filter((n) =>
    n.hasAttribute('onerror') || n.hasAttribute('onload') ||
    (n.tagName === 'SCRIPT' && /xssMark/.test(n.textContent || '')));
  console.log('   из них ВРАЖДЕБНЫХ (onerror/onload/xssMark):', hostile.length);
  Array.from(injected).slice(0, 5).forEach((n) =>
    console.log('      -', n.tagName.toLowerCase(),
      'class=' + JSON.stringify((n.getAttribute('class') || '').slice(0, 30))));

  const label = d.querySelector('.section-label');
  console.log('\n   имя секции отрисовано как текст:',
    JSON.stringify(label ? label.textContent.slice(0, 40) : null));
  console.log('   innerHTML секции содержит &lt; :',
    label ? label.innerHTML.includes('&lt;') : null);

  const input = d.querySelector('.chord-input');
  console.log('   аккорд в value:', JSON.stringify(input ? input.value.slice(0, 30) : null));
  console.log('   атрибут onmouseover не появился:', input ? !input.hasAttribute('onmouseover') : null);

  const verdict = w.eval('window.__XSS_FIRED.length') === 0 && hostile.length === 0;
  console.log('\n   ВЕРДИКТ:', verdict ? 'XSS НЕ ПРОШЁЛ — экранирование работает' : 'УЯЗВИМОСТЬ ПОДТВЕРЖДЕНА');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack.split('\n').slice(0,3).join('\n')); }
});
