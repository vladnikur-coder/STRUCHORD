#!/usr/bin/env node
'use strict';

// End-to-end Auto-Sync acceptance check against the user's embedded Oasis MP3.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const puppeteer = require('puppeteer');
const chromiumPackage = require('@sparticuz/chromium');
const chromium = chromiumPackage.default;
const ROOT = path.resolve(__dirname, '..', '..');
const input = process.argv.slice(2).find(argument => !argument.startsWith('--'))
  || "/tmp/arena-coding-uploads/Oasis - Don't Look Back in Anger.json";

function staticServer() {
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.wav':'audio/wav' };
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'STRUCHORD.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
}

(async () => {
  const project = JSON.parse(fs.readFileSync(input, 'utf8'));
  const oldPoints = project.backingTrack.points.map(point => ({bar:point.bar,time:point.time}));
  const libraryRoot = '/tmp/al2023/lib';
  if (!fs.existsSync(path.join(libraryRoot, 'libnspr4.so'))) {
    const packageBuild = path.dirname(require.resolve('@sparticuz/chromium'));
    await chromiumPackage.inflate(path.resolve(packageBuild, '..', 'bin', 'al2023.tar.br'));
  }
  const server = staticServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(), headless:'shell',
    args:[...chromium.args, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    env:{...process.env, LD_LIBRARY_PATH:[libraryRoot,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1400,height:1000});
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/STRUCHORD.html`, {waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(() => window.StruChordBackingTrack);
    await page.evaluate(async song => {
      document.documentElement.classList.remove('is-home-screen'); document.body.classList.remove('is-home-screen');
      globalTimeSig=song.globalTimeSig||'4/4'; sections=JSON.parse(JSON.stringify(song.sections)); DOM.bpmInput.value=String(song.bpm);
      const copy={...song,backingTrack:{...song.backingTrack}};
      await StruChordBackingTrack.importEmbedded(copy);
      await StruChordBackingTrack.loadSong({backingTrack:song.backingTrack});
      StruChordBackingTrack.invalidateGrid(); StruChordBackingTrack.toggleDrawer(true);
      if(window.resetHistory)window.resetHistory();
      document.querySelector('[data-bt-action="autosync"]').onclick();
      document.querySelector('[data-autosync-run]').click();
    }, project);
    await page.waitForFunction(() => document.querySelector('[data-autosync-apply]') || document.querySelector('.bt-autosync-error'), {timeout:120000});
    const preview = await page.evaluate(() => ({
      error:document.querySelector('.bt-autosync-error')?.textContent||'',
      summary:document.querySelector('.bt-autosync-summary')?.textContent.replace(/\s+/g,' ').trim()||'',
      rows:[...document.querySelectorAll('.bt-autosync-table tbody tr')].map(row=>row.textContent.replace(/\s+/g,' ').trim()),
      points:StruChordBackingTrack.serialize().points,
      disabled:document.querySelector('[data-autosync-apply]')?.disabled,
    }));
    assert.strictEqual(preview.error, '');
    assert.deepStrictEqual(preview.points, oldPoints, 'preview must not mutate existing points');
    assert.strictEqual(preview.disabled, false);
    assert(preview.rows.length >= 2 && preview.rows.length <= 3, preview.rows.join(' | '));
    const match = preview.summary.match(/([\d.]+) BPM.*Первый удар ([\d.]+) с.*Уверенность (\d+)%/);
    assert(match, preview.summary);
    const bpm=Number(match[1]), firstBeat=Number(match[2]), confidence=Number(match[3]);
    assert(bpm>=81.35&&bpm<=81.45,String(bpm));
    assert(firstBeat>=.27&&firstBeat<=.31,String(firstBeat));
    assert(confidence>=55,String(confidence));
    await page.setViewport({width:390,height:844});
    const mobile = await page.evaluate(() => {
      const panel=document.querySelector('.bt-autosync-panel'),rect=panel.getBoundingClientRect();
      return {viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,panelLeft:rect.left,panelRight:rect.right};
    });
    assert(mobile.bodyWidth<=mobile.viewport+1,JSON.stringify(mobile));
    assert(mobile.panelLeft>=-1&&mobile.panelRight<=mobile.viewport+1,JSON.stringify(mobile));
    await page.evaluate(()=>document.querySelector('[data-autosync-apply]').click());
    const applied = await page.evaluate(()=>StruChordBackingTrack.serialize().points);
    assert(applied.length>=2&&applied.length<=3,JSON.stringify(applied));
    assert(applied[0].time>=.27&&applied[0].time<=.31,JSON.stringify(applied));
    await page.evaluate(()=>window.undoEdit());
    await new Promise(resolve=>setTimeout(resolve,100));
    const undone = await page.evaluate(()=>StruChordBackingTrack.serialize().points);
    assert.deepStrictEqual(undone,oldPoints,'Undo must restore the original points in one step');
    assert.deepStrictEqual(pageErrors,[],'browser page errors');
    console.log(JSON.stringify({bpm,firstBeat,confidence,previewPoints:preview.rows,mobile,applied,undoRestored:true},null,2));
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error&&error.stack||error);process.exit(1);});
