/* B-39: выбор инструмента, новая и старая песни, настройки и сброс. */
const assert = require('assert');
const puppeteer = require('puppeteer');
const url = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
(async () => {
  const browser = await puppeteer.launch({executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium', args: ['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({width: 320, height: 700});
    await page.goto(url, {waitUntil: 'load'});
    await page.evaluate(() => localStorage.removeItem('struchord-default-instrument'));
    await page.reload({waitUntil: 'load'});
    assert(await page.$('.first-instrument-modal'), 'обязательный выбор');
    assert.equal(await page.$$eval('.first-instrument-modal button:disabled', b => b.length), 2);
    await page.keyboard.press('Escape');
    assert(await page.$('.first-instrument-modal'), 'Escape не закрывает выбор');
    const overflow = await page.evaluate(() => {const m = document.querySelector('.first-instrument-modal'); return m.scrollWidth > innerWidth || document.documentElement.scrollWidth > innerWidth;});
    assert(!overflow, 'нет горизонтального переполнения на 320px');
    await page.click('.first-instrument-modal [data-instrument="keys"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('struchord-default-instrument')), 'keys');
    await page.reload({waitUntil: 'load'});
    assert.equal(await page.$('.first-instrument-modal'), null, 'повторно не спрашивать');
    await page.evaluate(() => startNewSongFromHome());
    assert.equal(await page.evaluate(() => StruChordTracks.state().tracks[0].instrument), 'keys');
    assert.equal(await page.evaluate(() => StruChordTracks.removeTrack(1)), false, 'последнюю удалить нельзя');
    assert.equal(await page.evaluate(() => hasUnsavedChanges()), false);
    // Старая песня: и отсутствие поля, и прежний явный пустой массив.
    for (const tracks of [undefined, []]) {
      const result = await page.evaluate((tracks) => {
        const raw = {sections: [], ...(tracks === undefined ? {} : {tracks})};
        return StruChordTracks.attach(raw, raw).tracks;
      }, tracks);
      assert.equal(result.length, 1); assert.equal(result[0].instrument, 'guitar');
    }
    const existing = await page.evaluate(() => StruChordTracks.attach({sections:[]},{tracks:[{id:1,instrument:'keys',name:'Клавиши'}]}).tracks);
    assert.equal(existing[0].instrument, 'keys', 'существующие дорожки сохраняются');
    // Отклонённый сброс не меняет инструмент.
    page.once('dialog', d => d.dismiss());
    await page.evaluate(() => clearAll());
    assert.equal(await page.evaluate(() => StruChordTracks.state().tracks[0].instrument), 'keys');
    await page.evaluate(() => openHomeSettings());
    await page.click('#homeSettingsTabInstrument');
    await page.click('.home-settings-modal [data-instrument="guitar"]');
    assert.equal(await page.evaluate(() => StruChordTracks.state().tracks[0].instrument), 'keys', 'настройка не меняет текущую песню');
    await page.evaluate(() => document.querySelector('.home-settings-modal .home-modal-close').click());
    await page.evaluate(() => clearAll({skipConfirm:true}));
    assert.equal(await page.evaluate(() => StruChordTracks.state().tracks[0].instrument), 'guitar');
    await page.evaluate(() => StruChordMixer.open());
    assert.equal(await page.$eval('#b39MixerEmpty', x => x.hidden), true, 'пустая гитара видна как дорожка');
    assert.equal(await page.$$('.b39-row').then(x => x.length), 1);
    assert.equal(await page.$eval('button.b39-add', x => x.hidden).catch(() => false), false);
    assert.deepEqual(errors, [], 'ошибок JS нет');
    console.log('B-39 выбор инструмента: проверки пройдены');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
