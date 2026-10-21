#!/usr/bin/env node
// E4: настоящий Chromium, клик MIDI → Blob → независимый SMF parser.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const { parseMidi } = require('midi-file');
const root = path.resolve(__dirname, '../..');
const output = process.env.B12_E4_RESULTS ? path.resolve(process.env.B12_E4_RESULTS) : null;
const checks = [], errors = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); assert.ok(ok, detail || name); }
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell',
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
  try {
    const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html?view=editor', { waitUntil: 'load' });
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'dev/fixtures/b12-tab-insert.struchord'), 'utf8'));
    await page.evaluate(value => { localStorage.setItem('struchord_songs', JSON.stringify([value])); loadSong(0); }, fixture);
    await page.waitForFunction('sections.length === 1 && sections[0].squares[0].type === "tab"');
    for (const [width, height] of [[1280,800],[1440,900]]) for (const theme of ['light','dark']) {
      await page.setViewport({ width, height });
      await page.evaluate(theme => { document.documentElement.setAttribute('data-theme', theme); exportSong(); }, theme);
      await page.waitForSelector('#gpExportMidiBtn');
      const geometry = await page.evaluate(() => {
        const m = document.querySelector('#gpExportMidiBtn').closest('.strum-modal-content');
        const r = m.getBoundingClientRect(), b = m.querySelector('#gpExportCancelBtn').getBoundingClientRect();
        return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, cancelBottom:b.bottom, buttons:m.querySelectorAll('button').length, scroll:m.scrollHeight, client:m.clientHeight };
      });
      check(`четыре формата + Отмена, ${theme} ${width}×${height}`, geometry.buttons === 5);
      check(`диалог и Отмена не обрезаны, ${theme} ${width}×${height}`, geometry.y >= 0 && geometry.bottom <= height && geometry.cancelBottom <= height && geometry.scroll <= geometry.client + 1, JSON.stringify(geometry));
      if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `formats-${theme}-${width}x${height}.png`) }); }
      await page.click('#gpExportCancelBtn');
    }
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function (blob) { window.__e4Blob = blob; return original.call(this, blob); };
      document.addEventListener('click', e => { const a = e.target.closest('a[download]'); if (a) window.__e4Filename = a.download; }, true);
      exportSong();
    });
    await page.click('#gpExportMidiBtn'); await page.waitForSelector('#gpExportReportClose');
    const result = await page.evaluate(async () => ({ bytes: Array.from(new Uint8Array(await window.__e4Blob.arrayBuffer())), name: window.__e4Filename,
      report: document.querySelector('#gpExportReportClose').closest('.strum-modal-content').textContent,
      notes: sections[0].squares[0].notes, parts: songParts.length }));
    check('клик MIDI скачивает .mid', result.name.endsWith('.mid'));
    const midi = parseMidi(result.bytes); let at = 0;
    const on = midi.tracks[1].map(e => { at += e.deltaTime; return { ...e, at }; }).filter(e => e.type === 'noteOn');
    check('настоящий Blob — SMF format 1 / PPQ 960', midi.header.format === 1 && midi.header.ticksPerBeat === 960);
    check('в скачанном файле 4 ноты перед Em на своих долях', on.filter(e => e.at < 3840).map(e => `${e.at}:${e.noteNumber}`).join() === '0:40,960:43,1920:45,2880:48');
    check('после TAB есть аккомпанемент, не пустой файл', on.some(e => e.at >= 3840));
    check('отчёт называет SMF и ограничения, без GP-округления', result.report.includes('SMF format 1') && result.report.includes('MIDI хранит высоты') && !result.report.includes('17 ступенями'));
    check('экспорт не создаёт хранимых партий', result.parts === 0 && result.notes.length === 4);
    if (output) { await page.screenshot({ path: path.join(output, 'midi-report-dark-1440x900.png') }); }
    await page.click('#gpExportReportClose'); check('отчёт закрывается', !(await page.$('#gpExportReportClose')));
    check('нет ошибок страницы', errors.length === 0, errors.join(' | '));
    if (output) fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify({ checks, errors, filename: result.name, format: midi.header }, null, 2));
    console.log(`${checks.length} ok / 0 FAIL`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
