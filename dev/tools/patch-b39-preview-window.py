#!/usr/bin/env python3
"""B-39: планировать длинное предпрослушивание небольшими окнами. К 0.759."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text()
def replace(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('anchor count '+str(s.count(a))+': '+a[:80])
 s=s.replace(a,b,1)
replace('''  var voices = new Set();         // живые источники Web Audio
''','''  var voices = new Set();         // живые источники Web Audio
  var previewJobs = new Set();    // отмена таймеров длинного предпрослушивания
''')
replace('''    var before = new Set(voices), start = ctx.currentTime + .05;
    var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
    steps.forEach(function (step) { step.notes.forEach(function (midi) { var d=Number.isFinite(step.gain)?step.gain:null;playNote(ctx, channel, midi, start + step.at, step.dur, level*(d===null?1:d), d); }); });
    var added = Array.from(voices).filter(function (v) { return !before.has(v); });
    return function () { added.forEach(function (v) { try { v.stop(); } catch (e) {} voices.delete(v); }); };
''','''    var start = ctx.currentTime + .05, level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
    var owned = new Set(), index = 0, timer = null, stopped = false;
    // Не создаём все источники двухтактовой фразы сразу: будущие ноты
    // иначе занимают общий лимит раньше, чем начинают звучать.
    var deadline = Date.now() + Math.ceil((span * unit + 1) * 1000);
    function cancel() {
      if (stopped) return;
      stopped=true; if (timer) clearTimeout(timer); timer=null; previewJobs.delete(cancel);
      owned.forEach(function (v) { try { v.stop(); } catch (e) {} voices.delete(v); }); owned.clear();
    }
    function tick() {
      timer=null;
      if (stopped) return;
      if (ctxRef!==ctx || ctx.state==='closed' || Date.now()>deadline) { cancel(); return; }
      if (ctx.state==='running') {
        var horizon=ctx.currentTime+.20;
        while (index<steps.length && start+steps[index].at<=horizon) {
          var step=steps[index++], before=new Set(voices);
          step.notes.forEach(function (midi) {
            var d=Number.isFinite(step.gain)?step.gain:null;
            playNote(ctx,channel,midi,Math.max(ctx.currentTime+.005,start+step.at),step.dur,level*(d===null?1:d),d);
          });
          voices.forEach(function (v) { if (!before.has(v)) owned.add(v); });
        }
      }
      if (index<steps.length) timer=setTimeout(tick,40);
      else previewJobs.delete(cancel);
    }
    previewJobs.add(cancel); tick();
    return cancel;
''')
replace('''  function stopAll() {
    voices.forEach(function (src)''','''  function stopAll() {
    previewJobs.forEach(function (cancel) { cancel(); }); previewJobs.clear();
    voices.forEach(function (src)''')
p.write_text(s)
