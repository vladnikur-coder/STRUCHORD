/* Regression: track mute/solo silence guitar audio, not strum/picking step animation. */
const assert = require('assert');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', {
      waitUntil: 'load',
    });

    const result = await page.evaluate(async () => {
      startNewSongFromHome();
      addSection('verse');
      const sec = sections[0];
      const sq = sec.squares[0];
      const ev = sq.events[0];
      ev.chord = 'C';
      sec.strumPattern = {
        mode: 'strum', subdivision: 2,
        steps: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'],
      };
      renderSectionsGrid();

      const T = StruChordTracks;
      const state = T.state();
      const mainId = state.mainTrackId;
      T.setInstrument(mainId, 'guitar');
      const ctx = getAudioContext();
      await ctx.resume();

      const originalHighlight = window.scheduleStrumStepHighlight;
      const originalPluck = window.pluckString;
      const run = (mode) => {
        const highlights = [];
        const plucks = [];
        window.scheduleStrumStepHighlight = (...args) => {
          highlights.push({ step: args[2], cls: args[6] || 'strum-step-active' });
        };
        window.pluckString = (_ctx, opts) => plucks.push(opts);

        if (mode === 'mute') {
          T.setSolo(mainId, false);
          T.setMute(mainId, true);
        } else if (mode === 'solo-blocked') {
          T.setMute(mainId, false);
          const keysId = T.addTrack('keys');
          T.setSolo(keysId, true);
        } else {
          T.setMute(mainId, false);
          T.state().tracks.forEach((track) => T.setSolo(track.id, false));
        }

        playbackState.isPlaying = true;
        playbackState.currentSectionIndex = 0;
        playbackState.currentSquareIndex = 0;
        playbackState.currentEventIndex = 0;
        playbackState._sectionRepeatCount = {};
        playbackState._squareRepeatCount = {};
        playbackState._structureWalk = null;
        nextEventTime = ctx.currentTime + 0.3;
        scheduleNextEvent(ctx);
        stopPlayback();
        return { highlights, plucks: plucks.length };
      };

      try {
        const audible = run('audible');
        const muted = run('mute');
        sec.strumPattern = {
          mode: 'pick', subdivision: 2,
          steps: [[6], [5], [4], [3], [2], [1], [2], [3]],
        };
        const mutedPicking = run('mute');
        const soloBlocked = run('solo-blocked');
        toggleTimelineMode(true);
        // The fixture writes the section pattern directly, so the ribbon's
        // storage migration may legitimately omit a rendered hit row. Keep a
        // connected target under the real expanded-pass key to exercise the
        // scheduler's tl-hit-on branch rather than a DOM rendering detail.
        const hitKey = timelineKey(sec.id, sq.id, 0, 0, 0);
        if (!timelineHitEls.get(hitKey)) {
          const hit = document.createElement('span');
          document.body.appendChild(hit);
          timelineHitEls.set(hitKey, [hit]);
        }
        const timelineMuted = run('mute');
        return { audible, muted, mutedPicking, soloBlocked, timelineMuted };
      } finally {
        window.scheduleStrumStepHighlight = originalHighlight;
        window.pluckString = originalPluck;
      }
    });

    for (const name of ['audible', 'muted', 'mutedPicking', 'soloBlocked']) {
      assert(result[name].highlights.length > 0, `${name}: rhythm animation was not scheduled`);
      assert(result[name].highlights.every((hit) => hit.cls === 'strum-step-active'),
        `${name}: compact rhythm preview uses an unexpected animation class`);
    }
    assert(result.audible.plucks > 0, 'control: audible guitar produced no audio');
    assert.strictEqual(result.muted.plucks, 0, 'muted guitar still produced strum audio');
    assert.strictEqual(result.mutedPicking.plucks, 0, 'muted guitar still produced picking audio');
    assert.strictEqual(result.soloBlocked.plucks, 0, 'solo-blocked guitar still produced audio');
    assert.strictEqual(result.muted.highlights.length, result.audible.highlights.length,
      'mute changed the number of scheduled rhythm steps');
    assert.strictEqual(result.soloBlocked.highlights.length, result.audible.highlights.length,
      'solo changed the number of scheduled rhythm steps');
    assert(result.timelineMuted.highlights.length > 0,
      'muted guitar did not schedule ribbon rhythm animation');
    assert(result.timelineMuted.highlights.every((hit) => hit.cls === 'tl-hit-on'),
      'ribbon rhythm did not use tl-hit-on while the guitar was muted');
    assert.strictEqual(result.timelineMuted.plucks, 0,
      'muted guitar produced audio in ribbon mode');
    assert.deepStrictEqual(errors, []);
    console.log('B-39: mute/solo keep rhythm animation while guitar audio stays silent');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
