#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const htmlPath = path.join(repo, 'STRUCHORD.html');
const sourcePath = path.join(__dirname, 'gpx-bcfz-runtime.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const embedded = `    <script id="gpxBcfzRuntime" type="text/plain">\n${source}\n    </script>`;
const pattern = /    <script id="gpxBcfzRuntime" type="text\/plain">[\s\S]*?<\/script>/;
if (!pattern.test(html)) {
  const anchor = '    <script id="gp78ZipRuntime" type="text/plain">';
  if (!html.includes(anchor)) throw new Error('Cannot find the GP7/8 ZIP runtime insertion point.');
  fs.writeFileSync(htmlPath, html.replace(anchor, `${embedded}\n${anchor}`));
} else {
  fs.writeFileSync(htmlPath, html.replace(pattern, embedded));
}
console.log('Embedded GP6 BCFZ/BCFS runtime into STRUCHORD.html');

// Невидимые блоки нельзя оставлять с «сырым» </body>: Live Server и другие
// инструменты раздачи вклеивают служебный <script> перед первым </body> файла,
// и тот закрывал блок на полпути (хотфикс 0.641 — dev/tools/escape-inert-blocks.js).
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'tools', 'escape-inert-blocks.js')], { stdio: 'inherit' });