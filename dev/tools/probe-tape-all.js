// Лента ритма неподвижна на ЛЮБОЙ границе любого квадрата.
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const hits=(w,qi)=>w.eval(`(function(){
  const sec=sections[0], sq=sec.squares[${qi}];
  let off=0; const out=[];
  sq.events.forEach((e,i)=>{
    const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1), ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{ if(s&&s!=='_') out.push(
        (+(off+ph+swingStepOffsetUnits(k,sub,patternHasSwing(p))).toFixed(3))+s);});}
    off+=e.span;
  });
  return out.join(' ');})()`);
(async()=>{
 const w0=boot();
 const nq=JSON.parse(w0.eval('JSON.stringify(sections[0].squares.map(q=>q.events.length))'));
 let bad=0, tot=0;
 for(let qi=0;qi<nq.length;qi++){
  for(let hi=0;hi<nq[qi]-1;hi++){
   for(const dir of [1,-1]){
    const w=boot(); await new Promise(r=>setTimeout(r,250));
    const before=hits(w,qi);
    const sq=w.document.querySelectorAll('.square-inner')[qi]; if(!sq) continue;
    const cap=JSON.parse(w.eval(`JSON.stringify(sections[0].squares[${qi}].events.map(e=>e.span))`)).reduce((a,b)=>a+b,0);
    const W=800, gs=W/cap;
    sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
    sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
    const h=sq.querySelectorAll('.resize-handle')[hi]; if(!h) continue;
    const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
    if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
    for(let k=1;k<=8;k++) w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:dir*gs*k/8}));
    w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:dir*gs}));
    await new Promise(r=>setTimeout(r,300));
    const after=hits(w,qi); tot++;
    if(before!==after){bad++;
      console.log(`  sq${qi} ручка${hi} ${dir>0?'вправо':'влево'}: ЛЕНТА СЪЕХАЛА`);
      console.log('     до   :',before); console.log('     после:',after);}
   }
  }
 }
 console.log(`\nпроверено жестов: ${tot}, лента съехала: ${bad}`);
})();
