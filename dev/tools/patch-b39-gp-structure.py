#!/usr/bin/env python3
"""B-39: разворачивать знаки структуры в GPX/GP5 через реальный обход плеера. Применять к 0.758."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text()
old='''    // Бейдж ×N квадрата в GP разворачивается внутри секции. Абсолютные
'''
new='''    // Для знаков структуры линейный проход квадратов неверен: вольты и
    // переходы задают другой порядок. Используем тот же обход, что MIDI и
    // плеер, но только для временной экспортной модели, не меняя песню.
    if ((songData.sections || []).some(sec => (sec.squares || []).some(sq =>
        sq.repeatOpen || sq.repeatClose || sq.mark || sq.jump))) {
      return gpExportPrepareStructure(songData, parts, report);
    }
    if ((songData.sections || []).some(sec => (sec.squares || []).some(sq => sq.volta)))
      gpExportLoss(report,'Вольта без черты повтора: порядок воспроизведения в Guitar Pro может отличаться от STRUCHORD');
    // Бейдж ×N квадрата в GP разворачивается внутри секции. Абсолютные
'''
if s.count(old)!=1: raise SystemExit('anchor 1')
s=s.replace(old,new,1)
anchor='''  // GP5 writer принимает четверти, GPIF — единицы знаменателя такта.
'''
insert='''  function gpExportPrepareStructure(songData, parts, report) {
    const groups = [];
    const sourceSections = new Map((songData.sections || []).map(sec => [String(sec.id), sec]));
    let si=0, sqi=0, ei=0, walk=structureWalkState(), done=false;
    const sr={}, qr={};
    for (let guard=0; guard<100000; guard++) {
      const next=findNextEvent(si,sqi,ei,sr,qr,walk,{noLoop:true});
      if (!next) { done=true; break; }
      const source=sourceSections.get(String(next.section.id));
      if (!source) throw new Error('Не удалось сопоставить секцию при экспорте структуры.');
      const win=partEventWindowUnits(next.section,next.square,next.eventIndex);
      if (!(win.span>0)) throw new Error('В структуре есть ячейка без длительности.');
      let group=groups[groups.length-1];
      if (!group || group.source!==source || Math.abs(group.sourceEnd-win.start)>1e-8) {
        group={source,sourceStart:win.start,sourceEnd:win.start,squares:[]};
        groups.push(group);
      }
      // Один сегмент на событие; таб-квадрат остаётся целым, включая приёмы.
      const sq=next.square;
      const copy=sq.type==='tab' ? { ...sq, repeat:1 } : { ...sq, repeat:1, events:[{...next.event}] };
      delete copy.repeatOpen; delete copy.repeatClose; delete copy.volta; delete copy.mark; delete copy.jump;
      group.squares.push(copy); group.sourceEnd=win.end;
      si=next.sectionIndex; sqi=next.squareIndex; ei=next.eventIndex+1; walk=next.walk;
    }
    if (!done) throw new Error('Слишком длинный обход структуры: GP-файл не сохранён частично.');
    if (!groups.length) return { ...songData, sections:[], parts };
    // При разрыве внутри такта текущий GP-writer добавил бы паузу до
    // следующего такта. Лучше объяснить отказ, чем записать неверный ритм.
    for (const g of groups) {
      const bar=parseTimeSig(g.source.timeSig || songData.globalTimeSig || '4/4').numerator || 4;
      const length=g.sourceEnd-g.sourceStart;
      if (Math.abs(length/bar-Math.round(length/bar))>1e-8)
        throw new Error('GPX/GP5: переход или конец секции приходится внутрь такта. Экспорт структуры пока невозможен без изменения ритма; используйте MIDI.');
    }
    const exportSections=groups.map((g,i)=>({ ...g.source, id:'gp-walk-'+i, repeat:1, squares:g.squares }));
    const mappedParts=parts.map(part=>{
      const remap=rolls=>{
        const result={};
        groups.forEach((g,i)=>{
          const src=(rolls && rolls[String(g.source.id)]) || [], out=[];
          for (const note of src) {
            if (note.start < g.sourceStart-1e-9 || note.start >= g.sourceEnd-1e-9) continue;
            const duration=Number(note.dur), remaining=g.sourceEnd-Number(note.start);
            const copy={...note,start:Number(note.start)-g.sourceStart};
            if (Number.isFinite(duration) && duration>remaining+1e-9) {
              copy.dur=Math.max(0,remaining);
              gpExportLoss(report,'GPX/GP5: нота на границе перехода укорочена до конца фрагмента',1);
            }
            out.push(copy);
          }
          if (out.length) result[exportSections[i].id]=out;
        });
        return result;
      };
      const lyrics=[];
      groups.forEach((g,i)=>(part.lyrics || []).forEach(lyric=>{
        const start=Number(lyric.start)||0;
        if (String(lyric.secId)===String(g.source.id) && start>=g.sourceStart-1e-9 && start<g.sourceEnd-1e-9)
          lyrics.push({...lyric,secId:exportSections[i].id,start:start-g.sourceStart});
      }));
      return {...part,rolls:remap(part.rolls),pitchRolls:remap(part.pitchRolls),lyrics};
    });
    gpExportLoss(report,'Знаки структуры развёрнуты в последовательность тактов; сами знаки и вольты не перенесены');
    return {...songData,sections:exportSections,parts:mappedParts};
  }

'''
if s.count(anchor)!=1: raise SystemExit('anchor 2')
s=s.replace(anchor,insert+anchor,1);p.write_text(s)
