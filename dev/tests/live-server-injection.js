// live-server-injection.js — регресс на хотфикс 0.641.
//
// ПОВОД. Пользователь открывал приложение через VS Code Live Server (порт
// 5500) и видел под приложением огромную простыню исходника, ошибки
// «Invalid value for <svg> attribute width="${0|t}px"» и сломанный импорт
// .gpx. Через file:// и через GitHub Pages всё работало — разница была в том,
// что Live Server вклеивает служебный <script> перед ПЕРВЫМ </body> файла.
// Встроенный бандл alphaTab печатает HTML-страницу и содержал </body> у себя
// внутри, поэтому служебный </script> из вставки закрывал невидимый блок на
// полпути: дальше браузер разбирал остаток библиотеки как разметку.
//
// ЧТО СТОРОЖИТ:
//   1. в невидимых блоках нет неэкранированных «</» (тем же лексером, что
//      чинит — escape-inert-blocks.js);
//   2. первые </body> и </html> файла стоят ПОСЛЕ всех невидимых блоков;
//   3. вставка служебного скрипта (как у Live Server) перед первым </body> и
//      перед первым </html> не ломает страницу: блоки целы, в body нет
//      посторонних текстовых узлов, объём текста остаётся приложенческим.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { escapeInert, INERT_BLOCK_IDS } = require('../tools/escape-inert-blocks.js');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

// --- 1. экранирование внутри невидимых блоков ---
console.log('=== 1. невидимые блоки экранированы ===');
const inertRe = new RegExp(`<script id="(${INERT_BLOCK_IDS.join('|')})" type="text/plain">([\\s\\S]*?)<\\/script>`, 'g');
const inert = {};
let m;
while ((m = inertRe.exec(html)) !== null) {
  inert[m[1]] = { code: m[2], at: m.index, end: m.index + m[0].length };
  ok(`#${m[1]}: неэкранированных «</» нет`, escapeInert(m[2]).count === 0);
}
for (const id of INERT_BLOCK_IDS) ok(`блок #${id} присутствует`, !!inert[id]);

// --- 2. служебные скрипты встраиваются только в настоящие </body>/</html> ---
console.log('=== 2. точки вставки служебных скриптов ===');
const lastInertEnd = Math.max(...INERT_BLOCK_IDS.map(id => inert[id] ? inert[id].end : 0));
const iBody = html.indexOf('</body>');
const iHtml = html.indexOf('</html>');
ok('первый </body> — после всех невидимых блоков', iBody > lastInertEnd, `${iBody} <= ${lastInertEnd}`);
ok('первый </html> — после всех невидимых блоков', iHtml > lastInertEnd, `${iHtml} <= ${lastInertEnd}`);
ok('первый </body> — в конце страницы', html.slice(iBody, iBody + 60).includes('</html>'));

// --- 3. вставка как у Live Server не ломает страницу ---
console.log('=== 3. вставка служебного <script> (симуляция Live Server) ===');
const INJECT = '\n<script type="text/javascript" src="/livereload.js?snipver=1"></script>\n';
for (const anchor of ['</body>', '</html>']) {
  const at = html.indexOf(anchor);
  ok(`в исходнике есть ${anchor} для вставки`, at > 0);
  const patched = html.slice(0, at) + INJECT + html.slice(at);
  const dom = new JSDOM(patched);
  const doc = dom.window.document;

  let blocksOk = true;
  let blocksInfo = [];
  for (const id of INERT_BLOCK_IDS) {
    const el = doc.getElementById(id);
    const got = el ? el.textContent.length : -1;
    const want = inert[id] ? inert[id].code.length : 0;
    blocksInfo.push(`${id}=${got}`);
    if (got !== want) blocksOk = false;
  }
  ok(`вставка перед ${anchor}: невидимые блоки целы (${blocksInfo.join(' ')})`, blocksOk);

  const stray = [...doc.body.childNodes].filter(
    n => n.nodeType === 3 && n.textContent.trim().length > 0);
  ok(`вставка перед ${anchor}: в body нет посторонних текст-узлов`, stray.length === 0,
    stray.slice(0, 2).map(n => n.textContent.trim().slice(0, 40)).join(' | '));

  // Текст, который реально видит человек: textContent невидимых <script>
  // и <style> из него вычитаем, иначе это снова длина бандла, а не страницы.
  let text = doc.body.textContent.length;
  for (const el of doc.body.querySelectorAll('script, style')) text -= el.textContent.length;
  ok(`вставка перед ${anchor}: объём видимого текста приложенческий (${text})`, text < 20000,
    'выглядит как простыня исходника');

  const hasHeader = !!doc.querySelector('.app-title');
  ok(`вставка перед ${anchor}: шапка приложения на месте`, hasHeader);
  dom.window.close();
}

console.log(`\n${bad ? 'СБОЕВ: ' + bad : 'ALL OK — Live Server не ломает страницу'}`);
process.exit(bad ? 1 : 0);
