'use strict';
// Генератор базы «старые песни сохраняются бит-в-бит».
// Запускается ИЗ КОРНЯ репозитория против html-файла нужной версии:
//   node dev/tools/gen-save-baseline-0872.js /tmp/pre0872.html dev/fixtures/b39-save-baseline-0872.json
// База — маленький JSON: для каждого фикстура длина и sha256 сохранённой песни.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const htmlPath = process.argv[2] || path.join(ROOT, 'STRUCHORD.html');
const outPath = process.argv[3] || path.join(ROOT, 'dev', 'fixtures', 'b39-save-baseline-0872.json');
const HTML = fs.readFileSync(htmlPath, 'utf8');
const FIXTURES = ['b12-parts-demo.struchord', 'b12-tab-insert.struchord', 'praskovya.json', 'rhythm-golden.json', 'wind-of-change.json'];

function makeDom() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  return new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
      w.URL.createObjectURL = () => 'blob:baseline';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 8);
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { version: path.basename(htmlPath), fixtures: {} };
  for (const fixture of FIXTURES) {
    const song = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev', 'fixtures', fixture), 'utf8'));
    const dom = makeDom();
    const w = dom.window;
    await sleep(250);
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    await sleep(200);
    const res = w.saveCurrentSong();
    if (res && typeof res.then === 'function') await res;
    await sleep(150);
    const stored = JSON.parse(w.localStorage.getItem('struchord_songs') || '[]');
    // Поле date — метка сохранения, она по определению новая на каждом сейве.
    // Всё остальное обязано совпасть бит-в-бит, поэтому сравниваем без неё.
    const saved = { ...stored[0] };
    delete saved.date;
    const text = JSON.stringify(saved);
    out.fixtures[fixture] = {
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    };
    console.log(fixture, out.fixtures[fixture].bytes, out.fixtures[fixture].sha256.slice(0, 16));
    dom.window.close();
  }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log('written', outPath);
})();
