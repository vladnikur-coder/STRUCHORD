// Импорт песни из файла — кнопка «Из файла…» в диалоге загрузки.
//
// В Safari он не работал по двум причинам сразу:
//   1. click() звался на <input>, которого НЕТ в документе. Chrome такое
//      прощает, WebKit — нет: событие до элемента вне дерева не доходит,
//      системное окно не открывается;
//   2. accept = '.json,.struchord.json' — составное расширение не то,
//      что понимает спецификация (ожидается одно расширение после
//      последней точки). WebKit на нём гасит в окне вообще все файлы.
//
// Проверять приходится в headless Chrome, где дефект НЕ воспроизводится.
// Поэтому стенд смотрит не на «открылось ли окно», а на сами условия:
// лежит ли input в DOM в момент клика и какой у него accept.
const puppeteer = require('/home/user/node_modules/puppeteer');

let bad = 0;
const ok = (n, c, x) => {
  console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`);
  if (!c) bad++;
};

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 60000,
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('dialog', (d) => d.accept());
  const toasts = [];
  await p.exposeFunction('__t', (x) => toasts.push(x));
  await p.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await p.evaluate(() => {
    const o = window.showToast;
    window.showToast = function (x) {
      window.__t(x);
      return o.apply(this, arguments);
    };
  });
  await new Promise((r) => setTimeout(r, 900));

  console.log('=== 1. Условия, которых требует WebKit ===');
  const cond = await p.evaluate(() => {
    let captured = null;
    let atClick = null;
    const origCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
      const el = origCreate(tag);
      if (tag === 'input') captured = el;
      return el;
    };
    const origClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this.type === 'file') {
        const cs = getComputedStyle(this);
        atClick = {
          inDom: document.contains(this),
          accept: this.accept,
          display: cs.display,
          hasOnchange: !!this.onchange,
        };
      }
      // Сам клик НЕ пропускаем: системное окно в этой проверке не нужно.
    };
    window.importSongFile();
    document.createElement = origCreate;
    HTMLElement.prototype.click = origClick;
    if (captured) captured.remove();
    return atClick;
  });
  ok('input лежит в документе в момент click()', cond && cond.inDom === true, JSON.stringify(cond));
  ok('accept без составного расширения', cond && !/\.struchord\.json/.test(cond.accept), cond && cond.accept);
  ok('accept содержит .json', cond && /\.json/.test(cond.accept), cond && cond.accept);
  // display:none тоже делает элемент некликабельным в WebKit — прячем
  // сдвигом за экран.
  ok('input скрыт НЕ через display:none', cond && cond.display !== 'none', cond && cond.display);
  ok('обработчик выбора назначен', cond && cond.hasOnchange === true, String(cond && cond.hasOnchange));

  console.log('=== 2. Путь пользователя целиком ===');
  await p.evaluate(() => openLoadSongDialog());
  await new Promise((r) => setTimeout(r, 500));
  ok('кнопка «Из файла…» есть в диалоге', await p.evaluate(() => !!document.getElementById('loadFromFileBtn')));

  const [chooser] = await Promise.all([
    p.waitForFileChooser({ timeout: 8000 }),
    p.evaluate(() => document.getElementById('loadFromFileBtn').click()),
  ]);
  ok('системное окно выбора открылось', true);
  await chooser.accept(['/home/user/uploads/Every breath you take.struchord.json']);
  await new Promise((r) => setTimeout(r, 1200));
  const st = await p.evaluate(() => ({
    title: document.getElementById('songTitle').value,
    events: sections.reduce((s, x) => s + x.squares.reduce((y, q) => y + q.events.length, 0), 0),
    leftovers: document.querySelectorAll('input[type=file]').length,
    overlays: document.querySelectorAll('.strum-modal-overlay').length,
  }));
  ok('песня загрузилась', st.title === 'Every breath you take', st.title);
  ok('события на месте', st.events > 0, String(st.events));
  ok('диалог загрузки закрылся', st.overlays === 0, String(st.overlays));
  ok('input убран за собой', st.leftovers === 0, String(st.leftovers));
  ok('показан тост об импорте', toasts.some((t) => /импортирована/.test(t)), toasts.slice(-1).join(''));

  console.log('=== 3. Отмена выбора не копит элементы ===');
  for (let i = 0; i < 3; i++) {
    const [ch] = await Promise.all([
      p.waitForFileChooser({ timeout: 8000 }),
      p.evaluate(() => window.importSongFile()),
    ]);
    await ch.cancel();
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 1500));
  ok('после трёх отмен input не остался',
    (await p.evaluate(() => document.querySelectorAll('input[type=file]').length)) === 0);

  console.log('=== 4. Битый файл ===');
  require('fs').writeFileSync('/tmp/bench-bad.json', '{не json');
  const [ch2] = await Promise.all([
    p.waitForFileChooser({ timeout: 8000 }),
    p.evaluate(() => window.importSongFile()),
  ]);
  await ch2.accept(['/tmp/bench-bad.json']);
  await new Promise((r) => setTimeout(r, 800));
  ok('битый файл даёт сообщение, а не тишину',
    toasts.some((t) => /Ошибка чтения файла/.test(t)), toasts.slice(-1).join(''));

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
