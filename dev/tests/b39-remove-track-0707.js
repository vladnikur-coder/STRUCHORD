/* B-39: интерфейс удаления дорожки, защита, подтверждение и история. */
const assert = require('assert');
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.setViewport({width:390,height:844});
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', {waitUntil:'load'});
    await page.evaluate(() => localStorage.setItem('struchord-default-instrument','guitar'));
    await page.reload({waitUntil:'load'});
    await page.evaluate(() => { startNewSongFromHome(); addSection('verse'); sections[0].squares[0].events[0].chord='C'; requestRender(); });
    await page.waitForSelector('.chord-wrapper');
    await page.evaluate(() => StruChordMixer.open());
    const openMenu = id => page.click('.b39-row[data-id="'+id+'"] .b39-dots');
    await openMenu(1);
    assert(await page.$eval('#b39DeleteTrack', el=>el.disabled), 'нельзя удалить последнюю');
    assert.match(await page.$eval('#b39DeleteHint', el=>el.textContent), /хотя бы одна/);
    const id=await page.evaluate(() => StruChordTracks.addTrack('keys'));
    await openMenu(1);
    assert(await page.$eval('#b39DeleteTrack', el=>el.disabled), 'нельзя удалить главную');
    assert.match(await page.$eval('#b39DeleteHint', el=>el.textContent), /перетащите другую/i);
    await openMenu(id);
    assert.equal(await page.$eval('#b39DeleteTrack', el=>el.disabled), false);
    assert(await page.$eval('#b39DeleteHint', el=>el.hidden));
    const before=await page.evaluate(() => StruChordTracks.state());
    let message=''; page.once('dialog', async d=>{message=d.message();await d.dismiss();});
    await page.click('#b39DeleteTrack');
    assert.match(message,/Удалить дорожку/);
    assert.deepStrictEqual(await page.evaluate(() => StruChordTracks.state()),before,'отмена не меняет дорожки');
    // Снимок включает собственный аккорд и настройки дорожки.
    await page.evaluate((id) => {
      const sec=sections[0], sq=sec.squares[0];
      StruChordTracks.setTrackChord(id,StruChordTracks.cellKey(sec,sq,0),'Dm');
      StruChordTracks.setVolume(id,42);
    },id);
    const beforeDelete=await page.evaluate(() => StruChordTracks.state());
    page.once('dialog', d=>d.accept()); await page.click('#b39DeleteTrack');
    let after=await page.evaluate(() => ({state:StruChordTracks.state(), chord:sections[0].squares[0].events[0].chord, hidden:document.querySelector('#b39MixerMenu').hidden}));
    assert.equal(after.state.tracks.length,1); assert.equal(after.state.activeTrackId,1);
    assert.equal(after.chord,'C'); assert(after.hidden);
    await page.evaluate(() => undoEdit()); await new Promise(r=>setTimeout(r,100));
    const restored=await page.evaluate(() => StruChordTracks.state());
    assert.deepStrictEqual(restored.tracks,beforeDelete.tracks, 'undo вернул аккорд и настройки удалённой дорожки');
    await page.evaluate(() => redoEdit()); await new Promise(r=>setTimeout(r,100));
    assert.equal(await page.evaluate(() => StruChordTracks.state().tracks.length),1,'redo удалил дорожку');
    // Смена главной переносит аккорды; теперь старую главную можно удалить.
    await page.evaluate(() => undoEdit()); await new Promise(r=>setTimeout(r,100));
    await page.evaluate(() => StruChordTracks.reorderTracks(1,0));
    await page.evaluate(() => StruChordMixer.open());
    await openMenu(1);
    assert.equal(await page.$eval('#b39DeleteTrack',el=>el.disabled),false);
    page.once('dialog', d=>d.accept()); await page.click('#b39DeleteTrack');
    const switched=await page.evaluate(() => ({state:StruChordTracks.state(),chord:sections[0].squares[0].events[0].chord}));
    assert.equal(switched.state.tracks[0].instrument,'keys'); assert.equal(switched.chord,'Dm');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepStrictEqual(errors,[]);
    console.log('B-39: удаление дорожки — браузерные проверки пройдены');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
