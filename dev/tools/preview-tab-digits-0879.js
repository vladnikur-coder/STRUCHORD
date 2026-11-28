#!/usr/bin/env node
// 0.879 · Превью стана «Только цифры» без браузера: jsdom + @resvg/resvg-js.
// Песочница не умеет Chromium, поэтому чистую геометрию стана можно
// посмотреть PNG-ками. Кадры настоящей страницы снимает
// dev/tests/b12-tab-digits-0879-shots.js.
// Запуск: node dev/tools/preview-tab-digits-0879.js
'use strict';
const fs=require('fs'), path=require('path'), {JSDOM, VirtualConsole}=require('jsdom');
const ROOT=path.resolve(__dirname,'..','..');
const HTML=fs.readFileSync(path.join(ROOT,'STRUCHORD.html'),'utf8');
const dom=new JSDOM(HTML,{runScripts:'dangerously',url:'https://localhost/',virtualConsole:new VirtualConsole(),beforeParse(w){
 w.TextEncoder=TextEncoder; w.requestAnimationFrame=(cb)=>setTimeout(()=>cb(1),8);
 if(!w.ResizeObserver) w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 if(!w.document.fonts) w.document.fonts={add(){},check:()=>true,ready:Promise.resolve(),forEach(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>({width:10})});
}});
const w=dom.window;
setTimeout(()=>{
  let Resvg;
  try {
    ({ Resvg } = require('@resvg/resvg-js'));
  } catch (_) {
    console.error('Нужен @resvg/resvg-js: npm install @resvg/resvg-js --no-save');
    process.exit(1);
  }

  const notes=(n,span,frets)=>{const st=span/n;return Array.from({length:n},(_,i)=>({start:Math.round(i*st*1e9)/1e9,dur:st,string:i%6,fret:frets?frets[i%frets.length]:i%5}))};
  const cases=[
    ['cell-232x64-16ths', notes(8,2), 2, 232, 64, 'cell'],
    ['block-396x96-16ths', notes(16,4), 4, 396, 96, 'block'],
    ['block-396x96-8ths', notes(8,4,0.5), 4, 396, 96, 'block'],
    ['block-396x96-quarters', notes(4,4,1), 4, 396, 96, 'block'],
    ['block-396x96-two-digit', notes(8,4,0.5,[12,10,3,7,12,0,10,5]), 4, 396, 96, 'block'],
  ];
  // паузы
  const pauseNotes=[{start:0,dur:0.5,string:2,fret:0},{start:0.5,dur:0.5,pause:true},{start:1,dur:0.5,string:1,fret:3},{start:1.5,dur:0.5,string:0,fret:12}];
  cases.push(['block-396x96-pauses', pauseNotes, 2, 396, 96, 'block']);
  // аккорды: по 3 струны в каждой позиции (проверяем перекрытие цифр)
  const chord=[]; for(let i=0;i<8;i++) for(const s of [0,1,2]) chord.push({start:i*0.25,dur:0.25,string:s,fret:(i+s)%5});
  cases.push(['block-396x96-chords', chord, 2, 396, 96, 'block']);
  cases.push(['cell-232x64-chords', chord, 2, 232, 64, 'cell']);
  const OUT=path.join(ROOT,'dev','tmp','digits-0.879-preview');
  fs.mkdirSync(OUT,{recursive:true});
  for (const [name,n,b,width,height,layout] of cases) {
    const L=w.tabDigitsLayout(n,b,'4/4',{strings:6},{width,height,layout});
    let svg=w.tabDigitsSvgMarkup(L).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:#f5f4f1;color:#1e1e2f" `);
    svg=svg.replace(/dominant-baseline="central"/g,'dy="0.35em"');
    fs.writeFileSync(path.join(OUT, `${name}.png`), new Resvg(svg,{fitTo:{mode:'width',value:width*2}}).render().asPng());
    console.log(name,'font',L.font.toFixed(1),'lineGap',L.lineGap.toFixed(2),'step',L.step.toFixed(1),'labels',L.labels.map(l=>l.text).join(''));
  }
  process.exit(0);
},400);
