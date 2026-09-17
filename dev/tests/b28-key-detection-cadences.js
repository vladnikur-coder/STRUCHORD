#!/usr/bin/env node
/*
 * b28-key-detection-cadences.js — тесты автоопределения тональности
 * с учётом гармонических каденций и цепочек переходов (волна B-28).
 *
 * Проверяем:
 *  1. Граничные случаи (пустая песня -> null, одиночный аккорд -> fallback, sus/power);
 *  2. Корректность разбора аккордов (парсинг корней, басов, септаккордов);
 *  3. Классические каденции в мажоре (ii-V-I, IV-V-I, V7-I, IV-I);
 *  4. Минорные каденции (ii°-V-i, iv-V-i, эолийский каданс VI-bVII-i);
 *  5. Разрешение спора параллельного мажора и минора (Am vs C на поп-прогрессиях);
 *  6. Модальные прогрессии (дорийский лад, миксолидийский лад);
 *  7. Блюзовые квадраты на доминантсептаккордах;
 *  8. Реальные песни из папки uploads/ (100% совпадение с сохранённой тональностью).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
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
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' (' + details + ')' : ''));
  }
}

function testChords(chordList) {
  const json = JSON.stringify([{
    id: 1,
    timeSig: '4/4',
    squares: [{
      id: 1,
      events: chordList.map(c => ({ chord: c, span: 4 }))
    }]
  }]);
  return w.eval(`sections = ${json}; globalTimeSig = '4/4'; detectKeyFromChords();`);
}

// 1. Граничные случаи
check('пустая песня возвращает null', w.eval('sections = []; detectKeyFromChords()') === null);

check('песня без именованных аккордов возвращает null',
  w.eval('sections = [{ squares: [{ events: [{ chord: "", span: 4 }, { chord: "  ", span: 4 }] }] }]; detectKeyFromChords()') === null);

check('одиночный аккорд Am -> Am', testChords(['Am']) === 'Am');
check('одиночный аккорд G -> G', testChords(['G']) === 'G');
check('одиночный аккорд F#m -> F#m', testChords(['F#m']) === 'F#m');
check('одиночный аккорд D# -> Eb/D#', ['Eb', 'D#'].includes(testChords(['D#'])));

// 2. Парсинг аккордов
const p1 = w.eval('parseChordForKeyDetection("Am7")');
check('Am7 парсится как A min', p1 && p1.root === 'A' && p1.quality === 'min' && !p1.isDominant7);

const p2 = w.eval('parseChordForKeyDetection("G7")');
check('G7 парсится как G maj dom7', p2 && p2.root === 'G' && p2.quality === 'maj' && p2.isDominant7);

const p3 = w.eval('parseChordForKeyDetection("C/E")');
check('C/E парсится с басом E', p3 && p3.root === 'C' && p3.bassRoot === 'E');

const p4 = w.eval('parseChordForKeyDetection("Bm7b5")');
check('Bm7b5 парсится корректно', p4 && p4.root === 'B');

const p5 = w.eval('parseChordForKeyDetection("Bdim")');
check('Bdim парсится как dim', p5 && p5.root === 'B' && p5.quality === 'dim');

const p6 = w.eval('parseChordForKeyDetection("Dsus4")');
check('Dsus4 парсится с качеством null', p6 && p6.root === 'D' && p6.quality === null);

// 3. Классические каденции в мажоре
const k_ii_V_I = testChords(['Dm', 'G', 'C']);
check('мажорная каденция ii-V-I (Dm-G-C) -> C', k_ii_V_I === 'C', `got ${k_ii_V_I}`);

const k_ii_V7_I = testChords(['Dm7', 'G7', 'C']);
check('мажорная каденция ii-V7-I (Dm7-G7-C) -> C', k_ii_V7_I === 'C', `got ${k_ii_V7_I}`);

const k_IV_V_I = testChords(['F', 'G', 'C']);
check('полная мажорная каденция IV-V-I (F-G-C) -> C', k_IV_V_I === 'C', `got ${k_IV_V_I}`);

const k_IV_I = testChords(['C', 'F', 'C']);
check('плагальная каденция IV-I (C-F-C) -> C', k_IV_I === 'C', `got ${k_IV_I}`);

const k_D_maj = testChords(['Em', 'A7', 'D']);
check('каденция ii-V7-I в D-мажоре (Em-A7-D) -> D', k_D_maj === 'D', `got ${k_D_maj}`);

// 4. Минорные каденции
const k_min_ii_V_i = testChords(['Bm7b5', 'E7', 'Am']);
check('минорная каденция ii°-V7-i (Bm7b5-E7-Am) -> Am', k_min_ii_V_i === 'Am', `got ${k_min_ii_V_i}`);

const k_min_iv_V_i = testChords(['Dm', 'E', 'Am']);
check('минорная каденция iv-V-i (Dm-E-Am) -> Am', k_min_iv_V_i === 'Am', `got ${k_min_iv_V_i}`);

const k_aeolian = testChords(['F', 'G', 'Am']);
check('эолийский рок-каданс VI-bVII-i (F-G-Am) -> Am', k_aeolian === 'Am', `got ${k_aeolian}`);

const k_nat_minor = testChords(['Am', 'Dm', 'Em', 'Am']);
check('натуральный минор i-iv-v-i (Am-Dm-Em-Am) -> Am', k_nat_minor === 'Am', `got ${k_nat_minor}`);

// 5. Разрешение спора параллельного мажора и минора
const k_pop_Am = testChords(['Am', 'F', 'C', 'G', 'Am']);
check('поп-прогрессия Am-F-C-G-Am -> Am', k_pop_Am === 'Am', `got ${k_pop_Am}`);

const k_pop_C = testChords(['C', 'G', 'Am', 'F', 'C']);
check('поп-прогрессия C-G-Am-F-C -> C', k_pop_C === 'C', `got ${k_pop_C}`);

const k_doo_wop_C = testChords(['C', 'Am', 'F', 'G', 'C']);
check('doo-wop прогрессия C-Am-F-G-C -> C', k_doo_wop_C === 'C', `got ${k_doo_wop_C}`);

// 6. Модальные прогрессии
const k_dorian = testChords(['Am', 'D', 'Am', 'D']);
check('дорийский лад Am-D-Am-D -> Am', k_dorian === 'Am', `got ${k_dorian}`);

const k_mixolydian = testChords(['C', 'Bb', 'F', 'C']);
check('миксолидийский лад C-Bb-F-C -> C', k_mixolydian === 'C', `got ${k_mixolydian}`);

// 7. Блюз
const k_blues_E = testChords(['E7', 'A7', 'E7', 'B7', 'A7', 'E7']);
check('блюзовый оборот на доминантсептах -> E', k_blues_E === 'E', `got ${k_blues_E}`);

// 8. Песни из uploads/
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (fs.existsSync(uploadsDir)) {
  const songFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.json'));
  for (const f of songFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(uploadsDir, f), 'utf8'));
    const detected = w.eval(`
      sections = ${JSON.stringify(data.sections || [])};
      globalTimeSig = ${JSON.stringify(data.globalTimeSig || '4/4')};
      detectKeyFromChords();
    `);
    const expected = data.globalKey;
    check(`Песня ${f} -> ${detected} (ожидалось ${expected})`, detected === expected, `got ${detected}, expected ${expected}`);
  }
}

console.log(`\nИТОГО: пройдено ${pass}, провалено ${fail}`);
if (fail > 0) process.exit(1);
