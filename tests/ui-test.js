// Живой UI-тест: поднимаем страницу в jsdom, открываем редактор боя и
// кликаем кнопки "нот на долю" ровно так, как это делает пользователь.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    // jsdom без пакета canvas не умеет getContext — подсовываем пустышку,
    // иначе падает отрисовка круга аккордов и до редактора дело не доходит.
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

// Заглушки для того, что jsdom не умеет (звук) — на логику сетки не влияют.
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, createGain: () => ({ connect(){}, gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}} }) };
};

const show = (steps) =>
  steps.map((s) => (Array.isArray(s) ? '[' + s.join('') + ']' : s || '_')).join('');

function run() {
  const d = w.document;
  // Готовим песню: одна секция, такт 4/4.
  // `sections` объявлена через let — её нет в window, читаем через eval
  // в контексте страницы.
  const evalIn = (code) => w.eval(code);
  evalIn("addSection('Verse')");
  const secId = evalIn('sections[0].id');
  console.log('секция создана, id =', secId);
  evalIn(`openStrumPatternEditor('section', ${secId})`);
  const modal = d.querySelector('.strum-modal-content');
  if (!modal) throw new Error('модалка не открылась');

  const subBtns = Array.from(modal.querySelectorAll('.pattern-sub-btn'));
  const stepBtns = () => Array.from(modal.querySelectorAll('.pattern-step-btn'));
  const clickSub = (n) => {
    const b = subBtns.find((x) => x.dataset.sub === String(n));
    b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  };

  // 1) Ставим sub=1 и рисуем DDDD руками, кликая по ячейкам сетки.
  clickSub(1);
  const cells = stepBtns();
  console.log('ячеек при sub=1:', cells.length);
  // Цикл ячейки: D -> U -> X -> пусто. Кликаем, пока не встанет именно D.
  const setToD = (c) => {
    for (let i = 0; i < 5 && (c.textContent || '') !== '↓'; i++) {
      c.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    }
  };
  cells.forEach(setToD);
  const readPattern = () => {
    // паттерн живёт в замыкании; читаем то, что реально нарисовано в DOM
    return stepBtns().map((b) => b.textContent || '_').join('');
  };
  console.log('sub 1:', readPattern());

  // 2) Переключаем дробность и смотрим, адаптировался ли рисунок.
  clickSub(2);
  console.log('sub 2:', readPattern());
  clickSub(4);
  console.log('sub 4:', readPattern());

  // 3) Обратно
  clickSub(2);
  console.log('назад sub 2:', readPattern());
  clickSub(1);
  console.log('назад sub 1:', readPattern());

  const ok2 = '↓_↓_↓_↓_';
  const ok4 = '↓___↓___↓___↓___';
  clickSub(1);
  stepBtns().forEach(setToD);
  clickSub(2);
  const got2 = readPattern();
  clickSub(4);
  const got4 = readPattern();
  console.log('\nОЖИДАЛОСЬ sub2:', ok2, '| ПОЛУЧЕНО:', got2, got2 === ok2 ? 'OK' : 'FAIL');
  console.log('ОЖИДАЛОСЬ sub4:', ok4, '| ПОЛУЧЕНО:', got4, got4 === ok4 ? 'OK' : 'FAIL');

  // ---- Перебор: адаптируется ли он так же ----
  console.log('\n--- ПЕРЕБОР ---');
  const pickTab = modal.querySelector('.pattern-mode-tab[data-mode="pick"]');
  pickTab.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  clickSub(1);
  // Ставим Б на первую долю через поповер выбора струн.
  stepBtns()[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const pop = w.document.querySelector('.pattern-pick-popover');
  console.log('поповер открылся, кнопок:', pop ? pop.children.length : 0, '(ожидаем 8: Б, Б2, 6..1)');
  const bTok = Array.from(pop.children).find((b) => b.textContent === 'Б');
  bTok.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  console.log('перебор sub 1:', readPattern());
  clickSub(2);
  console.log('перебор sub 2:', readPattern());
  clickSub(4);
  console.log('перебор sub 4:', readPattern());

  // ---- Сохранение: доходит ли адаптированный рисунок до модели ----
  console.log('\n--- СОХРАНЕНИЕ ---');
  const modeStrum = modal.querySelector('.pattern-mode-tab[data-mode="strum"]');
  modeStrum.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  clickSub(1);
  stepBtns().forEach(setToD);
  clickSub(2);
  modal.querySelector('#save-pattern').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const saved = w.eval('JSON.stringify(sections[0].strumPattern)');
  console.log('в модели:', saved);
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message); process.exitCode = 1; }
});
