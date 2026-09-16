#!/usr/bin/env node
/*
 * b80-meta-pills.js — регрессии стилизованных списков тональности и
 * размера (волна B-80, дополнение к масштабу UI).
 *
 * Нативные <select#rootKey> и <select#globalTimeSig> оставлены источником
 * истины, но скрыты (класс .meta-select-native): их value/options читают
 * транспонирование, авто-ключ, лента и save/load. Поверх — стилизованные
 * пилюли (#keyPill/#timeSigPill) со своими выпадающими списками, которые
 * пишут значение в select и дёргают его change.
 *
 * Проверяем БЕЗ запуска всего приложения — вырезаем блок функций пилюль
 * из STRUCHORD.html и исполняем его в мини-DOM с настоящей разметкой:
 *  - разметка на месте, нативные select скрыты классом;
 *  - buildMetaList строит список из option/optgroup (группы сохранены);
 *  - выбор пункта пишет в select и запускает событие change;
 *  - syncMetaPills гонит подпись из значения select;
 *  - подпись «auto» тянется динамически;
 *  - toggleMetaPicker открывает/закрывает и подсвечивает текущий;
 *  - открытие одного списка закрывает второй.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name);
  }
}

// --- 1. Разметка на месте ---
const dom0 = new JSDOM(html);
const d0 = dom0.window.document;
check('нативный #rootKey существует', !!d0.getElementById('rootKey'));
check('нативный #globalTimeSig существует', !!d0.getElementById('globalTimeSig'));
check('#rootKey скрыт классом .meta-select-native',
  d0.getElementById('rootKey').classList.contains('meta-select-native'));
check('#globalTimeSig скрыт классом .meta-select-native',
  d0.getElementById('globalTimeSig').classList.contains('meta-select-native'));
check('пилюля #keyPill + подпись + список на месте',
  !!d0.getElementById('keyPill') && !!d0.getElementById('keyPillName') && !!d0.getElementById('keyPickerList'));
check('пилюля #timeSigPill + подпись + список на месте',
  !!d0.getElementById('timeSigPill') && !!d0.getElementById('timeSigPillName') && !!d0.getElementById('timeSigPickerList'));
check('списки изначально скрыты (hidden)',
  d0.getElementById('keyPickerList').hidden && d0.getElementById('timeSigPickerList').hidden);

// --- CSS скрывает нативные select ---
check('CSS .meta-select-native присутствует', /\.meta-select-native\s*\{/.test(html));
check('CSS .meta-pill присутствует', /\.meta-pill\s*\{/.test(html));
check('CSS .meta-pill-list присутствует', /\.meta-pill-list\s*\{/.test(html));
check('render() зовёт syncMetaPills()', /function render\(\)\s*\{[\s\S]{0,120}syncMetaPills\(\)/.test(html));

// --- 2. Вырезаем блок функций пилюль и исполняем его в мини-DOM ---
const start = html.indexOf('const META_PICKERS = {');
// Блок пилюль заканчивается прямо перед секцией окна тюнера.
const endIdx = html.indexOf('// ---------- ОКНО ТЮНЕРА ----------', start);
const snippet = html.slice(start, endIdx);
check('блок функций пилюль извлечён', start > 0 && endIdx > start && snippet.length > 500);

// Мини-DOM: только .meta-row с настоящими select'ами и пустыми пилюлями.
const rootKeyHtml = d0.getElementById('rootKey').outerHTML;
const tsHtml = d0.getElementById('globalTimeSig').outerHTML;
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="meta-row">
    ${rootKeyHtml}
    <button class="meta-pill" id="keyPill"><span id="keyPillName"></span></button>
    <div class="meta-pill-list" id="keyPickerList" hidden></div>
    ${tsHtml}
    <button class="meta-pill" id="timeSigPill"><span id="timeSigPillName"></span></button>
    <div class="meta-pill-list" id="timeSigPickerList" hidden></div>
  </div>
</body></html>`, { runScripts: 'outside-only' });

const win = dom.window;
// jsdom не реализует scrollIntoView — заглушим, чтобы toggle не падал.
win.HTMLElement.prototype.scrollIntoView = function () {};
// Исполняем вырезанный код в контексте окна.
win.eval(snippet);

const doc = win.document;
const rootKey = doc.getElementById('rootKey');
const ts = doc.getElementById('globalTimeSig');

// --- 3. buildMetaList: группы сохранены ---
win.eval('buildMetaList("key")');
const keyList = doc.getElementById('keyPickerList');
const groups = keyList.querySelectorAll('.meta-pill-group');
check('список тональности: сохранены 2 группы (мажорные/минорные)', groups.length === 2);
check('список тональности: группа «Мажорные» на месте',
  [...groups].some((g) => /Мажорные/.test(g.textContent)));
const keyItems = keyList.querySelectorAll('.meta-pill-item');
check('список тональности: 25 пунктов (auto + 12 + 12)', keyItems.length === 25);
check('список тональности: есть пункт auto',
  !!keyList.querySelector('.meta-pill-item[data-value="auto"]'));

win.eval('buildMetaList("timeSig")');
const tsItems = doc.getElementById('timeSigPickerList').querySelectorAll('.meta-pill-item');
check('список размера: ровно 7 пунктов', tsItems.length === 7);
check('список размера: без групп',
  doc.getElementById('timeSigPickerList').querySelectorAll('.meta-pill-group').length === 0);

// --- 4. Выбор пункта пишет в select и дёргает change ---
let keyChanged = null;
rootKey.addEventListener('change', () => { keyChanged = rootKey.value; });
keyList.querySelector('.meta-pill-item[data-value="G"]').onclick();
check('клик по «G» записал value в #rootKey', rootKey.value === 'G');
check('клик по «G» вызвал change на #rootKey', keyChanged === 'G');
check('после выбора список тональности закрылся', keyList.hidden === true);

let tsChanged = null;
ts.addEventListener('change', () => { tsChanged = ts.value; });
doc.getElementById('timeSigPickerList').querySelector('.meta-pill-item[data-value="3/4"]').onclick();
check('клик по «3/4» записал value в #globalTimeSig', ts.value === '3/4');
check('клик по «3/4» вызвал change', tsChanged === '3/4');

// --- 5. syncMetaPills гонит подписи ---
win.eval('syncMetaPills()');
check('подпись тональности = value (G)', doc.getElementById('keyPillName').textContent === 'G');
check('подпись размера = value (3/4)', doc.getElementById('timeSigPillName').textContent === '3/4');

// auto: подпись = полный текст option (динамический бейдж)
doc.getElementById('autoKeyOption').textContent = 'Am (авто)';
rootKey.value = 'auto';
win.eval('syncMetaPills()');
check('подпись auto тянет динамический текст «Am (авто)»',
  doc.getElementById('keyPillName').textContent === 'Am (авто)');

// --- 6. toggle: открыть один — закрыть другой ---
win.eval('toggleMetaPicker("key", true)');
win.eval('toggleMetaPicker("timeSig", true)');
check('открытие размера закрыло тональность',
  keyList.hidden === true && doc.getElementById('timeSigPickerList').hidden === false);

// подсветка текущего при открытии
win.eval('toggleMetaPicker("timeSig", false)');
ts.value = '6/8';
win.eval('toggleMetaPicker("timeSig", true)');
const cur = doc.getElementById('timeSigPickerList').querySelector('.meta-pill-item.is-current');
check('открытие подсвечивает текущий размер (6/8)', cur && cur.dataset.value === '6/8');

console.log(`\nИТОГО: пройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);
