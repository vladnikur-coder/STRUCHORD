// Сверка ПОДСКАЗКИ (в жесте) с ЗВУКОМ (после отпускания).
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const d=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=d.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const hint=(w)=>{const o=[];w.document.querySelectorAll('.rhythm-hint').forEach(s=>{
  const L=parseFloat(s.style.left)||0,WD=parseFloat(s.style.width)||0;
  s.querySelectorAll('.rhythm-hint-hit').forEach(h=>{
    if(h.classList.contains('rest')||h.style.display==='none')return;
    o.push(+(L+WD*(parseFloat(h.style.left)||0)/100).toFixed(2));});});
  return o.sort((a,b)=>a-b);};
const sound=(w)=>JSON.parse(w.eval(`(function(){
  const sec=sections[0],sq=sec.squares[1];
  const tot=sq.events.reduce((a,e)=>a+e.span,0);
  let off=0;const o=[];
  sq.events.forEach((e,i)=>{const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1),ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{if(s&&s!=='_')o.push(+(((off+ph+k/sub)/tot)*100).toFixed(2));});}
    off+=e.span;});
  return JSON.stringify(o.sort((a,b)=>a-b));})()`));
(async()=>{
 const w=boot(); await new Promise(r=>setTimeout(r,300));
 const W=800,gs=W/16,sq=w.document.querySelectorAll('.square-inner')[1];
 sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
 sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
 const s0=sound(w);
 console.log('ЗВУК до жеста :', s0.join(' '));
 const h=sq.querySelectorAll('.resize-handle')[1];
 const dn=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
 if(typeof h.onpointerdown==='function')h.onpointerdown(dn);else h.dispatchEvent(dn);
 console.log('подсказка down:', hint(w).join(' '));
 for(let k=1;k<=8;k++) w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:gs*k/8}));
 await new Promise(r=>setTimeout(r,120));
 const hv=hint(w);
 console.log('подсказка ЖЕСТ:', hv.join(' '));
 w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:gs}));
 await new Promise(r=>setTimeout(r,400));
 const s1=sound(w);
 console.log('ЗВУК после    :', s1.join(' '));
 console.log();
 console.log('ЗВУК не изменился        :', JSON.stringify(s0)===JSON.stringify(s1));
 console.log('подсказка = будущий звук :', JSON.stringify(hv)===JSON.stringify(s1));
 if(JSON.stringify(hv)!==JSON.stringify(s1)){
   console.log('  лишние в подсказке:', hv.filter(x=>!s1.some(u=>Math.abs(u-x)<0.2)).join(' ')||'—');
   console.log('  не показаны       :', s1.filter(x=>!hv.some(u=>Math.abs(u-x)<0.2)).join(' ')||'—');
 }
})();
