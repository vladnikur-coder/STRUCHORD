#!/usr/bin/env python3
"""B-39: жанровые рисунки для клавиш поверх 0.712."""
from pathlib import Path
p=Path('STRUCHORD.html'); text=p.read_text(encoding='utf-8'); a=text.index('// >>> B-39 STAGE5 BEGIN'); b=text.index('// <<< B-39 STAGE5 END',a); s=text[a:b]
def rep(old,new):
 global s
 n=s.count(old)
 if n!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: '+str(n)+' совпадений: '+repr(old[:100]))
 s=s.replace(old,new,1)
rep("  var DEFAULT_TYPE = 'keys-block';", """  // Ритмы по восемь восьмых в 4/4. Ноты относительны аккорду;
  // не имитируем ударные, динамику или отсутствующие в аккорде ступени.
  var STYLES = [
    ['pop','Поп',[
      ['Мягкое арпеджио',['B','A','t3','A','t5','A','t3','A']],
      ['Ровные аккорды',['H',null,'H',null,'H',null,'H',null]],
      ['Плотный припев',['B','H','H',null,'B','H','H',null]]]],
    ['rock','Рок',[
      ['Ровный рок',['B',null,'H','H','B',null,'H','H']],
      ['Октавная основа',['O',null,'H',null,'O','H','H',null]],
      ['Тихий куплет',['B',null,null,'A','H',null,'A',null]]]],
    ['punk','Панк',[
      ['Частые аккорды',['H','H','H','H','H','H','H','H']],
      ['Бас и аккорды',['B','H','H','H','B','H','H','H']],
      ['Акценты с паузами',['H','H',null,'H','H','H',null,'H']]]],
    ['country','Кантри',[
      ['Бас — аккорд',['B',null,'H',null,'B',null,'H',null]],
      ['Подвижный бас',['B',null,'H','A','B',null,'H','A']],
      ['Перебор',['t1','t5','t3','t5','t1','t5','t3','t5']]]],
    ['blues','Блюз',[
      ['Спокойный шаффл',['B',null,'H','H','B',null,'H','H'],true],
      ['Бас и аккорд',['B','H',null,'H','B','H',null,'H'],true],
      ['Плотный шаффл',['B','H','H','H','B','H','H','H'],true]]],
    ['jazz','Джаз',[
      ['Разреженные аккорды',[null,'H',null,null,'H',null,null,'H']],
      ['Свинговые акценты',['B',null,'H',null,null,'H',null,'H'],true],
      ['Бас и аккорды',['B',null,'H',null,'B','H',null,'H']]]],
    ['soul','Соул',[
      ['Мягкие аккорды',['H',null,null,null,'H',null,null,null]],
      ['Перебор',['B',null,'A','t3','t5',null,'A',null]],
      ['Пульс',['B',null,'H','H',null,'H','H',null]]]],
    ['funk','Фанк',[
      ['Синкопы',[null,'H',null,'H',null,null,'H','H']],
      ['С паузами',['H',null,null,'H',null,'H',null,'H']],
      ['Бас и акценты',['B',null,'H',null,null,'H','B','H']]]],
    ['fusion','Фьюжн',[
      ['Подвижный перебор',['B','t3','t5','A','t1','t5','t3','A']],
      ['Синкопы',['B',null,'H',null,'H',null,null,'H']],
      ['Бас с акцентами',['B','H',null,'H',null,'B','H',null]]]]
  ];
  STYLES.forEach(function (style) { style[2].forEach(function (entry, index) {
    PRESETS.push({ id:'style-'+style[0]+'-'+index, label:entry[0], genre:style[0], genreLabel:style[1], subdivision:2,
      hint:style[1]+' · '+entry[0]+(entry[2] ? ' · Swing' : ''), motif:entry[1].slice(), presetSwing:entry[2]===true });
  }); });
  var DEFAULT_TYPE = 'keys-block';""")
rep("    '.b39-acc-btn { display:inline-flex; align-items:center; gap:.3rem; padding:0 .5rem;',", """    '.b39-acc-preset[hidden] { display:none !important; }',
    '.b39-acc-genre { font:inherit; color:inherit; background:var(--color-surface); border:.0625rem solid var(--color-border-medium); border-radius:.6rem; padding:.3rem .5rem; max-width:100%; }',
    '.b39-acc-btn { display:inline-flex; align-items:center; gap:.3rem; padding:0 .5rem;',""")
rep("  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4;", "  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4, presetGenre = null;")
rep("    var out = [], alberti = ['t1', 't5', 't3', 't5'], i, beat;\n    for (i = 0; i < n; i++) {", """    var out = [], alberti = ['t1', 't5', 't3', 't5'], i, beat;
    var chosen = preset(type);
    if (chosen && chosen.motif) {
      // Для трёхдольных размеров берём шестишаговую версию: две группы по
      // три восьмых; не используем четырёхдольный хвост как отдельный такт.
      var motif = chosen.motif;
      if (Number(beats) === 3 || Number(beats) === 6 || Number(beats) === 9 || Number(beats) === 12) {
        motif = [motif[0],motif[1],motif[2],motif[4],motif[5],motif[6]];
      }
      for (i = 0; i < n; i++) out.push(motif[Math.floor(i * 2 / sub) % motif.length]);
      return out;
    }
    for (i = 0; i < n; i++) {""")
rep("    presets.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));\n    gridEl =", """    presets.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));
    presetGenre = el('select','b39-acc-genre'); presetGenre.id='b39AccGenre'; presetGenre.setAttribute('aria-label','Жанр пресетов');
    var common=el('option','','Общие'); common.value=''; presetGenre.appendChild(common);
    STYLES.forEach(function(style){var option=el('option','',style[1]);option.value=style[0];presetGenre.appendChild(option);});
    presetGenre.addEventListener('change',renderPanel); presets.appendChild(presetGenre);
    gridEl =""")
rep("        draft.type = p.id; draft.subdivision = p.subdivision; delete draft.steps; draftLength = scopeUnits();", "        draft.type = p.id; draft.subdivision = p.subdivision; if (p.motif) draft.swing = p.presetSwing; delete draft.steps; draftLength = scopeUnits();")
rep("      b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected);\n      var preview", "      b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected);\n      b.hidden = !!p && (p.genre || '') !== (presetGenre ? presetGenre.value : '');\n      var preview")
rep("    if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });", "    if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });\n    if (presetGenre) { var p = preset(cfg.type); presetGenre.value = p && p.genre || ''; }")
rep("    normalize: normalize, preset: preset, list: list, tokens: function () { return TOKENS.slice(); },", "    normalize: normalize, preset: preset, list: list, styles: function () { return STYLES.map(function (s) { return {id:s[0],label:s[1]}; }); }, tokens: function () { return TOKENS.slice(); },")
p.write_text(text[:a]+s+text[b:],encoding='utf-8'); print('Патч применён')
