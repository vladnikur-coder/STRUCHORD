#!/usr/bin/env python3
"""B-39: самостоятельные рисунки по общим приёмам, поверх 0.720."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'{n} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep("    { id: 'keys-octave-bass',  label: 'Октавный бас', subdivision: 1, hint: 'бас через октаву и аккорд по очереди' }", """    { id: 'keys-octave-bass',  label: 'Октавный бас', subdivision: 1, hint: 'бас через октаву и аккорд по очереди' },
    // Собственные двухтактовые рисунки: это не транскрипции видео.
    { id:'piano-soft-pulse', label:'Тихая опора', subdivision:2, phrase:true, lesson:true, presetSwing:false,
      hint:'Бас и аккорд чередуются с тихим средним звуком и паузами.',
      motif:[['B','R'],null,'M',null,'R',null,'M',null], secondMotif:['B',null,'M',null,'R',null,null,'M'],
      motif3:[['B','R'],null,'M',null,'R',null], second3:['B',null,'M',null,'R',null],
      motif6:[['B','R'],null,null,null,'M',null,'R',null,null,null,'M',null], second6:['B',null,null,null,'M',null,'R',null,null,null,'M',null] },
    { id:'piano-breathing-arp', label:'Перебор с паузами', subdivision:2, phrase:true, lesson:true, presetSwing:false,
      hint:'Перебор с паузами; второй такт отличается от первого.',
      motif:['B',null,'A','A',null,'A','A',null], secondMotif:['B',null,'A',null,'A','A',null,'A'],
      motif3:['B',null,'A','A',null,'A'], second3:['B',null,'A',null,'A','A'],
      motif6:['B',null,null,null,'A',null,'A',null,null,null,'A',null], second6:['B',null,'A',null,null,null,'A',null,'A',null,null,null] },
    { id:'piano-three-three-two', label:'Акценты 3+3+2', subdivision:2, phrase:true, lesson:true, presetSwing:false,
      hint:'В 4/4 акценты по группам 3+3+2 восьмых; в 3/4 и 6/8 — отдельная адаптация.',
      motif:[['B','R'],null,null,'R',null,null,'R',null], secondMotif:[['B','R'],null,null,'R',null,null,['B','R'],null],
      motif3:[['B','R'],null,'R',null,'M',null], second3:['B',null,'R',null,'M',null],
      motif6:[['B','R'],null,null,null,'M',null,'R',null,null,null,'M',null], second6:[['B','R'],null,null,null,'R',null,'M',null,null,null,'R',null] }""")
rep("var TOKENS = ['H', 'B', 'O', 'A',", "var TOKENS = ['H', 'R', 'M', 'B', 'O', 'A',")
rep("      if (Number(beats) === 3 || Number(beats) === 6 || Number(beats) === 9 || Number(beats) === 12) {", """      if(chosen.lesson && Number(beats)===3){motif=chosen.motif3;secondMotif=chosen.second3;}
      else if(chosen.lesson && Number(beats)===6){motif=chosen.motif6;secondMotif=chosen.second6;}
      else if (Number(beats) === 3 || Number(beats) === 6 || Number(beats) === 9 || Number(beats) === 12) {""")
rep("      if (t === 'H') midis = C.notes.slice();\n      else if (t === 'B')", """      if (t === 'H') midis = C.notes.slice();
      // R и M не берут нижний бас даже для слэш-аккорда.
      else if (t === 'R' || t === 'M') {
        var hand=C.bass===null ? C.notes.slice() : C.notes.slice(1);
        midis=t==='R' ? hand : (hand.length ? [hand[Math.floor((hand.length-1)/2)]] : []);
      }
      else if (t === 'B')""")
rep("        dynamic=strong ? 1 : step % sub === 0 ? 0.82 : 0.68;\n        // Ноты в паузах", """        dynamic=strong ? 1 : step % sub === 0 ? 0.82 : 0.68;
        var lessonPreset=preset(cfg.type);
        if(lessonPreset && lessonPreset.lesson){
          var voices=Array.isArray(token)?token:[token];
          dynamic=voices.indexOf('B')>=0 || voices.indexOf('O')>=0 ? 0.95 : voices.indexOf('R')>=0 ? 0.82 : voices.indexOf('M')>=0 ? 0.52 : 0.68;
          // Не продлеваем ноту специально на последующие пустые шаги.
          len=Math.min(dur-at,Math.max(0.02,len*0.82));
        }
        // Ноты в паузах""")
rep("        if (/^perform-(funk|punk)-/.test(cfg.type)) len=Math.max(0.02,len*0.58);\n        else {", "        if (lessonPreset && lessonPreset.lesson) { /* длительность уже задана выше */ }\n        else if (/^perform-(funk|punk)-/.test(cfg.type)) len=Math.max(0.02,len*0.58);\n        else {")
rep("    if (token === 'H') return '▮';", "    if (token === 'H' || token === 'R') return '▮';\n    if (token === 'M') return '♪';")
rep("    ['H','Аккорд'], ['B','Бас'],", "    ['H','Аккорд (бас по секции)'], ['R','Аккорд без баса'], ['M','Средний звук аккорда'], ['B','Бас'],")
rep("({H:'А', B:'Б', O:'О', A:'↑',", "({H:'А', R:'А−Б', M:'С', B:'Б', O:'О', A:'↑',")
rep("    if (footEl) footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.';", """    if (footEl) {
      var chosen=preset(draft.type), hint=chosen && chosen.lesson ? ' '+chosen.hint : '';
      footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.'+hint;
    }""")
p.write_text(s,encoding='utf8');print('OK')
