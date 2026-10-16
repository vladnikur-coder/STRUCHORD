#!/usr/bin/env node
/* Браузерная приёмка B-12.9.9: экспорт в настоящий бинарный Guitar Pro 5 (.gp5)
 * из настоящей страницы в headless Chromium.
 *
 * Нужен локальный сервер: python3 -m http.server 8000 в корне репозитория.
 * Проверяет:
 *  1. в окне выбора формата есть третий пункт — Guitar Pro 5 (.gp5);
 *  2. клик по нему отдаёт бинарный файл с заголовком FICHIER GUITAR PRO v5.10;
 *  3. отчёт честно говорит, что повтор остался повтором, а не копией тактов;
 *  4. круг: тот же файл импортируется обратно — дорожки, ноты, текст и
 *     нативный повтор совпадают, темп доезжает, консоль чистая.
 */
const fs = require('fs');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};

(async () => {
  const song = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gp-export-roundtrip-song.json'), 'utf8'));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1440, height: 1000 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?view=editor&acc=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate((value) => {
    localStorage.setItem('struchord_songs', JSON.stringify([value]));
    loadSong(0);
  }, song);
  await page.waitForFunction('(songParts || []).length === 3', { timeout: 20000 });
  ok('песня из трёх дорожек загрузилась в браузере', true);

  await page.evaluate(() => {
    window.__download = null;
    window.__downloadName = '';
    URL.createObjectURL = (blob) => { window.__download = blob; return 'blob:acc'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloadName = this.download; };
  });

  // 1. Окно выбора формата: третий пункт.
  await page.click('.toolbar button[onclick="exportSong()"]');
  await page.waitForSelector('#gpExportGp5Btn', { timeout: 15000 });
  ok('кнопка «Экспорт» открывает окно с пунктом Guitar Pro 5', true);
  const dialogText = await page.$eval('.strum-modal-content', (node) => node.textContent);
  ok('в окне все три формата: STRUCHORD, Guitar Pro 6 и Guitar Pro 5',
    /STRUCHORD/.test(dialogText) && /Guitar Pro 6/.test(dialogText) && /Guitar Pro 5/.test(dialogText));

  // 2. Экспорт в GP5 и отчёт.
  await page.click('#gpExportGp5Btn');
  await page.waitForFunction(() => !!window.__download, { timeout: 30000 });
  const downloaded = await page.evaluate(async () => ({
    name: window.__downloadName,
    base64: await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(window.__download);
    }),
  }));
  ok('файл называется .gp5', downloaded.name.endsWith('.gp5'), downloaded.name);
  const bytes = Buffer.from(downloaded.base64, 'base64');
  fs.writeFileSync('/tmp/acc-export.gp5', bytes);
  const header = bytes.slice(1, 31).toString('latin1');
  ok('файл начинается с FICHIER GUITAR PRO v5.10', /^FICHIER GUITAR PRO v5\.10/.test(header), header);
  ok('файл бинарный, а не текст GPIF', !bytes.slice(0, 4).toString('latin1').includes('<GPIF'));

  const reportText = await page.$eval('.strum-modal-overlay:last-of-type .strum-modal-content', (node) => node.textContent);
  ok('отчёт перечисляет перенесённое', /Перенесено/.test(reportText));
  ok('отчёт перечисляет потери', /Не переносится/.test(reportText));
  ok('отчёт говорит, что повтор записан нативным повтором Guitar Pro',
    /нативными повторами/.test(reportText), reportText.replace(/\s+/g, ' ').slice(0, 200));
  ok('отчёт называет версию файла 5.10', /5\.10/.test(reportText));
  console.log('   отчёт:', reportText.replace(/\s+/g, ' ').slice(0, 700));

  await page.evaluate(() => {
    document.querySelectorAll('.strum-modal-content').forEach((modal) => {
      const close = [...modal.querySelectorAll('button')].find((b) => /Готово|Закрыть|Понятно|OK/i.test(b.textContent));
      if (close) close.click();
    });
    document.querySelectorAll('.strum-modal-overlay').forEach((overlay) => overlay.remove());
  });

  // 3. Круг: тот же файл импортируется обратно.
  const before = await page.evaluate(() => ({
    sections: sections.length,
    squares: sections.reduce((sum, section) => sum + section.squares.length, 0),
    parts: songParts.length,
    notes: songParts.reduce((sum, part) => sum + Object.values(part.rolls || {}).flat().length
      + Object.values(part.pitchRolls || {}).flat().length, 0),
    detail: songParts.map((part) => `${part.instrument}:${Object.values(part.rolls || {}).flat().length}/${Object.values(part.pitchRolls || {}).flat().length}`).join(','),
    repeats: sections.map((section) => (section.squares || []).map((square) => square.repeat).join('/')),
    passes: sections.reduce((sum, section) => {
      const squareRepeat = Math.max(Number(section.repeat) || 1,
        ...(section.squares || []).map((square) => Number(square.repeat) || 1));
      return sum + (section.squares || []).length * squareRepeat;
    }, 0),
    bpm: Number(document.getElementById('bpmInput').value),
  }));
  const base64 = bytes.toString('base64');
  await page.evaluate(async (payload) => {
    const binary = atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    const file = new File([buffer], 'acc-export.gp5', { type: 'application/octet-stream' });
    window.importSong(file);
  }, base64);
  await page.waitForFunction(() => !!document.querySelector('#gp35TrackList'), { timeout: 20000 });
  const previewText = await page.$eval('.strum-modal-content', (node) => node.textContent);
  ok('приложение узнало свой файл GP5', /GP5\.10|GP5/.test(previewText), previewText.replace(/\s+/g, ' ').slice(0, 90));
  await page.evaluate(() => {
    const modal = [...document.querySelectorAll('.strum-modal-content')].find((m) => m.querySelector('#gp35TrackList'));
    const button = [...modal.querySelectorAll('button')].find((b) => /Импортировать/.test(b.textContent));
    button.click();
  });
  await page.waitForFunction(() => !document.querySelector('#gp35TrackList'), { timeout: 30000 });
  await sleep(600);
  const after = await page.evaluate(() => ({
    sections: sections.length,
    squares: sections.reduce((sum, section) => sum + section.squares.length, 0),
    parts: songParts.length,
    notes: songParts.reduce((sum, part) => sum + Object.values(part.rolls || {}).flat().length
      + Object.values(part.pitchRolls || {}).flat().length, 0),
    detail: songParts.map((part) => `${part.instrument}:${Object.values(part.rolls || {}).flat().length}/${Object.values(part.pitchRolls || {}).flat().length}`).join(','),
    repeats: sections.map((section) => (section.squares || []).map((square) => square.repeat).join('/')),
    passes: sections.reduce((sum, section) => {
      const squareRepeat = Math.max(Number(section.repeat) || 1,
        ...(section.squares || []).map((square) => Number(square.repeat) || 1));
      return sum + (section.squares || []).length * squareRepeat;
    }, 0),
    bpm: Number(document.getElementById('bpmInput').value),
  }));
  console.log('   до:', JSON.stringify(before));
  console.log('   после:', JSON.stringify(after));
  ok('круг: секции, такты и дорожки совпали',
    after.sections === before.sections && after.squares === before.squares && after.parts === before.parts,
    JSON.stringify({ before, after }));
  ok('круг: все ноты вернулись', after.notes === before.notes, `${before.notes} → ${after.notes}`);
  // Повтор живёт либо в секции (repeat), либо на квадрате (square.repeat) —
  // сравниваем число проходов, а не то, где именно поле оказалось.
  ok('круг: повтор вернулся повтором, а не копией тактов', after.passes === before.passes,
    `проходов ${before.passes} → ${after.passes}`);
  ok('темп доехал', after.bpm === before.bpm, `${before.bpm} → ${after.bpm}`);

  ok('в консоли браузера нет ошибок', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.error('АВАРИЯ:', error && error.message);
  process.exit(1);
});