// page-integrity.js — целостность страницы (хотфикс 0.256).
//
// Повод: релизы 0.251–0.255 возили в себе (1) временный зонд отладки B-31
// со слушателем pointerup и (2) ОБРЫВОК-дубликат этого зонда после </html>,
// который парсер переносил в body и пользователь видел код текстом внизу
// страницы. Ни один сьют этого не ловил: зонд без жеста молчит, а на
// посторонний текст в body никто не ассертил. Этот сьют сторожит:
//   1. исходник заканчивается ровно на </html> — после первого </html>
//      нет ни байта (мусорные хвосты = следствия тихих откатов среды);
//   2. в исходнике нет маркеров временной отладки (DIFF-панели,
//      ?debug-гейты, z-index:99999);
//   3. все <script>-блоки парсятся;
//   4. в рендере НЕТ посторонних прямых текст-узлов в body (мусор
//      парсер кладёт именно туда) и ни одного <pre> (оверлеи отладки);
//   5. шапка несёт версию (R6/R7: видимый номер синхронен с реестром);
//   6. файлы PWA-пакета (sw.js, manifest.json), на которые ссылается
//      страница, существуют рядом с ней.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const htmlPath = path.join(ROOT, 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

// --- 1. Хвост файла ---
console.log('=== 1. хвост исходника ===');
const iHtml = html.indexOf('</html>');
ok('</html> встречается ровно один раз', (html.match(/<\/html>/g) || []).length === 1);
ok('после </html> только перевод строки', /^\s*$/.test(html.slice(iHtml + 7)), JSON.stringify(html.slice(iHtml + 7, iHtml + 40)));
ok('файл заканчивается на </html>', /\n$/.test(html) && html.trimEnd().endsWith('</html>'));

// --- 2. Маркеры временной отладки ---
console.log('=== 2. маркеры отладки ===');
// Маркеры точечные: z-index:99999 НЕ входит (его честно использует
// пользовательский fpsMeter), как и «=== B-» (так оформлены заголовки
// секций кода). Ловим конкретные следы отладочных панелей.
const markers = [
  'B-31 DIFF', 'b31debug', 'DEBUG — временный диагност',
  'РАЗЛИЧИЙ НЕТ', 'кадр2', "createElement('pre')", 'createElement("pre")',
];
for (const m of markers) {
  ok(`нет «${m}»`, !html.includes(m));
}

// --- 3. Скрипт-блоки парсятся ---
console.log('=== 3. скрипт-блоки ===');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let unparsed = 0;
blocks.forEach((b, i) => {
  try { new Function(b[1]); } catch (e) { unparsed++; console.log(`      блок #${i}: ${e.message}`); }
});
ok(`все ${blocks.length} <script>-блоков парсятся`, unparsed === 0);

// --- 4. Рендер: тело страницы чистое ---
console.log('=== 4. чистота рендера ===');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
dom.window.addEventListener('load', () => {
  const d = dom.window.document;

  // Прямые дети body: текст допустим только пустой/пробельный.
  // Мусор после </html> парсер кладёт текстом именно в body.
  const stray = [...d.body.childNodes].filter(
    (n) => n.nodeType === 3 && n.textContent.trim() !== ''
  );
  ok('в body нет посторонних текст-узлов', stray.length === 0,
    stray.length ? JSON.stringify(stray[0].textContent.slice(0, 60)) : '');
  ok('в рендере нет <pre> (оверлеи отладки)', d.body.querySelectorAll('pre').length === 0);

  // --- 5. Версия в шапке ---
  console.log('=== 5. версия в шапке ===');
  const ver = d.querySelector('.app-title span');
  const mVer = ver ? (ver.textContent.match(/ver (0\.\d{3})/) || [])[1] : null;
  ok('шапка несёт «ver N.NNN»', !!mVer, ver && ver.textContent.trim());

  // --- 6. PWA-пакет рядом ---
  console.log('=== 6. PWA-пакет ===');
  ok('sw.js лежит рядом', fs.existsSync(path.join(ROOT, 'sw.js')));
  ok('manifest.json лежит рядом', fs.existsSync(path.join(ROOT, 'manifest.json')));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok('CACHE_NAME синхронен с версией (R7)', mVer ? sw.includes(`struchord-v${mVer.replace(/^0\./, '')}`) : false);

  console.log(`\n${bad ? 'СБОЕВ: ' + bad : 'ALL OK — страница целостна'}`);
  process.exit(bad ? 1 : 0);
});
