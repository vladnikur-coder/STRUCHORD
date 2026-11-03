#!/usr/bin/env python3
"""GP5: распределение одновременных нот по виртуальным струнам (0.755)."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit('Expected 1 match, got %d: %s'%(s.count(a),a[:100]))
 s=s.replace(a,b,1)
rep("//     октав (C2…C8). Высота каждой ноты восстанавливается ровно\n//     (строй + лад = MIDI), сдвиг октавы для баса не применяется.", "//     октав (C2…C8). Высоты сохраняются при наличии места в двух\n//     голосах; невместившиеся ноты и сдвиг низких октав попадают в отчёт.")
rep("    swingWrittenAsStraight: 0 };", "    swingWrittenAsStraight: 0, gp5Unassigned: 0 };")
rep("    stats.skippedRecorded = 0; stats.skippedMuted = 0; stats.outOfRange = 0;", "    stats.skippedRecorded = 0; stats.skippedMuted = 0; stats.outOfRange = 0; stats.gp5Unassigned = 0;")
rep("        if (opts.gp5 && stats.octaveShifts && typeof gpExportLoss === 'function') {", """        if (opts.gp5 && stats.gp5Unassigned && typeof gpExportLoss === 'function') {
          gpExportLoss(report, 'GP5: одновременные ноты не помещаются на виртуальных струнах в двух голосах', stats.gp5Unassigned);
        }
        if (opts.gp5 && stats.octaveShifts && typeof gpExportLoss === 'function') {""")
rep('  function velocityOf(track) {', '''  // Для созвучия распределяем ноты совместно. В GP5 на каждой струне
  // одновременно возможна одна нота в каждом из двух голосов. Подбор
  // максимального паросочетания не меняет высоту и не переставляет ноты
  // во времени; неразместившиеся ноты явно указываются в отчёте.
  function gp5Positions(notes) {
    var result=new Array(notes.length), groups=new Map();
    notes.forEach(function(n,index) {
      var pos=gp5Position(n.pitch);
      if (!pos) return;
      var k=n.start+':'+n.dur, group=groups.get(k);
      if(!group){group=[];groups.set(k,group);}
      var choices=[];
      WIDE_MIDI.forEach(function(open,string){
        var fret=pos.pitch-open;
        if(fret>=0 && fret<=24){choices.push({string:string,fret:fret});}
      });
      group.push({index:index,pos:pos,choices:choices});
    });
    groups.forEach(function(group){
      // Два места на струне — по одному в каждом голосе.
      var occupied=new Array(WIDE_MIDI.length*2).fill(null);
      function assign(item,seen){
        for(var i=0;i<item.choices.length;i++){
          var candidate=item.choices[i];
          for(var voice=0;voice<2;voice++){
            var slot=candidate.string*2+voice;
            if(seen[slot])continue;
            seen[slot]=true;
            if(!occupied[slot] || assign(occupied[slot],seen)){
              occupied[slot]=item;
              result[item.index]={string:candidate.string,fret:candidate.fret};
              return true;
            }
          }
        }
        return false;
      }
      // Сначала ограниченные ноты: результат детерминирован и максимален.
      group.sort(function(a,b){return a.choices.length-b.choices.length || a.index-b.index;});
      group.forEach(function(item){
        if(!assign(item,[])) stats.gp5Unassigned++;
      });
    });
    return result;
  }

  function velocityOf(track) {''')
rep('''                if (gp5) {
                  var pos = gp5Position(p);
                  if (pos) tabList.push({ start: n.start, dur: n.dur,
                    string: pos.string, fret: pos.fret, velocity: n.velocity, voice: 1 });
                }
''','')
rep('''        if (list.length) pitchRolls[String(sec.id)] = list;
        if (gp5 && tabList.length) rolls[String(sec.id)] = tabList;''','''        if (list.length) pitchRolls[String(sec.id)] = list;
        if (gp5 && list.length) {
          var positions=gp5Positions(list);
          list.forEach(function(n,i){
            var pos=positions[i];
            if(pos)tabList.push({start:n.start,dur:n.dur,string:pos.string,fret:pos.fret,velocity:n.velocity,voice:1});
          });
        }
        if (gp5 && tabList.length) rolls[String(sec.id)] = tabList;''')
rep('    windowUnits: windowUnits, gp5Position: gp5Position,','    windowUnits: windowUnits, gp5Position: gp5Position, gp5Positions: gp5Positions,')
p.write_text(s,encoding='utf-8')
