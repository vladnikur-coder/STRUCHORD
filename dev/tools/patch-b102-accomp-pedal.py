#!/usr/bin/env python3
"""B-102 (0.774): педаль в клавишном аккомпанементе.

Проблема: ноты аккомпанемента обрывались ровно на записанной длительности.
Замер офлайн-рендера (2 ячейки по 4 доли, 120 BPM) показал провалы в тишину
0,10-0,60 с между атаками в каждом жанре: pop 0,54 с после первой доли,
jazz 0,58 с, funk 0,38 с. На пианино так не бывает: снятая рука не глушит
струну, звук тянется до смены гармонии.

Решение: каждую атаку (весь аккорд, а не отдельную ноту) ведём до следующей
атаки, но не дальше конца ячейки, оставляя 4% доли, чтобы новая атака
читалась. Плотные жанры держатся короче: в фанке и панке отрывистость —
часть грува. Ручные рисунки (status 'manual') не трогаем: там длительности
расставил пользователь.

Патч правит только планировщик notes-v1 (StruChordNoteCandidate.plan),
поэтому педаль одинаково работает в звуке, MIDI и GP5.
"""
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'STRUCHORD.html'
src = open(PATH, encoding='utf-8').read()

HELPER = ''' // B-102 (0.774): педаль. Снятая рука не глушит струну: звук тянется до
 // следующей атаки, а не обрывается на записанной длительности. Иначе между
 // аккордами остаются провалы в тишину и любой рисунок звучит отрывисто.
 // Просвет и допуск — доли доли, а не секунды: у звука и экспорта разные
 // единицы времени, а рисунок должен совпадать у обоих.
 const PEDAL_RELEASE_BEAT=0.04, PEDAL_ATTACK_BEAT=0.05, PEDAL_GENRE_FACTOR={funk:0.5,punk:0.55,blues:0.75,jazz:0.9};
 function pedalFactor(){const cfg=T().state().autoAccomp,main=cfg&&cfg.primary;const f=main&&PEDAL_GENRE_FACTOR[main];return typeof f==='number'?f:1;}
 function withPedal(steps,o,pattern){
  if(!Array.isArray(steps)||steps.length<2)return steps;
  if(pattern && pattern.status==='manual')return steps;
  if(o && o.noPedal)return steps;
  const factor=pedalFactor(),end=Number(o&&o.dur),beats=Number(pattern&&pattern.beats);
  if(!(factor>0)||!Number.isFinite(end))return steps;
  const unit=Number.isFinite(beats)&&beats>0?end/beats:end;
  const tol=Math.max(0.004,unit*PEDAL_ATTACK_BEAT),gap=Math.max(0.006,unit*PEDAL_RELEASE_BEAT);
  const at=steps.map(s=>Number(s.at)||0);
  // Один удар — ноты, начавшиеся почти одновременно (рисунок раскачивает их на
  // пару миллисекунд). Педаль берёт весь аккорд целиком: иначе тянулась бы
  // только последняя нота, а остальные голоса гасли на записанной длительности.
  const attacks=[];
  at.forEach(t=>{if(!attacks.length||t-attacks[attacks.length-1]>tol)attacks.push(t);});
  return steps.map((s,i)=>{
   if(!(Number(s.dur)>0)||!Array.isArray(s.notes)||!s.notes.length)return s;
   let next=null;
   for(const a of attacks){if(a>at[i]+tol){next=a;break;}}
   const stop=(Number.isFinite(next)?Math.min(next,end):end)-gap,room=stop-at[i];
   if(!(room>0)||s.dur>=room)return s;
   return Object.assign({},s,{dur:s.dur+(room-s.dur)*factor});
  });
 }
'''

anchor = " function plan(o){"
assert src.count(anchor) == 1, 'plan anchor not unique'
src = src.replace(anchor, HELPER + anchor, 1)

gp5_old = "    return result.length?result:[{at:0,dur:o.dur,notes:[],gain:1,type:TYPE,source:'cell'}];"
gp5_new = "    return result.length?withPedal(result,o,v):[{at:0,dur:o.dur,notes:[],gain:1,type:TYPE,source:'cell'}];"
assert src.count(gp5_old) == 1, 'gp5 return not unique'
src = src.replace(gp5_old, gp5_new, 1)

cell_old = ("  try{return HOST.__keyModules.renderer.planCell(d,o.cell||'preview',{duration:o.dur,"
            "span:o.span,denominator:Number(String(o.ts||'4/4').split('/')[1])});}")
cell_new = ("  try{return withPedal(HOST.__keyModules.renderer.planCell(d,o.cell||'preview',{duration:o.dur,"
            "span:o.span,denominator:Number(String(o.ts||'4/4').split('/')[1])}),o,v);}")
assert src.count(cell_old) == 1, 'planCell return not unique'
src = src.replace(cell_old, cell_new, 1)

open(PATH, 'w', encoding='utf-8').write(src)
print('patched', PATH)
