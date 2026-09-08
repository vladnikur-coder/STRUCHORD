// Вперёд vs назад: что с боем ВО ВРЕМЯ жеста (до отпускания).
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const d=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=d.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const W=800;
// звучащие удары подсказки, абсолютные % ширины квадрата
const hint=(w)=>{const o=[];w.document.querySelectorAll('.rhythm-hint').forEach(s=>{
  const L=parseFloat(s.style.left)||0,WD=parseFloat(s.style.width)||0;
  s.querySelectorAll('.rhythm-hint-hit').forEach(h=>{if(h.classList.contains('rest'))return;
    if(h.style.display==='none')return;
    o.push(+(L+WD*(parseFloat(h.style.left)||0)/100).toFixed(2));});});
  return o.sort((a,b)=>a-b).join(' ');};
(async()=>{
 for(const [dir,name] of [[1,'ВПЕРЁД (вправо)'],[-1,'НАЗАД (влево)']]){
  const w=boot(); await new Promise(r=>setTimeout(r,300));
  const sq=w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
  sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
  const gs=W/16,h=sq.querySelectorAll('.resize-handle')[1];
  const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
  if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
  const base=hint(w);
  console.log('=== '+name+' ===');
  console.log('  down :',base);
  for(const frac of [0.25,0.5,0.75,1.0]){
    w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:dir*gs*frac}));
    await new Promise(r=>setTimeout(r,70));
    const cur=hint(w);
    console.log('  move '+frac+': '+(cur===base?'на месте':'ИЗМЕНИЛСЯ'));
    if(cur!==base) console.log('        '+cur);
  }
  w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:dir*gs}));
  await new Promise(r=>setTimeout(r,350));
  console.log('  up   :',hint(w));
  console.log();
 }
})();
