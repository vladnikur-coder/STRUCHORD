const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const w=boot();
const dump=(tag)=>{
  const r=w.eval(`(()=>{const s=sections[0],sq=s.squares[1];
    return JSON.stringify({spans:sq.events.map(e=>e.span),
      sounding:sq.events.map((e,i)=>{try{const x=rhythmSoundingForEvent(s,sq,e,i);return x?x.mode+':'+x.subdivision+':'+(x.steps||[]).length:'null'}catch(err){return 'ERR '+err.message}}),
      refs:JSON.stringify(songRhythmRolls&&songRhythmRolls.refs||[]).slice(0,300),
      pool:Object.keys((songRhythmRolls&&songRhythmRolls.pool)||{})});})()`);
  console.log('\n--- '+tag+' ---'); const o=JSON.parse(r);
  console.log(' spans   ',o.spans.join(' | '));
  console.log(' sounding',o.sounding.join(' | '));
  console.log(' pool    ',o.pool.join(','));
  console.log(' refs    ',o.refs);
};
dump('до жеста');
const W=800,gs=W/16;
const sq=w.document.querySelectorAll('.square-inner')[1];
sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
const h=sq.querySelectorAll('.resize-handle')[2];
const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
[20,40,gs].forEach(x=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:x})));
dump('ВО ВРЕМЯ жеста (до pointerup)');
w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:gs}));
setTimeout(()=>dump('ПОСЛЕ pointerup'),400);
