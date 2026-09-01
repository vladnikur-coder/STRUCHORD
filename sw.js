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

const CACHE_NAME = 'struchord-v91';

// Список файлов, которые нужно закэшировать сразу при установке.
// './' добавлен на случай, если приложение открывают по адресу
// папки без имени файла (например, просто ваш-сайт.github.io/struchord/).
const APP_SHELL = ['./', './STRUCHORD.html', './manifest.json'];

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
