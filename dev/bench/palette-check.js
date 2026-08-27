const puppeteer=require('/home/user/node_modules/puppeteer');
const path='file:///home/user/STRUCHORD.html';
function lum(c){const [r,g,b]=c;const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)}
function ratio(a,b){const l1=lum(a),l2=lum(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)}
function parse(s){const m=s.match(/\d+/g);return m?m.slice(0,3).map(Number):[0,0,0]}
(async()=>{
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
await page.goto(path,{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await page.evaluate(d=>{const o=JSON.parse(d);window.loadSong&&0;const f=window.__load||null;
  // грузим через внутреннюю функцию импорта
  const blob=new Blob([d],{type:'application/json'});
  const file=new File([blob],'s.json',{type:'application/json'});
  window.importSong(file);
},json);
await new Promise(r=>setTimeout(r,900));
for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t==='dark'?'dark':''),theme);
  await new Promise(r=>setTimeout(r,400));
  const c=await page.evaluate(()=>{
    const g=(el,p)=>getComputedStyle(el).getPropertyValue(p);
    const body=document.body, cont=document.querySelector('.container');
    const cell=document.querySelector('.chord-wrapper .chord-content')||document.querySelector('.chord-wrapper');
    const sq=document.querySelector('.square-inner');
    return {
      bodyBg:g(body,'background-color'), contBg:g(cont,'background-color'),
      text:g(cont,'color'), sqBg:sq?g(sq,'background-color'):null,
      accent:getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
      warm:getComputedStyle(document.documentElement).getPropertyValue('--color-accent-warm').trim(),
    };
  });
  const hex=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))};
  console.log('---',theme,'---');
  console.log('  фон стола',c.bodyBg,' лист',c.contBg,' квадрат',c.sqBg);
  console.log('  текст/лист   ',ratio(parse(c.text),parse(c.contBg)));
  console.log('  акцент/лист  ',c.accent,ratio(hex(c.accent),parse(c.contBg)));
  console.log('  тёплый/лист  ',c.warm,ratio(hex(c.warm),parse(c.contBg)));
  if(c.sqBg) console.log('  квадрат/лист ',ratio(parse(c.sqBg),parse(c.contBg)));
  await page.screenshot({path:`/home/user/dev/bench/palette-${theme}.png`});
}
await browser.close();
})();
