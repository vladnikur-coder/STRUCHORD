// Сколько глифов (нот) показано в каждой ячейке на каждой фазе жеста.
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);
setTimeout(main,300);
function cells(){
  const sq=w.document.querySelectorAll('.square-inner')[1];
  if(!sq) return 'нет квадрата';
  return Array.from(sq.querySelectorAll('.chord-wrapper')).map(cw=>{
    const p=cw.querySelector('.event-strum-preview');
    const glyphs=p?p.querySelectorAll('*').length:0;
    const txt=p?(p.textContent||'').trim().replace(/\s+/g,''):'';
    return (txt||'∅')+'('+glyphs+')';
  }).join('  ');
}
function hints(){
  const els=w.document.querySelectorAll('.rhythm-hint');
  if(!els.length) return 'нет полос';
  return Array.from(els).map(el=>{
    const hits=el.querySelectorAll('.rhythm-hint-hit').length;
    return ((el.textContent||'').trim().replace(/\s+/g,'')||'∅')+'['+hits+']';
  }).join('  ');
}
function main(){
  const W=800,gs=W/16;
  const sq=w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
  sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
  console.log('ДО ЖЕСТА     превью:',cells());
  console.log('             полосы:',hints());
  const h=sq.querySelectorAll('.resize-handle')[2];
  const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
  if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
  console.log('\nPOINTERDOWN  превью:',cells());
  console.log('             полосы:',hints());
  let step=0;
  const pts=[20,40,gs/2,gs];
  (function tick(){
    if(step<pts.length){
      w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:pts[step]}));
      setTimeout(()=>{console.log('\nMOVE '+pts[step]+'px  превью:',cells());console.log('             полосы:',hints());step++;tick();},50);
    } else {
      w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:gs}));
      setTimeout(()=>{console.log('\nPOINTERUP    превью:',cells());console.log('             полосы:',hints());},700);
    }
  })();
}
