// Предупреждение при закрытии с несохранёнными правками.
//
// Отслеживание построено на СЛЕПКЕ песни (serializeCurrentSong), а не на
// флаге «что-то меняли»: флаг пришлось бы ставить в каждом обработчике, и
// один забытый вызов молча ломал бы защиту. Побочная выгода слепка —
// правка «туда и обратно» не считается изменением.
//
// Ложное срабатывание здесь дороже пропуска: диалог на ровном месте
// приучает закрывать его не глядя, и тогда он не сработает там, где нужен.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });

  const q = () => p.evaluate(() => hasUnsavedChanges());

  console.log('=== 1. Чистый старт без сохранённых песен ===');
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1100));
  let r = await p.evaluate(() => ({
    unsaved: hasUnsavedChanges(),
    sections: sections.length,
    title: document.getElementById('songTitle').value,
  }));
  console.log(`      секций ${r.sections}, название «${r.title}»`);
  ok('на пустом экране диалога не будет', r.unsaved === false, String(r.unsaved));

  console.log('\n=== 2. Загруженная песня не считается изменённой ===');
  await p.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 700));
  ok('сразу после загрузки — чисто', (await q()) === false);

  console.log('\n=== 3. Правка модели ловится ===');
  await p.evaluate(() => { sections[0].squares[0].events[0].chord = 'B7'; render(); });
  await new Promise(r => setTimeout(r, 300));
  ok('смена аккорда — есть изменения', (await q()) === true);

  await p.evaluate(() => { document.getElementById('songTitle').value = 'Другое имя'; });
  await new Promise(r => setTimeout(r, 200));
  ok('смена названия — есть изменения', (await q()) === true);

  console.log('\n=== 4. Возврат к исходному снимает флаг ===');
  await p.evaluate(() => {
    sections[0].squares[0].events[0].chord = 'F';
    document.getElementById('songTitle').value = 'Scorpions - Wind of Change';
    render();
  });
  await new Promise(r => setTimeout(r, 300));
  // Слепок восстановился — спрашивать не о чем. Флаговая схема здесь
  // продолжала бы считать песню изменённой.
  ok('правка «туда и обратно» не считается', (await q()) === false);

  console.log('\n=== 5. Точки, задающие новую отсечку ===');
  await p.evaluate(() => { sections[0].squares[0].events[0].chord = 'A7'; render(); });
  await new Promise(r => setTimeout(r, 200));
  await p.evaluate(() => { window.confirm = () => true; saveCurrentSong(); });
  await new Promise(r => setTimeout(r, 400));
  ok('после сохранения — чисто', (await q()) === false);

  await p.evaluate(() => { document.getElementById('bpmInput').value = 137; });
  await new Promise(r => setTimeout(r, 200));
  ok('смена BPM — есть изменения', (await q()) === true);

  await p.evaluate(() => { window.confirm = () => true; clearAll(); });
  await new Promise(r => setTimeout(r, 500));
  ok('после сброса — чисто', (await q()) === false);

  await p.evaluate(() => { loadSong(0); });
  await new Promise(r => setTimeout(r, 600));
  ok('после повторной загрузки — чисто', (await q()) === false);

  console.log('\n=== 6. Новая работа с нуля ===');
  await p.evaluate(() => { window.confirm = () => true; clearAll(); });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => {
    addSection('Verse'); render();
    sections[0].squares[0].events[0].chord = 'Em'; render();
  });
  await new Promise(r => setTimeout(r, 400));
  ok('песня, которую ни разу не сохраняли, защищена', (await q()) === true);

  console.log('\n=== 7. Обработчик beforeunload ===');
  r = await p.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(ev, 'returnValue', { writable: true, value: '' });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok('при изменениях уход останавливается', r === true, String(r));

  await p.evaluate(() => { window.confirm = () => true; saveCurrentSong(); });
  await new Promise(r => setTimeout(r, 400));
  r = await p.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(ev, 'returnValue', { writable: true, value: '' });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok('без изменений уход не мешает', r === false, String(r));

  console.log('\n=== 8. Просмотр не считается правкой ===');
  await p.evaluate(() => { loadSong(0); });
  await new Promise(r => setTimeout(r, 600));
  // Режимы, зум и прокрутка — состояние интерфейса, не песни.
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise(r => setTimeout(r, 500));
  ok('переход в режим ленты — не правка', (await q()) === false);
  await p.evaluate(() => { setTimelineZoom(1.5); });
  await new Promise(r => setTimeout(r, 300));
  ok('зум ленты — не правка', (await q()) === false);
  await p.evaluate(() => toggleTimelineMode(false));
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => { setSquareZoom(2, true); });
  await new Promise(r => setTimeout(r, 300));
  ok('зум квадратов — не правка', (await q()) === false);

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
