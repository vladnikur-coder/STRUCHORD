#!/usr/bin/env python3
"""B-39: двухтактовые варианты и исполнительская динамика поверх 0.715."""
from pathlib import Path
p=Path('STRUCHORD.html'); text=p.read_text(encoding='utf-8')
def rep(a,b):
 global text
 n=text.count(a)
 if n!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: %d совпадений %r' % (n,a[:100]))
 text=text.replace(a,b,1)
rep("  var DEFAULT_TYPE = 'keys-block';", """  // Отдельные ID: прежние сохранённые рисунки не меняют звучание.
  STYLES.forEach(function(style) {
    var rows=FAMILY_MOTIFS[style[0]] || [], neighbors=[1,2,3,2,0];
    rows.forEach(function(motif,i) {
      var next=rows[neighbors[i]], second=motif.slice(0,4).concat(next.slice(4,8));
      // В 3/4 и 6/8 позиции 3 и 7 не входят в адаптацию, поэтому
      // обеспечиваем различие и в значимых позициях второго такта.
      if ([0,1,2,4,5,6].every(function(k){return JSON.stringify(motif[k])===JSON.stringify(second[k]);})) {
        var k=[5,6,4,2,1,0].find(function(j){return JSON.stringify(motif[j])!==JSON.stringify(next[j]);});
        if (k!==undefined) second[k]=next[k];
      }
      PRESETS.push({id:'perform-'+style[0]+'-'+i,label:'Исполнение · '+FAMILY_ROLES[i],
        genre:style[0],genreLabel:style[1],subdivision:2,motif:motif,secondMotif:second,
        phrase:true,hint:style[1]+' · двухтактовая фраза с акцентами',
        presetSwing:style[0]==='blues'||style[0]==='jazz'});
    });
  });
  var DEFAULT_TYPE = 'keys-block';""")
rep("      var motif = chosen.motif;\n      if (Number(beats) === 3", "      var motif = chosen.motif, secondMotif = chosen.secondMotif;\n      if (Number(beats) === 3")
rep("        motif = [motif[0],motif[1],motif[2],motif[4],motif[5],motif[6]];\n      }\n      for (i = 0; i < n; i++) out.push(motif[Math.floor(i * 2 / sub) % motif.length]);", """        motif = [motif[0],motif[1],motif[2],motif[4],motif[5],motif[6]];
        if (secondMotif) secondMotif = [secondMotif[0],secondMotif[1],secondMotif[2],secondMotif[4],secondMotif[5],secondMotif[6]];
      }
      var count = chosen.phrase && n * 2 <= MAX_STEPS ? n * 2 : n;
      for (i = 0; i < count; i++) {
        var bar = i >= n && secondMotif ? secondMotif : motif;
        out.push(bar[Math.floor((i % n) * 2 / sub) % bar.length]);
      }""")
# И редактор, и сохранённая секционная фраза видят все два такта.
rep("var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited ? numerator(current.ts) : draftLength);", "var selectedPreset=preset(draft.type);\n    var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited || (selectedPreset && selectedPreset.phrase) ? numerator(current.ts) : draftLength);")
rep("draft.type = p.id; draft.subdivision = p.subdivision; if (p.motif) draft.swing = p.presetSwing; delete draft.steps; draftLength = scopeUnits();", "draft.type = p.id; draft.subdivision = p.subdivision; if (p.motif) draft.swing = p.presetSwing; delete draft.steps; draftLength = p.phrase && current.scope==='section' && scopeUnits()*2*draft.subdivision<=MAX_STEPS ? scopeUnits()*2 : scopeUnits();")
rep("draftLength = !draftInherited && cfg.steps ? cfg.steps.length / cfg.subdivision : scopeUnits();", "draftLength = !draftInherited && cfg.steps ? cfg.steps.length / cfg.subdivision : (preset(cfg.type) && preset(cfg.type).phrase && current.scope==='section' && scopeUnits()*2*cfg.subdivision<=MAX_STEPS ? scopeUnits()*2 : scopeUnits());")
rep("offset = Math.round(squareOffset(sq2, current.ei, current.ts) * draft.subdivision);", "offset = Math.round((squareOffset(sq2, current.ei, current.ts) + (selectedPreset && selectedPreset.phrase ? precedingSquares(sec2,sq2,current.ts) : 0)) * draft.subdivision);")
# Континуитет нового исполнения между квадратами внутри секции.
rep("  // ---------- Токены -> MIDI-ноты ----------", """  function precedingSquares(sec, sq, ts) {
    if (!sec || !sq || !Array.isArray(sec.squares)) return 0;
    var total=0;
    for(var i=0;i<sec.squares.length;i++) {
      var item=sec.squares[i]; if(item===sq || item.id===sq.id) break;
      try { total += Math.max(0,Number(getSquareBeats(item,ts))||0) * Math.max(1,Number(item.repeat)||1); } catch(e) {}
    }
    return total;
  }

  // ---------- Токены -> MIDI-ноты ----------""")
