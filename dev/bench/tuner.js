// Тюнер: определение высоты тона, шкала, эталоны.
//
// Микрофон подменяем: Chrome умеет проигрывать WAV вместо живого входа
// (--use-file-for-fake-audio-capture). Так можно подать РОВНО известную
// частоту и проверить, что тюнер называет её верно.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');

// Генерируем WAV с нотой: основной тон + обертоны, как у струны.
// Именно с обертонами: на чистой синусоиде любой алгоритм справится, а
// у гитары вторая гармоника часто ГРОМЧЕ первой — на этом ломается БПФ.
function makeWav(freq, sec = 3, rate = 48000, amp = 12000) {
  const n = Math.floor(rate * sec);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-t * 0.4);
    const v =
      0.45 * Math.sin(2 * Math.PI * freq * t) +
      0.60 * Math.sin(2 * Math.PI * freq * 2 * t) +   // громче основного
      0.25 * Math.sin(2 * Math.PI * freq * 3 * t) +
      0.10 * Math.sin(2 * Math.PI * freq * 4 * t);
    data.writeInt16LE(Math.max(-32767, Math.min(32767, v * env * amp)), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };

(async () => {
  console.log('=== 1. Логика: частота -> нота и центы ===');
  {
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 900));
    const r = await p.evaluate(() => {
      const cases = [
        [440, 'A4', 0], [82.41, 'E2', 0], [110, 'A2', 0],
        [146.83, 'D3', 0], [196, 'G3', 0], [246.94, 'B3', 0], [329.63, 'E4', 0],
        [466.16, 'A#4', 0], [261.63, 'C4', 0],
      ];
      return cases.map(([f, name, cents]) => {
        const g = tunerFreqToNote(f);
        return { f, want: name, got: g.name + g.octave, cents: g.cents };
      });
    });
    r.forEach(x => ok(`${x.f} Гц = ${x.want}`, x.got === x.want && Math.abs(x.cents) <= 1, `${x.got} ${x.cents}ц`));
    // Расстройка
    const det = await p.evaluate(() => {
      const sharp = tunerFreqToNote(440 * Math.pow(2, 25 / 1200));  // +25 центов
      const flat = tunerFreqToNote(440 * Math.pow(2, -30 / 1200));  // -30 центов
      return { sharp: sharp.cents, flat: flat.cents, sn: sharp.name, fn: flat.name };
    });
    ok('+25 центов распознаны', det.sharp === 25 && det.sn === 'A', `${det.sn} ${det.sharp}`);
    ok('−30 центов распознаны', det.flat === -30 && det.fn === 'A', `${det.fn} ${det.flat}`);
    await b.close();
  }

  console.log('\n=== 2. Окно тюнера ===');
  {
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 900));
    // Кнопка переехала из панели инструментов в ШАПКУ и стала круглой
    // с нарисованным камертоном (в шрифте Tabler его нет).
    const inBar = await p.evaluate(() => {
      const btn = document.querySelector('.app-header .icon-round-btn');
      return { есть: !!btn, svg: btn ? btn.querySelectorAll('svg path').length : 0,
        вПанели: [...document.querySelectorAll('.toolbar .action-btn')]
          .filter(b => /Тюнер/.test(b.textContent)).length };
    });
    ok('кнопка есть в шапке', inBar.есть === true);
    ok('с нарисованным камертоном', inBar.svg === 4, String(inBar.svg));
    ok('дубля в панели нет', inBar.вПанели === 0, String(inBar.вПанели));

    await p.evaluate(() => openTuner());
    await new Promise(r => setTimeout(r, 400));
    const ui = await p.evaluate(() => {
      const m = document.querySelector('.tuner-modal');
      if (!m) return null;
      return {
        strings: m.querySelectorAll('.tuner-string-btn').length,
        labels: [...m.querySelectorAll('.tuner-string-label')].map(x => x.textContent),
        hasScale: !!m.querySelector('.tuner-scale'),
        hasMicBtn: !!m.querySelector('.tuner-mic-btn'),
        hasX: !!m.querySelector('.tuner-x'),
        tuning: (m.querySelector('#tunerTuningName') || {}).textContent,
        listHidden: m.querySelector('#tunerTunings').hidden,
        note: m.querySelector('#tunerNote').textContent,
        w: Math.round(m.getBoundingClientRect().width),
        h: Math.round(m.getBoundingClientRect().height),
        fits: m.getBoundingClientRect().bottom <= innerHeight + 0.5 &&
              m.getBoundingClientRect().top >= -0.5,
      };
    });
    console.log('   ', JSON.stringify(ui));
    ok('шесть кнопок эталона', ui.strings === 6, String(ui.strings));
    ok('шкала на месте', ui.hasScale);
    // Кнопки микрофона больше нет: он включается при открытии окна и
    // выключается при закрытии.
    ok('кнопки микрофона нет', ui.hasMicBtn === false);
    ok('крестик в углу есть', ui.hasX === true);
    ok('строй подписан именем', /Standard|Drop|Open|DADGAD/.test(ui.tuning || ''), ui.tuning);
    ok('список строёв свёрнут', ui.listHidden === true);
    ok('окно влезает в экран', ui.fits === true, `${ui.w}x${ui.h}`);
    // Окно узкое (380px). Базовое .strum-modal-content объявлено НИЖЕ и
    // стоит с !important — при равной специфичности побеждало оно, и
    // тюнер раздувался до 520px. Лечится двойным селектором.
    ok('окно не раздуто до 520px', ui.w <= 400, `${ui.w}px`);

    // Геометрия шкалы: стрелка на ±5 центов обязана попадать в зелёную
    // зону, а на ±49 — не вылезать за края. Ход считается от
    // фактической ширины (окно резиновое), поэтому проверяем числами.
    const geo = await p.evaluate(async () => {
      const sc = document.getElementById('tunerScale').getBoundingClientRect();
      const z = document.querySelector('.tuner-zone').getBoundingClientRect();
      const at = async (c) => {
        tunerRender(440 * Math.pow(2, c / 1200));
        await new Promise((x) => setTimeout(x, 180));
        const n = document.getElementById('tunerNeedle').getBoundingClientRect();
        return n.left + n.width / 2 - sc.left;
      };
      return {
        w: sc.width,
        zoneL: z.left - sc.left, zoneR: z.right - sc.left,
        n0: await at(0), n5: await at(5), nm5: await at(-5),
        n49: await at(49), nm49: await at(-49),
      };
    });
    ok('в нуле стрелка по центру', Math.abs(geo.n0 - geo.w / 2) < 2, String(Math.round(geo.n0)));
    ok('+5 центов внутри зелёной зоны',
      geo.n5 <= geo.zoneR + 1 && geo.n5 >= geo.zoneL, `${Math.round(geo.n5)} vs ${Math.round(geo.zoneR)}`);
    ok('−5 центов внутри зелёной зоны',
      geo.nm5 >= geo.zoneL - 1 && geo.nm5 <= geo.zoneR, `${Math.round(geo.nm5)} vs ${Math.round(geo.zoneL)}`);
    ok('+49 не выходит за шкалу', geo.n49 <= geo.w, `${Math.round(geo.n49)} из ${Math.round(geo.w)}`);
    ok('−49 не выходит за шкалу', geo.nm49 >= 0, String(Math.round(geo.nm49)));

    // Эталон звучит
    const rang = await p.evaluate(async () => {
      const before = activeOscillators.size;
      document.querySelectorAll('.tuner-string-btn')[0].click();
      await new Promise(r => setTimeout(r, 120));
      const btn = document.querySelectorAll('.tuner-string-btn')[0];
      return { before, after: activeOscillators.size, lit: btn.classList.contains('is-ringing') };
    });
    ok('эталон запускает осцилляторы', rang.after > rang.before, `${rang.before} -> ${rang.after}`);
    ok('кнопка подсвечена пока звучит', rang.lit === true);

    // Закрытие
    const closed = await p.evaluate(() => {
      document.querySelector('.tuner-x').click();
      return !document.querySelector('.tuner-modal');
    });
    ok('крестик закрывает окно', closed);
    ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
    await b.close();
  }

  console.log('\n=== 3. Разбор реального сигнала через микрофон ===');
  {
    // Проверяем на нотах всех шести струн + заведомо расстроенной.
    const cases = [
      ['E2 (6-я)', 82.41, 'E2'],
      ['A2 (5-я)', 110.0, 'A2'],
      ['D3 (4-я)', 146.83, 'D3'],
      ['G3 (3-я)', 196.0, 'G3'],
      ['B3 (2-я)', 246.94, 'B3'],
      ['E4 (1-я)', 329.63, 'E4'],
    ];
    for (const [name, freq, want] of cases) {
      const wav = '/tmp/tuner_' + Math.round(freq) + '.wav';
      fs.writeFileSync(wav, makeWav(freq));
      const b = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--allow-file-access-from-files',
          '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
          '--use-file-for-fake-audio-capture=' + wav],
      });
      const p = await b.newPage();
      await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 800));
      const r = await p.evaluate(async () => {
        // Микрофон стартует САМ при открытии окна.
        openTuner();
        await new Promise(x => setTimeout(x, 1800));
        const note = document.getElementById('tunerNote').textContent;
        const hz = document.getElementById('tunerHz').textContent;
        const needle = document.getElementById('tunerNeedle').style.transform;
        return { note, hz, needle, on: tunerState !== null };
      });
      console.log(`    ${name}: показал «${r.note}», ${r.hz}`);
      ok(`${name} распознана`, r.note === want, `ждали ${want}, получили ${r.note}`);
      await b.close();
    }
  }

  console.log('\n=== 4. Расстроенная струна и молчание ===');
  {
    // E2, завышенная на 30 центов: имя то же, отклонение должно быть видно.
    const freq = 82.41 * Math.pow(2, 30 / 1200);
    const wav = '/tmp/tuner_detuned.wav';
    fs.writeFileSync(wav, makeWav(freq));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 1800));
      const readout = document.getElementById('tunerReadout');
      const m = /([+-]?\d+) центов/.exec(document.getElementById('tunerHz').textContent);
      return {
        note: document.getElementById('tunerNote').textContent,
        cents: m ? +m[1] : null,
        off: readout.classList.contains('is-off'),
        good: readout.classList.contains('is-good'),
        needle: document.getElementById('tunerNeedle').style.transform,
      };
    });
    console.log('   ', JSON.stringify(r));
    ok('нота та же (E2)', r.note === 'E2', r.note);
    ok('отклонение около +30', r.cents !== null && Math.abs(r.cents - 30) <= 6, String(r.cents));
    ok('помечена как расстроенная', r.off === true && r.good === false);
    ok('стрелка ушла вправо', /translateX\(\d+(\.\d+)?px\)/.test(r.needle), r.needle);

    // Микрофон отпускается при закрытии
    const stopped = await p.evaluate(async () => {
      document.querySelector('.tuner-x').click();
      await new Promise(x => setTimeout(x, 200));
      return { state: typeof tunerState === 'object' ? tunerState : 'нет' };
    });
    ok('микрофон отпущен при закрытии', stopped.state === null, JSON.stringify(stopped));
    await b.close();
  }

  console.log('\n=== 4б. Автостарт микрофона и выбор строя ===');
  {
    const wav = '/tmp/tuner_auto.wav';
    fs.writeFileSync(wav, makeWav(110, 4, 48000, 4000));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));

    // Микрофон включается САМ, без единого нажатия.
    const auto = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 1800));
      return { on: tunerState !== null, note: document.getElementById('tunerNote').textContent };
    });
    ok('микрофон включился сам', auto.on === true);
    ok('и сразу слышит ноту', auto.note === 'A2', auto.note);

    // Список строёв.
    const list = await p.evaluate(() => {
      document.getElementById('tunerTuningBtn').click();
      const l = document.getElementById('tunerTunings');
      return {
        open: !l.hidden,
        // Считаем именно кнопки: между ними стоят заголовки групп.
        count: l.querySelectorAll('.tuner-tuning-item').length,
        groups: [...l.querySelectorAll('.tuner-tuning-group')].map(x => x.textContent),
        current: l.querySelectorAll('.tuner-tuning-item.is-current').length,
      };
    });
    ok('список строёв открывается', list.open === true);
    ok('строёв много', list.count >= 20, String(list.count));
    ok('текущий помечен ровно один', list.current === 1, String(list.current));
    ok('список разбит на группы', list.groups.length >= 3, list.groups.join(', '));

    // Выбор Drop D перестраивает кнопки эталона: 6-я струна D2.
    const drop = await p.evaluate(() => {
      [...document.querySelectorAll('.tuner-tuning-item')]
        .find(x => /Drop D/.test(x.textContent)).click();
      const b6 = document.querySelectorAll('.tuner-string-btn')[0];
      return {
        name: document.getElementById('tunerTuningName').textContent,
        title: b6.title,
        closed: document.getElementById('tunerTunings').hidden,
        notes: [...document.querySelectorAll('.tuner-string-label')].map(x => x.textContent).join(''),
      };
    });
    ok('строй сменился на Drop D', drop.name === 'Drop D', drop.name);
    ok('6-я струна стала D2 73.42 Гц', /D2 · 73\.42/.test(drop.title), drop.title);
    ok('ноты строя DADGBE', drop.notes === 'DADGBE', drop.notes);
    ok('список закрылся после выбора', drop.closed === true);

    // Закрытие крестиком отпускает микрофон.
    const closed = await p.evaluate(async () => {
      document.querySelector('.tuner-x').click();
      await new Promise(x => setTimeout(x, 200));
      return { gone: !document.querySelector('.tuner-modal'), mic: tunerState };
    });
    ok('крестик закрыл окно', closed.gone === true);
    ok('микрофон отпущен', closed.mic === null);

    // Выбранный строй помнится между открытиями.
    const again = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 300));
      const n = document.getElementById('tunerTuningName').textContent;
      document.querySelector('.tuner-x').click();
      return n;
    });
    ok('строй помнится при переоткрытии', again === 'Drop D', again);
    ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
    await b.close();
  }

  console.log('\n=== 4в. Таблица строёв ===');
  {
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await p.evaluate(() => {
      const bad = { range: [], back: [], dup: [] };
      const ids = new Set();
      for (const t of TUNER_TUNINGS) {
        if (ids.has(t.id)) bad.dup.push(t.id);
        ids.add(t.id);
        const fs = t.notes.map(noteToFrequency);
        if (!fs.every((f) => f && f >= TUNER_MIN_HZ && f <= TUNER_MAX_HZ)) bad.range.push(t.name);
        // Обратный ход: частота -> нота обязана вернуть исходную.
        t.notes.forEach((n, i) => {
          const g = tunerFreqToNote(fs[i]);
          if (g.name + g.octave !== n) bad.back.push(`${t.name}: ${n} -> ${g.name}${g.octave}`);
        });
      }
      const all = TUNER_TUNINGS.flatMap((t) => t.notes.map(noteToFrequency));
      return { count: TUNER_TUNINGS.length, bad,
        lowest: +Math.min(...all).toFixed(1), highest: +Math.max(...all).toFixed(1),
        groups: [...new Set(TUNER_TUNINGS.map((t) => t.group))],
        sixStrings: TUNER_TUNINGS.every((t) => t.notes.length === 6) };
    });
    console.log(`    строёв ${r.count}, группы: ${r.groups.join(', ')}, диапазон ${r.lowest}-${r.highest} Гц`);
    ok('строи есть во всех группах', r.groups.length >= 4, r.groups.join(', '));
    ok('у всех ровно шесть струн', r.sixStrings === true);
    ok('нет повторяющихся id', r.bad.dup.length === 0, r.bad.dup.join(', '));
    ok('все ноты в диапазоне детектора', r.bad.range.length === 0, r.bad.range.join(', '));
    ok('нота -> частота -> нота сходится', r.bad.back.length === 0, r.bad.back.slice(0, 3).join('; '));
    await b.close();
  }

  console.log('\n=== 4г. Самые низкие ноты слышны ===');
  // Ради «обширного выбора дропов» граница детектора опущена с 60 до
  // 40 Гц. Проверяем нижний край: Drop G это G1 = 48.99 Гц.
  for (const [name, freq, want] of [
    ['G1 (Drop G)', 48.99, 'G1'],
    ['A1 (Drop A)', 55.00, 'A1'],
    ['B1 (Drop B)', 61.74, 'B1'],
  ]) {
    const wav = '/tmp/tuner_low_' + Math.round(freq) + '.wav';
    // У низких струн основной тон особенно слаб — моделируем честно.
    const rate = 48000, n = rate * 3;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const t = i / rate, e = Math.exp(-t * 0.3);
      const v = 0.30 * Math.sin(2 * Math.PI * freq * t) + 0.65 * Math.sin(2 * Math.PI * freq * 2 * t) +
        0.35 * Math.sin(2 * Math.PI * freq * 3 * t) + 0.15 * Math.sin(2 * Math.PI * freq * 4 * t);
      data.writeInt16LE(Math.max(-32767, Math.min(32767, v * e * 4000)), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
    head.write('data', 36); head.writeUInt32LE(data.length, 40);
    fs.writeFileSync(wav, Buffer.concat([head, data]));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const got = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 2000));
      return document.getElementById('tunerNote').textContent;
    });
    ok(`${name} распознана`, got === want, `показал «${got}»`);
    await b.close();
  }

  console.log('\n=== 4д. Список показывает размах выбора ===');
  // Пользователь ДВАЖДЫ просил «обширный выбор строёв», когда в файле их
  // уже было 25. Причина: список в одну колонку высотой 240px показывал
  // ШЕСТЬ штук — всю группу Standard и ничего больше, — а полоса
  // прокрутки в Safari скрыта до касания трекпада. Выбор выглядел
  // куцым, хотя был большим.
  //
  // Теперь список в две колонки, окно на время выбора расширяется, а
  // полоса прокрутки видима принудительно.
  for (const [w, h] of [[1440, 900], [1280, 800], [1440, 720], [1024, 640]]) {
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h });
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await p.evaluate(async () => {
      openTuner();
      document.getElementById('tunerTuningBtn').click();
      await new Promise(x => setTimeout(x, 350));
      const m = document.querySelector('.tuner-modal').getBoundingClientRect();
      const l = document.getElementById('tunerTunings');
      const lr = l.getBoundingClientRect();
      const items = [...l.querySelectorAll('.tuner-tuning-item')];
      const visible = items.filter((x) => {
        const b = x.getBoundingClientRect();
        return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1;
      });
      // Сколько РАЗНЫХ групп видно без прокрутки.
      const heads = [...l.querySelectorAll('.tuner-tuning-group')].filter((x) => {
        const b = x.getBoundingClientRect();
        return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1;
      });
      const cols = getComputedStyle(l).gridTemplateColumns.split(' ').length;
      document.getElementById('tunerTuningBtn').click();
      await new Promise(x => setTimeout(x, 350));
      const m2 = document.querySelector('.tuner-modal').getBoundingClientRect();
      return {
        openW: Math.round(m.width), openH: Math.round(m.height),
        closedW: Math.round(m2.width),
        visible: visible.length, groupsSeen: heads.length, cols,
        fits: m.top >= -0.5 && m.bottom <= innerHeight + 0.5,
      };
    });
    console.log(`    ${w}x${h}: окно ${r.openW}x${r.openH}, видно ${r.visible} строёв, групп ${r.groupsSeen}, колонок ${r.cols}`);
    ok(`${w}x${h}: окно влезает в экран`, r.fits === true);
    // Порог зависит от высоты экрана: на 640px после шкалы, кнопки
    // строя и ряда струн списку остаётся около 200px — это 7 пунктов.
    // Главное не число, а что видно РАЗНЫЕ группы и ясен размах.
    const need = h >= 800 ? 12 : h >= 720 ? 10 : 6;
    ok(`${w}x${h}: видно не меньше ${need} строёв`, r.visible >= need, String(r.visible));
    ok(`${w}x${h}: видно больше одной группы`, r.groupsSeen >= 2, String(r.groupsSeen));
    ok(`${w}x${h}: список в две колонки`, r.cols === 2, String(r.cols));
    ok(`${w}x${h}: окно расширяется под список`, r.openW > r.closedW, `${r.closedW} -> ${r.openW}`);
    ok(`${w}x${h}: и сужается обратно`, r.closedW <= 400, String(r.closedW));
    await b.close();
  }

  console.log('\n=== 4е. Ручная подстройка строя стрелками ===');
  {
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));

    // Порядок: два ходовых строя первыми.
    const order = await p.evaluate(() => {
      openTuner();
      document.getElementById('tunerTuningBtn').click();
      const l = document.getElementById('tunerTunings');
      return {
        first: [...l.querySelectorAll('.tuner-tuning-item')].slice(0, 2)
          .map(x => x.querySelector('span').textContent),
        dropD: TUNER_TUNINGS.filter(t => t.name === 'Drop D').length,
      };
    });
    ok('первый строй — E Standard', order.first[0] === 'E Standard', order.first[0]);
    ok('второй — Drop D', order.first[1] === 'Drop D', order.first[1]);
    ok('Drop D не задвоился', order.dropD === 1, String(order.dropD));

    // Стрелки: по две на струну, скрыты, проявляются по наведению.
    await p.evaluate(() => document.getElementById('tunerTuningBtn').click());
    const arrows = await p.evaluate(() => {
      const cell = document.querySelector('.tuner-string-cell');
      const ar = cell.querySelectorAll('.tuner-string-arrow');
      return { perString: ar.length, total: document.querySelectorAll('.tuner-string-arrow').length,
        hidden: +getComputedStyle(ar[0]).opacity };
    });
    ok('по две стрелки на струну', arrows.perString === 2, String(arrows.perString));
    ok('всего двенадцать', arrows.total === 12, String(arrows.total));
    ok('по умолчанию скрыты', arrows.hidden === 0, String(arrows.hidden));

    const cell = await p.evaluate(() => {
      const c = document.querySelector('.tuner-string-cell').getBoundingClientRect();
      return { x: Math.round(c.left + c.width / 2), y: Math.round(c.top + c.height / 2) };
    });
    await p.mouse.move(cell.x - 50, cell.y - 50);
    await p.mouse.move(cell.x, cell.y, { steps: 6 });
    await new Promise(r => setTimeout(r, 300));
    const shown = await p.evaluate(() =>
      +getComputedStyle(document.querySelector('.tuner-string-arrow')).opacity);
    ok('проявляются по наведению', shown === 1, String(shown));

    // Обе иконки РИСУЮТСЯ. chevron-up однажды не попал в сабсет шрифта:
    // класс собирался подстановкой `ti-${icon}`, а subset-icons.py ищет
    // литералы. Кнопка была пустой — снаружи «верхней стрелки нет».
    const icons = await p.evaluate(() =>
      [...document.querySelector('.tuner-string-cell').querySelectorAll('.tuner-string-arrow i')]
        .map(i => ({ cls: i.className, w: Math.round(i.getBoundingClientRect().width) })));
    ok('иконка «вверх» отрисована', icons[0].w > 4, JSON.stringify(icons[0]));
    ok('иконка «вниз» отрисована', icons[1].w > 4, JSON.stringify(icons[1]));

    // Подстройка: шестая вниз на два полутона = Drop D, имя узнаётся.
    const shift = await p.evaluate(() => {
      const down = () => document.querySelectorAll('.tuner-string-cell')[0]
        .querySelectorAll('.tuner-string-arrow')[1].click();
      down();
      const mid = { note: document.querySelector('.tuner-string-label').textContent,
        name: document.getElementById('tunerTuningName').textContent };
      down();
      return { mid, end: { note: document.querySelector('.tuner-string-label').textContent,
        name: document.getElementById('tunerTuningName').textContent } };
    });
    ok('полутон вниз: E -> D#', shift.mid.note === 'D#', shift.mid.note);
    ok('промежуточный строй назван своим', shift.mid.name === 'Свой строй', shift.mid.name);
    ok('два полутона вниз: D', shift.end.note === 'D', shift.end.note);
    ok('набор узнан как Drop D', shift.end.name === 'Drop D', shift.end.name);

    // Обратно вверх.
    const up = await p.evaluate(() => {
      const u = () => document.querySelectorAll('.tuner-string-cell')[0]
        .querySelectorAll('.tuner-string-arrow')[0].click();
      u(); u();
      return { note: document.querySelector('.tuner-string-label').textContent,
        name: document.getElementById('tunerTuningName').textContent };
    });
    ok('вернулись к E Standard', up.note === 'E' && up.name === 'E Standard', JSON.stringify(up));

    // Выбор готового строя сбрасывает ручную правку.
    const reset = await p.evaluate(() => {
      document.querySelectorAll('.tuner-string-cell')[0]
        .querySelectorAll('.tuner-string-arrow')[1].click();
      document.getElementById('tunerTuningBtn').click();
      [...document.querySelectorAll('.tuner-tuning-item')]
        .find(x => /Open G/.test(x.textContent)).click();
      return { name: document.getElementById('tunerTuningName').textContent,
        notes: [...document.querySelectorAll('.tuner-string-label')].map(x => x.textContent).join('') };
    });
    ok('готовый строй сбрасывает правку', reset.name === 'Open G', reset.name);
    ok('и ставит свои ноты', reset.notes === 'DGDGBD', reset.notes);

    // Ниже границы детектора не пускает: тюнер такую струну не услышит.
    const limit = await p.evaluate(() => {
      document.getElementById('tunerTuningBtn').click();
      [...document.querySelectorAll('.tuner-tuning-item')]
        .find(x => /Drop G/.test(x.textContent)).click();
      const down = () => document.querySelectorAll('.tuner-string-cell')[0]
        .querySelectorAll('.tuner-string-arrow')[1].click();
      down(); down(); down(); down();
      const note = tunerActiveNotes()[0];
      return { note, hz: +noteToFrequency(note).toFixed(1) };
    });
    ok('ниже границы детектора не уходит', limit.hz >= 40, `${limit.note} = ${limit.hz} Гц`);

    // Стрелки не вылезают за нижнее поле окна.
    const fit = await p.evaluate(() => {
      const m = document.querySelector('.tuner-modal');
      const mr = m.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(m).paddingBottom);
      return [...document.querySelectorAll('.tuner-string-arrow')]
        .filter(a => a.getBoundingClientRect().bottom > mr.bottom - pad + 0.5).length;
    });
    ok('стрелки внутри окна', fit === 0, `${fit} за краем`);
    ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
    await b.close();
  }

  console.log('\n=== 4ж. Тёмная тема: элементы не сливаются с окном ===');
  // В тёмной теме --color-surface и --color-neutral-bg равны фону
  // модалки (#2c2c2b). Шкала стояла на neutral-bg, кнопки струн — на
  // surface, и обе группы полностью растворялись: замер по ПИКСЕЛЯМ
  // скриншота дал контраст 1.00.
  //
  // Меряем именно пиксели, а не computed style: у полупрозрачных
  // фонов (rgba) getComputedStyle возвращает саму rgba, и расчёт
  // контраста по ней врёт — реальный цвет получается только после
  // наложения на подложку.
  {
    const { PNG } = require('pngjs');
    const fs2 = require('fs');
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const p = await b.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 900));
    for (const dark of [true, false]) {
      await p.evaluate((d) => {
        const isD = document.documentElement.getAttribute('data-theme') === 'dark';
        if (d !== isD) toggleTheme();
      }, dark);
      await new Promise(r => setTimeout(r, 300));
      await p.evaluate(() => { openTuner(); tunerRender(440 * Math.pow(2, 18 / 1200)); });
      await new Promise(r => setTimeout(r, 400));
      const box = await p.evaluate(() => {
        const q = (s) => { const r = document.querySelector(s).getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
        return { m: q('.tuner-modal'), sc: q('.tuner-scale'),
          st: q('.tuner-string-btn'), z: q('.tuner-zone') };
      });
      await p.screenshot({ path: '/tmp/tuner_theme.png' });
      const png = PNG.sync.read(fs2.readFileSync('/tmp/tuner_theme.png'));
      const at = (x, y) => { const i = (png.width * y + x) << 2;
        return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
      const lum = (c) => { const f = (v) => { v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const cr = (a, c) => { const l1 = lum(a), l2 = lum(c);
        return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2); };
      const win = at(box.m.x + 20, box.sc.y + box.sc.h + 30);
      const scale = at(box.sc.x + 30, box.sc.y + (box.sc.h / 2 | 0));
      const str = at(box.st.x + (box.st.w / 2 | 0), box.st.y + 4);
      const zone = at(box.z.x + 3, box.z.y + (box.z.h / 2 | 0));
      const name = dark ? 'тёмная' : 'светлая';
      console.log(`      ${name}: шкала ${cr(win, scale)}, кнопка ${cr(win, str)}, зона ${cr(scale, zone)}`);
      if (dark) {
        // Светлую тему не проверяем: там кнопка струны белая на белом
        // окне и держится рамкой — так было изначально и устраивает.
        ok('тёмная: шкала отделена от окна', cr(win, scale) >= 1.15, String(cr(win, scale)));
        ok('тёмная: кнопки струн видны', cr(win, str) >= 1.3, String(cr(win, str)));
      }
      ok(`${name}: зелёная зона различима`, cr(scale, zone) >= 1.15, String(cr(scale, zone)));
    }
    await b.close();
  }

  console.log('\n=== 5. ТИХИЙ сигнал (главный дефект) ===');
  // Пользователь: «тюнер не слышит ноты». Причина была не в пороге
  // тишины, а в обрезке краёв окна: порог стоял АБСОЛЮТНЫЙ (0.2), и при
  // сигнале тише 20% шкалы обрезались оба края целиком — срез пустой,
  // ответа нет. Живой микрофон почти всегда тише.
  //
  // Замер до правки: 12% громкости, RMS 0.044 (впятеро выше порога
  // тишины) — нота не определялась.
  for (const [amp, pct] of [[4000, '12%'], [1500, '4.6%'], [600, '1.8%'], [250, '0.8%']]) {
    const wav = '/tmp/tuner_quiet_' + amp + '.wav';
    fs.writeFileSync(wav, makeWav(110, 3, 48000, amp));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 1700));
      return document.getElementById('tunerNote').textContent;
    });
    ok(`тихий сигнал ${pct} шкалы слышен`, r === 'A2', `показал «${r}»`);
    await b.close();
  }

  console.log('\n=== 6. Шум и тишина: тюнер молчит ===');
  // Обратная сторона снижения порогов: на пустой комнате и на речи
  // стрелка не должна дёргаться.
  const noises = [
    ['тишина', () => 0],
    ['белый шум', () => (Math.random() * 2 - 1) * 1200],
    // Гул электросети попадает в рабочий диапазон (граница 40 Гц) и
    // автокорреляцией читается как отличная нота G1. Отсекается
    // проверкой обертонов — см. tunerHasOvertones.
    ['гул 50 Гц', (t) => Math.sin(2 * Math.PI * 50 * t) * 900],
    ['гул 50 Гц громкий', (t) => Math.sin(2 * Math.PI * 50 * t) * 6000],
    ['гул 60 Гц (США)', (t) => Math.sin(2 * Math.PI * 60 * t) * 3000],
    ['речь-подобный', (t) => (Math.random() * 2 - 1) * 800 * (1 + Math.sin(2 * Math.PI * 3 * t))],
  ];
  for (const [name, gen] of noises) {
    const rate = 48000, n = rate * 3;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      data.writeInt16LE(Math.max(-32767, Math.min(32767, gen(i / rate) | 0)), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
    head.write('data', 36); head.writeUInt32LE(data.length, 40);
    const wav = '/tmp/tuner_noise.wav';
    fs.writeFileSync(wav, Buffer.concat([head, data]));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    const r = await p.evaluate(async () => {
      openTuner();
      await new Promise(x => setTimeout(x, 2000));
      return document.getElementById('tunerNote').textContent;
    });
    ok(`${name}: молчит`, r === '—', `показал «${r}»`);
    await b.close();
  }

  console.log('\n=== 7. Затухающая струна не пропадает ===');
  // Струна тише всего в конце: нота должна держаться, пока её слышно.
  {
    const rate = 48000, sec = 8, n = rate * sec;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const t = i / rate, e = Math.exp(-t * 0.55), f = 82.41;
      const v = 0.45 * Math.sin(2 * Math.PI * f * t) + 0.60 * Math.sin(2 * Math.PI * f * 2 * t) +
        0.25 * Math.sin(2 * Math.PI * f * 3 * t) + 0.10 * Math.sin(2 * Math.PI * f * 4 * t);
      data.writeInt16LE(Math.max(-32767, Math.min(32767, v * e * 5000)), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
    head.write('data', 36); head.writeUInt32LE(data.length, 40);
    const wav = '/tmp/tuner_decay.wav';
    fs.writeFileSync(wav, Buffer.concat([head, data]));
    const b = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav],
    });
    const p = await b.newPage();
    await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate(() => openTuner());
    const seen = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      seen.push(await p.evaluate(() => document.getElementById('tunerNote').textContent));
    }
    const held = seen.filter(x => x === 'E2').length;
    console.log('    ', seen.join(' '));
    ok('нота держится всё затухание', held >= 9, `${held} из ${seen.length}`);
    await b.close();
  }

  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
})();
