// B-50 (2026-09-05): ресайз границы меняет ТОЛЬКО пару у ручки.
//
// Дефект (найден пользователем на песне «Дешевые Драмы»): в квадрате с
// долями 2|2|1.75|2.25|4|4 протяжка ЛЮБОЙ границы прогоняла через
// Math.round(span/step)*step весь квадрат, и ячейки, к которым никто не
// прикасался, теряли дробные доли. Дробные доли законны: они получаются
// при зуме с шагом 0.25 и приходят из импортированных файлов.
//
// Контракт (решение пользователя 2026-09-05):
//   - меняются только две ячейки по бокам перетаскиваемой границы;
//   - обе встают на текущий шаг сетки (четверти без зума, восьмые дальше);
//   - остальные ячейки сохраняют span бит-в-бит, включая некратные шагу;
//   - длина квадрата не меняется: сумма пары постоянна.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const root = __dirname + '/../..';
const html = fs.readFileSync(root + '/STRUCHORD.html', 'utf8');

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};

function boot() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(win) {
      win.HTMLCanvasElement.prototype.getContext = () => ({
        font: '', measureText: () => ({ width: 10 }),
        clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
        lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
        fillText(){}, strokeText(){}, setTransform(){}, scale(){}, setLineDash(){},
        createLinearGradient: () => ({ addColorStop(){} }),
      });
    },
  });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () {
    return { currentTime: 0, state: 'running', resume() {} };
  };
  // Квадрат-репро: две дробные ячейки в середине, целые по краям.
  w.eval(`
    globalTimeSig = '4/4';
    squareZoom = 1;
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'F', span: 2, timeSig: null, strumPattern: null },
          { chord: 'E', span: 2, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 1.75, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2.25, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
          { chord: 'E', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    nextId = 20;
  `);
  try { w.render(); } catch (e) {}
  return w;
}

const spans = (w) => JSON.parse(w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))'));
const W = 800;
const gs = W / 16; // одна доля в px: квадрат 16 долей

