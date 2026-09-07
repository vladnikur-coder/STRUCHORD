// АБСОЛЮТНЫЕ моменты ударов по всему квадрату — до и после ресайза.
// Вопрос: остаётся ли «лента ритма» неподвижной, как в режиме ленты.
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
// абсолютные позиции ударов в ДОЛЯХ от начала квадрата + чей аккорд
const hits=(w)=>JSON.parse(w.eval(`(function(){
  const sec=sections[0], sq=sec.squares[1];
  let off=0; const out=[];
  sq.events.forEach((e,i)=>{
    const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1);
      const ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{ if(s&&s!=='_') out.push({
        t:+(off+ph+swingStepOffsetUnits(k,sub,patternHasSwing(p))).toFixed(3), s:s, ch:e.chord});});}
    off+=e.span;
  });
  return JSON.stringify(out);})()`));
(async()=>{
 const w=boot(); await new Promise(r=>setTimeout(r,300));
 const A=hits(w);
 console.log('ДО   ('+A.length+' ударов):');
 console.log('  ', A.map(h=>h.t+h.s).join(' '));
 const W=800,gs=W/16,sq=w.document.querySelectorAll('.square-inner')[1];
 sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
 sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
 const h=sq.querySelectorAll('.resize-handle')[1];
 const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
 if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
 for(let k=1;k<=8;k++) w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:gs*k/8}));
 w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:gs}));
 await new Promise(r=>setTimeout(r,350));
 const B=hits(w);
 console.log('\nПОСЛЕ ('+B.length+' ударов):');
 console.log('  ', B.map(h=>h.t+h.s).join(' '));
 const ta=A.map(h=>h.t+h.s).join(' '), tb=B.map(h=>h.t+h.s).join(' ');
 console.log('\nлента ритма НЕ изменилась:', ta===tb);
 if(ta!==tb){
   const sa=new Set(A.map(h=>h.t+h.s)), sbs=new Set(B.map(h=>h.t+h.s));
   console.log('  пропали:', [...sa].filter(x=>!sbs.has(x)).join(' ')||'—');
   console.log('  появились:', [...sbs].filter(x=>!sa.has(x)).join(' ')||'—');
 }
 console.log('\nсмена аккорда (доля -> аккорд):');
 console.log('  до   :', A.filter((h,i)=>i===0||A[i-1].ch!==h.ch).map(h=>h.t+':'+h.ch).join(' '));
 console.log('  после:', B.filter((h,i)=>i===0||B[i-1].ch!==h.ch).map(h=>h.t+':'+h.ch).join(' '));
})();
