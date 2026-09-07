// Совпадает ли СЕТКА счёта с сеткой ударов (по узлам в долях, не по пикселям).
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
const dom=new JSDOM(fs.readFileSync(root+'/STRUCHORD.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.addEventListener('load',()=>{
 w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}
 setTimeout(()=>{
  const r=w.eval(`(function(){
    const sec=sections[0], sq=sec.squares[1];
    const div=getEditorCountSubdivision(sec,sq);
    // узлы счёта: те, для которых countLabelFor даёт непустой слог
    const bpb=getGridUnitsPerBar(sec.timeSig||globalTimeSig);
    // Узлы счёта — ровно те, что рисует buildInnerCounts (ceil от начала
    // ячейки к ближайшему узлу), а не своя формула: иначе замер врёт.
    const cnt=[]; let off=0;
    sq.events.forEach((e)=>{
      const span=e.span, step=1/div;
      const first=Math.ceil((off-1e-6)/step)*step;
      for(let node=first; node<off+span-1e-6; node+=step){
        const sub=Math.round((node-Math.floor(node+1e-6))*div)%div;
        if(countLabelFor(node,sub,div,bpb)) cnt.push(+node.toFixed(3));
      }
      off+=span;
    });
    // узлы ударов: реальные моменты звучания
    const hit=[]; off=0;
    sq.events.forEach((e,i)=>{
      const p=rhythmSoundingForEvent(sec,sq,e,i);
      if(p&&p.steps){const sub=Math.max(1,p.subdivision||1), ph=p.gridPhase||0;
        p.steps.forEach((s,k)=>{ if(s&&s!=='_') hit.push(+(off+ph+swingStepOffsetUnits(k,sub,patternHasSwing(p))).toFixed(3));});}
      off+=e.span;
    });
    return JSON.stringify({div, cnt, hit});
  })()`);
  const {div,cnt,hit}=JSON.parse(r);
  console.log('дробление счёта (div):', div);
  console.log('узлов счёта:', cnt.length, '| ударов:', hit.length);
  // Свинг: удар на 2/3 доли не обязан совпадать с «и» на 1/2 — это НОРМА,
  // он всё равно принадлежит слогу «и». Проверяем принадлежность слогу.
  const orphan=hit.filter(t=>{
    const frac=t-Math.floor(t);
    // ближайший слог той же доли
    return !cnt.some(c=>Math.abs(c-t)<1e-6) && !(Math.abs(frac-2/3)<0.01 && cnt.some(c=>Math.abs(c-(Math.floor(t)+0.5))<1e-6));
  });
  console.log('ударов вне сетки счёта:', orphan.length, orphan.length?('-> '+orphan.slice(0,10).join(' ')):'');
 },350);
});
