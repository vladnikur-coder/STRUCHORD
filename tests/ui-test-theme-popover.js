// B-16 (2026-08-26): выбор цветовой схемы длинным нажатием на кнопку
// темы. Проверяем сам жест, а не только разметку: короткий тап как
// раньше щёлкает светло/темно, удержание 500мс открывает поповер и
// подавляет следующий click, правый клик открывает тот же список,
// выбор пункта применяет схему и закрывает поповер.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
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
const w = dom.window;
const d = w.document;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('   ok  ', name); }
  else { fail++; console.log('   FAIL', name, detail === undefined ? '' : ' — ' + detail); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PointerEvent в jsdom может отсутствовать: собираем событие с нужными
// полями руками (код читает pointerType/button/clientX/clientY).
function ptr(type, props) {
  props = Object.assign({ bubbles: true, cancelable: true }, props || {});
  let e;
  try { e = new w.PointerEvent(type, props); }
  catch (_) { e = new w.MouseEvent(type, props); }
  for (const k of Object.keys(props)) {
    try {
      if (e[k] === undefined) Object.defineProperty(e, k, { value: props[k] });
    } catch (_) { /* поле защищено — обработчик прочитает дефолт */ }
  }
  return e;
}

(async () => {
  const btn = d.getElementById('themeToggleBtn');
  const pop = d.getElementById('schemePopover');
  const popList = d.getElementById('schemePopoverList');
  const themeOf = () => d.documentElement.getAttribute('data-theme') || 'light';
  const isOpen = () => pop.classList.contains('is-open');

  console.log('\n=== B-16. Разметка и инициализация ===');
  ok('кнопка темы и поповер на месте', !!btn && !!pop && !!popList);
  ok('поповер закрыт при старте', !isOpen() && pop.getAttribute('aria-hidden') === 'true');
  ok('кнопка заявляет попап списком', btn.getAttribute('aria-haspopup') === 'listbox');

  console.log('\n=== B-16. Короткий тап: тема щёлкается, поповер молчит ===');
  const t0 = themeOf();
  btn.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }));
  await sleep(40);
  btn.dispatchEvent(ptr('pointerup', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }));
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('тап переключил тему', themeOf() !== t0, `${t0} -> ${themeOf()}`);
  await sleep(600);
  ok('тап не открыл поповер', !isOpen());

  console.log('\n=== B-16. Длинное нажатие: поповер + подавление click ===');
  const t1 = themeOf();
  btn.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }));
  await sleep(600);
  ok('лонгпресс открыл поповер', isOpen());
  ok('aria-expanded на кнопке', btn.getAttribute('aria-expanded') === 'true');
  ok('внутри 16 схем (Дефолт + 15)', popList.querySelectorAll('.scheme-item').length === 16,
     'пунктов: ' + popList.querySelectorAll('.scheme-item').length);
  const selNow = popList.querySelector('.scheme-item[aria-selected="true"]');
  ok('текущая схема подсвечена (Дефолт)', !!selNow && (selNow.getAttribute('data-scheme-id') || '') === '');
  ok('у клона нет inline onclick (обработчик делегирован в JS)',
     [...popList.querySelectorAll('.scheme-item')].every((el) => !el.getAttribute('onclick')));
  // Отпускаем палец: браузер добросит click — тема НЕ должна щёлкнуться.
  btn.dispatchEvent(ptr('pointerup', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }));
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('click после лонгпресса тему НЕ тронул', themeOf() === t1, `${t1} -> ${themeOf()}`);
  ok('поповер остался открыт (ждёт выбора)', isOpen());
  // А следующий обычный тап снова переключает тему (флаг одноразовый).
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('следующий тап тему щёлкает снова', themeOf() !== t1, `${t1} -> ${themeOf()}`);
  ok('…и закрывает открытый поповер', !isOpen());
  // Возвращаем тему, чтобы не путать дальнейшие сравнения.
  if (themeOf() !== t1) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  console.log('\n=== B-16. Выбор пункта применяет схему ===');
  btn.dispatchEvent(ptr('contextmenu', { pointerType: 'mouse', button: 2, clientX: 8, clientY: 8, bubbles: true, cancelable: true }));
  ok('правый клик открыл поповер', isOpen());
  const oceanItem = popList.querySelector('[data-scheme-id="ocean"]');
  ok('пункт «Океан» есть в списке', !!oceanItem);
  oceanItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('data-scheme = ocean', d.documentElement.getAttribute('data-scheme') === 'ocean');
  ok('выбор сохранён в localStorage', w.localStorage.getItem('struchord-scheme') === 'ocean');
  ok('поповер закрылся после выбора', !isOpen());
  const headName = d.getElementById('schemeCurrentName');
  ok('заголовок панели «Тык» обновился', !!headName && headName.textContent.trim() === 'Океан',
     headName && headName.textContent);

  console.log('\n=== B-16. Повторное открытие: подсветка следует за схемой ===');
  btn.dispatchEvent(ptr('contextmenu', { pointerType: 'mouse', button: 2, clientX: 8, clientY: 8, bubbles: true, cancelable: true }));
  const selOcean = popList.querySelector('.scheme-item[aria-selected="true"]');
  ok('подсвечен «Океан»', !!selOcean && selOcean.getAttribute('data-scheme-id') === 'ocean',
     selOcean && selOcean.getAttribute('data-scheme-id'));

  console.log('\n=== B-16. Закрытия: Escape и клик мимо ===');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  ok('Escape закрыл поповер', !isOpen());
  w.eval('openSchemePopover()');
  ok('повторно открыт (для клика мимо)', isOpen());
  d.body.dispatchEvent(ptr('pointerdown', { bubbles: true, clientX: 400, clientY: 400 }));
  ok('клик мимо закрыл поповер', !isOpen());

  console.log('\n=== B-16. Системное меню на кнопке заглушено ===');
  const cm = ptr('contextmenu', { pointerType: 'mouse', button: 2, bubbles: true, cancelable: true });
  btn.dispatchEvent(cm);
  ok('contextmenu предотвращён', cm.defaultPrevented);
  ok('…и открыл наш список', isOpen());
  w.eval('closeSchemePopover()');

  console.log('\n=== B-16. Сдвиг пальца отменяет жест (скролл) ===');
  const t2 = themeOf();
  btn.dispatchEvent(ptr('pointerdown', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }));
  await sleep(100);
  btn.dispatchEvent(ptr('pointermove', { pointerType: 'touch', clientX: 5, clientY: 40 }));
  await sleep(500);
  ok('после сдвига поповер не открылся', !isOpen());
  btn.dispatchEvent(ptr('pointerup', { pointerType: 'touch', clientX: 5, clientY: 40 }));
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('тема после прерванного жеста щёлкается обычно', themeOf() !== t2);
  if (themeOf() !== t2) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  d.documentElement.removeAttribute('data-scheme');
  try { w.localStorage.removeItem('struchord-scheme'); } catch (_) {}

  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
