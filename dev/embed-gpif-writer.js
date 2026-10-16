#!/usr/bin/env node
/*
 * Встраивает dev/gpif-writer.js в STRUCHORD.html невидимым блоком
 * <script id="gpifWriterRuntime" type="text/plain"> — по образцу MIDI-рантайма
 * (12.9.7) и BCFZ-кодека (12.9.6). Поднимается только при экспорте в Guitar Pro.
 */
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const htmlPath = path.join(repo, 'STRUCHORD.html');
const sourcePath = path.join(__dirname, 'gpif-writer.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const embedded = `    <script id="gpifWriterRuntime" type="text/plain">\n${source}\n    </script>`;
const pattern = /    <script id="gpifWriterRuntime" type="text\/plain">[\s\S]*?<\/script>/;
if (!pattern.test(html)) {
  const anchor = '    <script id="gp78ZipRuntime" type="text/plain">';
  if (!html.includes(anchor)) throw new Error('Cannot find the GP7/8 runtime insertion point.');
  fs.writeFileSync(htmlPath, html.replace(anchor, `${embedded}\n${anchor}`));
} else {
  fs.writeFileSync(htmlPath, html.replace(pattern, embedded));
}
console.log('Embedded GPIF writer into STRUCHORD.html');

// Экранирование «</» внутри невидимых блоков — обязательный шаг встраивания.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'tools', 'escape-inert-blocks.js')], { stdio: 'inherit' });
