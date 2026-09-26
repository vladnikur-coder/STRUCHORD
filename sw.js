// ===== Service Worker для STRUCHORD =====
// Задача: один раз (при первом заходе по сети) сохранить приложение
// в кэше браузера, дальше отдавать его из кэша даже без интернета.
//
// Стратегия — "cache, falling back to network, with background update":
// 1. Если файл уже есть в кэше — отдаём его сразу (офлайн работает).
// 2. Параллельно всё равно пытаемся сходить в сеть и обновить кэш,
//    чтобы при следующем открытии (когда сеть будет) подтянулась
//    свежая версия файла, если вы его меняли.
//
// ВАЖНО: при каждом изменении STRUCHORD.html меняйте CACHE_NAME
// (например, struchord-v2) — иначе браузер продолжит показывать
// старую закэшированную версию, потому что имя кэша не поменялось.

const CACHE_NAME = 'struchord-v413';

// Список файлов, которые нужно закэшировать сразу при установке.
// './' добавлен на случай, если приложение открывают по адресу
// папки без имени файла (например, просто ваш-сайт.github.io/struchord/).
const APP_SHELL = ['./', './STRUCHORD.html', './manifest.json', './uploads/220.mp3', './uploads/грохочет гром.mp3', './uploads/ofont.ru_Izhitsa.ttf'];

self.addEventListener('install', (event) => {
  // skipWaiting — новая версия SW начинает работать сразу, не дожидаясь
  // закрытия всех вкладок со старой версией.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll не даст критической ошибке одного файла сорвать всю
      // установку — оборачиваем в Promise.allSettled на всякий случай.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  // Удаляем кэши от старых версий (если меняли CACHE_NAME раньше).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Обрабатываем только GET-запросы того же происхождения (сам файл
  // приложения). Остального в STRUCHORD и нет — всё встроено в HTML.
  if (event.request.method !== 'GET') return;

  // B-66.2.3: Range-запросы (206 Partial Content). Safari воспроизводит
  // аудио именно таким способом: сначала «Range: bytes=0-1» для зондировки,
  // затем диапазонами — и ждёт ровно 206 с заголовком Content-Range. Вместо
  // этого кэш отдавал целиком 200 OK, и аудио-стек WebKit молча отказывался
  // играть файл: сцена звучала всем, КРОМЕ 220.mp3, а консоль оставалась
  // пустой. Поэтому range-запросы обрабатываем отдельно: из кэша режем
  // нужный диапазон и отвечаем честным 206, без кэша — уходим в сеть.
  if (event.request.headers.has('range')) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (!cached) return fetch(event.request);
        const rangeHeader = event.request.headers.get('range') || '';
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (!match) return cached; // нестандартный Range — отдаём целиком
        const buffer = await cached.arrayBuffer();
        const total = buffer.byteLength;
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        if (!match[1]) { // форма «bytes=-500»: последние 500 байт
          start = Math.max(0, total - parseInt(match[2] || '0', 10));
          end = total - 1;
        }
        if (start > end || start >= total) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` },
          });
        }
        const slice = buffer.slice(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(slice.byteLength),
            'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
          },
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          // Обновляем кэш свежей версией, если сеть доступна.
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // сети нет — используем то, что было в кэше

      // Если в кэше уже что-то есть — отдаём мгновенно, не ждём сеть.
      return cached || networkFetch;
    })
  );
});
