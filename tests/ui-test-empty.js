// Проверяем: редактор открывается с ПУСТОЙ сеткой, но уже заданные
// ритмы (свои и унаследованные) по-прежнему подхватываются.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
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
  const d = w.document;
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const grid = () => Array.from(d.querySelectorAll('.pattern-step-btn')).map((b) => b.textContent || '_').join('');
  const closeEditor = () => {
    const c = d.querySelector('#cancel-pattern');
    if (c) click(c);
  };

  w.eval("addSection('Verse')");
  const secId = w.eval('sections[0].id');

  // 1) Новая секция — сетка должна быть пустой
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  console.log('1. Новая секция, бой   :', grid(), grid().replace(/_/g, '') === '' ? 'ПУСТО OK' : 'НЕ ПУСТО');

  // 2) Переключение на перебор — тоже пусто
  click(d.querySelector('.pattern-mode-tab[data-mode="pick"]'));
  console.log('2. Новая секция, перебор:', grid(), grid().replace(/_/g, '') === '' ? 'ПУСТО OK' : 'НЕ ПУСТО');
  click(d.querySelector('.pattern-mode-tab[data-mode="strum"]'));

  // 3) Пустой паттерн нельзя сохранить — должна быть защита
  click(d.querySelector('#save-pattern'));
  const savedEmpty = w.eval('JSON.stringify(sections[0].strumPattern)');
  console.log('3. Попытка сохранить пустое ->', savedEmpty, savedEmpty === 'null' || savedEmpty === undefined ? '(не сохранилось, OK)' : '(СОХРАНИЛОСЬ?)');

  // 4) Ставим ритм из пресета и сохраняем
  const chips = Array.from(d.querySelectorAll('#patternPresetChips .pattern-preset-chip'));
  const six = chips.find((c) => c.dataset.presetId === 'six');
  click(six);
  console.log('4. После клика по «Шестёрка»:', grid());
  click(d.querySelector('#save-pattern'));
  console.log('   сохранено:', w.eval('JSON.stringify(sections[0].strumPattern.steps)'));

  // 5) Повторное открытие — должен подхватиться сохранённый ритм, а не пустота
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  console.log('5. Повторное открытие  :', grid(), grid().replace(/_/g, '') !== '' ? 'РИТМ НА МЕСТЕ OK' : 'ПУСТО — ОШИБКА');
  closeEditor();

  // 6) Ячейка внутри этой секции — наследует бой секции, а не пустоту
  const sqId = w.eval('sections[0].squares[0].id');
  w.eval(`openStrumPatternEditor('event', ${secId}, ${sqId}, 0)`);
  console.log('6. Ячейка (наследует)  :', grid(), grid().replace(/_/g, '') !== '' ? 'УНАСЛЕДОВАЛ OK' : 'ПУСТО — ОШИБКА');
  closeEditor();

  // 7) Секция без ритма — ячейка открывается пустой
  w.eval("addSection('Chorus')");
  const sec2 = w.eval('sections[1].id');
  const sq2 = w.eval('sections[1].squares[0].id');
  w.eval(`openStrumPatternEditor('event', ${sec2}, ${sq2}, 0)`);
  console.log('7. Ячейка без наследства:', grid(), grid().replace(/_/g, '') === '' ? 'ПУСТО OK' : 'НЕ ПУСТО');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
