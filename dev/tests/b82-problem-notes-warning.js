/**
 * dev/tests/b82-problem-notes-warning.js
 *
 * Тест-сьют волны B-82: Диагностика проблемных нот на грифе и индикатор предупреждения:
 * 1. analyzeFingeringShape возвращает problemStrings и problemNotes для 1-нотных исключений (near_match).
 * 2. analyzeFingeringShape возвращает problemStrings для нераспознанной гармонии.
 * 3. createInteractiveFretboard отрисовывает fe-problem-ring и fe-problem-dot при setProblemStrings.
 * 4. openFingeringEditor показывает и скрывает fe-warning-badge у кнопки «Сохранить».
 * 5. Динамическое переключение подсветки при исправлении формы в редакторе.
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

console.log('=== 1. analyzeFingeringShape: problemStrings при 1 лишней ноте (near_match) ===');
// Форма: C мажор [x, 3, 2, 0, 1, 2] -> C(3), E(2), G(0), C(1) + F#(2 на 1-й струне/индекс 5)
const resNear = w.analyzeFingeringShape(['x', 3, 2, 0, 1, 2]);
check('Кластер опознан как near_match', resNear.reason, 'near_match');
checkTrue('Подсказка содержит baseChord', !!resNear.suggestion && !!resNear.suggestion.baseChord);
checkTrue('problemStrings содержит индекс 5 (струна с лишней нотой)', Array.isArray(resNear.problemStrings) && resNear.problemStrings.includes(5));
checkTrue('problemNotes содержит имя лишней ноты F#', Array.isArray(resNear.problemNotes) && resNear.problemNotes.includes('F#'));

console.log('\n=== 2. analyzeFingeringShape: problemStrings при нераспознанной гармонии ===');
// Форма: диссонирующий кластер [3, 4, 5, 6, x, x]
const resCluster = w.analyzeFingeringShape([3, 4, 5, 6, 'x', 'x']);
check('Диссонирующий кластер: reason = unrecognized_harmony', resCluster.reason, 'unrecognized_harmony');
checkTrue('problemStrings содержит все зажатые струны кластера', Array.isArray(resCluster.problemStrings) && resCluster.problemStrings.length === 4);

console.log('\n=== 3. createInteractiveFretboard: подсветка fe-problem-ring и fe-problem-dot ===');
const fb = w.createInteractiveFretboard(['x', 3, 2, 0, 1, 2], () => {});
// До подсветки
checkTrue('Без problemStrings на грифе нет fe-problem-ring', !fb.container.innerHTML.includes('fe-problem-ring'));

// Включаем подсветку проблемной струны 5
fb.setProblemStrings([5]);
const htmlWithRing = fb.container.innerHTML;
checkTrue('После setProblemStrings([5]) на грифе появился fe-problem-ring', htmlWithRing.includes('fe-problem-ring'));
checkTrue('После setProblemStrings([5]) на грифе появился fe-problem-dot', htmlWithRing.includes('fe-problem-dot'));
checkTrue('fe-problem-ring окрашен в var(--color-danger)', htmlWithRing.includes('stroke="var(--color-danger)"'));

// Сбрасываем подсветку
fb.setProblemStrings([]);
checkTrue('После сброса fe-problem-ring исчезает', !fb.container.innerHTML.includes('fe-problem-ring'));

console.log('\n=== 4. openFingeringEditor: fe-warning-badge у кнопки «Сохранить» ===');
w.eval(`
  sections = [{
    id: 1, type: "Verse", squares: [{
      id: 2, repeat: 1, events: [{ chord: "Am", span: 4 }]
    }]
  }];
  globalKey = "Am";
  keyMode = "manual";
`);

const mockWrapper = w.document.createElement('div');
mockWrapper.className = 'chord-cell-wrapper';
mockWrapper.dataset.sec = '1';
mockWrapper.dataset.square = '2';
mockWrapper.dataset.ei = '0';
const mockInput = w.document.createElement('input');
mockInput.className = 'chord-input';
mockInput.value = 'Am';
mockWrapper.appendChild(mockInput);
w.document.body.appendChild(mockWrapper);

w.openFingeringEditor('Am', 0, mockWrapper);

const warningBadge = w.document.getElementById('fe-warning-badge');
checkTrue('Значок предупреждения присутствует в DOM', !!warningBadge);
check('Для валидного аккорда Am значок скрыт (display: none)', warningBadge.style.display, 'none');

// Стираем ноты -> форма становится неполной / '?'
const clearBtn = w.document.getElementById('clear-fingering');
if (clearBtn) clearBtn.click();
check('Для неопознанной формы значок отображается (inline-flex)', warningBadge.style.display, 'inline-flex');

// Ставим форму с 1 лишней нотой: C triad + F# на 1-й струне
// zones:
// string 1 fret 3 -> zone 20 (fret 3, string 2)
// string 2 fret 2 -> zone 15 (fret 2, string 3)
// string 3 fret 0 -> zone 4 (fret 0, string 4)
// string 4 fret 1 -> zone 11 (fret 1, string 5)
// string 5 fret 2 -> zone 18 (fret 2, string 6)
const zones = w.document.getElementById('fingering-editor-fretboard').querySelectorAll('div');
zones[20].click();
zones[15].click();
zones[4].click();
zones[11].click();
zones[18].click();

check('При лишней ноте значок предупреждения виден', warningBadge.style.display, 'inline-flex');
const boardHtml = w.document.getElementById('fingering-editor-fretboard').innerHTML;
checkTrue('При лишней ноте на грифе отображается fe-problem-ring', boardHtml.includes('fe-problem-ring'));

// Убираем лишнюю ноту (клик по string 5 fret 2 -> zone 18)
zones[18].click();
// Открытая 1-я струна -> zone 6
zones[6].click();

check('После исправления аккорда значок скрывается', warningBadge.style.display, 'none');
const cleanBoardHtml = w.document.getElementById('fingering-editor-fretboard').innerHTML;
checkTrue('После исправления аккорда fe-problem-ring исчезает', !cleanBoardHtml.includes('fe-problem-ring'));

console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
if (failed > 0) process.exit(1);

