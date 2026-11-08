// B-39 0.802: хип-хоп вместо соул — жанровая карта, профили корпуса, паттерны, санитайзер.
'use strict';
const fs=require('fs'),assert=require('assert');
const accompaniment=fs.readFileSync('keyboard-accompaniment.js','utf8');
const html=fs.readFileSync('STRUCHORD.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const profiles=require('../audits/b39-corpus-groove-profiles.json');

// 1. Жанровая карта: 9 жанров, hiphop есть, soul нет нигде в продукте.
const GENRES=['pop','rock','punk','country','blues','jazz','hiphop','funk','fusion'];
assert(accompaniment.includes("['hiphop','Хип-хоп',["),'STYLES: жанр хип-хоп с русской подписью');
assert(!accompaniment.includes("'Соул'"),'STYLES: соул удалён');
assert(!accompaniment.includes('soul:['),'FAMILY_MOTIFS: ключа soul нет');
assert(accompaniment.includes('      hiphop:['),'FAMILY_MOTIFS: семейство hiphop');
// ID пресетов собираются динамически из STYLES/FAMILY_MOTIFS: проверяем сами конструкторы.
assert(accompaniment.includes("id:'style-'+style[0]+'-'+index"),'конструктор ID style');
assert(accompaniment.includes("id:'family-'+style[0]+'-'+i"),'конструктор ID family');
assert(accompaniment.includes("id:'perform-'+style[0]+'-'+i"),'конструктор ID perform');
// Свинг по умолчанию остаётся только у блюза и джаза; хип-хоп прямой.
const swingLine=accompaniment.match(/presetSwing:style\[0\]==='blues'\s*\|\|\s*style\[0\]==='jazz'/g)||[];
assert(swingLine.length>=2,'свинг включён только у blues/jazz (семейства и исполнения)');
assert(html.includes("var AUTO_GENRES = ['pop','rock','punk','country','blues','jazz','hiphop','funk','fusion'];"),'санитайзер: hiphop в списке');
assert(!html.includes("'soul'"),'в HTML не осталось soul-жанра');
const VER=(html.match(/· ver (\d+\.\d+)/)||[])[1];   // динамический R7-контракт (как в 0.785/0.800): тест живёт между волнами
assert(VER&&sw.includes('struchord-v'+VER.replace(/^0\./,'')),'версия и кэш парой (R7): ver '+VER);

// 2. Профили корпуса: soul растворён, hiphop из 516 файлов, фанк/поп поглотили папки.
assert.deepStrictEqual(profiles.genres,GENRES,'билдер: 9 жанров с hiphop');
assert(!profiles.profiles.soul&&profiles.profiles.hiphop,'soul нет, hiphop есть');
const hip4=profiles.profiles.hiphop['4/4'].custom;
assert.strictEqual(hip4.n,492,'hiphop 4/4 собран из 492 файлов');
assert.strictEqual(profiles.profiles.hiphop['6/8'].custom.n,24,'hiphop 6/8 — 24 файла');
assert.strictEqual(profiles.profiles.hiphop['3/4'].custom.n,0,'hiphop 3/4 — честный fallback (0 файлов)');
assert.strictEqual(profiles.styleMap['hip-hop'],'hiphop');
assert.strictEqual(profiles.styleMap['hip-hop#r&b'],'hiphop');
assert.strictEqual(profiles.styleMap['hip-hop_hooks'],'hiphop');
assert.strictEqual(profiles.styleMap['gospel_organ'],'funk','переклейка: органный госпел -> фанк');
assert.strictEqual(profiles.styleMap['contemporary_soul_ballads'],'pop','переклейка: соул-баллады -> поп');
assert(Object.values(profiles.styleMap).every(x=>GENRES.includes(x)),'все 109 папок ведут в живые жанры');
const dataStart=html.indexOf('const CORPUS_PROFILES = ');
const dataEnd=html.indexOf(';\nfunction corpusProfileFor',dataStart);
assert.deepStrictEqual(JSON.parse(html.slice(dataStart+'const CORPUS_PROFILES = '.length,dataEnd)),profiles.profiles,'встроенная таблица = собранной');

// 3. Модуль исполнения: генерация hiphop работает, soul невалиден, детерминизм.
const moduleStart=html.indexOf('perf=(function(){let module={exports:{}},require=function(){return hand}');
const moduleEnd=html.indexOf('return module.exports;})(),section=',moduleStart);
let expression=html.slice(moduleStart,moduleEnd+'return module.exports;})()'.length);
expression=expression.replace('return module.exports;})()','return {generatePerformance,corpusProfileFor,corpusGrooveIndex,CORPUS_PROFILES,GROOVES,GENRES,METERS};})()');
const perf=new Function('hand','return '+expression.slice('perf='.length))({
  planSequence:({chords})=>({ok:true,voices:chords.map(()=>({left:[36],right:[60,64,67],omitted:[]}))})
});
assert(perf.GENRES.hiphop&&!perf.GENRES.soul,'GENRES: hiphop вместо soul');
assert.strictEqual(perf.GROOVES.hiphop.length,4,'4 groove-строки хип-хопа');
const p=perf.corpusProfileFor('hiphop','4/4','verse');
assert(p&&p.a.reduce((a,b)=>a+b,0)===100&&p.d>=0.9&&p.d<=1.1,'профиль hiphop в границах');
assert.strictEqual(perf.corpusProfileFor('soul','4/4','verse'),null,'профиля soul больше нет');
const chords=Array.from({length:4},()=>({bassPc:0,tones:[0,4,7],beats:4}));
const opts={chords,low:36,high:88,bpm:88,meter:'4/4',genre:'hiphop',role:'chorus',swing:false,seed:5,phraseSeed:42,rhythmVersion:2};
const a=perf.generatePerformance(opts),b=perf.generatePerformance(opts);
assert(a.ok&&b.ok&&JSON.stringify(a)===JSON.stringify(b),'hiphop генерируется и детерминирован');
for(const n of a.notes){assert(n.midi>=36&&n.midi<=88&&n.beat>=0&&n.duration>0&&n.velocity>=30&&n.velocity<=118,'ноты в границах');}
assert.throws(()=>perf.generatePerformance({...opts,genre:'soul'}),'soul больше не принимается генератором');
// Прямой грув: без свинга атаки лежат у ровной сетки шестнадцатых — в пределах
// штатного детерминированного джиттера «вразнобой» (0.776/0.778, ~9 мс), но не на
// свинговых смещениях (~треть шестнадцатой).
assert(a.notes.every(n=>Math.abs(n.beat*4-Math.round(n.beat*4))<0.1),'без свинга атаки у ровной сетки (в пределах джиттера)');

// 4. Прототип синхронизирован с HTML (блок ROLE->METERS), как требует тест 0.772.
const proto=fs.readFileSync('dev/prototypes/keyboard-performance.js','utf8');
const roleLine='const ROLE = Object.freeze({intro:0.72, verse:0.82, prechorus:1.0, chorus:1.16, bridge:0.94, solo:0.72, outro:0.62, custom:0.9});';
assert(html.includes(proto.slice(proto.indexOf(roleLine),proto.indexOf('\nconst METERS = Object.freeze('))),'прототип = HTML в сверяемом блоке');
console.log('B-39 hip-hop 0.802: жанровая карта, профили (492/24/0), паттерны, санитайзер, синхронизация прототипа — OK');
