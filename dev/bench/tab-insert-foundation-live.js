#!/usr/bin/env node
/* Приёмка основы B-12.12 (0.668), НЕ полная приёмка волны.
 * STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html node dev/bench/tab-insert-foundation-live.js
 * Настоящий FileReader, загрузка/экспорт, перезагрузка страницы, указатель,
 * Ctrl+Z/Y, геометрия, планировщик и скриншоты обеих тем/размеров.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..', '..');
const output = path.resolve(process.env.B12_TAB_RESULTS || path.join(__dirname, 'results', 'tab-insert-0.668'));
const url = new URL(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html');
url.searchParams.set('view', 'editor');
const htmlBytes = fs.readFileSync(path.join(root, 'STRUCHORD.html'));
const artifact = { sha256: crypto.createHash('sha256').update(htmlBytes).digest('hex'), bytes: htmlBytes.length };
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'dev/fixtures/b12-tab-insert.struchord'), 'utf8'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [];
let browser;
function check(name, condition, details) {
  checks.push({ name, ok: !!condition, ...(details === undefined ? {} : { details }) });
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${details === undefined ? '' : ' — ' + JSON.stringify(details)}`);
  assert.ok(condition, name);
}
async function importFile(page, song) {
  return page.evaluate(data => new Promise((resolve, reject) => {
    const previous = document.querySelector('.section-card .tab-insert');
    const started = performance.now();
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Таб не появился после импорта')); }, 10000);
    const observer = new MutationObserver(() => {
      const tab = document.querySelector('.section-card .tab-insert');
      if (!tab || tab === previous || tab.querySelectorAll('[data-tab-note]').length !== data.sections[0].squares[0].notes.length) return;
      observer.disconnect(); clearTimeout(timeout);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - started)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    importSong(new File([JSON.stringify(data)], 'tab-foundation.struchord', { type: 'application/json' }));
  }), song);
}
async function model(page) {
  return page.evaluate(() => ({ notes: sections[0].squares[0].notes, beats: sections[0].squares[0].beats, ids: sections[0].squares.map(s => s.id) }));
}
async function capture(page, theme, width, height, view) {
  await page.mouse.move(2, 2);
  await page.setViewport({ width, height });
  await page.evaluate(({ theme, view }) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('struchord-theme', theme);
    toggleTimelineMode(view === 'timeline');
  }, { theme, view });
  await wait(180);
  if (view === 'editor') await page.$eval('.section-card', node => node.scrollIntoView({ block: 'center' }));
  else await page.$eval('#timelineStage', node => node.scrollIntoView({ block: 'center' }));
  await wait(350); // Дождаться ухода подсказки после настоящего pointerout.
  const metrics = await page.evaluate(view => {
    const tab = document.querySelector(view === 'editor' ? '.section-card .tab-insert' : '#timelineTrack .tab-insert');
    const rect = tab.getBoundingClientRect();
    const container = tab.closest(view === 'editor' ? '.square-inner' : '.tl-cell');
    const bounds = container.getBoundingClientRect();
    const notes = [...tab.querySelectorAll('.tab-fret-number')].map(node => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
        visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!hit && tab.contains(hit),
        inside: r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1 };
    });
    const badge = tab.querySelector('.tab-insert-count').getBoundingClientRect();
    return { width: rect.width, height: rect.height, containerHeight: bounds.height, scrollY,
      badgeInside: badge.left >= bounds.left && badge.right <= bounds.right + 1 && badge.bottom <= bounds.bottom + 1,
      notes, beats: getSquareBeats(sections[0].squares[0], sections[0].timeSig || globalTimeSig) };
  }, view);
  check(`${view} ${theme} ${width}×${height}: все четыре ноты и счётчик внутри рамки`, metrics.notes.length === 4 && metrics.notes.every(n => n.inside && n.visible) && metrics.badgeInside, metrics);
  check(`${view} ${theme}: низкая 6-я струна ниже 5-й`, metrics.notes[0].y > metrics.notes[2].y);
  await page.screenshot({ path: path.join(output, `${view}-${theme}-${width}x${height}.png`) });
  return { view, theme, viewport: { width, height }, ...metrics };
}
// Оригинальный pluckString создаёт настоящие источники. AudioWorklet пишет
// PCM мастер-выхода на аудиопотоке: холодный расчёт аппликатуры в UI не
// сдвигает окно измерения первой ноты и не подменяет звук заглушкой.
async function exerciseAudio(sourcePage, saved) {
  const evidence = [];
  for (const view of ['editor', 'timeline']) {
    // Независимые запуски: не измеряем деку предыдущего Em на первой ноте.
    const page = await sourcePage.browser().newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.goto(sourcePage.url(), { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready); await wait(350);
      await importFile(page, saved);
      await page.evaluate(async () => {
        const probe = window.__tabAudio = { plucks: [], nativeSources: [], tabEvents: [], chunks: [], kind: 'accompaniment' };
        const ctx = getAudioContext(); ensureGuitarBus(ctx);
        const moduleUrl = URL.createObjectURL(new Blob([`
          registerProcessor('tab-acceptance-capture', class extends AudioWorkletProcessor {
            process(inputs) {
              const pcm = inputs[0]?.[0];
              if (pcm) this.port.postMessage({ time: currentTime, pcm: pcm.slice() });
              return true;
            }
          });`], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(moduleUrl); URL.revokeObjectURL(moduleUrl);
        const tap = new AudioWorkletNode(ctx, 'tab-acceptance-capture', { outputChannelCount: [1] });
        tap.port.onmessage = event => probe.chunks.push(event.data);
        (guitarMasterPanner || masterFilters[masterFilters.length - 1]).connect(tap);
        tap.connect(ctx.destination); // Выход процессора нулевой: звук не удваивается.
        const createSource = ctx.createBufferSource.bind(ctx);
        ctx.createBufferSource = () => {
          const node = createSource(), start = node.start.bind(node);
          node.start = (...args) => {
            probe.nativeSources.push({ kind: probe.kind, start: args[0], calledAt: ctx.currentTime, frames: node.buffer?.length });
            return start(...args);
          };
          return node;
        };
        const originalPluck = pluckString, originalTab = playTabNotesAt;
        window.pluckString = (ctx, opts) => {
          const before = activeOscillators.size, requestedAt = ctx.currentTime;
          const result = originalPluck(ctx, opts);
          probe.plucks.push({ kind: probe.kind, requestedAt, createdAt: ctx.currentTime, freq: opts.freq, start: opts.startTime, duration: opts.duration,
            pan: opts.pan, sound: opts.sound || songSoundNow,
            createdSources: activeOscillators.size - before,
            bufferFrames: [...activeOscillators].at(-1)?.buffer?.length || 0 });
          return result;
        };
        window.playTabNotesAt = (...args) => {
          probe.kind = 'tab'; probe.tabEvents.push({ start: args[1], bpm: args[2], timeSig: args[3] });
          try { return originalTab(...args); } finally { probe.kind = 'accompaniment'; }
        };
      });
      await page.evaluate(view => toggleTimelineMode(view === 'timeline'), view);
      await page.evaluate(() => {
        __tabAudio.plucks = []; __tabAudio.nativeSources = []; __tabAudio.tabEvents = []; __tabAudio.chunks = [];
        if (countInEnabled) toggleCountIn();
        if (!playbackState.metronomeMuted) toggleMetronome();
      });
      await page.click('#btnPlay');
      await page.waitForFunction(() => __tabAudio.tabEvents.length === 1 && getAudioContext().state === 'running', { timeout: 5000 });
      await page.waitForFunction(() => getAudioContext().currentTime >= __tabAudio.tabEvents[0].start + 1.73, { timeout: 4000, polling: 15 });
      const activeTab = await page.evaluate(view => !!document.querySelector(view === 'editor'
        ? '.section-card .tab-insert.playback-active' : '#timelineTrack .tl-cell--tab.tl-active'), view);
      await page.waitForFunction(() => getAudioContext().currentTime >= __tabAudio.tabEvents[0].start + 2.18, { timeout: 3000, polling: 15 });
      const result = await page.evaluate(() => ({ start: __tabAudio.tabEvents[0].start, plucks: __tabAudio.plucks.slice(),
        context: getAudioContext().state, sampleRate: getAudioContext().sampleRate, nativeSources: __tabAudio.nativeSources,
        tabHighlightCleared: !document.querySelector('.section-card .tab-insert.playback-active'),
        chordHighlighted: !!document.querySelector('.section-card .chord-wrapper.playback-active') }));
      await page.click(view === 'editor' ? '#btnPlay' : '#btnStop');
      const countAtStop = await page.evaluate(() => __tabAudio.plucks.length);
      await wait(350);
      const levels = await page.evaluate(() => {
        const probe = __tabAudio, rate = getAudioContext().sampleRate, start = probe.tabEvents[0].start;
        return [0, 1, 2, 3].map(i => {
          const from = start + i * 0.5 + 0.08, to = start + i * 0.5 + 0.4;
          const pcm = probe.chunks.filter(c => c.time >= from && c.time < to).flatMap(c => Array.from(c.pcm));
          const rms = Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length);
          // Период, а не самый громкий обертон: у гитары вторая гармоника
          // бывает громче основного тона. Ищем первый сильный локальный пик
          // нормированной автокорреляции в диапазоне басовой фразы 60–160 Гц.
          const samples = pcm.filter((_, index) => index % 8 === 0), sampleRate = rate / 8;
          const correlations = [], minimum = Math.floor(sampleRate / 160), maximum = Math.ceil(sampleRate / 60);
          for (let lag = minimum - 1; lag <= maximum + 1; lag++) {
            let xy = 0, xx = 0, yy = 0;
            for (let k = lag; k < samples.length; k++) {
              const x = samples[k], y = samples[k - lag]; xy += x * y; xx += x * x; yy += y * y;
            }
            correlations[lag] = xy / Math.sqrt(xx * yy);
          }
          const peaks = [];
          for (let lag = minimum; lag <= maximum; lag++) if (correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) {
            peaks.push({ lag, correlation: correlations[lag] });
          }
          const strongest = Math.max(...peaks.map(p => p.correlation));
          const peak = peaks.find(p => p.correlation >= strongest * 0.95);
          return { rms, peakHz: peak ? sampleRate / peak.lag : 0, periodCorrelation: peak?.correlation || 0,
            frames: pcm.length, from: from - start, to: to - start };
        });
      });
      const tab = result.plucks.filter(n => n.kind === 'tab');
      const chord = result.plucks.filter(n => n.kind !== 'tab');
      const expectedHz = [82.4068892282, 97.9988589954, 110, 130.81278265];
      check(`${view}: четыре реальных источника E2 G2 A2 C3`, tab.length === 4 && tab.every((n, i) =>
        Math.abs(n.freq - expectedHz[i]) < 0.01 && n.createdSources === 1 && n.bufferFrames > 0 && Number.isFinite(n.pan)), tab);
      check(`${view}: старты 0 / 0.5 / 1 / 1.5 с, четверти по 0.5 с`, tab.every((n, i) =>
        Math.abs(n.start - result.start - i * 0.5) < 0.001 && Math.abs(n.duration - 0.5) < 0.001));
      check(`${view}: все четыре ноты поставлены в Web Audio заранее, не в прошлом`, tab.every(n => n.createdAt < n.start),
        tab.map(n => ({ leadMs: (n.start - n.createdAt) * 1000 })));
      check(`${view}: PCM ненулевой, основные частоты соответствуют четырём нотам`, levels.every((n, i) =>
        n.frames > 10000 && n.rms > 0.00001 && n.periodCorrelation > 0.7 && Math.abs(n.peakHz - expectedHz[i]) < 3), levels);
      check(`${view}: до 2 с нет щипков аккомпанемента; Em начинается на 2 с`, chord.length > 0 && result.nativeSources.filter(n => n.start < result.start + 2 - 0.001).length === 4 &&
        chord.every(n => n.start >= result.start + 2 - 0.001) && Math.abs(chord[0].start - result.start - 2) < 0.001);
      check(`${view}: подсветка переходит с таба на Em`, activeTab && result.tabHighlightCleared && result.chordHighlighted);
      check(`${view}: ${view === 'editor' ? 'Пауза' : 'Стоп'} убирает источники и не планирует новые`, await page.evaluate(count =>
        !playbackState.isPlaying && activeOscillators.size === 0 && __tabAudio.plucks.length === count, countAtStop));
      evidence.push({ view, ...result, levels });
    } finally { await page.close(); }
  }
  return evidence;
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  if (process.env.B12_TAB_AUDIO_ONLY !== '1') fs.rmSync(path.join(output, 'measurements.json'), { force: true });
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: 'shell',
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('dialog', async dialog => {
    // Пользователь подтверждает перезагрузку импортированной, ещё не сохранённой в библиотеку песни.
    if (dialog.type() === 'beforeunload') await dialog.accept();
    else { errors.push(`Unexpected ${dialog.type()}: ${dialog.message()}`); await dialog.dismiss(); }
  });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // Измеряем открытие из уже работающего приложения, не его стартовую анимацию.
  await wait(350);
  if (process.env.B12_TAB_AUDIO_ONLY === '1') { await exerciseAudio(page, fixture); return; }
  const openingMs = await importFile(page, fixture);
  check('файл открывается через реальный FileReader', (await model(page)).notes.length === 4, { openingMs });
  check('открытие тестовой песни ≤ 300 мс', openingMs <= 300, openingMs);
  const before = await page.$eval('.section-card .tab-insert', node => node.getBoundingClientRect().width);
  await page.evaluate(() => rerenderSectionSquaresDom(sections[0]));
  const after = await page.$eval('.section-card .tab-insert', node => ({ width: node.getBoundingClientRect().width, count: node.querySelectorAll('[data-tab-note]').length }));
  check('локальная перерисовка не меняет ширину и не убирает ноты', Math.abs(before - after.width) < 1 && after.count === 4, { before, after });
  // Настоящий диалог: клик, обновление списка, Отмена, применение, горячая отмена.
  await page.click('.section-card .tab-insert');
  await page.waitForSelector('.tab-insert-editor');
  const modal = await page.$eval('.tab-insert-editor', node => ({ position: getComputedStyle(node).position, rows: node.querySelectorAll('.tab-note-row').length }));
  check('мини-редактор — fixed overlay, четыре строки', modal.position === 'fixed' && modal.rows === 4, modal);
  await page.select('.tab-note-row[data-index="0"] [data-tab-field="string"]', '5');
  check('выбор первой струны передаёт индекс 5, без двойного пересчёта', await page.$eval('.tab-editor-preview [data-start="0"]', node => node.dataset.string) === '5');
  await page.select('.tab-note-row[data-index="0"] [data-tab-field="string"]', '0');
  check('выбор шестой струны передаёт индекс 0', await page.$eval('.tab-editor-preview [data-start="0"]', node => node.dataset.string) === '0');
  check('длительность 1 единица в 4/4 подписана как четверть', await page.$eval('.tab-note-row[data-index="0"] [data-tab-field="dur"]', node => node.selectedOptions[0].textContent) === '1/4');
  await page.screenshot({ path: path.join(output, 'modal-light-1440x900.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await wait(180);
  await page.screenshot({ path: path.join(output, 'modal-dark-1440x900.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.click('[data-tab-add]');
  check('после +ноту список показывает пять строк', await page.$$eval('.tab-insert-editor .tab-note-row', rows => rows.length) === 5);
  check('черновик ещё не изменил песню', (await model(page)).notes.length === 4);
  await page.click('[data-tab-cancel]');
  check('Отмена оставляет четыре ноты', (await model(page)).notes.length === 4);
  await page.click('.section-card .tab-insert');
  await page.click('[data-tab-add]');
  await page.click('[data-tab-apply]');
  check('применение добавляет пятую ноту и ровно один такт', (await model(page)).notes.length === 5 && (await model(page)).beats === 8);
  await wait(500); // Мышь неподвижна над аккордом под закрытым окном: лишнего снимка быть не должно.
  check('закрытие диалога не создаёт скрытую правку аппликатуры', await page.evaluate(() => historyDebugState().length === 2));
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForFunction('sections[0].squares[0].notes.length === 4');
  check('Ctrl+Z отменяет всю правку диалога', (await model(page)).beats === 4);
  await wait(500);
  await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control');
  await page.waitForFunction('sections[0].squares[0].notes.length === 5');
  check('Ctrl+Y возвращает правку диалога', (await model(page)).beats === 8);
  await importFile(page, fixture);
  // Действительные кнопки операций + клавиатурная история, не прямой вызов Undo.
  const ids = () => page.evaluate(() => sections[0].squares.map(sq => sq.id).join(','));
  const shortcut = async key => { await page.keyboard.down('Control'); await page.keyboard.press(key); await page.keyboard.up('Control'); };
  await page.hover('.section-card .square--tab');
  await page.click('.section-card .square--tab [title="Переместить таб вниз"]');
  check('кнопка переноса меняет порядок TAB / Em', await ids() === '102,101');
  await page.click('.section-card .square--tab [title="Копировать таб-вставку"]');
  check('кнопка копирования создаёт независимый таб с четырьмя нотами', await page.evaluate(() => sections[0].squares.length === 3 && sections[0].squares[2].notes.length === 4 && sections[0].squares[2].notes !== sections[0].squares[1].notes));
  await shortcut('z'); await page.waitForFunction(() => sections[0].squares.length === 2);
  check('Ctrl+Z отменяет копию, но не перенос', await ids() === '102,101');
  await shortcut('z'); await page.waitForFunction(() => sections[0].squares[0].id === 101);
  check('следующий Ctrl+Z возвращает порядок до переноса', await ids() === '101,102');
  await shortcut('y'); await page.waitForFunction(() => sections[0].squares[0].id === 102);
  check('Ctrl+Y возвращает перенос', await ids() === '102,101');
  await shortcut('y'); await page.waitForFunction(() => sections[0].squares.length === 3);
  check('следующий Ctrl+Y возвращает копию нот', await page.evaluate(() => sections[0].squares[2].notes.map(n => n.fret).join(',') === '0,3,0,3'));
  await page.select('#globalTimeSig', '6/8');
  check('смена размера через UI сохраняет ноты и целые такты без фиктивных аккордов', await page.evaluate(() => globalTimeSig === '6/8' && sections[0].squares.filter(sq => sq.type === 'tab').every(sq => sq.beats === 12 && sq.events.length === 0 && sq.notes.map(n => n.start).join(',') === '0,2,4,6' && sq.notes.every(n => n.dur === 2))));
  await importFile(page, fixture);
  const dimensions = [];
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
      dimensions.push(await capture(page, theme, width, height, 'editor'));
      dimensions.push(await capture(page, theme, width, height, 'timeline'));
    }
  }
  await page.evaluate(() => toggleTimelineMode(false));
  // Скачиваем реальный Blob, перезагружаем и открываем ИМЕННО скачанное.
  await page.evaluate(() => {
    window.__tabNativeDownload = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, click: HTMLAnchorElement.prototype.click };
    URL.createObjectURL = blob => { window.__tabDownload = blob; return 'blob:tab-acceptance'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () { window.__tabDownloadName = this.download; };
  });
  const downloaded = await page.evaluate(async () => {
    await exportStruchordFile();
    return { name: window.__tabDownloadName, text: await window.__tabDownload.text() };
  });
  await page.evaluate(() => {
    URL.createObjectURL = __tabNativeDownload.create; URL.revokeObjectURL = __tabNativeDownload.revoke;
    HTMLAnchorElement.prototype.click = __tabNativeDownload.click; delete window.__tabNativeDownload;
  });
  const saved = JSON.parse(downloaded.text);
  check('скачанный файл хранит четыре ноты и тип tab', downloaded.name.endsWith('.struchord') && saved.sections[0].squares[0].type === 'tab' && saved.sections[0].squares[0].notes.length === 4);
  fs.writeFileSync(path.join(output, 'four-notes-before-em.struchord'), downloaded.text);
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  const reopenedMs = await importFile(page, saved);
  check('после перезагрузки открывается скачанный файл, ноты те же', JSON.stringify((await model(page)).notes) === JSON.stringify(saved.sections[0].squares[0].notes), { reopenedMs });
  await page.setViewport({ width: 1440, height: 900 });
  await page.$eval('.section-card', node => node.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, 'reopened-1440x900.png') });
  const order = await page.evaluate(() => {
    let si = 0, sqi = 0, ei = 0, walk = structureWalkState(null);
    const sr = {}, qr = {}, out = [];
    for (let i = 0; i < 20; i++) {
      const n = findNextEvent(si, sqi, ei, sr, qr, walk);
      if (!n) return { done: true, events: out };
      out.push({ tab: !!n.event.isTab, chord: n.event.chord, span: n.event.span });
      si = n.sectionIndex; sqi = n.squareIndex; ei = n.eventIndex + 1; walk = n.walk;
    }
    return { done: false, events: out };
  });
  check('планировщик: TAB + 4 Em, 20 долей, затем конец', order.done && order.events.length === 5 && order.events[0].tab && order.events.reduce((sum, n) => sum + n.span, 0) === 20, order);
  const audio = await exerciseAudio(page, saved);
  check('нет ошибок выполнения и консоли', errors.length === 0, errors);
  const results = { version: '0.668', date: '2026-10-20', browser: await browser.version(), url: url.href,
    artifact, openingMs, reopenedMs, timingMethod: 'FileReader → новый TAB DOM → два requestAnimationFrame; стартовая анимация приложения исключена', dimensions, order, audio, checks, errors,
    limitations: ['Не полная приёмка Going to the Run', 'Клавиатурный ввод и бюджет ввода ещё не реализованы', 'GP/MIDI-экспорт и транспонирование — следующие этапы'] };
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
  fs.rmSync(path.join(output, 'failure.json'), { force: true });
  console.log(`\n${checks.length} checks passed; evidence: ${output}`);
})().catch(error => {
  if (process.env.B12_TAB_AUDIO_ONLY !== '1') fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ artifact, checks, errors, error: error.stack }, null, 2) + '\n');
  console.error(error.stack); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
