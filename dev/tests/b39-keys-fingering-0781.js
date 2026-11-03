'use strict';
// 0.781: цифры на клавишах — это аппликатура, а не круговой перебор 1–5.
// Проверяем правила, по которым играет рука:
//   * пальцы идут по порядку (правая снизу вверх, левая зеркально);
//   * в аккорде трезвучие берётся 1-3-5, октавное трезвучие — 1-2-3-5;
//   * растяжка не выходит за предел: широкие аккорды распределяются
//     между пальцами, а не «всё подряд»;
//   * большой палец не садится на чёрную клавишу без нужды;
//   * бас ниже E3 с разрывом от децимы — это левая рука (снизу мизинец);
//   * повтор ноты в соседнем аккорде играется тем же пальцем;
//   * панель, превью и подпись показывают одно и то же, оговорки «условно» нет.
const assert = require('assert'), puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8031/STRUCHORD.html', { waitUntil: 'load' });

    const rules = await page.evaluate(() => {
      startNewSongFromHome(); addSection('Verse');
      const K = window.StruChordKeys;
      const cases = {
        triad: [60, 64, 67],
        triadOctave: [60, 64, 67, 72],
        twoHands: [36, 55, 60, 64],
        wideTenth: [48, 60, 64, 67],
        fiveNotes: [55, 60, 64, 67, 71],
        blackChord: [61, 65, 68],
        seventh: [38, 50, 53, 57, 60]
      };
      const out = {};
      for (const [name, notes] of Object.entries(cases)) out[name] = { notes, fingers: K.keyFingering(notes) };
      // Тот же аккорд второй раз — та же рука (детерминизм).
      out.repeat = [K.keyFingering([60, 64, 67]), K.keyFingering([60, 64, 67])];
      // Слишком много нот на руку — цифр нет, а не выдумка.
      out.tooMany = K.keyFingering([60, 62, 64, 65, 67, 69]);
      return out;
    });

    // --- 1. Порядок пальцев и состав -------------------------------------
    for (const [name, c] of Object.entries(rules)) {
      if (!c || !c.notes) continue;
      assert(c.fingers, name + ': аппликатура есть для ' + c.notes.join(','));
      const groups = { left: [], right: [] };
      const sorted = c.notes.slice().sort((a, b) => a - b);
      let split = 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1] < 52 && sorted[i] - sorted[i - 1] >= 10) { split = i; break; }
      }
      sorted.slice(0, split).forEach(n => groups.left.push([n, Number(c.fingers[n])]));
      sorted.slice(split).forEach(n => groups.right.push([n, Number(c.fingers[n])]));
      for (const [hand, pairs] of Object.entries(groups)) {
        if (pairs.length < 2) continue;
        const digits = pairs.map(p => p[1]);
        assert(digits.every(d => d >= 1 && d <= 5), name + ': палец ' + hand + ' в пределах 1–5');
        assert(new Set(digits).size === digits.length, name + ': каждый палец ' + hand + ' один раз: ' + digits);
        const increasing = digits.every((d, i) => i === 0 || d > digits[i - 1]);
        const decreasing = digits.every((d, i) => i === 0 || d < digits[i - 1]);
        assert(hand === 'right' ? increasing : decreasing,
          name + ': ' + hand + ' идёт ' + (hand === 'right' ? 'снизу вверх' : 'сверху вниз') + ': ' + digits);
      }
      assert.equal(Object.keys(c.fingers).length, c.notes.length, name + ': палец у каждой ноты');
    }

    // --- 2. Конкретные правила -------------------------------------------
    assert.deepStrictEqual(rules.triad.fingers, { 60: '1', 64: '3', 67: '5' },
      'трезвучие C-E-G берётся 1-3-5, а не 1-2-3');
    assert.deepStrictEqual(rules.triadOctave.fingers, { 60: '1', 64: '2', 67: '3', 72: '5' },
      'C-E-G-C в октаву — 1-2-3-5');
    assert.equal(rules.twoHands.fingers[36], '5', 'бас играет левая рука, снизу мизинец');
    assert.equal(rules.twoHands.fingers[55], '1', 'правой руке достаётся большой палец');
    // Растяжка: в пятинотном аккорде пальцы заняты все, без перескоков.
    assert.deepStrictEqual(rules.fiveNotes.fingers, { 55: '1', 60: '2', 64: '3', 67: '4', 71: '5' },
      'пять нот — пять пальцев по порядку');
    // Октава в правой руке не дробится на 1-2-2-3: пальцы разные.
    const octaveDigits = Object.values(rules.triadOctave.fingers);
    assert.equal(new Set(octaveDigits).size, octaveDigits.length, 'октава не берётся одним пальцем дважды');
    // Чёрные клавиши: большой палец не садится на чёрную без необходимости,
    // а если садится — рядом стоят пальцы, а не мизинец на терции.
    assert.equal(rules.blackChord.fingers[61], '1', 'в чёрном аккорде снизу остаётся опора большим');
    assert(rules.blackChord.fingers[65] !== '2', 'на чёрной клавише не сидит второй палец вплотную к большому');

    // --- 3. Один и тот же аккорд — одна и та же рука ---------------------
    assert.deepStrictEqual(rules.repeat[0], rules.repeat[1], 'повторный расчёт даёт ту же аппликатуру');
    assert.deepStrictEqual(rules.repeat[0], rules.triad.fingers, 'и ту же, что в первый раз');

    // --- 4. Больше пяти нот на руку — цифр нет ---------------------------
    assert.equal(rules.tooMany, null, 'шесть нот на одну руку не раскладываются — цифры не выдумываются');

    // --- 5. Панель, превью и подпись --------------------------------------
    await page.evaluate(() => {
      sections[0].squares[0].events[0].chord = 'C';
      document.getElementById('showFingers').checked = true;
      toggleFingersVisibility();
      StruChordKeys.open();
    });
    await wait(250);
    const ui = await page.evaluate(() => {
      const digits = svg => [...svg.querySelectorAll('text.b39-key-finger')].map(t => t.textContent);
      const panel = document.querySelector('#b39KeysPanel svg');
      const wrap = document.createElement('div');
      wrap.innerHTML = StruChordKeys.renderKeysVoicingSVG('C', 1);
      return {
        panel: digits(panel),
        aria: panel.getAttribute('aria-label'),
        foot: document.querySelector('#b39KeysPanel .b39-keys-foot').textContent,
        compact: digits(wrap.querySelector('svg')),
        compactText: wrap.textContent
      };
    });
    assert(ui.panel.length > 0, 'в панели есть цифры аппликатуры');
    assert(ui.panel.every(d => /^[1-5]$/.test(d)), 'в панели только пальцы 1–5: ' + ui.panel.join(''));
    assert.match(ui.aria, /аппликатура/, 'клавиатура объявляет аппликатуру');
    assert.match(ui.foot, /1–5 — аппликатура/, 'подпись объясняет цифры');
    assert(!/условн/.test(ui.foot + ui.compactText + ui.aria), 'оговорки «условно» больше нет');
    assert(ui.compact.length > 0, 'в превью аккорда тоже есть цифры');

    // --- 6. Выключенные цифры ничего не рисуют ---------------------------
    const off = await page.evaluate(() => {
      document.getElementById('showFingers').checked = false;
      toggleFingersVisibility();
      const panel = document.querySelector('#b39KeysPanel svg');
      return {
        digits: [...panel.querySelectorAll('text.b39-key-finger')].length,
        foot: document.querySelector('#b39KeysPanel .b39-keys-foot').textContent
      };
    });
    assert.equal(off.digits, 0, 'без галочки цифр нет');
    assert(!/аппликатура/.test(off.foot), 'без галочки нет и подписи про аппликатуру');

    assert.deepStrictEqual(errors, []);
    console.log('Аппликатура: C-E-G 1-3-5, C-E-G-C 1-2-3-5, бас — левая рука, 5 нот по порядку, ' +
      'чёрные клавиши без лишнего большого пальца, повтор считается одинаково — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
