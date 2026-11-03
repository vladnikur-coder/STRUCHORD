'use strict';
// 0.771 → 0.776: записанные звуки не внутри HTML, а отдельными файлами.
//
// В 0.771 проверялось, что рядом с приложением лежит keyboard-sounds.js и что
// даже с file:// тембр звучит. С 0.776 звуки — обычные mp3 в папке sounds/:
// file:// их не отдаст (fetch запрещён), зато браузер качает только выбранный
// тембр и не парсит 10 МБ base64. Поэтому проверяем устройство, а не file://:
//   * в HTML нет встроенных данных сэмплов;
//   * в sounds/manifest.json четыре тембра, у пианино три слоя силы;
//   * банк грузится по http и отдаёт записанные буферы, а не синтез.
const assert = require('assert'), puppeteer = require('puppeteer'), path = require('path'), fs = require('fs');

(async () => {
  const html = path.resolve(process.env.STRUCHORD_HTML || 'STRUCHORD.html');
  const dir = path.dirname(html);
  const source = fs.readFileSync(html, 'utf8');
  assert(!/__b39SampleData\s*=/.test(source), 'в HTML не должно быть встроенных сэмплов');
  assert(!/keyboard-sounds\.js/.test(source), 'старый единый файл звуков больше не подключается');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'sounds', 'manifest.json'), 'utf8'));
  // С 0.780 в манифесте появился пятый служебный банк — записи демпфера
  // пианино (release); тембров по-прежнему четыре.
  assert.deepStrictEqual(Object.keys(manifest).sort(), ['acoustic', 'organ', 'pad', 'release', 'rhodes'],
    'манифест описывает четыре тембра и банк демпфера');
  assert(manifest.release.length >= 80, 'записи демпфера на весь диапазон');
  const layered = manifest.acoustic.filter(e => Array.isArray(e.layers) && e.layers.length === 3);
  assert(layered.length >= 9, 'у пианино есть слои силы в среднем регистре: ' + layered.length);
  for (const mode of Object.keys(manifest)) {
    for (const entry of manifest[mode]) {
      const files = [entry.file, ...(entry.layers || []).map(l => l.file)].filter(Boolean);
      for (const file of files) {
        assert(fs.existsSync(path.join(dir, 'sounds', file)), 'нет файла sounds/' + file);
      }
    }
  }

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8028/STRUCHORD.html', { waitUntil: 'load' });
    const info = await page.evaluate(async () => {
      const off = new OfflineAudioContext(1, 1, 44100);
      const list = await window.StruChordSampleBank.load('rhodes', off);
      const near = window.StruChordSampleBank.nearest('rhodes', 55, 12);
      return {
        notes: list.length,
        looped: !!(near && near.loopEnd > near.loopStart),
        seconds: near ? +near.buffer.duration.toFixed(1) : 0
      };
    });
    assert(info.notes >= 12, 'банк Rhodes загружен из sounds/: ' + info.notes + ' нот');
    assert(info.looped, 'у Rhodes сохранилась записанная петля сустейна');
    assert(info.seconds > 1, 'это запись, а не синтез: ' + info.seconds + ' с');
    console.log('Separate sounds: ' + info.notes + ' записей Rhodes из sounds/, петля ' +
      info.seconds + ' с, пианино слоёв: ' + layered.length + ' — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
