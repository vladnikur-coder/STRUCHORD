#!/usr/bin/env python3
"""B-39: новые семейства рисунков поверх 0.714, старые ID не меняются."""
from pathlib import Path
p=Path('STRUCHORD.html'); text=p.read_text(encoding='utf-8')
def rep(a,b):
 global text
 if text.count(a)!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: %d совпадений %r' % (text.count(a),a[:120]))
 text=text.replace(a,b,1)
rep("  var DEFAULT_TYPE = 'keys-block';", """  // Самостоятельные семейства из пяти связанных вариантов на такт 4/4.
  // Старые пресеты и их идентификаторы остаются неизменными.
  // Порядок: вступление, куплет, переход, припев, окончание.
  var FAMILY_MOTIFS = {
    pop:[
      ['B',null,'t3',null,'t5',null,'t3',null],
      ['B',null,'t3','t5','B',null,'t3','t5'],
      ['B','t3','t5','A','B',null,'t3','t5'],
      [['B','H'],null,'H','t5',['B','H'],null,'H','t5'],
      ['B',null,'t3','t5',['B','H'],null,null,null]],
    rock:[
      ['B',null,'H',null,'B',null,'H',null],
      ['B',null,'H','H','B','t5','H',null],
      ['B',null,'H','H','O',null,'H','H'],
      [['O','H'],null,'H','H',['O','H'],null,'H','H'],
      ['B',null,'H','H',['O','H'],null,null,null]],
    punk:[
      ['B',null,'H',null,'B',null,'H',null],
      ['B','H','H',null,'B','H','H',null],
      ['B','H','H','H','B','H',null,null],
      [['B','H'],'H','H','H',['B','H'],'H','H','H'],
      ['B','H','H','H',['B','H'],null,null,null]],
    country:[
      ['B',null,'H',null,'t5',null,'H',null],
      ['B',null,'H','A','t5','t3','H','A'],
      ['B','t5','H','A','t5','t3','H','A'],
      [['B','H'],null,'H','A',['B','t5'],null,'H','A'],
      ['B',null,'H','A',['B','H'],null,null,null]],
    blues:[
      ['B',null,'H',null,'B',null,'H',null],
      ['B',null,'H','H','B','H','H',null],
      ['B','H',null,'H','B','H',null,'H'],
      [['B','H'],null,'H','H',['B','H'],null,'H','H'],
      ['B','H',null,'H',['B','H'],null,null,null]],
    jazz:[
      [null,'H',null,null,'B',null,'H',null],
      ['B',null,null,'H',null,'H',null,'H'],
      ['B',null,'H',null,null,'H','t5','H'],
      ['B','H',null,'H','B',null,'H','H'],
      ['B',null,'H',null,['B','H'],null,null,null]],
    soul:[
      ['B',null,null,'t3','H',null,null,null],
      ['B',null,'t3','t5','H',null,'t3',null],
      ['B',null,'t3','t5','H',null,'H','t5'],
      [['B','H'],null,'t3','H','B',null,'H','t5'],
      ['B',null,'t3','t5',['B','H'],null,null,null]],
    funk:[
      ['B',null,null,'H',null,null,'H',null],
      ['B',null,'H',null,null,'H',null,'H'],
      ['B',null,'H','H',null,'H','t5','H'],
      ['B','H',null,'H','B','H',null,'H'],
      ['B',null,'H','H',['B','H'],null,null,null]],
    fusion:[
      ['B',null,'t3','t5',null,null,'t3',null],
      ['B','t3','t5',null,'B',null,'t3','t5'],
      ['B','t3','t5','A',null,'H','t3','t5'],
      [['B','H'],'t3',null,'H','B','t5','H','A'],
      ['B','t3','t5','A',['B','H'],null,null,null]]
  };
  var FAMILY_ROLES = ['Вступление','Куплет','Переход','Припев','Аутро'];
  STYLES.forEach(function(style) {
    (FAMILY_MOTIFS[style[0]] || []).forEach(function(motif,i) {
      PRESETS.push({id:'family-'+style[0]+'-'+i, label:'Семейство · '+FAMILY_ROLES[i],
        genre:style[0],genreLabel:style[1],subdivision:2,motif:motif,
        hint:style[1]+' · связанный вариант: '+FAMILY_ROLES[i],
        presetSwing:style[0]==='blues' || style[0]==='jazz'});
    });
  });
  var DEFAULT_TYPE = 'keys-block';""")
rep("  function pickIndex(type){return ({Intro:0,Verse:0,PreChorus:1,Chorus:2,Bridge:1,Solo:0,Outro:0,Custom:1})[type] || 0;}", "  function pickIndex(type){var n=({Intro:0,Verse:1,PreChorus:2,Chorus:3,Bridge:2,Solo:1,Outro:4,Custom:1})[type];return n===undefined ? 1 : n;}")
rep("var acc=A(), idx=pickIndex(sec.type), id='style-'+first+'-'+idx, p=acc.preset(id);", "var acc=A(), idx=pickIndex(sec.type), id='family-'+first+'-'+idx, p=acc.preset(id);")
rep("var base=acc.buildSteps(id,2,beats), accent=second && acc.preset('style-'+second+'-'+idx);", "var base=acc.buildSteps(id,2,beats), accent=second && acc.preset('family-'+second+'-'+idx);")
rep("for (var k=1;k<=2;k++) {\n          var alternate=acc.preset('style-'+second+'-'+((idx+k)%3));", "for (var k=1;k<=4;k++) {\n          var alternate=acc.preset('family-'+second+'-'+((idx+k)%5));")
# Дополнительный жанр не меняет ритмическое ощущение всей дорожки.
rep("swing:!!(p.presetSwing || (accent && accent.presetSwing)),steps:base", "swing:!!p.presetSwing,steps:base")
p.write_text(text,encoding='utf-8');print('Патч применён')
