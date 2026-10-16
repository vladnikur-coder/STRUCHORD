#!/usr/bin/env node
/*
 * escape-inert-blocks.js — экранирование закрывающих HTML-тегов внутри
 * невидимых блоков <script type="text/plain"> (встроенные рантаймы
 * GP6/BCFS, GPIF-писатель, GP7-8/ZIP и alphaTab).
 *
 * ЗАЧЕМ. Live Server (и некоторые другие инструменты раздачи) вклеивают
 * свой служебный <script> перед ПЕРВЫМ </body>, который находят в файле.
 * Встроенный бандл alphaTab печатает HTML-страницу и содержит внутри себя
 * </body>. Из-за этого служебный </script> из вставки закрывал невидимый
 * блок на полпути, браузер дальше разбирал остаток библиотеки как разметку —
 * под приложением появлялась простыня исходника, приложение ломалось, а в
 * консоли сыпались ошибки «Invalid value for <svg> attribute width="${0|t}px"».
 * Проверялось в Chromium 149: до правки body.innerText = 274 918 символов,
 * после — 147; совпало и с цифрами пользователя (275 013).
 *
 * ЧТО ДЕЛАЕМ. '</' → '<\/' внутри невидимых блоков. Для JS это тот же самый
 * символ (identity escape в строковых литералах и в регулярных выражениях),
 * поэтому поведение рантайма не меняется: print() по-прежнему выводит
 * «</body>». Правило общее, а не точечное: экранируются все закрывающие
 * теги, включая те, что появятся в будущих версиях бандла.
 *
 * Запуск: node dev/tools/escape-inert-blocks.js [--check]
 *   --check — ничего не менять, только сообщить о расхождениях (код 1).
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const checkOnly = process.argv.includes('--check');

const INERT_BLOCK_IDS = ["gpxBcfzRuntime", "gpifWriterRuntime", "gp78ZipRuntime", "midiRuntime", "alphaTabRuntime"];
const INERT = new RegExp(
  `(<script id="(?:${INERT_BLOCK_IDS.join("|")})" type="text/plain">)([\\s\\S]*?)(</script>)`,
  'g'
);

// Лексер вместо регулярки. Правило «</ перед буквой» не годится: в исходнике
// есть .replace(/</g,"&lt;"), где «</» — это тело регулярного выражения вместе
// с закрывающим слэшем. Экранировать там нельзя, V8 перестаёт парсить файл
// («Invalid regular expression: /<\/g…»). Поэтому разбираем код и правим «</»
// ТОЛЬКО внутри строковых и шаблонных литералов: для JS это тот же символ
// (identity escape), а снаружи — регулярки, комментарии, код — не трогаем.

const REGEX_ALLOWED_BEFORE = '(,=:[!&|?{};+-*%~^<>\n\t ';

function escapeInert(code) {
  const n = code.length;
  let i = 0;
  let count = 0;

  // Строковый литерал '…' или "…": экранируем «</» внутри.
  function readString(quote) {
    let j = i + 1;
    let buf = quote;
    while (j < n) {
      if (code[j] === '\\') { buf += code[j] + (code[j + 1] || ''); j += 2; continue; }
      if (code[j] === quote) { buf += quote; j++; break; }
      if (code[j] === '<' && code[j + 1] === '/') { buf += '<\\/'; count++; j += 2; continue; }
      buf += code[j]; j++;
    }
    i = j;
    return buf;
  }

  // Шаблонный литерал `…`: внутри него «${…}» — снова код, поэтому рекурсия.
  function readTemplate() {
    let j = i + 1;
    let buf = '`';
    while (j < n) {
      const ch = code[j];
      if (ch === '\\') { buf += ch + (code[j + 1] || ''); j += 2; continue; }
      if (ch === '`') { buf += '`'; j++; break; }
      if (ch === '$' && code[j + 1] === '{') {
        buf += '${'; j += 2; i = j;
        buf += readCode('}');
        j = i;
        continue;
      }
      if (ch === '<' && code[j + 1] === '/') { buf += '<\\/'; count++; j += 2; continue; }
      buf += ch; j++;
    }
    i = j;
    return buf;
  }

  // Код до endChar ('}' при ${…}, иначе до конца файла).
  function readCode(endChar) {
    let out = '';
    let last = '';
    while (i < n) {
      const ch = code[i];
      if (endChar && ch === endChar) { i++; return out + ch; }
      if (ch === "'" || ch === '"') { out += readString(ch); last = ch; continue; }
      if (ch === '`') { out += readTemplate(); last = '`'; continue; }
      if (ch === '/' && code[i + 1] === '/') {
        const nl = code.indexOf('\n', i);
        const end = nl === -1 ? n : nl;
        out += code.slice(i, end); i = end; continue;
      }
      if (ch === '/' && code[i + 1] === '*') {
        const close = code.indexOf('*/', i + 2);
        const end = close === -1 ? n : close + 2;
        out += code.slice(i, end); i = end; continue;
      }
      if (ch === '/' && (last === '' || REGEX_ALLOWED_BEFORE.includes(last))) {
        const start = i;
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === '[') inClass = true;
          else if (code[j] === ']') inClass = false;
          else if (code[j] === '/' && !inClass) break;
          else if (code[j] === '\n') break;
          j++;
        }
        out += code.slice(start, j + 1);
        i = j + 1;
        last = '/';
        continue;
      }
      if (!/\s/.test(ch)) last = ch;
      out += ch; i++;
    }
    return out;
  }

  return { code: readCode(''), count };
}

// Модулем этот файл тоже нужен: dev/tools/check-html-syntax.js и регресс
// dev/tests/live-server-injection.js берут отсюда escapeInert, чтобы проверять
// страницу тем же лексером, которым она чинится.
if (require.main === module) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  let out = html;
  let touched = 0;
  const report = [];

  // Матчи ищем по УЖЕ изменённому тексту: экранирование удлиняет блок на
  // каждый «</», и смещения из исходной строки после первой правки указывали
  // внутрь соседнего блока — файл разрывался на середине (проверено на
  // gpifWriterRuntime: пропадал gp78ZipRuntime).
  INERT.lastIndex = 0;
  let match;
  while ((match = INERT.exec(out)) !== null) {
    const id = /id="([\w-]+)"/.exec(match[1])[1];
    const result = escapeInert(match[2]);
    if (result.count > 0) touched++;
    report.push(`   ${id}: экранировано «</» — ${result.count}`);
    out = out.slice(0, match.index) + match[1] + result.code + match[3] + out.slice(match.index + match[0].length);
    INERT.lastIndex = match.index + match[1].length + result.code.length + match[3].length;
  }

  console.log('escape-inert-blocks:');
  report.forEach(line => console.log(line));

  if (touched === 0) {
    console.log('   все невидимые блоки уже экранированы');
  } else if (checkOnly) {
    console.error(`\nОШИБКА: неэкранированных «</» в ${touched} блоке(ах) — запустите node dev/tools/escape-inert-blocks.js`);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(htmlPath, out);
    console.log(`   записано: блоков изменено ${touched}`);
  }
}

module.exports = { escapeInert, INERT_BLOCK_IDS };
