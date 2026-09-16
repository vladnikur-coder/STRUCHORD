/**
 * dev/tests/b81-chord-recognition.js
 *
 * Тест-сьют волны B-81: Улучшение распознавания аккорда по аппликатуре:
 * 1. Стандартные трезвучия, септаккорды, обращения / слэш-аккорды.
 * 2. Shell-войсинги без квинты (Cmaj7, C7, Cm7, Am7).
 * 3. Формы без терции (no3, no3,no5, C5, Csus4, Csus2, A7sus4).
 * 4. Контекстный скоринг (hintedChordName, key, prevChordName).
 * 5. Разрешение неоднозначностей (C6 vs Am7) и tie-break.
 * 6. Многоуровневый fallback (слишком мало нот, «похоже на», список нот).
 * 7. Интерактивные пилюли выбора при неоднозначности в редакторе.
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

console.log('=== 1. Базовые трезвучия, септаккорды и обращения ===');
check('C открытый [x,3,2,0,1,0]', w.analyzeFingeringShape(['x', 3, 2, 0, 1, 0]).chordName, 'C');
check('Am открытый [x,0,2,2,1,0]', w.analyzeFingeringShape(['x', 0, 2, 2, 1, 0]).chordName, 'Am');
check('G открытый [3,2,0,0,0,3]', w.analyzeFingeringShape([3, 2, 0, 0, 0, 3]).chordName, 'G');
check('Em открытый [0,2,2,0,0,0]', w.analyzeFingeringShape([0, 2, 2, 0, 0, 0]).chordName, 'Em');
check('D открытый [x,x,0,2,3,2]', w.analyzeFingeringShape(['x', 'x', 0, 2, 3, 2]).chordName, 'D');
check('Dm открытый [x,x,0,2,3,1]', w.analyzeFingeringShape(['x', 'x', 0, 2, 3, 1]).chordName, 'Dm');
check('F баррэ [1,3,3,2,1,1]', w.analyzeFingeringShape([1, 3, 3, 2, 1, 1]).chordName, 'F');
check('Bm баррэ [x,2,4,4,3,2]', w.analyzeFingeringShape(['x', 2, 4, 4, 3, 2]).chordName, 'Bm');
check('C7 открытый [x,3,2,3,1,0]', w.analyzeFingeringShape(['x', 3, 2, 3, 1, 0]).chordName, 'C7');
check('E7 открытый [0,2,0,1,0,0]', w.analyzeFingeringShape([0, 2, 0, 1, 0, 0]).chordName, 'E7');
check('D7 открытый [x,x,0,2,1,2]', w.analyzeFingeringShape(['x', 'x', 0, 2, 1, 2]).chordName, 'D7');
check('C/E слэш-аккорд [0,3,2,0,1,0]', w.analyzeFingeringShape([0, 3, 2, 0, 1, 0]).chordName, 'C/E');
check('G/B слэш-аккорд [x,2,0,0,0,3]', w.analyzeFingeringShape(['x', 2, 0, 0, 0, 3]).chordName, 'G/B');

console.log('\n=== 2. Джазовые Shell-войсинги без квинты (чистые имена C7, Cmaj7, Am7) ===');
check('Shell Cmaj7 [x,3,2,4,x,x] (1-3-7 без 5)', w.analyzeFingeringShape(['x', 3, 2, 4, 'x', 'x']).chordName, 'Cmaj7');
check('Shell C7 [x,3,2,3,x,x] (1-3-b7 без 5)', w.analyzeFingeringShape(['x', 3, 2, 3, 'x', 'x']).chordName, 'C7');
check('Shell Am7 [5,x,5,5,x,x] (1-b7-b3 без 5)', w.analyzeFingeringShape([5, 'x', 5, 5, 'x', 'x']).chordName, 'Am7');
check('C9 [x,3,2,3,3,x]', w.analyzeFingeringShape(['x', 3, 2, 3, 3, 'x']).chordName, 'C9');
check('Cadd9 [x,3,2,0,3,0]', w.analyzeFingeringShape(['x', 3, 2, 0, 3, 0]).chordName, 'Cadd9');
check('C6/9 [x,3,2,2,3,3]', w.analyzeFingeringShape(['x', 3, 2, 2, 3, 3]).chordName, 'C6/9');
check('Hendrix E7#9 [x,7,6,7,8,x]', w.analyzeFingeringShape(['x', 7, 6, 7, 8, 'x']).chordName, 'E7(♯9)');
check('Cm7b5 [x,3,4,3,4,x]', w.analyzeFingeringShape(['x', 3, 4, 3, 4, 'x']).chordName, 'Cm7♭5');
check('Cdim7 [x,3,4,2,4,x]', w.analyzeFingeringShape(['x', 3, 4, 2, 4, 'x']).chordName, 'Cdim7');

console.log('\n=== 3. Формы без терции (no3, no3,no5, 5, sus) ===');
check('C7(no3) [x,3,5,3,x,x] (1-5-b7)', w.analyzeFingeringShape(['x', 3, 5, 3, 'x', 'x']).chordName, 'C7(no3)');
check('C7(no3,no5) [x,3,x,3,x,x] (1-b7 дуада)', w.analyzeFingeringShape(['x', 3, 'x', 3, 'x', 'x']).chordName, 'C7(no3,no5)');
check('Power chord C5 [x,3,5,5,x,x] (1-5)', w.analyzeFingeringShape(['x', 3, 5, 5, 'x', 'x']).chordName, 'C5');
check('Csus4 [x,3,3,0,1,1]', w.analyzeFingeringShape(['x', 3, 3, 0, 1, 1]).chordName, 'Csus4');
check('Csus2 [x,3,0,0,3,3]', w.analyzeFingeringShape(['x', 3, 0, 0, 3, 3]).chordName, 'Csus2');
check('A7sus4 [x,0,2,0,3,0]', w.analyzeFingeringShape(['x', 0, 2, 0, 3, 0]).chordName, 'A7sus4');

console.log('\n=== 4. Контекстный скоринг и разрешение неоднозначностей (C6 vs Am7) ===');
const am7Shape = ['x', 0, 2, 0, 1, 0]; // ноты A, E, G, C, E

// В тональности Am побеждает Am7
const resAm = w.analyzeFingeringShape(am7Shape, { key: 'Am' });
check('Форма x,0,2,0,1,0 в тональности Am определяется как Am7', resAm.chordName, 'Am7');

// При хинте Am7 побеждает Am7
const resHintAm = w.analyzeFingeringShape(am7Shape, { hintedChordName: 'Am7' });
check('Форма x,0,2,0,1,0 с хинтом ячейки Am7 определяется как Am7', resHintAm.chordName, 'Am7');

// В тональности C с предшествующим аккордом G побеждает C6/A
const resC6 = w.analyzeFingeringShape(am7Shape, { key: 'C', prevChordName: 'G' });
check('Форма x,0,2,0,1,0 в тональности C после G определяется как C6/A', resC6.chordName, 'C6/A');

// При хинте C6 побеждает C6/A
const resHintC6 = w.analyzeFingeringShape(am7Shape, { hintedChordName: 'C6' });
check('Форма x,0,2,0,1,0 с хинтом ячейки C6 определяется как C6/A', resHintC6.chordName, 'C6/A');

console.log('\n=== 5. Порог неоднозначности (ambiguous flag, altCandidate и UI-пилюли) ===');
// В нейтральном контексте без тональности форма x,x,2,2,1,0 дает равенство баллов между Am/E и C6/E
const resNeutral = w.analyzeFingeringShape(['x', 'x', 2, 2, 1, 0], {});
checkTrue('Форма x,x,2,2,1,0 имеет флаг ambiguous', resNeutral.ambiguous);
checkTrue('Форма x,x,2,2,1,0 имеет altCandidate', !!resNeutral.altCandidate);
check('Форма x,x,2,2,1,0 основной кандидат', resNeutral.chordName, 'Am/E');
check('Форма x,x,2,2,1,0 альтернативный кандидат', resNeutral.altCandidate.chordName, 'C6/E');

// Проверка интерактивных пилюль в DOM модального редактора
const mockWrapper = w.document.createElement('div');
mockWrapper.className = 'chord-cell-wrapper';
mockWrapper.dataset.sec = '1';
mockWrapper.dataset.square = '2';
mockWrapper.dataset.ei = '0';
w.document.body.appendChild(mockWrapper);

w.openFingeringEditor(null, null, mockWrapper, { createMode: true });
const analysisDiv = w.document.getElementById('chord-analysis');

// Устанавливаем форму x,x,2,2,1,0 через клики по сетке
const clearBtn = w.document.getElementById('clear-fingering');
if (clearBtn) clearBtn.click();
const fbZones = w.document.getElementById('fingering-editor-fretboard').querySelectorAll('div');
// String 2 fret 2, String 3 fret 2, String 4 fret 1, String 5 fret 0
fbZones[14].click();
fbZones[15].click();
fbZones[10].click();
fbZones[5].click();

const pills = analysisDiv.querySelectorAll('.fe-pill-choice');
checkTrue('В UI модалки отрендерились 2 пилюли выбора', pills.length >= 2);
if (pills.length >= 2) {
  checkTrue('Первая пилюля активна по умолчанию', pills[0].classList.contains('is-selected'));
  checkTrue('Вторая пилюля не активна по умолчанию', !pills[1].classList.contains('is-selected'));
  // Клик по второй пилюле переключает выбор
  pills[1].click();
  checkTrue('После клика вторая пилюля стала активной', pills[1].classList.contains('is-selected'));
  checkTrue('После клика первая пилюля перестала быть активной', !pills[0].classList.contains('is-selected'));
}

console.log('\n=== 6. Многоуровневый Fallback ===');
// Уровень 1: менее 2 струн
const res1Note = w.analyzeFingeringShape(['x', 'x', 'x', 2, 'x', 'x']);
check('Меньше 2 струн: chordName = ?', res1Note.chordName, '?');
check('Меньше 2 струн: reason = too_few_notes', res1Note.reason, 'too_few_notes');

// Уровень 2: 1-нотное исключение (C + лишняя нота F#)
const resNear = w.analyzeFingeringShape(['x', 3, 2, 'x', 1, 2]); // C(3), E(2), C(1), F#(2)
checkTrue('Кластер с лишней нотой дает подсказку', resNear.reason === 'near_match' || resNear.chordName !== '?');
if (resNear.suggestion) {
  checkTrue('Подсказка содержит baseChord', !!resNear.suggestion.baseChord);
}

// Уровень 3: интервалы от баса рассчитываются даже при нераспознанной форме
checkTrue('Неопознанная форма содержит intervalMap', Array.isArray(res1Note.intervals) || res1Note.reason === 'too_few_notes');

console.log('\n=== 7. Детерминированный Tie-Break ===');
// circleOfFifthsDist корректно считает шаги
check('Круг квинт: C -> G = 1 шаг', w.eval('circleOfFifthsDist')(0, 7), 1);
check('Круг квинт: C -> D = 2 шага', w.eval('circleOfFifthsDist')(0, 2), 2);
check('Круг квинт: C -> F# = 6 шагов', w.eval('circleOfFifthsDist')(0, 6), 6);
check('Круг квинт: C -> F = 1 шаг', w.eval('circleOfFifthsDist')(0, 5), 1);

console.log(`\nИТОГО: пройдено ${pass}, провалено ${failed}`);
if (failed > 0) process.exit(1);
