// dev/tests/b77-fingering-editor-button-styles.js
// Тест для волны B-77: Гармонизация кнопок редактора аппликатур,
// проверка соответствия дизайн-системе, CSS-переменным и семантике.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0;
let failed = 0;

function ok(cond, msg) {
  if (cond) {
    console.log(`   ok   ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL  ${msg}`);
    failed++;
  }
}

function eq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) {
    console.log(`   ok   ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL  ${msg}\n        ожидалось ${sb}\n        получено  ${sa}`);
    failed++;
  }
}

console.log('\n=== 1. Проверка разметки кнопок в модалке редактора аппликатур ===');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(htmlSource, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (fn) => setTimeout(fn, 16);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.scrollTo = () => {};
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
      strokeText() {}
    });
  }
});

const w = dom.window;

// Проверяем вызов openFingeringEditor и наличие всех кнопок
const dummyWrapper = w.document.createElement('div');
w.document.body.appendChild(dummyWrapper);
w.openFingeringEditor('Am', 0, dummyWrapper);

const modal = w.document.querySelector('.fe-modal');
ok(!!modal, 'Модалка редактора аппликатур открылась (.fe-modal)');

const cancelBtn = w.document.getElementById('cancel-fingering');
ok(!!cancelBtn, 'Кнопка «Отмена» найдена');
ok(cancelBtn.classList.contains('fe-btn') && cancelBtn.classList.contains('fe-btn--ghost'), 'Кнопка «Отмена» имеет класс .fe-btn--ghost');
eq(cancelBtn.textContent.trim(), 'Отмена', 'Кнопка «Отмена» имеет правильную подпись');

const clearBtn = w.document.getElementById('clear-fingering');
ok(!!clearBtn, 'Кнопка «Очистить» найдена');
ok(clearBtn.classList.contains('fe-btn') && clearBtn.classList.contains('fe-btn--danger'), 'Кнопка очистки имеет класс .fe-btn--danger');
eq(clearBtn.textContent.trim(), 'Очистить', 'Кнопка очистки имеет подпись «Очистить»');

const saveBtn = w.document.getElementById('save-fingering');
ok(!!saveBtn, 'Кнопка «Сохранить» найдена');
ok(saveBtn.classList.contains('fe-btn') && saveBtn.classList.contains('fe-btn--primary'), 'Кнопка сохранения имеет класс .fe-btn--primary');

const saveAllBtn = w.document.getElementById('save-fingering-all');
ok(!!saveAllBtn, 'Кнопка «Сохранить для всех» найдена');
ok(saveAllBtn.classList.contains('save-for-all-btn'), 'Кнопка «Сохранить для всех» имеет класс .save-for-all-btn');

console.log('\n=== 2. Проверка CSS-правил на отсутствие захардкоженных цветов ===');

const cssMatch = htmlSource.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
const allCss = cssMatch.join('\n');

// Проверяем стили .fe-btn, .fe-btn--danger, .fe-btn--ghost, .fe-btn--primary
const feBtnDangerMatch = allCss.match(/\.fe-btn--danger\s*\{([^}]+)\}/);
ok(!!feBtnDangerMatch, 'CSS содержит правило .fe-btn--danger');
if (feBtnDangerMatch) {
  const body = feBtnDangerMatch[1];
  ok(body.includes('var(--color-danger-bg)'), '.fe-btn--danger использует var(--color-danger-bg)');
  ok(body.includes('var(--color-danger-border)'), '.fe-btn--danger использует var(--color-danger-border)');
  ok(body.includes('var(--color-danger)'), '.fe-btn--danger использует var(--color-danger)');
  ok(!/#486d48/i.test(body), '.fe-btn--danger не содержит старого зеленого #486d48');
}

const feBtnPrimaryMatch = allCss.match(/\.fe-btn--primary\s*\{([^}]+)\}/);
ok(!!feBtnPrimaryMatch, 'CSS содержит правило .fe-btn--primary');
if (feBtnPrimaryMatch) {
  const body = feBtnPrimaryMatch[1];
  ok(body.includes('var(--color-ink)'), '.fe-btn--primary использует var(--color-ink)');
  ok(body.includes('var(--color-surface)'), '.fe-btn--primary использует var(--color-surface)');
}

const feBtnGhostMatch = allCss.match(/\.fe-btn--ghost\s*\{([^}]+)\}/);
ok(!!feBtnGhostMatch, 'CSS содержит правило .fe-btn--ghost');
if (feBtnGhostMatch) {
  const body = feBtnGhostMatch[1];
  ok(body.includes('var(--color-border-medium)'), '.fe-btn--ghost использует var(--color-border-medium)');
  ok(body.includes('var(--color-text-secondary)'), '.fe-btn--ghost использует var(--color-text-secondary)');
}

console.log(`\nИТОГО: пройдено ${passed}, провалено ${failed}`);
if (failed > 0) process.exit(1);
