// Скриншоты: загрузка песни наполняет кнопки расширений под колесом.
// Запуск: python3 -m http.server 8021 --bind 127.0.0.1 & node dev/tools/shot-wheel-load.js
const puppeteer = require('/home/user/node_modules/puppeteer');
const song = JSON.stringify(
  [require('/home/user/uploads/Every breath you take.struchord-2.json')]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
  });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8021/STRUCHORD.html', { waitUntil: 'load' });
  await wait(900);
  // Ставим песню ПОСЛЕ старта приложения: на старте библиотека
  // проходит строгую проверку целостности, и чужой файл она чистит.
  await p.evaluate((json) => localStorage.setItem('struchord_songs', json), song);
  await p.evaluate(() => loadSong(0));
  await wait(800);
  await p.evaluate(() => {
    const inp = document.querySelector('.chord-input');
    activeChordInput = inp;
    openChordWheel(inp);
  });
  await wait(400);
  await p.screenshot({ path: '/home/user/wheel-load-seeded.png' });
  // Кнопка add9 (вторая; madd9 склеен в неё) — выучена из песни:
  // круг строит add9 в оба кольца.
  await p.evaluate(() =>
    document.querySelectorAll('#wheelModeRow1 .mode-tab')[1].click());
  await wait(400);
  await p.screenshot({ path: '/home/user/wheel-load-add9.png' });
  await b.close();
  console.log('shots saved');
})().catch((e) => { console.error(e); process.exit(1); });
