// Живой тест «принципа маятника»: кликаем по ячейкам сетки в реальном DOM
// и смотрим, в каком порядке сменяются знаки на сильных и слабых позициях.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
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
  w.eval("addSection('Verse')");
  const secId = w.eval('sections[0].id');
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  const modal = d.querySelector('.strum-modal-content');
  const subBtns = Array.from(modal.querySelectorAll('.pattern-sub-btn'));
  const stepBtns = () => Array.from(modal.querySelectorAll('.pattern-step-btn'));
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const clickSub = (n) => click(subBtns.find((x) => x.dataset.sub === String(n)));

  // Полный цикл одной ячейки: жмём 5 раз и записываем, что показывает кнопка.
  function cycleOf(cellIndex) {
    const seq = [];
    const btn = () => stepBtns()[cellIndex];
    for (let i = 0; i < 5; i++) {
      click(btn());
      seq.push(btn().textContent || '_');
    }
    return seq.join(' → ');
  }

  // Сброс сетки в пустое состояние перед каждым замером.
  function clearGrid() {
    stepBtns().forEach((b) => {
      for (let i = 0; i < 5 && (b.textContent || '') !== ''; i++) click(b);
    });
  }

  console.log('=== subdivision 4: доля состоит из 4 ячеек ===');
  clickSub(4);
  clearGrid();
  console.log('  ячейка 1 (сильная доля):', cycleOf(0));
  clearGrid();
  console.log('  ячейка 2 (слабая, «и»): ', cycleOf(1));
  clearGrid();
  console.log('  ячейка 3 (сильная)    : ', cycleOf(2));
  clearGrid();
  console.log('  ячейка 4 (слабая)     : ', cycleOf(3));

  console.log('\n=== subdivision 2: доля = 2 ячейки ===');
  clickSub(2);
  clearGrid();
  console.log('  доля 1.1 (сильная):', cycleOf(0));
  clearGrid();
  console.log('  доля 1.2 (слабая) :', cycleOf(1));
  clearGrid();
  console.log('  доля 2.1 (сильная):', cycleOf(2));

  console.log('\n=== subdivision 1: каждая ячейка — целая доля ===');
  console.log('    (ожидаем чередование по сквозному номеру: ↓ ↑ ↓ ↑)');
  clickSub(1);
  clearGrid();
  for (let i = 0; i < 4; i++) {
    clearGrid();
    console.log(`  доля ${i + 1}:`, cycleOf(i));
  }

  console.log('\n=== Полнота набора: в любой ячейке доступны все 4 состояния ===');
  clickSub(2);
  clearGrid();
  const strong = new Set(cycleOf(0).split(' → '));
  clearGrid();
  const weak = new Set(cycleOf(1).split(' → '));
  const need = ['↓', '↑', '×', '_'];
  console.log('  сильная:', [...strong].join(''), need.every((x) => strong.has(x)) ? 'все 4 OK' : 'НЕПОЛНО');
  console.log('  слабая :', [...weak].join(''), need.every((x) => weak.has(x)) ? 'все 4 OK' : 'НЕПОЛНО');

  console.log('\n=== Перебор не затронут: клик открывает поповер струн ===');
  click(modal.querySelector('.pattern-mode-tab[data-mode="pick"]'));
  clickSub(2);
  click(stepBtns()[1]); // слабая позиция — раньше тут был бы U
  const pop = d.querySelector('.pattern-pick-popover');
  console.log('  поповер открылся:', !!pop, '| кнопок:', pop ? pop.children.length : 0);
  console.log('  текст ячейки после клика:', JSON.stringify(stepBtns()[1].textContent), '(должен быть пустым — знак не подставился)');
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
