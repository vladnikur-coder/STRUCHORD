#!/usr/bin/env python3
"""B-39: прослушивание отдельных клавиш встроенной панели, 0.747."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise SystemExit(f'Expected exactly one match ({n}): {a[:120]}')
 s=s.replace(a,b,1)
rep(".b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }", ".b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }\n.b39-keys-body svg rect[data-midi] { cursor:pointer; }\n.b39-keys-body svg rect[data-midi]:active, .b39-keys-body svg rect[data-midi]:focus-visible { stroke:var(--color-accent-warm); stroke-width:2; }\n.b39-keys-body svg text, .b39-keys-body svg circle { pointer-events:none; }")
rep("      'role=\"img\" aria-label=\"' + (o.showFingers ?", "      (o.interactive ? 'role=\"group\" ' : 'role=\"img\" ') + 'aria-label=\"' + (o.showFingers ?")
rep("    // белые\n    layout.keys.forEach", "    function keyAttrs(midi) { return o.interactive ? ' data-midi=\"' + midi + '\" tabindex=\"' + (midi===low ? '0' : '-1') + '\" role=\"button\" aria-label=\"Нота ' + noteLabel(midi, 'sharp') + '\"' : ''; }\n    // белые\n    layout.keys.forEach")
rep("        '\" rx=\"2\" fill=\"' + fill + '\" stroke=\"' + stroke + '\" stroke-width=\"1\"/>');", "        '\" rx=\"2\" fill=\"' + fill + '\" stroke=\"' + stroke + '\" stroke-width=\"1\"' + keyAttrs(k.midi) + '/>');")
rep("        '\" rx=\"2\" fill=\"' + fill + '\" stroke=\"' + stroke + '\" stroke-width=\"0.8\"/>');", "        '\" rx=\"2\" fill=\"' + fill + '\" stroke=\"' + stroke + '\" stroke-width=\"0.8\"' + keyAttrs(k.midi) + '/>');")
rep("    foot = el('div', 'b39-keys-foot', ''); head.insertBefore(foot, nav);", """    // Один делегированный обработчик: компактные превью и аккорды не меняем.
    function playPanelKey(target) {
      var key = target && target.closest && target.closest('rect[data-midi]');
      var A = audio(), active = activeTrack();
      if (!key || !body.contains(key) || !A || !active || !active.track || active.track.instrument !== 'keys') return;
      var ctx = typeof HOST.audioPreflightForGesture === 'function' ? HOST.audioPreflightForGesture() : HOST.getAudioContext();
      if (!ctx) return;
      if (typeof HOST.resumeAudioContext === 'function') HOST.resumeAudioContext();
      A.previewNote(ctx, active.track.id, Number(key.getAttribute('data-midi')));
    }
    body.addEventListener('pointerdown', function(e) { if (e.button === 0) playPanelKey(e.target); });
    body.addEventListener('focusin', function(e) {
      if (!e.target.matches('rect[data-midi]')) return;
      var old = body.querySelector('rect[data-midi][tabindex="0"]');
      if (old && old !== e.target) old.setAttribute('tabindex', '-1');
      e.target.setAttribute('tabindex', '0');
    });
    body.addEventListener('keydown', function(e) {
      if (!e.target.matches('rect[data-midi]')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) playPanelKey(e.target); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        var next = body.querySelector('rect[data-midi="' + (Number(e.target.getAttribute('data-midi')) + (e.key === 'ArrowRight' ? 1 : -1)) + '"]');
        e.preventDefault(); e.stopPropagation(); if (next) next.focus();
      }
    });
    foot = el('div', 'b39-keys-foot', ''); head.insertBefore(foot, nav);""")
rep("      rootPc: f ? f.rootPc : undefined, labelSpace: 16, labelFont: 11, fingerFont: 11, showFingerWarning: false", "      rootPc: f ? f.rootPc : undefined, labelSpace: 16, labelFont: 11, fingerFont: 11, showFingerWarning: false, interactive: true")
rep("  function previewPattern(chord, ctx, trackId, key, cfg, options) {", """  // Нота панели не зависит от аккорда или наличия секций и не пишет в песню.
  function previewNote(ctx, trackId, midi) {
    var T = tracks(); if (!T || !ctx || !Number.isInteger(midi)) return false;
    var state = T.state(), track = T.track(trackId), range = T.keyRange(trackId);
    if (!track || track.instrument !== 'keys' || state.activeTrackId !== trackId || !range || midi < range.low || midi > range.high) return false;
    var gain = effectiveGain(state, track); if (gain <= 0) return false;
    ensureCtx(ctx); var channel = channelFor(ctx, trackId, gain); if (!channel) return false;
    playNote(ctx, channel, midi, ctx.currentTime + .01, .55, HEADROOM / Math.sqrt(4));
    return true;
  }

  function previewPattern(chord, ctx, trackId, key, cfg, options) {""")
rep("    scheduleEvent: scheduleEvent, preview: preview, previewPattern: previewPattern, stopAll: stopAll, reset: reset,", "    scheduleEvent: scheduleEvent, preview: preview, previewNote: previewNote, previewPattern: previewPattern, stopAll: stopAll, reset: reset,")
p.write_text(s,encoding='utf-8');print('Клавиши панели звучат при нажатии')
