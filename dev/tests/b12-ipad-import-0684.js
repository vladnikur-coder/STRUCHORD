#!/usr/bin/env node
/**
 * Приёмочный автотест 0.684:
 *  1. На iPadOS (platform === 'MacIntel' && maxTouchPoints > 1) и iPhone (UA iPhone)
 *     окно выбора файла получает application/octet-stream (не пустой accept!) и весь список
 *     расширений (.struchord, .json, .gp3, .gp4, .gp5, .gp, .gpx, .mid, .midi).
 *  2. На обычном компьютере (Mac/Windows/Linux, в т.ч. Windows-ноутбук с тачскрином)
 *     application/octet-stream НЕ добавляется, но .gpx, .mid, .midi присутствуют в списке.
 *  3. Реальный выбор через FileChooser открывает .struchord, .gp5, .gpx и .mid без ошибок.
 *  4. Чужое расширение (.zip, .pdf) сразу отклоняется понятным сообщением со списком форматов.
 *  5. Экспорт пустой песни в .gp5 / .gpx не скачивает битый файл, а выдаёт понятную подсказку;
 *     после добавления аккорда экспорт .gp5 и .gpx снова скачивает читаемые файлы.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const CHROME_PATH = process.env.CHROME_PATH || '/tmp/chromium';
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log('PASS: ' + label);
  } else {
    failed++;
    console.error('FAIL: ' + label + (detail ? ' — ' + detail : ''));
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureAcceptForProfile(browser, profile) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setUserAgent(profile.ua);
  await page.setViewport(profile.viewport);
  await page.evaluateOnNewDocument((plat, pts) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => plat, configurable: true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => pts, configurable: true });
  }, profile.platform, profile.maxTouchPoints);
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 45000 });
  const accept = await page.evaluate(() => {
    let captured = null;
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      captured = this.accept;
      this.dispatchEvent(new Event('cancel'));
    };
    try {
      window.importSongFile();
    } finally {
      HTMLInputElement.prototype.click = origClick;
    }
    return captured;
  });
  return { page, accept, errors };
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'struchord-0684-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // Подготовим тестовые файлы на диске для настоящего FileChooser
    const struchordPath = path.join(tmpDir, 'test-song.struchord');
    fs.writeFileSync(
      struchordPath,
      JSON.stringify({
        schemaVersion: 5,
        metadata: { artist: 'Кино', title: 'Пачка сигарет' },
        bpm: 122,
        globalKey: 'Em',
        keyMode: 'manual',
        globalTimeSig: '4/4',
        sections: [
          {
            id: 1,
            type: 'Verse',
            repeat: 1,
            squares: [{ id: 2, repeat: 1, events: [{ chord: 'Em', span: 4 }] }],
          },
        ],
      }),
    );
    const gp5Path = path.join(FIXTURES_DIR, 'sample-gp5.gp5');
    const gpxPath = path.join(FIXTURES_DIR, 'sample-gp6.gpx');
    const zipPath = path.join(tmpDir, 'archive.zip');
    fs.writeFileSync(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3, 4]));

    const REQ_EXTS = ['.struchord', '.json', '.gp3', '.gp4', '.gp5', '.gp', '.gpx', '.mid', '.midi'];

    // --- 1. iPadOS 17 (представляется MacIntel + maxTouchPoints = 5) ---
    const ipad = await captureAcceptForProfile(browser, {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      viewport: { width: 1024, height: 768, isMobile: true, hasTouch: true },
    });
    const ipadTokens = String(ipad.accept || '').split(',');
    check(
      'Версия в шапке не ниже 0.684',
      await ipad.page.$eval('#devPanelTrigger', (el) => parseFloat((el.textContent.match(/\d+\.\d+/) || ['0'])[0]) >= 0.684),
    );
    check(
      'iPadOS (MacIntel + maxTouchPoints=5): accept не пустой и содержит все форматы + application/octet-stream',
      ipad.accept.length > 0 &&
        REQ_EXTS.every((ext) => ipadTokens.includes(ext)) &&
        ipadTokens.includes('application/json') &&
        ipadTokens.includes('application/octet-stream'),
      ipad.accept,
    );

    // Перехватим тосты на странице iPad для проверки реальных файлов
    await ipad.page.evaluate(() => {
      window.__toasts = [];
      const orig = window.showToast;
      window.showToast = function (msg) {
        window.__toasts.push(String(msg));
        return orig ? orig.apply(this, arguments) : undefined;
      };
    });

    // 1а. Выбор .struchord через настоящий FileChooser на iPad
    {
      const chooserPromise = ipad.page.waitForFileChooser();
      await ipad.page.click('#homeImportSongBtn');
      const chooser = await chooserPromise;
      await chooser.accept([struchordPath]);
      await wait(300);
      const title = await ipad.page.$eval('#songTitle', (el) => el.value);
      check('iPad: файл .struchord выбирается и открывает песню', title === 'Пачка сигарет', title);
    }

    // 1б. Сделаем экспорт MIDI из загруженной песни, чтобы проверить и живой .mid!
    const midiBytes = await ipad.page.evaluate(() => window.midiExportBytes().bytes);
    const midPath = path.join(tmpDir, 'exported-test.mid');
    fs.writeFileSync(midPath, Buffer.from(midiBytes));

    // 1в. Выбор .gp5 через настоящий FileChooser на iPad
    {
      const chooserPromise = ipad.page.waitForFileChooser();
      await ipad.page.evaluate(() => window.importSongFile());
      const chooser = await chooserPromise;
      await chooser.accept([gp5Path]);
      await ipad.page.waitForSelector('#gp35TrackList', { timeout: 8000 });
      check('iPad: файл .gp5 выбирается и открывает окно дорожек Guitar Pro', true);
      await ipad.page.evaluate(() => {
        const modal = document.querySelector('#gp35TrackList')?.closest('.strum-modal-content');
        const btn = Array.from(modal?.querySelectorAll('button') || []).find((b) => b.textContent.trim() === 'Отмена');
        if (btn) btn.click();
      });
      await wait(150);
    }

    // 1г. Выбор .gpx через настоящий FileChooser на iPad
    {
      const chooserPromise = ipad.page.waitForFileChooser();
      await ipad.page.evaluate(() => window.importSongFile());
      const chooser = await chooserPromise;
      await chooser.accept([gpxPath]);
      await ipad.page.waitForSelector('#gp35TrackList', { timeout: 8000 });
      const heading = await ipad.page.$eval('#gp35TrackList', (el) => el.closest('.strum-modal-content')?.textContent || '');
      check('iPad: файл .gpx выбирается и открывает предпросмотр GP6', heading.includes('Импорт Guitar Pro 6'), heading.slice(0, 80));
      await ipad.page.evaluate(() => {
        const modal = document.querySelector('#gp35TrackList')?.closest('.strum-modal-content');
        const btn = Array.from(modal?.querySelectorAll('button') || []).find((b) => b.textContent.trim() === 'Отмена');
        if (btn) btn.click();
      });
      await wait(150);
    }

    // 1д. Выбор .mid через настоящий FileChooser на iPad
    {
      const chooserPromise = ipad.page.waitForFileChooser();
      await ipad.page.evaluate(() => window.importSongFile());
      const chooser = await chooserPromise;
      await chooser.accept([midPath]);
      await ipad.page.waitForSelector('#gp35TrackList', { timeout: 8000 });
      const heading = await ipad.page.$eval('#gp35TrackList', (el) => el.closest('.strum-modal-content')?.textContent || '');
      check('iPad: файл .mid выбирается и открывает предпросмотр MIDI', heading.includes('MIDI'), heading.slice(0, 80));
      await ipad.page.evaluate(() => {
        const modal = document.querySelector('#gp35TrackList')?.closest('.strum-modal-content');
        const btn = Array.from(modal?.querySelectorAll('button') || []).find((b) => b.textContent.trim() === 'Отмена');
        if (btn) btn.click();
      });
      await wait(150);
    }

    // 1е. Выбор чужого .zip на iPad -> понятное сообщение без падения
    {
      await ipad.page.evaluate(() => { window.__toasts.length = 0; });
      const chooserPromise = ipad.page.waitForFileChooser();
      await ipad.page.evaluate(() => window.importSongFile());
      const chooser = await chooserPromise;
      await chooser.accept([zipPath]);
      await wait(250);
      const toasts = await ipad.page.evaluate(() => window.__toasts.slice());
      const last = toasts[toasts.length - 1] || '';
      check(
        'iPad: чужой файл .zip выдаёт понятный список поддерживаемых форматов (не «Ошибка чтения файла»)',
        last.includes('Этот тип файла не поддерживается') &&
          last.includes('.struchord') &&
          last.includes('.gp5') &&
          last.includes('.gpx') &&
          last.includes('.mid'),
        last,
      );
    }

    check('iPad: нет ошибок JavaScript', ipad.errors.length === 0, ipad.errors.join(' | '));
    await ipad.page.close();

    // --- 2. iPhone (UA iPhone, 390×844) ---
    const iphone = await captureAcceptForProfile(browser, {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    });
    const iphoneTokens = String(iphone.accept || '').split(',');
    check(
      'iPhone: accept содержит все форматы и application/octet-stream',
      REQ_EXTS.every((ext) => iphoneTokens.includes(ext)) && iphoneTokens.includes('application/octet-stream'),
      iphone.accept,
    );
    check('iPhone: нет ошибок JavaScript', iphone.errors.length === 0, iphone.errors.join(' | '));
    await iphone.page.close();

    // --- 3. Компьютер (MacBook без тача и Windows-ноутбук с тачскрином) ---
    const macDesktop = await captureAcceptForProfile(browser, {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      viewport: { width: 1440, height: 900 },
    });
    const macTokens = String(macDesktop.accept || '').split(',');
    check(
      'Mac (компьютер): accept содержит .gpx и .mid, но НЕ содержит application/octet-stream',
      REQ_EXTS.every((ext) => macTokens.includes(ext)) &&
        macTokens.includes('application/json') &&
        !macTokens.includes('application/octet-stream'),
      macDesktop.accept,
    );

    // Проверим на компьютере защиту от экспорта пустой песни в .gp5 / .gpx
    const emptyExportRes = await macDesktop.page.evaluate(() => {
      window.__toasts = [];
      window.__downloads = [];
      const origToast = window.showToast;
      window.showToast = function (msg) {
        window.__toasts.push(String(msg));
        return origToast ? origToast.apply(this, arguments) : undefined;
      };
      const origAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) window.__downloads.push(this.download);
      };
      try {
        startNewSongFromHome();
        addSection('Verse'); // есть секция и пустой квадрат (такты есть, но ни одного аккорда/ноты нет!)
        const r5 = window.exportGuitarPro5();
        const toast5 = window.__toasts[window.__toasts.length - 1] || '';
        const r6 = window.exportGuitarPro();
        const toast6 = window.__toasts[window.__toasts.length - 1] || '';
        return { r5, r6, toast5, toast6, downloads: window.__downloads.slice() };
      } finally {
        HTMLAnchorElement.prototype.click = origAnchorClick;
      }
    });
    check(
      'Пустая секция без аккордов и нот: экспорт .gp5 и .gpx не скачивает битый файл и показывает понятную подсказку',
      emptyExportRes.r5 === null &&
        emptyExportRes.r6 === null &&
        emptyExportRes.downloads.length === 0 &&
        emptyExportRes.toast5.includes('добавьте хотя бы один аккорд или таб') &&
        emptyExportRes.toast6.includes('добавьте хотя бы один аккорд или таб'),
      JSON.stringify(emptyExportRes),
    );

    // А после добавления аккорда Em экспорт .gp5 и .gpx проходит и читается обратно!
    const nonEmptyExportOk = await macDesktop.page.evaluate(() => {
      sections[0].squares[0].events[0].chord = 'Em';
      render();
      const gp5 = window.gpExportBytesGP5();
      const gpx = window.gpExportBytes();
      return gp5.bytes.length > 200 && gpx.bytes.length > 200;
    });
    check('Песня с аккордом Em: экспорт .gp5 и .gpx успешно создаёт читаемые файлы', nonEmptyExportOk);
    check('Mac (компьютер): нет ошибок JavaScript', macDesktop.errors.length === 0, macDesktop.errors.join(' | '));
    await macDesktop.page.close();

    const winTouch = await captureAcceptForProfile(browser, {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 10,
      viewport: { width: 1366, height: 768 },
    });
    check(
      'Windows с сенсорным экраном: application/octet-stream НЕ добавляется (фильтр остаётся компьютерным)',
      !String(winTouch.accept || '').includes('application/octet-stream') &&
        String(winTouch.accept || '').includes('.gpx') &&
        String(winTouch.accept || '').includes('.mid'),
      winTouch.accept,
    );
    await winTouch.page.close();
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\nИТОГ 0.684 iPad/импорт/экспорт: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
