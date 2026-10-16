#!/usr/bin/env node
/*
 * Встраивает dev/gp5-writer.js в STRUCHORD.html невидимым блоком
 * <script id="gp5WriterRuntime" type="text/plain"> — по образцу GPIF-писателя
 * и MIDI-рантайма. Поднимается только при экспорте в Guitar Pro 5.
 */
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const htmlPath = path.join(repo, 'STRUCHORD.html');
const sourcePath = path.join(__dirname, 'gp5-writer.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const embedded = `    <script id="gp5WriterRuntime" type="text/plain">\n${source}\n    </script>`;
const pattern = /    <script id="gp5WriterRuntime" type="text\/plain">[\s\S]*?<\/script>/;
if (!pattern.test(html)) {
  const anchor = '    <script id="gpifWriterRuntime" type="text/plain">';
  if (!html.includes(anchor)) throw new Error('Cannot find the GPIF writer insertion point.');
  fs.writeFileSync(htmlPath, html.replace(anchor, `${embedded}\n${anchor}`));
} else {
  fs.writeFileSync(htmlPath, html.replace(pattern, embedded));
}
console.log('Embedded GP5 writer into STRUCHORD.html');

// Экранирование «</» внутри невидимых блоков — обязательный шаг встраивания.
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'tools', 'escape-inert-blocks.js')], { stdio: 'inherit' });