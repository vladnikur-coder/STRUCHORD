#!/usr/bin/env node
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
const KEY='struchord-audio-diagnostics-v1';
class MockAudioContext {
  constructor(){this.state='running';this.sampleRate=48000;this.currentTime=1;this.destination={};this.onstatechange=null;}
  resume(){this.state='running';return Promise.resolve();}
  suspend(){this.state='suspended';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){}};}
  createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
function makeDom(seed){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
    w.AudioContext=w.webkitAudioContext=MockAudioContext;
    Object.defineProperty(w.navigator,'audioSession',{configurable:true,value:{type:'auto'}});
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:40}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
    if(seed)w.localStorage.setItem(KEY,seed);
  }});
  return new Promise(resolve=>dom.window.addEventListener('load',()=>resolve(dom),{once:true}));
}
(async()=>{
  const dom=await makeDom(); const w=dom.window;
  const first=w.getAudioContext();
  if(!first||w.eval('audioContextGeneration')!==1)throw new Error('ПРОВАЛ: первое поколение не создано');
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'hidden'});
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await new Promise(resolve=>setTimeout(resolve,0));
  if(first.state!=='suspended')throw new Error('ПРОВАЛ: idle-контекст не усыпился в фоне');
  if(!w.eval("audioDiagnosticLog.some(e=>e.type==='context-suspend-resolved')"))throw new Error('ПРОВАЛ: suspend не записан в журнал');
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'visible'});
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await new Promise(resolve=>setTimeout(resolve,0));
  if(first.state!=='running')throw new Error('ПРОВАЛ: контекст не проснулся после возврата');
  if(w.eval('navigator.audioSession.type')!=='playback')throw new Error('ПРОВАЛ: playback AudioSession не установлен');
  first.state='interrupted';
  if(!w.hardRecoverAudioContext('runtime-test',true))throw new Error('ПРОВАЛ: hard recovery вернул false');
  const second=w.getAudioContext();
  if(second===first||second.state!=='running')throw new Error('ПРОВАЛ: контекст не заменён рабочим');
  if(w.eval('audioContextGeneration')!==2)throw new Error('ПРОВАЛ: поколение не увеличено');
  const report=JSON.parse(w.audioDiagnosticReport());
  const types=report.events.map(event=>event.type);
  if(!types.includes('context-created'))throw new Error('ПРОВАЛ: создание контекста не попало в журнал');
  if(!types.includes('hard-recovery-started')||!types.includes('hard-recovery-finished'))throw new Error('ПРОВАЛ: hard recovery не записан целиком');
  const stored=w.localStorage.getItem(KEY);
  if(!stored)throw new Error('ПРОВАЛ: журнал не сохранён в localStorage');
  if(report.current.generation!==2||report.current.context.state!=='running')throw new Error('ПРОВАЛ: отчёт не содержит живое поколение');
  w.openAudioDiagnosticReport();
  const field=w.document.querySelector('.audio-diagnostic-report');
  if(!field||!field.value.includes('hard-recovery-finished'))throw new Error('ПРОВАЛ: dev-модалка не показывает сохранённый отчёт');
  w.closeAudioDiagnosticReport(); dom.window.close();

  // Имитируем полный перезапуск Safari: новый Window получает только
  // содержимое localStorage, но не JS-состояние первого запуска.
  const restarted=await makeDom(stored); const rw=restarted.window;
  const afterRestart=JSON.parse(rw.audioDiagnosticReport());
  const oldSession=report.events[0].session;
  if(!afterRestart.events.some(event=>event.session===oldSession&&event.type==='hard-recovery-finished'))throw new Error('ПРОВАЛ: hard recovery исчез после перезапуска');
  if(!afterRestart.events.some(event=>event.session!==oldSession&&event.type==='page-init'))throw new Error('ПРОВАЛ: новый запуск не отделён новым session id');
  for(let index=0;index<210;index++)rw.recordAudioDiagnostic('ring-test',{index});
  const ring=JSON.parse(rw.localStorage.getItem(KEY));
  if(ring.length!==200||ring.at(-1).index!==209)throw new Error('ПРОВАЛ: кольцо не удерживает ровно последние 200 событий');
  rw.clearAudioDiagnosticLog();
  if(rw.localStorage.getItem(KEY)!==null)throw new Error('ПРОВАЛ: очистка не удалила постоянный журнал');
  console.log('ALL OK — recovery записан, отчёт открывается, журнал переживает новый Window, ограничен 200 событиями и очищается.');
  restarted.window.close();
})().catch(error=>{console.error(error);process.exit(1);});