function drag(w, handleIndex, fromX, points) {
  const sq = w.document.querySelector('.square-inner');
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const h = sq.querySelectorAll('.resize-handle')[handleIndex];
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: fromX });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
  points.forEach((x) => w.document.dispatchEvent(
    new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x })));
  w.document.dispatchEvent(
    new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: points[points.length - 1] }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('B-50: ресайз трогает только пару у ручки\n');

  // 1. Чужая граница не смеет ровнять дробные доли.
  {
    const w = boot();
    ok('шаг сетки без зума = 1 доля', w.eval('getResizeStep()') === 1, w.eval('getResizeStep()'));
    drag(w, 1, 0, [20, 40, gs]); // граница E|Am — пара (1,2)
    await sleep(250);
    const s = spans(w);
    ok('G вне пары сохранил дробный span 2.25', s[3] === 2.25, s.join(' | '));
    ok('крайние F/E не тронуты', s[0] === 2 && s[4] === 4 && s[5] === 4, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }

  // 2. Своя граница: обе ячейки пары встают на четверти.
  {
    const w = boot();
    drag(w, 2, 0, [20, 40, gs]); // граница Am|G — пара (2,3)
    await sleep(250);
    const s = spans(w);
    ok('Am встал на целую долю', Number.isInteger(s[2]), s[2]);
    ok('G встал на целую долю', Number.isInteger(s[3]), s[3]);
    ok('сумма пары сохранена (4)', Math.abs(s[2] + s[3] - 4) < 1e-9, s[2] + s[3]);
    ok('соседи вне пары целы', s[0] === 2 && s[1] === 2 && s[4] === 4 && s[5] === 4, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }

  // 3. Клик без движения ничего не меняет.
  {
    const w = boot();
    const before = spans(w).join(' | ');
    drag(w, 2, 0, [0]);
    await sleep(250);
    ok('клик по ручке не квантует дроби', spans(w).join(' | ') === before, spans(w).join(' | '));
  }

  // 4. Шаг восьмых: пара встаёт на восьмые, чужие дроби живы.
  {
    const w = boot();
    w.eval('squareZoom = 1.5;');
    ok('шаг при зуме 1.5 = 0.5', w.eval('getResizeStep()') === 0.5, w.eval('getResizeStep()'));
    drag(w, 0, 0, [10, 20, gs / 2]); // граница F|E — пара (0,1)
    await sleep(250);
    const s = spans(w);
    const onEighth = (v) => Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-9;
    ok('пара кратна восьмой', onEighth(s[0]) && onEighth(s[1]), `${s[0]} | ${s[1]}`);
    ok('дробные Am/G вне пары не тронуты', s[2] === 1.75 && s[3] === 2.25, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }


  // 5. Дробность боя переживает ресайз (фидбек 2026-09-05: «ритм внутри
  //    ячеек ломается после отпускания мыши»). Бой секции тройками:
  //    после жеста ячейка обязана остаться тройками, изменив лишь число
  //    шагов по своей длине. Раньше sub улетал в 4 и 12.
  {
    const w = boot();
    w.eval(`
      sections[0].strumPattern = { mode: 'strum', subdivision: 3,
        steps: ['D', null, null, 'D', null, 'U', null, null, 'U', 'D', null, 'U'] };
    `);
    try { w.render(); } catch (e) {}
    const subs = () => JSON.parse(w.eval(`JSON.stringify(sections[0].squares[0].events.map((e,i)=>{
      const x = rhythmSoundingForEvent(sections[0], sections[0].squares[0], e, i);
      return x ? x.subdivision : null; }))`));
    const before = subs();
    ok('до жеста бой тройками', before.every((v) => v === 3), before.join(','));
    drag(w, 2, 0, [20, 40, gs]);
    await sleep(400);
    const after = subs();
    const s = spans(w);
    ok('после жеста дробность осталась 3', after.every((v) => v === 3), after.join(','));
    const steps = JSON.parse(w.eval(`JSON.stringify(sections[0].squares[0].events.map((e,i)=>{
      const x = rhythmSoundingForEvent(sections[0], sections[0].squares[0], e, i);
      return x ? x.steps.length : null; }))`));
    ok('шагов ровно span x 3', steps.every((n, i) => n === Math.round(s[i] * 3)),
       steps.join(',') + ' при долях ' + s.join(','));
  }


  // 6. Плотность нот ВО ВРЕМЯ жеста (фидбек 2026-09-05: «количество нот
  //    на долю меняется»). Полосы подсказки обязаны показывать столько
  //    ударов, сколько будет после отпускания, а не сколько было до.
  {
    const w = boot();
    w.eval(`
      sections[0].strumPattern = { mode: 'strum', subdivision: 3,
        steps: ['D', null, null, 'D', null, 'U', null, null, 'U', 'D', null, 'U'] };
    `);
    try { w.render(); } catch (e) {}
    await sleep(300);
    const sqEl = w.document.querySelector('.square-inner');
    sqEl.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
    sqEl.querySelectorAll('.chord-wrapper').forEach((cw) => {
      cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
    });
    const hits = () => Array.from(w.document.querySelectorAll('.rhythm-hint'))
      .map((el) => el.querySelectorAll('.rhythm-hint-hit').length);
    const h = sqEl.querySelectorAll('.resize-handle')[2];
    const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
    if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
    const atDown = hits();
    ok('на старте жеста удары по стартовым долям (1.75x3=5)', atDown[2] === 5, atDown.join(','));
    w.eval('window.__builds = 0;');
    for (let x = 1; x <= 40; x++) {
      w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x }));
    }
    await sleep(120);
    const during = hits();
    // Am -> 3 доли: 3x3 = 9 ударов; G -> 1 доля: 1x3 = 3 удара.
    ok('в жесте удары пересчитаны под будущие доли (3x3=9)', during[2] === 9, during.join(','));
    ok('сосед пары тоже пересчитан (1x3=3)', during[3] === 3, during.join(','));
    ok('чужие ячейки не тронуты', during[0] === atDown[0] && during[4] === atDown[4], during.join(','));
    w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40 }));
    await sleep(500);
    const s = spans(w);
    const steps = JSON.parse(w.eval(`JSON.stringify(sections[0].squares[0].events.map((e,i)=>{
      const x = rhythmSoundingForEvent(sections[0], sections[0].squares[0], e, i);
      return x ? x.steps.length : null; }))`));
    ok('после отпускания совпало с показанным в жесте',
       steps[2] === during[2] && steps[3] === during[3],
       'жест ' + during.slice(2, 4).join(',') + ' vs итог ' + steps.slice(2, 4).join(','));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.join(','));
  }


  // 7. Удары стоят на МЕТРИЧЕСКОЙ сетке квадрата, как в режиме ленты
  //    (пользователь 2026-09-05: «ритм над 1 та и та должен располагаться
  //    как в режиме ленты», «при ресайзе его положение не должно
  //    визуально меняться»). Регрессия 0.175: число ударов менялось, а
  //    ширина полосы оставалась стартовой — шаг между ударами плыл.
  {
    const w = boot();
    w.eval(`
      sections[0].strumPattern = { mode: 'strum', subdivision: 3,
        steps: ['D', null, null, 'D', null, 'U', null, null, 'U', 'D', null, 'U'] };
    `);
    try { w.render(); } catch (e) {}
    await sleep(300);
    const sqEl = w.document.querySelector('.square-inner');
    sqEl.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
    sqEl.querySelectorAll('.chord-wrapper').forEach((cw) => {
      cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
    });
    // Абсолютные позиции ударов в % ширины квадрата.
    const absPositions = () => {
      const out = [];
      w.document.querySelectorAll('.rhythm-hint').forEach((strip) => {
        const L = parseFloat(strip.style.left) || 0;
        const WD = parseFloat(strip.style.width) || 0;
        strip.querySelectorAll('.rhythm-hint-hit').forEach((hit) => {
          out.push(L + WD * (parseFloat(hit.style.left) || 0) / 100);
        });
      });
      return out.sort((a, b) => a - b);
    };
    // Модальный (самый частый) шаг сетки. Строгое «все шаги равны» здесь
    // неверно: ячейка 1.75 доли не делится на тройки нацело, и на её
    // стыке с соседом остаётся законный неровный интервал. Проверяем,
    // что ОСНОВНАЯ сетка — шаг 1/subdivision доли — не меняется.
    const modalGap = (arr) => {
      const gaps = arr.slice(1).map((v, i) => +(v - arr[i]).toFixed(2));
      const freq = {};
      gaps.forEach((g) => { freq[g] = (freq[g] || 0) + 1; });
      return +Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
    };
    const h = sqEl.querySelectorAll('.resize-handle')[2];
    const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
    if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
    const atDown = absPositions();
    const gapAtDown = modalGap(atDown);
    // 16 долей в квадрате, тройки: шаг = 100 / (16 x 3) = 2.08%
    ok('на старте шаг сетки = 1/3 доли (как в ленте)', Math.abs(gapAtDown - 2.08) < 0.02, gapAtDown);
    // Шаг ВНУТРИ каждой ячейки обязан быть ровно 1/subdivision доли —
    // тот же инвариант, что у дорожки ленты (renderTimelineRhythm кладёт
    // удары от начала ячейки с шагом span/steps). Абсолютную сетку здесь
    // требовать нельзя: ячейка может начинаться вне сетки (G стартует на
    // 5.75 доли), и лента в этом случае тоже сдвинута — удары считаются
    // ОТ НАЧАЛА ЯЧЕЙКИ. Регрессия 0.175 ломала именно шаг: 9 ударов
    // вжимались в прежнюю ширину и шли через 1.21% вместо 2.08%.
    const perCellSteps = () => Array.from(w.document.querySelectorAll('.rhythm-hint'))
      .map((strip) => {
        const WD = parseFloat(strip.style.width) || 0;
        const hits = Array.from(strip.querySelectorAll('.rhythm-hint-hit'))
          .map((hit) => WD * (parseFloat(hit.style.left) || 0) / 100);
        if (hits.length < 2) return null;
        return +(hits[1] - hits[0]).toFixed(2);
      })
      .filter((v) => v !== null);
    const stepsAtDown = perCellSteps();
    ok('шаг внутри каждой ячейки = 1/3 доли (как в ленте)',
       stepsAtDown.every((v) => Math.abs(v - 2.08) < 0.03), stepsAtDown.join(','));
    for (let x = 1; x <= 40; x++) {
      w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x }));
    }
    await sleep(150);
    const during = absPositions();
    ok('в жесте шаг сетки НЕ изменился', Math.abs(modalGap(during) - gapAtDown) < 0.02,
       'было ' + gapAtDown + ' стало ' + modalGap(during));
    const stepsDuring = perCellSteps();
    ok('в жесте шаг ВНУТРИ ячеек не изменился',
       stepsDuring.every((v) => Math.abs(v - 2.08) < 0.03), stepsDuring.join(','));
    // Ячейка, у которой уехала ЛЕВАЯ граница, обязана начинаться с
    // нового узла: иначе выросший сосед налезает на неё. Читаем позиции
    // В ПОРЯДКЕ DOM (без сортировки — она бы замаскировала наложение) и
    // требуем строгого возрастания.
    const domOrder = [];
    w.document.querySelectorAll('.rhythm-hint').forEach((strip) => {
      const L = parseFloat(strip.style.left) || 0;
      const WD = parseFloat(strip.style.width) || 0;
      strip.querySelectorAll('.rhythm-hint-hit').forEach((hit) => {
        domOrder.push(L + WD * (parseFloat(hit.style.left) || 0) / 100);
      });
    });
    const monotone = domOrder.every((v, k) => k === 0 || v - domOrder[k - 1] > 0.5);
    ok('ячейки не налезают друг на друга', monotone,
       domOrder.map((v) => v.toFixed(2)).join(' '));
    // Узлы метрической сетки не сдвинулись: те, что были и остались,
    // стоят на прежних процентах.
    const kept = atDown.filter((v) => during.some((u) => Math.abs(u - v) < 0.05));
    ok('общие узлы сетки не сместились', kept.length >= atDown.length - 12,
       'сохранилось ' + kept.length + ' из ' + atDown.length);
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
