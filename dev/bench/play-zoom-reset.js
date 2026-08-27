// Старт воспроизведения ПОДБИРАЕТ масштаб под самую мелкую долю песни
// (autoZoomForPlayback), а не сбрасывает его к 100%.
//
// Раньше здесь был безусловный сброс: считалось, что во время игры нужен
// обзор всей песни. С дробными долями это перестало работать —
// шестнадцатая при 100% занимает 1px, и «обзор» показывает полоску
// вместо аккорда. Теперь ручной зум пользователя заменяется расчётным:
// песня из четвертей вернётся к 100%, песня с мелкими долями —
// поднимется настолько, чтобы они читались.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 700));

  console.log('=== 1. Масштаб перед стартом ===');
  await p.evaluate(() => { setSquareZoom(2.6, true); });
  await new Promise(r => setTimeout(r, 300));
  const before = await p.evaluate(() => ({
    zoom: squareZoom,
    varv: getComputedStyle(document.documentElement).getPropertyValue('--square-zoom').trim(),
    zoomed: document.body.classList.contains('is-zoomed'),
    badges: document.querySelectorAll('.section-badge--zoom').length,
    width: document.querySelector('.squares-list').getBoundingClientRect().width,
  }));
  console.log(`      zoom=${before.zoom}, --square-zoom=${before.varv}, бейджей ${before.badges}, ширина ${before.width.toFixed(1)}`);
  ok('масштаб увеличен', before.zoom > 2.5);
  ok('бейджи масштаба есть', before.badges > 0);

  console.log('\n=== 2. Старт воспроизведения ===');
  await p.evaluate(() => { playAll(); });
  await new Promise(r => setTimeout(r, 600));
  const after = await p.evaluate(() => ({
    zoom: squareZoom,
    varv: getComputedStyle(document.documentElement).getPropertyValue('--square-zoom').trim(),
    zoomed: document.body.classList.contains('is-zoomed'),
    badges: document.querySelectorAll('.section-badge--zoom').length,
    width: document.querySelector('.squares-list').getBoundingClientRect().width,
    playing: playbackState.isPlaying,
    bodyPlaying: document.body.classList.contains('is-playing'),
  }));
  console.log(`      zoom=${after.zoom}, --square-zoom=${after.varv}, бейджей ${after.badges}, ширина ${after.width.toFixed(1)}`);
  // Wind of Change состоит из четвертей и восьмых: минимальная доля
  // даёт масштаб около 1.2x, а не 2.6x, который стоял до старта.
  ok('ручной масштаб заменён расчётным', Math.abs(after.zoom - before.zoom) > 0.5,
     `было ${before.zoom}, стало ${after.zoom}`);
  ok('масштаб в разумных пределах', after.zoom >= 1 && after.zoom <= 4, String(after.zoom));
  ok('CSS-переменная синхронна', Math.abs(parseFloat(after.varv) - after.zoom) < 0.01, after.varv);
  // Бейдж показывает ТЕКУЩИЙ масштаб и остаётся, пока масштаб больше
  // 100%. Раньше он исчезал вместе со сбросом; теперь автозум масштаб
  // сохраняет, и прятать индикатор было бы враньём — человек должен
  // видеть, что картинка увеличена, и уметь вернуть 100% одним кликом.
  ok('бейдж отражает состояние зума', (after.zoom > 1.01) === (after.badges > 0),
     `зум ${after.zoom.toFixed(2)}, бейджей ${after.badges}`);
  ok('ширина пересчитана под новый масштаб', Math.abs(after.width - before.width) > 50,
    `${before.width.toFixed(1)} -> ${after.width.toFixed(1)}`);
  ok('воспроизведение идёт', after.playing && after.bodyPlaying);

  console.log('\n=== 3. Класс анимации снимается ===');
  await new Promise(r => setTimeout(r, 400));
  const anim = await p.evaluate(() => document.querySelectorAll('.squares-list.zoom-animated').length);
  ok('zoom-animated снят после перехода', anim === 0, String(anim));

  console.log('\n=== 4. Повторный старт без зума не ломает игру ===');
  await p.evaluate(() => { playAll(); }); // стоп
  await new Promise(r => setTimeout(r, 250));
  await p.evaluate(() => { playAll(); }); // старт
  await new Promise(r => setTimeout(r, 400));
  const again = await p.evaluate(() => ({ z: squareZoom, playing: playbackState.isPlaying }));
  // Повторный старт даёт ТОТ ЖЕ расчётный масштаб: он зависит только от
  // самой мелкой доли песни, а она не менялась.
  ok('масштаб воспроизводим', Math.abs(again.z - after.zoom) < 0.01,
     `${after.zoom} -> ${again.z}`);
  ok('воспроизведение идёт', again.playing);
  await p.evaluate(() => stopPlayback());

  console.log('\n=== 4б. Остановка возвращает масштаб, что был до старта ===');
  // Автозум — служебное состояние на время игры, а не выбор человека.
  // Подробности и все случаи — в dev/bench/zoom-restore.js.
  await p.evaluate(() => setSquareZoom(2.6, true));
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate(() => { playAll(); });
  await new Promise(r => setTimeout(r, 700));
  const during = await p.evaluate(() => squareZoom);
  await p.evaluate(() => stopPlayback());
  await new Promise(r => setTimeout(r, 600));
  const restored = await p.evaluate(() => squareZoom);
  ok('после остановки вернулся масштаб пользователя',
     Math.abs(restored - 2.6) < 0.02, `${during.toFixed(2)} -> ${restored.toFixed(2)}`);

  console.log('\n=== 5. Зум после старта всё ещё доступен ===');
  await p.evaluate(() => setSquareZoom(1.8, true));
  await new Promise(r => setTimeout(r, 250));
  const z2 = await p.evaluate(() => squareZoom);
  ok('масштаб меняется как обычно', Math.abs(z2 - 1.8) < 1e-6, String(z2));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
