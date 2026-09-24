// B-66.2.3 (2026-09-23): Safari 17.6 — mp3 ачивки молчит, консоль пуста.
//
// Факты от пользователя (ask_user):
//   - в сцене звучит всё, КРОМЕ mp3 (WebAudio-ноты чайма играют);
//   - консоль Safari пустая;
//   - Safari 17.6.
//
// Двойная правка:
//   1. sw.js: Safari играет аудио Range-запросами и ждёт ровно
//      «206 Partial Content» с Content-Range. Кэш отдавал целиком
//      «200 OK» — WebKit-аудио молча отказывалось играть. Теперь
//      range-запросам из кэша отвечаем честным 206-подрезом.
//   2. STRUCHORD.html: прогрев и чайм 220.mp3 раньше глушили отказ
//      play() без следа. Теперь пишут в персистентный аудио-журнал —
//      одна подтверждающая сцена на Mac даёт точную причину вместо
//      пустой консоли.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let bad = 0;
function ok(label, cond, dbg) {
  if (cond) console.log('   ok  ', label);
  else { bad++; console.log('   FAIL', label, dbg == null ? '' : dbg); }
}

const root = path.join(__dirname, '..', '..');
const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'STRUCHORD.html'), 'utf8');

console.log('=== 1. sw.js: текстовые признаки Range-обработки ===');
ok('есть ветка range-запросов', swSrc.includes("headers.has('range')"));
ok('отвечает 206', swSrc.includes('status: 206'));
ok('ставит Content-Range', swSrc.includes("'Content-Range'"));
ok('ставит Accept-Ranges', swSrc.includes("'Accept-Ranges'"));
ok('есть 416 для невалидного диапазона', swSrc.includes('status: 416'));
ok('range-ветка обработана ДО общего обработчика',
  swSrc.indexOf("headers.has('range')") > 0 &&
  swSrc.indexOf("headers.has('range')") < swSrc.indexOf("caches.match(event.request)"));
const cacheVersion = /CACHE_NAME = 'struchord-v(\d+)'/.exec(swSrc);
const appVersion = /STRUCHORD[^<]*<span[^>]*>· ver 0\.(\d+)<\/span>/.exec(html);
ok('версия кэша поднята и синхронизирована с приложением',
  !!(cacheVersion && appVersion && Number(cacheVersion[1]) >= 353 && cacheVersion[1] === appVersion[1]),
  { cacheVersion: cacheVersion && cacheVersion[1], appVersion: appVersion && appVersion[1] });

console.log('=== 2. sw.js: функциональный прогон Range-обработчика ===');
(async () => {
  const handlers = {};
  const store = new Map();
  const sandbox = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      // Cache Storage отдаёт каждый раз свежий клон — мок повторяет это,
      // иначе тело ответа читается повторно и второй запрос падает.
      match: (req) => { const hit = store.get(req.url); return Promise.resolve(hit ? hit.clone() : null); },
      open: () => Promise.resolve({
        put: (req, res) => { store.set(req.url, res); return Promise.resolve(); },
      }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: () => Promise.reject(new Error('offline в стенде')),
    Response,
    Promise,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(swSrc, sandbox);
  ok('fetch-обработчик зарегистрирован', typeof handlers.fetch === 'function');

  // Кладём в кэш «файл» на 1000 байт.
  const total = 1000;
  const bytes = new Uint8Array(total);
  for (let i = 0; i < total; i++) bytes[i] = i % 251;
  const url = 'https://example.test/uploads/220.mp3';
  const full = new Response(bytes.slice(), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  store.set(url, full);

  async function respondWith(request) {
    const payloads = request.payloads || [request];
    let resolved;
    handlers.fetch({
      request: payloads[0],
      respondWith: (p) => { resolved = p; },
    });
    return Promise.resolve(resolved);
  }

  const r1 = await respondWith(new Request(url, { headers: { Range: 'bytes=0-1' } }));
  ok('bytes=0-1 → статус 206', r1.status === 206, r1.status);
  ok('bytes=0-1 → Content-Range корректный',
    r1.headers.get('content-range') === `bytes 0-1/${total}`, r1.headers.get('content-range'));
  ok('bytes=0-1 → ровно 2 байта', (await r1.arrayBuffer()).byteLength === 2);

  const r2 = await respondWith(new Request(url, { headers: { Range: 'bytes=10-19' } }));
  const buf2 = new Uint8Array(await r2.arrayBuffer());
  ok('bytes=10-19 → статус 206', r2.status === 206, r2.status);
  ok('bytes=10-19 → содержимое совпадает с исходником',
    buf2.length === 10 && buf2[0] === (10 % 251) && buf2[9] === (19 % 251),
    [buf2.length, buf2[0], buf2[9]]);
  ok('bytes=10-19 → Accept-Ranges: bytes', r2.headers.get('accept-ranges') === 'bytes');

  const r3 = await respondWith(new Request(url, { headers: { Range: 'bytes=999-' } }));
  ok('bytes=999- (открытый хвост) → 206 и 1 байт',
    r3.status === 206 && (await r3.arrayBuffer()).byteLength === 1);

  const r4 = await respondWith(new Request(url, { headers: { Range: 'bytes=-100' } }));
  const r4Length = (await r4.arrayBuffer()).byteLength;
  ok('bytes=-100 (суффикс) → 206 и 100 байт',
    r4.status === 206 && r4Length === 100,
    [r4.status, r4Length]);

  const r5 = await respondWith(new Request(url, { headers: { Range: 'bytes=2000-' } }));
  ok('вырожденный диапазон → 416 с Content-Range */N',
    r5.status === 416 && r5.headers.get('content-range') === `bytes */${total}`,
    r5.status);

  const r6 = await respondWith(new Request(url));
  ok('обычный запрос → целиком из кэша (200)', r6.status === 200, r6.status);

  console.log('=== 3. STRUCHORD.html: журнал диагностики в прогреве и чайме ===');
  [
    'achievement-prime-requested',
    'achievement-prime-playing',
    'achievement-prime-rejected',
    'achievement-prime-throw',
    'achievement-chime-requested',
    'achievement-chime-playing',
    'achievement-chime-rejected',
  ].forEach((evt) => ok(`событие ${evt}`, html.includes("'" + evt + "'")));
  ok('старый беззвучный catch чайма удалён',
    !html.includes("звук мог быть запрещён до пользовательского жеста"),
    'остался молчаливый catch');
  ok('chime-rejected пишет диагностическую нагрузку',
    /achievement-chime-rejected',\s*\{[\s\S]*?mediaError/.test(html));
  ok('wasPrimed фиксируется в отказе чайма',
    /achievement-chime-rejected[\s\S]{0,300}?wasPrimed/.test(html));
  ok('mp3 «Грохочет гром» играет без программного fade-out',
    html.includes("envelope: 'native-no-fade'") &&
    html.includes('activeThunderAchievementAudios = new Set') &&
    html.includes("envelope: 'constant-no-fade'") &&
    !html.includes('fadeStart =') &&
    !html.includes('linearRampToValueAtTime(.0001, endAt)') &&
    !html.includes('exponentialRampToValueAtTime(.0001, ctx.currentTime + Math.min(5.8'),
    'ожидаем native playback без синтетического fade; fallback тоже constant gain');
  ok('версия приложения поднята не ниже релиза B-66.2.3',
    !!(appVersion && Number(appVersion[1]) >= 353),
    appVersion && appVersion[1]);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
