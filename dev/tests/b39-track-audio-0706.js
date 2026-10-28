/* Живой браузер: выбор инструмента, призрак и микшер при прослушивании и транспорте. */
const assert = require('assert');
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', {waitUntil:'load'});
    await page.evaluate(() => {localStorage.setItem('struchord-default-instrument', 'keys');});
    await page.reload({waitUntil:'load'});
    const r = await page.evaluate(async () => {
      startNewSongFromHome(); addSection('verse');
      const sec = sections[0], sq = sec.squares[0], ev = sq.events[0]; ev.chord = 'C';
      requestRender(); await new Promise(r => setTimeout(r, 100));
      const wrapper = document.querySelector('.chord-wrapper');
      const ctx = getAudioContext(); await ctx.resume();
      const T = StruChordTracks, A = StruChordAudio;
      let plucks = [], original = pluckString;
      pluckString = (c, opts) => { plucks.push({gain:b39GuitarGain, freq:opts.freq}); };
      function preview() { const before=A.stats().notes; plucks=[]; playChord('C',wrapper); return {keys:A.stats().notes-before,guitars:plucks.length,gains:plucks.map(p=>p.gain)}; }
      function transport() {
        const before=A.stats().notes; plucks=[];
        playbackState.isPlaying=true; playbackState.currentSectionIndex=0; playbackState.currentSquareIndex=0; playbackState.currentEventIndex=0;
        playbackState._sectionRepeatCount={}; playbackState._squareRepeatCount={}; playbackState._structureWalk=null; nextEventTime=ctx.currentTime+.3;
        scheduleNextEvent(ctx); const result={keys:A.stats().notes-before,guitars:plucks.length,gains:plucks.map(p=>p.gain)}; stopPlayback(); return result;
      }
      const keysPreview=preview(), keysSong=transport();
      const guitar=T.addTrack('guitar');
      const guitarPreview=preview(), mixedSong=transport();
      T.setVolume(guitar,50); const half=transport();
      T.setMute(guitar,true); const muted=transport(); T.setMute(guitar,false);
      T.setSolo(guitar,true); const solo=transport(); T.setSolo(guitar,false);
      T.setTrackChord(guitar, T.cellKey(sec,sq,0), ''); const ghost=preview(), ghostSong=transport();
      // У второй гитары может быть аккорд, когда главная клавишная пуста.
      T.setTrackChord(guitar, T.cellKey(sec,sq,0), 'Am'); ev.chord=''; const guitarOnly=transport();
      T.setActive(1); const emptyKeys=preview();
      // Главная гитара: клавиши не должны подключаться к её двойному клику.
      ev.chord='C'; T.reorderTracks(1,0); T.setActive(guitar);
      const mainGuitar=preview(), mainGuitarSong=transport();
      pluckString=original;
      return {keysPreview,keysSong,guitarPreview,mixedSong,half,muted,solo,ghost,ghostSong,guitarOnly,emptyKeys,mainGuitar,mainGuitarSong};
    });
    assert(r.keysPreview.keys > 0 && r.keysPreview.guitars === 0, 'клавиши: двойной клик без гитары');
    assert(r.keysSong.keys > 0 && r.keysSong.guitars === 0, 'клавиши: транспорт без гитары');
    assert(r.guitarPreview.keys === 0 && r.guitarPreview.guitars > 0, 'гитара: только активная');
    assert(r.mixedSong.keys > 0 && r.mixedSong.guitars > 0, 'обе дорожки в транспорте');
    assert(r.half.gains.length && r.half.gains.every(x=>x===.5), 'громкость гитары');
    assert(r.muted.keys > 0 && r.muted.guitars === 0, 'mute');
    assert(r.solo.keys === 0 && r.solo.guitars > 0, 'solo');
    assert(r.ghost.keys === 0 && r.ghost.guitars === 0, 'призрак молчит при двойном клике');
    assert(r.ghostSong.keys > 0 && r.ghostSong.guitars === 0, 'призрак молчит в транспорте');
    assert(r.guitarOnly.keys === 0 && r.guitarOnly.guitars > 0, 'дополнительная гитара без аккорда главной');
    assert(r.emptyKeys.keys === 0 && r.emptyKeys.guitars === 0, 'пустая активная клавишная дорожка');
    assert(r.mainGuitar.guitars > 0 && r.mainGuitar.keys === 0, 'двойной клик главной гитары');
    assert(r.mainGuitarSong.guitars > 0 && r.mainGuitarSong.keys > 0, 'переставленные дорожки');
    assert.deepStrictEqual(errors, []);
    console.log('B-39: 13 браузерных сценариев звука пройдены');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exit(1);});