rep("    var offset = own ? 0 : squareOffset(o.sq, o.ei, o.ts);", "    var express = !!(preset(cfg.type) && preset(cfg.type).phrase);\n    var offset = own ? 0 : squareOffset(o.sq, o.ei, o.ts) + (express ? precedingSquares(o.sec,o.sq,o.ts) : 0);")
rep("      var token = base[(startStep + i) % base.length];\n      out.push({", """      var token = base[(startStep + i) % base.length];
      var dynamic=1;
      if (express && token !== null) {
        var step=(startStep+i)%base.length, strong=step % (sub*2) === 0;
        dynamic=strong ? 1 : step % sub === 0 ? 0.82 : 0.68;
        // Ноты в паузах могут звучать до следующей атаки; короткий фанк
        // и панк оставляем более отрывистыми. Не пересекаем границу аккорда.
        if (/^perform-(funk|punk)-/.test(cfg.type)) len=Math.max(0.02,len*0.58);
        else {
          var gap=1;
          while(gap<base.length && base[(step+gap)%base.length]===null) gap++;
          if(gap>1) len=Math.min(dur-at,Math.max(len,(swingOffset(baseNode+i+gap,sub,swingOn)-offset)*unit-at)*0.9);
        }
      }
      out.push({""")
rep("        dur: len,\n        notes: tokenNotes(token, C, function () { return arp++; }),", "        dur: len,\n        ...(express ? {gain:dynamic} : {}),\n        notes: tokenNotes(token, C, function () { return arp++; }),")
# Управление громкостью и тембром нот — только при наличии gain от планировщика.
rep("  function playPiano(ctx, target, midi, start, dur, level) {", "  function playPiano(ctx, target, midi, start, dur, level, expression) {")
rep("    var decay = Math.max(0.38, Math.min(2.6, dur * 1.5)) * (PEDAL ? 1.85 : 1);", "    var decay = Math.max(Number.isFinite(expression) ? 0.16 : 0.38, Math.min(2.6, dur * 1.5)) * (PEDAL ? 1.85 : 1);")
rep("      var amp = level / Math.pow(n, 1.45);", "      var brightness = Number.isFinite(expression) ? Math.max(0.65,Math.min(1,expression)) : 1;\n      var amp = level / Math.pow(n, 1.45 + (1-brightness)*0.7);")
rep("  function playNote(ctx, channel, midi, start, dur, level) {", "  function playNote(ctx, channel, midi, start, dur, level, expression) {")
rep("    else playPiano(ctx, target, midi, start, dur, level);", "    else playPiano(ctx, target, midi, start, dur, level, expression);")
rep("            playNote(ctx, channel, midi, evStart + at, len, level);", "            var dynamics=Number.isFinite(st.gain) ? st.gain : null;\n            playNote(ctx, channel, midi, evStart + at, len, level * (dynamics===null ? 1 : dynamics), dynamics);")
rep("steps.forEach(function (step) { step.notes.forEach(function (midi) { playNote(ctx, channel, midi, start + step.at, step.dur, level); }); });", "steps.forEach(function (step) { step.notes.forEach(function (midi) { var d=Number.isFinite(step.gain)?step.gain:null;playNote(ctx, channel, midi, start + step.at, step.dur, level*(d===null?1:d), d); }); });")
rep("var n = { start: round4(at), dur: round4(dur), pitch: p, velocity: velocityOf(track) };", "var n = { start: round4(at), dur: round4(dur), pitch: p, velocity: Math.max(1,Math.min(127,Math.round(velocityOf(track)*(Number.isFinite(step.gain)?step.gain:1)))) };")
# Автомат использует новые исполнения; дополнительные стили смешиваются внутри каждого такта.
rep("id='family-'+first+'-'+idx", "id='perform-'+first+'-'+idx")
rep("accent=second && acc.preset('family-'+second+'-'+idx)", "accent=second && acc.preset('perform-'+second+'-'+idx)")
rep("acc.preset('family-'+second+'-'+((idx+k)%5))", "acc.preset('perform-'+second+'-'+((idx+k)%5))")
rep("var group=compound ? Math.floor(i/6) : Math.floor(i/2);return group===lastGroup", "var pos=i%(beats*2), group=compound ? Math.floor(pos/6) : Math.floor(pos/2);return group===lastGroup")
p.write_text(text,encoding='utf-8');print('Патч применён')
