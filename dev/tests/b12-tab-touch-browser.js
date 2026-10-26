#!/usr/bin/env node
// 0.675: чистая новая песня, касания без системной клавиатуры, настоящий
// alphaTab / история / FileReader / Web Audio. Артефакты только по opt-in.
const {isDeepStrictEqual} = require('util');
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const chromium = require('@sparticuz/chromium').default, puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..');
const output = process.env.B12_TOUCH_RESULTS ? path.resolve(process.env.B12_TOUCH_RESULTS) : null;
const checks = [], errors = [], gestures = []; let counting = true;
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(detail)}`); assert.ok(ok, name); };
const notes = page => page.evaluate(() => JSON.parse(JSON.stringify(tabInsertEditorState.draft.notes)));
(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: 'shell',
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();
    page.on('pageerror', e => {errors.push(e.message);console.error('PAGEERROR',e.message)});
    page.on('dialog', async d => d.type() === 'beforeunload' ? d.accept() : d.dismiss());
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Не scrollIntoView: настоящие CDP touch-scroll жесты. Записываем
    // отдельно и нажатия, и прокрутки, включая подготовку четырёх квадратов.
    async function reveal(selector) {
      await page.waitForSelector(selector);
      if (!counting) { await page.$eval(selector, e=>e.scrollIntoView({block:'center',inline:'start'})); await wait(220); return; }
      for (let i = 0; i < 25; i++) {
        const r = await page.$eval(selector, el => {
          const r = el.getBoundingClientRect(); let parent = el.parentElement;
          while (parent && !(parent.scrollHeight > parent.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
          const b = parent && parent !== document.body && parent !== document.documentElement ? parent.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
          const hit = document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return { hitElement:hit?.outerHTML.slice(0,250), hit: !!hit && (el.contains(hit) || (el.dataset.wheelChordIdentity && hit.textContent === el.dataset.wheelChordIdentity)), elementTop:r.top, elementBottom:r.bottom, y: r.top + r.height / 2, x: r.left + r.width / 2, top: Math.max(0, b.top), bottom: Math.min(innerHeight, b.bottom), left: b.left, right: b.right };
        });
        if (r.hit && r.elementTop > r.top + 5 && r.elementBottom < r.bottom - 5 && r.x >= 0 && r.x < 390) return;
        const down = r.elementBottom >= r.bottom - 5;
        const x = Math.max(5, Math.min(385, r.left + 2));
        const y = Math.round(down ? r.bottom - 45 : r.top + 45), distance = Math.min(350, r.bottom-r.top-90);
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x, y}] });
        for (let step=1; step<=12; step++) {
          await client.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y+(down?-1:1)*distance*step/12}]}); await wait(16);
        }
        await wait(180);
        await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        if (counting) gestures.push({ type: 'scroll', target: selector, direction: down ? 'down' : 'up' });
        await wait(450);
      }
      console.error(await page.$eval(selector, e => ({ rect:e.getBoundingClientRect().toJSON(), html:e.outerHTML, scrollY, scrollX, innerWidth })));
      if(output) await page.screenshot({path:path.join(output,'failure.png')});
      throw new Error('Cannot reveal ' + selector);
    }
    async function tap(selector, label = selector, pause = 160) {
      await reveal(selector); const r=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}); await page.touchscreen.tap(r.x,r.y); if (counting) gestures.push({ type: 'tap', label }); await wait(pause);
    }
    async function shot(name) { if (output) await page.screenshot({ path: path.join(output, name + '.png') }); }
    async function shortcut(key) { await page.keyboard.down('Control'); await page.keyboard.press(key); await page.keyboard.up('Control'); await wait(450); }

    await tap('#homeNewSongBtn', 'Новая песня');
    await tap('[onclick="addSection(\'Verse\')"]', 'Куплет');
    await page.waitForSelector('.add-square-btn');
    for (let i = 0; i < 3; i++) { await tap('.add-square-btn', '+ квадрат', 600); await page.waitForFunction(n=>sections[0].squares.length===n,{},i+2); }
    check('новая песня, одна секция, четыре аккордовых квадрата', await page.evaluate(() => sections.length === 1 && sections[0].squares.length === 4 && sections[0].squares.every(s => !s.type)), await page.evaluate(() => sections.map(s => ({id:s.id,squares:s.squares.length}))));
    await tap('.chord-input', 'Первая аккордовая ячейка');
    await tap('.chord-input', 'Открыть круг аккордов');
    await page.waitForSelector('#chordWheelModal.open');
    await tap('#circleSvg .wheel-sector[data-wheel-chord-identity="Em"]', 'Em в круге');
    check('Em введён касанием круга, не изменением модели', await page.evaluate(() => sections[0].squares[0].events[0].chord === 'Em'));
    await tap('.chord-input', 'Выбрать Em для настройки боя');
    await tap('.chord-btn-strum', 'Ритм Em');
    await tap('[data-preset-id="six"]', 'Бой «Шестёрка»');
    await tap('#save-pattern', 'Сохранить бой');
    await page.waitForSelector('.add-tab-btn');
    await tap('.add-tab-btn', 'Таб');
    await page.waitForSelector('.tab-at-host svg', { timeout: 30000 }); await wait(700);
    await tap('[data-tab-position]', 'Позиция');
    // Native popup вне DOM: CDP не маршрутизирует в него touch/mouse.
    // Не имитируем успешное касание: отдельный native-select в журнале.
    await page.keyboard.press('Escape'); await page.select('[data-tab-position]', '0');
    gestures.push({ type: 'native-select', label: 'В начале секции (автоматизирован выбор в системном списке)' }); await wait(160);
    check('нативный список: выбрано начало секции через UI', await page.evaluate(() => tabInsertEditorState.position === 0));
    for (const d of [0, 3]) { await tap(`[data-tab-digit="${d}"]`, 'Лад ' + d, 820); await tap('[data-tab-time-step="1"]', 'Следующая четверть'); }
    await tap('[data-tab-string-step="1"]', '5-я струна');
    for (const d of [0, 2]) { await tap(`[data-tab-digit="${d}"]`, 'Лад ' + d, 820); if(d===0)await tap('[data-tab-time-step="1"]', 'Следующая четверть'); }
    const expected = await notes(page);
    check('четыре четверти E2 G2 A2 B2 на струнах 6/5', expected.map(n => `${n.start}:${n.string}:${n.fret}:${n.dur}`).join() === '0:0:0:1,1:0:3:1,2:1:0:1,3:1:2:1', expected);
    check('курсор без десятичной доли: «доля 4»', await page.$eval('.tab-at-cursor-readout', e => e.textContent.includes('доля 4 ·') && !e.textContent.includes('4.75')));
    check('нет системного текстового поля и сжатия viewport при вводе', await page.evaluate(() => !document.activeElement.matches('input,textarea') && Math.abs(visualViewport.height - 844) < 2));
    const geometry = [];
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      await shot(`editor-${theme}-390`);
    }
    for (const width of [390, 1024]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 768, isMobile: true, hasTouch: true }); await wait(550);
      const g = await page.evaluate(() => {
        const body = document.querySelector('.tab-editor-body'), host = document.querySelector('.tab-at-host'), label = document.querySelector('[data-tab-position]').previousElementSibling;
        const b = body.getBoundingClientRect(), l = label.getBoundingClientRect();
        return { width: innerWidth, tools: getComputedStyle(document.querySelector('.tab-tools')).display,
          credit: host.textContent.includes('rendered by alphaTab'), hostOverflow: host.scrollWidth - host.clientWidth,
          position: { text: label.textContent, width: l.width, scroll: label.scrollWidth, right: l.right },
          digits: [...document.querySelectorAll('[data-tab-digit]')].map(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { text: e.textContent, w: r.width, h: r.height, visible: r.top >= b.top && r.bottom <= b.bottom && r.right <= innerWidth && !!hit && e.contains(hit) }; }) };
      }); geometry.push(g);
      check(`${width}: все 10 цифр видны, настоящие цели не меньше 44 px`, g.tools !== 'none' && g.digits.length === 10 && g.digits.every(n => n.visible && n.w >= 44 && n.h >= 44), g);
      check(`${width}: Позиция целиком, стан не прокручивается вбок`, g.position.text === 'Позиция' && g.position.scroll <= g.position.width + 1 && g.position.right < width && g.hostOverflow <= 1, g);
      check(`${width}: рекламной подписи нет`, !g.credit);
      await shot(`editor-dark-${width}`);
    }
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await wait(500);
    await tap('[data-tab-apply]', 'Применить'); counting = false;
    check('TAB перед Em, четыре исходных квадрата остались', await page.evaluate(() => sections[0].squares.length === 5 && sections[0].squares[0].type === 'tab' && sections[0].squares[1].events[0].chord === 'Em'));
    const acceptance = { taps: gestures.filter(g => g.type === 'tap').length, nativeSelections: gestures.filter(g => g.type === 'native-select').length, scrolls: gestures.filter(g => g.type === 'scroll').length, gestures };
    console.log('ACCEPTANCE ' + JSON.stringify(acceptance));
    await reveal('.section-card .tab-insert'); await shot('result-390');
    // Нужен именно Ctrl+Z после размещения перед Em, не только после набора.
    await page.evaluate(() => document.activeElement.blur()); await shortcut('KeyZ');
    check('один Ctrl+Z убрал всю новую вставку, Em и четыре квадрата остались', await page.evaluate(() => sections[0].squares.length === 4 && sections[0].squares.every(s => s.type !== 'tab') && sections[0].squares[0].events[0].chord === 'Em'));
    await shortcut('KeyY');
    check('один Redo вернул позицию и все четыре ноты', await page.evaluate(()=>sections[0].squares[0].type==='tab') && isDeepStrictEqual(await page.evaluate(()=>sections[0].squares[0].notes),expected));
    await reveal('.section-card .tab-insert'); await page.tap('.section-card .tab-insert'); await page.waitForSelector('.tab-at-host svg'); await wait(500);
    check('повторное открытие редактора показывает те же ноты', isDeepStrictEqual(await notes(page),expected));
    // Лад 12, затем вернуть исходный черновик одним Ctrl+Z.
    await reveal('[data-tab-digit="1"]');
    const digitPoints=await page.evaluate(()=>[1,2].map(n=>{const r=document.querySelector(`[data-tab-digit="${n}"]`).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}));
    await page.touchscreen.tap(digitPoints[0].x,digitPoints[0].y); await wait(50); await page.touchscreen.tap(digitPoints[1].x,digitPoints[1].y); await wait(820);
    check('экранные 1 → 2 дают один лад 12', (await notes(page)).some(n => n.start === 0 && n.fret === 12));
    await shortcut('KeyZ'); check('двузначный лад отменяется одним шагом черновика', isDeepStrictEqual(await notes(page),expected));
    await page.keyboard.press('Digit2'); await page.keyboard.press('Digit4'); await wait(820);
    check('клавиатурные 2 → 4 дают лад 24', (await notes(page)).some(n => n.start === 0 && n.fret === 24));
    await shortcut('KeyZ'); check('лад 24 тоже один шаг отмены', isDeepStrictEqual(await notes(page),expected));
    // Созвучие без возврата назад: после цифр курсор остался на 0.
    await tap('[data-tab-string-step="1"]', '', 40); await tap('[data-tab-digit="2"]', '', 820);
    await tap('[data-tab-string-step="1"]', '', 40); await tap('[data-tab-digit="2"]', '', 820);
    check('панель: три ноты на одной доле, не последовательность', (await notes(page)).filter(n => n.start === 0).length === 3, await notes(page));
    await shortcut('KeyZ'); await shortcut('KeyZ');
    check('отмена экранного созвучия сохранила исходную фразу', isDeepStrictEqual(await notes(page),expected));
    // Тот же способ с физическими клавишами. Курсор в начале на струне 4.
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('Digit2'); await wait(820);
    check('клавиатура: другая струна добавляет одновременную ноту', (await notes(page)).filter(n => n.start === 0).length === 2);
    await shortcut('KeyZ');
    check('подсказка содержит двузначный лад и созвучие и видна на телефоне', await page.$eval('.tab-editor-hint', e => e.textContent.includes('Лады 10–24') && e.textContent.includes('Созвучие') && getComputedStyle(e).display !== 'none'));
    await page.tap('[data-tab-cancel]');
    // Правка существующего таба отменяется отдельно, не удаляет его.
    await reveal('.section-card .tab-insert'); await page.tap('.section-card .tab-insert'); await page.waitForSelector('.tab-at-host svg');
    await tap('[data-tab-digit="5"]', '', 820); await page.tap('[data-tab-apply]');
    await page.evaluate(() => document.activeElement.blur()); await shortcut('KeyZ');
    check('Undo повторной правки не удаляет уже существующую вставку', await page.evaluate(()=>sections[0].squares.length===5) && isDeepStrictEqual(await page.evaluate(()=>sections[0].squares[0].notes),expected));

    // Настоящий скачиваемый Blob, а не собственноручно собранный fixture.
    await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = function (blob) { window.__touchBlob = blob; return original.call(this, blob); }; });
    await reveal('[onclick="exportSong()"]'); await page.tap('[onclick="exportSong()"]'); await page.tap('#gpExportStruchordBtn');
    const saved = await page.evaluate(async () => await __touchBlob.text());
    check('экспорт песни содержит четыре ноты и четыре аккордовых квадрата', JSON.parse(saved).sections[0].squares.length === 5);
    if (output) fs.writeFileSync(path.join(output, 'four-notes-before-em.struchord'), saved);
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(()=>document.fonts.ready); await wait(350);
    const reopenFile=path.join(require('os').tmpdir(),`struchord-touch-${process.pid}.struchord`); fs.writeFileSync(reopenFile,saved);
    const chooserPromise=page.waitForFileChooser(); await page.tap('#homeImportSongBtn'); const chooser=await chooserPromise; await chooser.accept([reopenFile]);
    try { await page.waitForSelector('.section-card .tab-insert',{visible:true}); } catch(e) { console.error('IMPORT DIAGNOSTIC',await page.evaluate(()=>({sections,bodyClass:document.body.className,html:document.querySelector('#sectionsContainer')?.innerHTML.slice(0,200),renderDepth,needsRender,toast:document.querySelector('#toast')?.textContent,hidden:document.hidden}))); throw e; }
    await page.waitForFunction(() => sections[0]?.squares[0]?.notes?.length === 4); fs.unlinkSync(reopenFile);
    check('перезагрузка + реальный FileReader: те же ноты после открытия файла', isDeepStrictEqual(await page.evaluate(()=>sections[0].squares[0].notes),expected));
    await reveal('.section-card .tab-insert'); await shot('reopened-390');
    await page.tap('.section-card .tab-insert'); await page.waitForSelector('.tab-at-host svg'); await wait(500);
    check('редактор после открытия файла: все струны/лады/время прежние', isDeepStrictEqual(await notes(page),expected)); await shot('reopened-editor-390'); await page.tap('[data-tab-cancel]');
    await page.evaluate(() => toggleTimelineMode(true)); await wait(250);
    await page.$eval('#timelineTrack .tab-insert', e => e.scrollIntoView({ block: 'center', inline: 'start' })); await wait(200);
    check('Лента показывает четыре ноты перед Em, без наложенного боя', await page.evaluate(() => document.querySelectorAll('#timelineTrack .tab-insert [data-tab-note]').length === 4 && !document.querySelector('#timelineTrack .tl-cell--tab .event-strum-preview'))); await shot('timeline-390');
    // Подключение к реальному мастер-выходу; synth/планировщик не подменяем.
    await page.evaluate(async () => {
      if (countInEnabled) toggleCountIn(); if (!playbackState.metronomeMuted) toggleMetronome();
      const ctx = getAudioContext(); ensureGuitarBus(ctx);
      window.__touchAudio = { chunks: [], plucks: [], kind: 'chord', start: null };
      const url = URL.createObjectURL(new Blob([`registerProcessor('touch-capture', class extends AudioWorkletProcessor { process(inputs) { const pcm=inputs[0]?.[0]; if(pcm) this.port.postMessage({time:currentTime,pcm:pcm.slice()}); return true; } });`], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      const tap = new AudioWorkletNode(ctx, 'touch-capture', { outputChannelCount: [1] }); tap.port.onmessage = e => __touchAudio.chunks.push(e.data);
      (guitarMasterPanner || masterFilters[masterFilters.length-1]).connect(tap); tap.connect(ctx.destination);
      const pluck = pluckString, tab = playTabNotesAt;
      window.pluckString = function (ctx, opts) { const result = pluck(ctx, opts); __touchAudio.plucks.push({ kind: __touchAudio.kind, freq: opts.freq, start: opts.startTime, duration: opts.duration }); return result; };
      window.playTabNotesAt = function (...args) { __touchAudio.start = args[1]; __touchAudio.kind = 'tab'; try { return tab(...args); } finally { __touchAudio.kind = 'chord'; } };
    });
    await reveal('#btnPlay'); await page.tap('#btnPlay');
    await page.waitForFunction(() => __touchAudio.start !== null && getAudioContext().currentTime >= __touchAudio.start + 1.1, { timeout: 8000 }); await shot('playing-tab-390');
    await page.waitForFunction(() => getAudioContext().currentTime >= __touchAudio.start + 2.2, { timeout: 5000 }); await shot('playing-em-390');
    await page.waitForFunction(() => getAudioContext().currentTime >= __touchAudio.start + 3.1, { timeout: 5000 });
    const audio = await page.evaluate(() => ({ start: __touchAudio.start, plucks: __touchAudio.plucks, sampleRate: getAudioContext().sampleRate,
      chunks: __touchAudio.chunks.filter(c => c.time >= __touchAudio.start && c.time < __touchAudio.start+3.1).map(c => ({ time: c.time, pcm: Array.from(c.pcm) })) }));
    await page.evaluate(() => stopPlayback());
    const tab = audio.plucks.filter(n => n.kind === 'tab'), chord = audio.plucks.filter(n => n.kind === 'chord');
    check('звук: четыре реальные ноты E2 G2 A2 B2', tab.length === 4 && tab.every((n,i) => Math.abs(n.freq - [82.406889,97.998859,110,123.470825][i]) < .01), tab);
    check('звук: ноты в 0/0.5/1/1.5 с, Em не раньше 2 с', tab.every((n,i) => Math.abs(n.start-audio.start-i*.5)<.001) && chord.length > 6 && chord.every(n => n.start>=audio.start+2-.001) && Math.abs(chord[0].start-audio.start-2)<.001, chord);
    const levels = [0,1,2,3].map(i => { const v=audio.chunks.filter(c=>c.time>=audio.start+i*.5+.1 && c.time<audio.start+i*.5+.4).flatMap(c=>c.pcm); return Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length); });
    check('настоящий PCM мастер-выхода: все четыре ноты ненулевые', levels.every(v=>v>.00001), levels);
    if (output) {
      const pcm=audio.chunks.flatMap(c=>c.pcm), wav=Buffer.alloc(44+pcm.length*2); wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(audio.sampleRate,24);wav.writeUInt32LE(audio.sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));fs.writeFileSync(path.join(output,'playback.wav'),wav);
    }
    delete audio.chunks;
    check('нет ошибок страницы', errors.length===0, errors);
    if (output) { const html=fs.readFileSync(path.join(root,'STRUCHORD.html')); fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({version:'0.675',sha256:crypto.createHash('sha256').update(html).digest('hex'),bytes:html.length,checks,errors,geometry,acceptance,audio,levels},null,2)+'\n'); }
    console.log(`${checks.length} ok / 0 FAIL`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack);process.exitCode=1; });
