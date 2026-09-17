/**
 * dev/tests/b83-custom-chord-name-prompt.js
 *
 * Тест-сьют волны B-83: Диалог ручного ввода названия для нераспознанных аккордов:
 * 1. В createMode при нераспознанной форме клик «Добавить аккорд» открывает диалог fe-prompt-overlay.
 * 2. Инпут диалога предзаполняется подсказанным базовым именем (если есть near_match).
 * 3. Кнопка подсказки в диалоге и в статусе доступна для клика.
 * 4. Пустой ввод блокируется классом is-invalid.
 * 5. Успешный ввод сохраняет аккорд и форму в ячейку и библиотеку userFingerings.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.resolve(__dirname, '../../STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (fn) => setTimeout(fn, 16);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText: () => ({ width: 10 }),
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillText() {},
      strokeText() {},
      setTransform() {},
      scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});

const w = dom.window;
let pass = 0;
let failed = 0;

function check(name, actual, expected) {
  const actStr = JSON.stringify(actual);
  const expStr = JSON.stringify(expected);
  if (actStr === expStr) {
    console.log(`   ok   ${name}`);
    pass++;
  } else {
    console.error(` FAIL   ${name}\n        получено: ${actStr}\n        ожидалось: ${expStr}`);
    failed++;
  }
}

function checkTrue(name, val) {
  if (val) {
    console.log(`   ok   ${name}`);
    pass++;
  } else {
    console.error(` FAIL   ${name} (ожидалось truthy, получено ${val})`);
    failed++;
  }
}

console.log('=== 1. Инициализация сцены и создание ячейки для createMode ===');
w.eval(`
  sections = [{
    id: 1, type: "Verse", key: "C", squares: [{
      id: 2, repeat: 1, events: [{ chord: "", span: 4 }]
    }]
  }];
  globalKey = "C";
  keyMode = "manual";
`);

const mockWrapper = w.document.createElement('div');
mockWrapper.className = 'chord-cell-wrapper chord-wrapper';
mockWrapper.dataset.sec = '1';
mockWrapper.dataset.square = '2';
mockWrapper.dataset.ei = '0';
const mockInput = w.document.createElement('input');
mockInput.className = 'chord-input';
mockInput.dataset.sec = '1';
mockInput.dataset.square = '2';
mockInput.dataset.ei = '0';
mockInput.value = '';
mockWrapper.appendChild(mockInput);
w.document.body.appendChild(mockWrapper);
w.activeChordInput = mockInput;

// Открываем редактор с нуля
w.openFingeringEditor(null, null, mockWrapper, { createMode: true });

// Набираем спорную форму [x, x, 4, 2, 3, 1]
// Очищаем
const clearBtn = w.document.getElementById('clear-fingering');
if (clearBtn) clearBtn.click();

const fbZones = w.document.getElementById('fingering-editor-fretboard').querySelectorAll('div');
// String 2 fret 4 -> zone 27 (fret 4, string 3)
// String 3 fret 2 -> zone 16 (fret 2, string 4)
// String 4 fret 3 -> zone 23 (fret 3, string 5)
// String 5 fret 1 -> zone 12 (fret 1, string 6)
fbZones[27].click();
fbZones[16].click();
fbZones[23].click();
fbZones[12].click();

const analysisDiv = w.document.getElementById('chord-analysis');
checkTrue('Статус содержит подсказку "Похоже на Dm"', analysisDiv.innerHTML.includes('fe-suggestion-btn') && analysisDiv.innerHTML.includes('Dm'));

console.log('\n=== 2. Клик «Добавить аккорд» при неопознанной форме открывает диалог ввода имени ===');
const addBtn = w.document.getElementById('save-fingering');
addBtn.click();

const promptOverlay = w.document.getElementById('fe-prompt-overlay');
checkTrue('Диалог ввода имени #fe-prompt-overlay появился в DOM', !!promptOverlay);

const nameInput = w.document.getElementById('fe-custom-name-input');
checkTrue('Инпут названия присутствует', !!nameInput);
check('Инпут предзаполнен подсказанным базовым именем Dm', nameInput.value, 'Dm');

console.log('\n=== 3. Проверка валидации пустого ввода ===');
nameInput.value = '   ';
const promptSaveBtn = w.document.getElementById('fe-prompt-save');
promptSaveBtn.click();

checkTrue('Пустой ввод получает класс is-invalid', nameInput.classList.contains('is-invalid'));
checkTrue('Диалог не закрылся при ошибке', !!w.document.getElementById('fe-prompt-overlay'));

console.log('\n=== 4. Успешный ввод кастомного имени (D/F#) и сохранение ===');
nameInput.value = 'D/F#';
promptSaveBtn.click();

checkTrue('После сохранения диалог ввода закрылся', !w.document.getElementById('fe-prompt-overlay'));
checkTrue('Модалка редактора аппликатур закрылась', !w.document.querySelector('.fe-modal'));

const savedChord = w.eval('sections[0].squares[0].events[0].chord');
const savedFingering = w.eval('sections[0].squares[0].events[0].fingering');

check('Ячейка песни получила введенное имя D/F#', savedChord, 'D/F#');
check('Инпут ячейки отображает D/F#', mockInput.value, 'D/F#');
check('Форма ячейки сохранена x,x,4,2,3,1', savedFingering, 'x,x,4,2,3,1');

const userList = w.eval('userFingerings.get("D/F#|C")') || [];
checkTrue('Форма сохранена в библиотеку userFingerings для D/F#', userList.some((e) => e.shape.join(',') === 'x,x,4,2,3,1'));

console.log('\n=== 5. Клик по интерактивной кнопке подсказки в createMode ===');
w.openFingeringEditor(null, null, mockWrapper, { createMode: true });
const clearBtn2 = w.document.getElementById('clear-fingering');
if (clearBtn2) clearBtn2.click();

const fbZones2 = w.document.getElementById('fingering-editor-fretboard').querySelectorAll('div');
fbZones2[27].click();
fbZones2[16].click();
fbZones2[23].click();
fbZones2[12].click();

const sugBtn = w.document.querySelector('.fe-suggestion-btn');
checkTrue('Кнопка подсказки Dm найдена', !!sugBtn);
if (sugBtn) {
  sugBtn.click();
  const prompt2 = w.document.getElementById('fe-prompt-overlay');
  checkTrue('Клик по подсказке открыл диалог ввода имени', !!prompt2);
  const input2 = w.document.getElementById('fe-custom-name-input');
  check('Инпут содержит подсказанное имя Dm', input2 ? input2.value : null, 'Dm');
  const cancelBtn = w.document.getElementById('fe-prompt-cancel');
  if (cancelBtn) cancelBtn.click();
  checkTrue('После отмены диалог закрыт', !w.document.getElementById('fe-prompt-overlay'));
}

console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
if (failed > 0) process.exit(1);
