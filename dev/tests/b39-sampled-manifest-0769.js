'use strict';
// B-39 · 0.769: записанные тембры. В 0.769 сэмплы лежали base64 внутри
// keyboard-sounds.js; с 0.776 это отдельные mp3 в sounds/. Смысл проверки
// сохранился: в HTML нет ни одного образца, лицензии остаются в настройках,
// а манифест действительно указывает на существующие файлы.
const fs = require('fs'), assert = require('assert'), path = require('path');
const html = fs.readFileSync(process.env.STRUCHORD_HTML || 'STRUCHORD.html', 'utf8');
const audio = fs.readFileSync('keyboard-audio.js', 'utf8');
const dir = path.resolve(process.env.STRUCHORD_SOUNDS || 'sounds');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

assert(!html.includes('window.__b39SampleData='), 'образцы не встроены в HTML');
assert(!/data:audio\/[a-z0-9.+-]+;base64/.test(html), 'в HTML нет mp3 как data-URI');
assert(audio.includes('window.StruChordSampleCredits='), 'лицензии остаются в настройках');
assert(html.includes('StruChordSampleCredits'), 'настройки показывают источники звуков');
for (const name of ['keyboard-audio.js', 'keyboard-accompaniment.js']) {
  assert(html.includes('src="./' + name + '"'), 'HTML подключает ' + name);
}

let count = 0, files = new Set(), bytes = 0, loops = 0;
for (const [bank, items] of Object.entries(manifest)) {
  assert(items.length, bank + ': записи есть');
  for (const entry of items) {
    // Пианино в среднем регистре лежит слоями силы, остальные — одной записью.
    const takes = entry.layers ? entry.layers.map(l => ({ ...entry, ...l })) : [entry];
    for (const x of takes) {
    const file = path.join(dir, x.file);
    assert(fs.existsSync(file), 'нет файла ' + x.file);
    const buf = fs.readFileSync(file);
    assert(buf.length > 1000, x.file + ': файл не пустой');
    // Rhodes лежит WAV: у него записанная петля, mp3 добавил бы щелчок на стыке.
    const riff = buf.slice(0, 4).toString('latin1') === 'RIFF';
    const mp3 = buf.slice(0, 3).toString('latin1') === 'ID3' ||
      (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    assert(riff || mp3, x.file + ': это аудиофайл, который понимает браузер');
    assert(x.file.endsWith(riff ? '.wav' : '.mp3'), x.file + ': расширение совпадает с форматом');
    if (x.loopStart !== undefined) { loops++; assert(x.loopEnd > x.loopStart, x.file + ': петля в порядке'); }
    count++; files.add(x.file); bytes += buf.length;
    }
  }
}

// Четыре тембра плюс служебный банк демпфера (0.780).
assert.deepStrictEqual(Object.keys(manifest).sort(), ['acoustic', 'organ', 'pad', 'release', 'rhodes'],
  'четыре тембра и банк демпфера');
assert(loops >= 15, 'у Rhodes есть петли: ' + loops);
assert(manifest.release.length === 88, 'записи демпфера на все 88 клавиш: ' + manifest.release.length);
assert(bytes > 10_000_000, 'записи реально на месте: ' + (bytes / 1048576).toFixed(1) + ' МБ');
console.log(`Записанные тембры: ${files.size} файлов в sounds/, ${(bytes / 1048576).toFixed(2)} МБ (${count} записей со слоями), петель ${loops}, HTML ${(Buffer.byteLength(html) / 1048576).toFixed(2)} МБ — OK`);
