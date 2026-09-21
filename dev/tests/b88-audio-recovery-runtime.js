#!/usr/bin/env node
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
class MockAudioContext {
  constructor(){this.state='running';this.sampleRate=48000;this.currentTime=1;this.destination={};this.onstatechange=null;}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){}};}
  createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
  w.AudioContext=w.webkitAudioContext=MockAudioContext;
  w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:40}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
}});
dom.window.addEventListener('load',()=>{
  const w=dom.window;
  const first=w.getAudioContext();
  if(!first||w.eval('audioContextGeneration')!==1)throw new Error('ПРОВАЛ: первое поколение не создано');
  first.state='interrupted';
  if(!w.hardRecoverAudioContext('runtime-test',true))throw new Error('ПРОВАЛ: hard recovery вернул false');
  const second=w.getAudioContext();
  if(second===first||second.state!=='running')throw new Error('ПРОВАЛ: контекст не заменён рабочим');
  if(w.eval('audioContextGeneration')!==2)throw new Error('ПРОВАЛ: поколение не увеличено');
  console.log('ALL OK — AudioContext реально пересоздаётся и становится running.');
  dom.window.close();
});
