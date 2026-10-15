#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const htmlPath = path.join(repo, 'STRUCHORD.html');
const sourcePath = path.join(__dirname, 'gp78-zip-runtime.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8').trimEnd();
const embedded = `    <script id="gp78ZipRuntime" type="text/plain">\n${source}\n    </script>`;
const pattern = /    <script id="gp78ZipRuntime" type="text\/plain">[\s\S]*?<\/script>/;
if (!pattern.test(html)) {
  const anchor = '    <!-- alphaTab v1.8.4 (MPL-2.0), embedded and lazy-loaded for GP3–GP5. -->';
  if (!html.includes(anchor)) throw new Error('Cannot find the alphaTab runtime insertion point.');
  fs.writeFileSync(htmlPath, html.replace(anchor, `${embedded}\n${anchor}`));
} else {
  fs.writeFileSync(htmlPath, html.replace(pattern, embedded));
}
console.log('Embedded GP7/8 ZIP runtime into STRUCHORD.html');
