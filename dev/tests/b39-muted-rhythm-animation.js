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
      const originalVibrate = window.vibrateFingeringStrings;
      const originalPluck = window.pluckString;
      const originalMuteChunk = window.playMuteChunk;
      const run = (mode) => {
        const highlights = [];
        const vibrations = [];
        const plucks = [];
        const muteChunks = [];
        window.scheduleStrumStepHighlight = (...args) => {
          highlights.push({ step: args[2], cls: args[6] || 'strum-step-active' });
        };
        window.vibrateFingeringStrings = (_ctx, stringIndexes, atTime, stepSeconds, spread) => {
          vibrations.push({ stringIndexes:[...stringIndexes], atTime, stepSeconds, spread });
        };
        window.pluckString = (_ctx, opts) => plucks.push(opts);
        window.playMuteChunk = (...args) => muteChunks.push(args);

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
        return { highlights, vibrations, plucks: plucks.length, muteChunks: muteChunks.length };
      };

      let scenarios;
      try {
        const audible = run('audible');
        const muted = run('mute');
        sec.strumPattern = {
          mode: 'strum', subdivision: 2,
          steps: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'],
        };
        const audibleMuteChunk = run('audible');
        const mutedMuteChunk = run('mute');
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
        scenarios = { audible, muted, audibleMuteChunk, mutedMuteChunk, mutedPicking, soloBlocked, timelineMuted };
      } finally {
        window.scheduleStrumStepHighlight = originalHighlight;
        window.vibrateFingeringStrings = originalVibrate;
        window.pluckString = originalPluck;
        window.playMuteChunk = originalMuteChunk;
      }

      // Exercise the real CSS-class path as well as the scheduling contract.
      // The scenarios above prove muted transport invokes vibration; the two
      // real playback runs below observe its visible class in both UI hosts.
      T.setActive(mainId);
      toggleTimelineMode(true);
      sec.strumPattern = {
        mode: 'strum', subdivision: 2,
        steps: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'],
      };
      T.state().tracks.forEach((track) => T.setSolo(track.id, false));
      T.setMute(mainId, true);
      const timelineFingering = document.getElementById('tlNowFing');
      timelineFingering.innerHTML = '';
      document.getElementById('tlPanelNow')._lastRenderSig = '';
      let timelineDomVibrations = 0;
      const observer = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.type === 'attributes' && record.target.classList?.contains('fing-string') &&
              record.target.classList.contains('is-vibrating')) timelineDomVibrations++;
        });
      });
      observer.observe(timelineFingering, { subtree:true, attributes:true, attributeFilter:['class'] });
      playbackState.isPlaying = true;
      playbackState.currentSectionIndex = 0;
      playbackState.currentSquareIndex = 0;
      playbackState.currentEventIndex = 0;
      playbackState._sectionRepeatCount = {};
      playbackState._squareRepeatCount = {};
      playbackState._structureWalk = null;
      nextEventTime = ctx.currentTime + 0.12;
      scheduleNextEvent(ctx);
      await new Promise((resolve) => setTimeout(resolve, 800));
      observer.disconnect();
      stopPlayback();

      toggleTimelineMode(false);
      const showFingering = document.getElementById('showFingering');
      if (showFingering) showFingering.checked = true;
      renderSectionsGrid();
      let editorDomVibrations = 0;
      const editorObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.type === 'attributes' && record.target.classList?.contains('fing-string') &&
              record.target.classList.contains('is-vibrating')) editorDomVibrations++;
        });
      });
      editorObserver.observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] });
      playbackState.isPlaying = true;
      playbackState.currentSectionIndex = 0;
      playbackState.currentSquareIndex = 0;
      playbackState.currentEventIndex = 0;
      playbackState._sectionRepeatCount = {};
      playbackState._squareRepeatCount = {};
      playbackState._structureWalk = null;
      nextEventTime = ctx.currentTime + 0.12;
      scheduleNextEvent(ctx);
      await new Promise((resolve) => setTimeout(resolve, 800));
      editorObserver.disconnect();
      const editorTooltip = document.getElementById('fingering-tooltip');
      const editorDiag = {
        display: editorTooltip && editorTooltip.style.display,
        strings: editorTooltip ? editorTooltip.querySelectorAll('.fing-string').length : -1,
        activeWrappers: document.querySelectorAll('.chord-wrapper.playback-active').length,
        timelineMode,
      };
      stopPlayback();
      return { ...scenarios, timelineDomVibrations, editorDomVibrations, editorDiag };
    });

    for (const name of ['audible', 'muted', 'mutedPicking', 'soloBlocked']) {
      assert(result[name].highlights.length > 0, `${name}: rhythm animation was not scheduled`);
      assert(result[name].highlights.every((hit) => hit.cls === 'strum-step-active'),
        `${name}: compact rhythm preview uses an unexpected animation class`);
      assert(result[name].vibrations.length > 0, `${name}: fingering strings were not animated`);
      assert.strictEqual(result[name].vibrations.length, result[name].highlights.length,
        `${name}: string animation was duplicated by the audio pass`);
      assert(result[name].vibrations.every((hit) => hit.stringIndexes.length > 0),
        `${name}: string animation did not identify any strings`);
    }
    const downStroke = result.muted.vibrations.find((hit) => hit.spread === 0.014);
    const upStroke = result.muted.vibrations.find((hit) => hit.spread === 0.01);
    assert(downStroke && upStroke, 'muted D/U strokes lost their directional delays');
    assert.deepStrictEqual(upStroke.stringIndexes, [...downStroke.stringIndexes].reverse(),
      'muted upstroke did not reverse the fingering-string direction');
    assert.deepStrictEqual(
      result.mutedPicking.vibrations.map((hit) => hit.stringIndexes),
      [[0], [1], [2], [3], [4], [5], [4], [3]],
      'muted picking animated strings other than the current step');
    assert(result.audible.plucks > 0, 'control: audible guitar produced no audio');
    assert(result.audibleMuteChunk.muteChunks > 0,
      'control: audible X strokes did not produce mute chunks');
    assert.strictEqual(result.mutedMuteChunk.muteChunks, 0,
      'muted X strokes still produced mute chunks');
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
    assert.strictEqual(result.timelineMuted.vibrations.length, result.timelineMuted.highlights.length,
      'muted ribbon guitar did not animate fingering strings for every rhythm step');
    assert.strictEqual(result.timelineMuted.plucks, 0,
      'muted guitar produced audio in ribbon mode');
    assert(result.timelineDomVibrations > 0,
      'real muted ribbon playback never applied is-vibrating to a fingering string');
    assert(result.editorDomVibrations > 0,
      `real muted editor playback never applied is-vibrating to a fingering string: ${JSON.stringify(result.editorDiag)}`);
    assert.deepStrictEqual(errors, []);
    console.log('B-39: mute/solo keep rhythm and fingering-string animation while guitar audio stays silent');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
