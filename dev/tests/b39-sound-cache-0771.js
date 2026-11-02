'use strict';
// 0.771 → 0.776: записанные звуки должны работать офлайн.
//
// В 0.771 все четыре тембра лежали одним keyboard-sounds.js (10 МБ base64),
// и проверка требовала этот файл в кэше приложения. С 0.776 звуки — отдельные
// mp3 в sounds/: браузер качает только выбранный тембр, а кэширует их
// service worker по факту первого обращения. Проверяем именно это:
//   * имя кэша соответствует релизу;
//   * манифест звуков и скачанные записи лежат в кэше;
//   * при повторном открытии без сети тембр по-прежнему играет.
const assert = require('assert'), puppeteer = require('puppeteer'), fs = require('fs');
const cacheName = /CACHE_NAME = '([^']+)'/.exec(fs.readFileSync('sw.js', 'utf8'))[1];
const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8028/STRUCHORD.html';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Первая загрузка только ставит service worker: страницу он начинает
    // обслуживать со второй. Только тогда запросы звуков реально кэшируются.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });

    // Загружаем тембр так, как это делает приложение: через банк звуков.
    await page.evaluate(async () => {
      const off = new OfflineAudioContext(1, 1, 44100);
      await window.StruChordSampleBank.load('rhodes', off);
    });

    const info = await page.evaluate(async () => {
      const keys = await caches.keys();
      const name = keys.find(k => k === location.origin + '/') || keys[0];
      const cache = await caches.open(keys[0]);
      const requests = await cache.keys();
      const urls = requests.map(r => new URL(r.url).pathname);
      const sounds = urls.filter(u => u.includes('/sounds/'));
      let bytes = 0;
      for (const u of sounds.slice(0, 8)) {
        const hit = await cache.match(u);
        if (hit) bytes += (await hit.clone().arrayBuffer()).byteLength;
      }
      return { name: keys[0], manifest: urls.some(u => u.endsWith('/sounds/manifest.json')), sounds: sounds.length, bytes };
    });

    assert.equal(info.name, cacheName, 'имя кэша соответствует релизу');
    assert.ok(info.manifest, 'манифест звуков попадает в кэш');
    assert.ok(info.sounds >= 8, 'записи тембра кэшируются по факту загрузки: ' + info.sounds);
    assert.ok(info.bytes > 200_000, 'звуки кэшируются целиком, а не заголовками: ' + info.bytes + ' байт');

    console.log('Offline cache: ' + info.name + ' держит ' + info.sounds + ' записей тембра (' +
      (info.bytes / 1e6).toFixed(1) + ' МБ в первых восьми) — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
