#!/usr/bin/env node
/* Браузерная приёмка B-12.9.8: экспорт в Guitar Pro 6 из настоящей страницы.
 *
 * Нужен локальный сервер: python3 -m http.server 8000 в корне репозитория
 * (как для b68-songmap-drag.js). Проверяет в headless Chromium:
 *  1. кнопка «Экспорт» открывает окно выбора формата;
 *  2. «Guitar Pro 6» отдаёт файл .gpx с контейнером BCFS/BCFZ и подробный
 *     модальный отчёт: что перенесено и что осталось в приложении;
 *  3. круг: этот же файл импортируется обратно тем же окном импорта — секции,
 *     такты, дорожки и ноты совпадают (с разворотом повторов, который GPIF
 *     хранить не умеет), темп доезжает, консоль чистая.
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

  // 1. Окно выбора формата.
  await page.click('.toolbar button[onclick="exportSong()"]');
  await page.waitForSelector('#gpExportGpBtn', { timeout: 15000 });
  ok('кнопка «Экспорт» открывает окно выбора формата', true);
  const dialogText = await page.$eval('.strum-modal-content', (node) => node.textContent);
  ok('в окне есть и своя песня, и Guitar Pro 6', /STRUCHORD/.test(dialogText) && /Guitar Pro 6/.test(dialogText));

  // 2. Экспорт в Guitar Pro 6 и подробный отчёт.
  await page.click('#gpExportGpBtn');
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
  ok('файл называется .gpx', downloaded.name.endsWith('.gpx'), downloaded.name);
  const bytes = Buffer.from(downloaded.base64, 'base64');
  fs.writeFileSync('/tmp/acc-export.gpx', bytes);
  ok('файл начинается с BCFZ (сжатый контейнер GP6)',
    bytes.slice(0, 4).toString('latin1') === 'BCFZ' || bytes.slice(0, 4).toString('latin1') === 'BCFS',
    bytes.slice(0, 4).toString('latin1'));
  const reportText = await page.$eval('.strum-modal-overlay:last-of-type .strum-modal-content', (node) => node.textContent);
  ok('отчёт перечисляет перенесённое', /перенес|Перенес/.test(reportText));
  ok('отчёт перечисляет потери или приблизительные места',
    /Не переносится|потер|приблизительно/.test(reportText), reportText.replace(/\s+/g, ' ').slice(0, 200));
  ok('отчёт честно предупреждает, что повторы записаны повторяющимися тактами',
    /Повторы секций записаны повторяющимися тактами/.test(reportText));
  console.log('   отчёт:', reportText.replace(/\s+/g, ' ').slice(0, 900));

  // Закрываем отчёт.
  await page.evaluate(() => {
    document.querySelectorAll('.strum-modal-content').forEach((modal) => {
      const close = [...modal.querySelectorAll('button')].find((b) => /Закрыть|Понятно|OK/i.test(b.textContent));
      if (close) close.click();
    });
    document.querySelectorAll('.strum-modal-overlay').forEach((overlay) => overlay.remove());
  });

  // 3. Импорт того же файла обратно.
  const songBefore = await page.evaluate(() => ({
    sections: sections.length,
    squares: sections.reduce((sum, section) => sum + section.squares.length, 0),
    passes: sections.reduce((sum, section) => sum + (Number(section.repeat) || 1), 0),
    parts: songParts.length,
    notes: songParts.reduce((sum, part) => sum + Object.values(part.rolls || {}).flat().length
      + Object.values(part.pitchRolls || {}).flat().length, 0),
    detail: songParts.map((part) => `${part.instrument}:${Object.values(part.rolls || {}).flat().length}/${Object.values(part.pitchRolls || {}).flat().length}`).join(','),
    bpm: Number(document.getElementById('bpmInput').value),
  }));
  const base64 = bytes.toString('base64');
  await page.evaluate(async (payload) => {
    const binary = atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    const file = new File([buffer], 'acc-export.gpx', { type: 'application/octet-stream' });
    window.importSong(file);
  }, base64);
  await page.waitForFunction(() => !!document.querySelector('#gp35TrackList'), { timeout: 20000 });
  ok('приложение распознало свой файл Guitar Pro 6', true);
  const previewText = await page.$eval('.strum-modal-content', (node) => node.textContent);
  ok('предпросмотр предлагает три дорожки', /Гитара/.test(previewText) && /Ударн|Бас/.test(previewText),
    previewText.replace(/\s+/g, ' ').slice(0, 120));
  await page.evaluate(() => {
    const modal = [...document.querySelectorAll('.strum-modal-content')].find((m) => m.querySelector('#gp35TrackList'));
    const button = [...modal.querySelectorAll('button')].find((b) => /Импортировать/.test(b.textContent));
    button.click();
  });
  await page.waitForFunction(() => !document.querySelector('#gp35TrackList'), { timeout: 30000 });
  await sleep(500);
  const songAfter = await page.evaluate(() => ({
    sections: sections.length,
    squares: sections.reduce((sum, section) => sum + section.squares.length, 0),
    passes: sections.reduce((sum, section) => sum + (Number(section.repeat) || 1), 0),
    parts: songParts.length,
    notes: songParts.reduce((sum, part) => sum + Object.values(part.rolls || {}).flat().length
      + Object.values(part.pitchRolls || {}).flat().length, 0),
    detail: songParts.map((part) => `${part.instrument}:${Object.values(part.rolls || {}).flat().length}/${Object.values(part.pitchRolls || {}).flat().length}`).join(','),
    bpm: Number(document.getElementById('bpmInput').value),
  }));
  console.log('   до:', JSON.stringify(songBefore), 'после:', JSON.stringify(songAfter));
  // GPIF не хранит повторы: экспорт разворачивает их в копии тактов, поэтому
  // ожидаемое число нот после круга считаем с разворотом repeat.
  const expectedNotes = await page.evaluate((before) => {
    const repeats = {};
    for (const section of sections) repeats[String(section.id)] = Number(section.repeat) || 1;
    let total = 0;
    for (const part of songParts) {
      const roll = (list) => (list || []).reduce((sum, note, index, all) => {
        const sectionId = Object.keys(part.rolls || {}).find((key) => (part.rolls[key] || []) === all) || '';
        return sum + (repeats[sectionId] || 1);
      }, 0);
      total += Object.values(part.rolls || {}).reduce((sum, list) => sum + roll(list), 0);
      total += Object.values(part.pitchRolls || {}).reduce((sum, list) => sum + roll(list), 0);
    }
    return total;
  }, songBefore);
  ok('круг: секции, такты и дорожки совпали',
    songAfter.sections === songBefore.sections && songAfter.squares === songBefore.squares &&
    songAfter.parts === songBefore.parts, JSON.stringify({ songBefore, songAfter }));
  ok('круг: ноты совпали с учётом разворота повторов', songAfter.notes === expectedNotes,
    `после ${songAfter.notes}, ожидалось ${expectedNotes}`);
  ok('темп доехал', songAfter.bpm === songBefore.bpm, `${songBefore.bpm} → ${songAfter.bpm}`);

  ok('в консоли браузера нет ошибок', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.error('АВАРИЯ:', error && error.message);
  process.exit(1);
});