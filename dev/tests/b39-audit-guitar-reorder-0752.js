/* Диагностика 0.752: показывает существующую проблему, не норму поведения. */
const assert = require('assert'), puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument','guitar'));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8009/STRUCHORD.html');
    if(await page.evaluate(()=>typeof StruChordTracks.guitarShape==='function')){console.log('Диагностика 0.752 пропущена: перестановка проверяется в b39-guitar-track-shapes-0753.js');return;}
    const result = await page.evaluate(() => {
      startNewSongFromHome(); addSection('Verse');
      const T=StruChordTracks, s=sections[0], q=s.squares[0], ev=q.events[0];
      ev.chord='C'; ev.fingering='x,3,2,0,1,0';
      const id=T.addTrack('guitar'), cell=T.cellKey(s,q,0);
      T.setTrackChord(id,cell,'Am');
      const before=JSON.parse(JSON.stringify(ev));
      T.reorderTracks(1,0);
      return {before,after:JSON.parse(JSON.stringify(ev)),newMain:T.state().mainTrackId,id};
    });
    assert.equal(result.before.chord,'C');
    assert.equal(result.after.chord,'Am');
    assert.equal(result.newMain,result.id);
    assert.equal(result.after.fingering,result.before.fingering,'текущая ошибка: чужая форма осталась на новом главном аккорде');
    console.log('Аудит 0.752: форма главной гитары остаётся на событии при перестановке дорожек');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
