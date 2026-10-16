#!/usr/bin/env node
/*
 * Встраивает dev/midi-runtime.js в STRUCHORD.html невидимым блоком
 * <script id="midiRuntime" type="text/plain"> — по образцу ZIP-кодека (12.9.5)
 * и BCFZ-рантайма (12.9.6). Поднимается только при импорте .mid.
 */
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const htmlPath = path.join(repo, 'STRUCHORD.html');
const sourcePath = path.join(__dirname, 'midi-runtime.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const embedded = `    <script id="midiRuntime" type="text/plain">\n${source}\n    </script>`;
const pattern = /    <script id="midiRuntime" type="text\/plain">[\s\S]*?<\/script>/;
if (!pattern.test(html)) {
  const anchor = '    <!-- alphaTab v1.8.4 (MPL-2.0), embedded and lazy-loaded for GP3–GP5. -->';
  if (!html.includes(anchor)) throw new Error('Cannot find the alphaTab runtime insertion point.');
  fs.writeFileSync(htmlPath, html.replace(anchor, `${embedded}\n${anchor}`));
} else {
  fs.writeFileSync(htmlPath, html.replace(pattern, embedded));
}
console.log('Embedded Standard MIDI File reader into STRUCHORD.html');

// Экранирование «</» внутри невидимых блоков — обязательный шаг встраивания
// (хотфикс 0.641, dev/tools/escape-inert-blocks.js).
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'tools', 'escape-inert-blocks.js')], { stdio: 'inherit' });