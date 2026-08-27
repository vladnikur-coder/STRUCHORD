const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html','utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font:'', measureText:()=>({width:10}), clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},
      moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},
      setTransform(){}, scale(){}, createLinearGradient:()=>({addColorStop(){}}) });
  }});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function(){ return { currentTime:0, state:'running', resume(){} }; };
const evl = (c)=>w.eval(`(()=>{ ${c} })()`);
evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] } ]}];
  sections[0].squares[0].events = [{ chord:'C', span:4, timeSig:null,
    strumPattern:{mode:'strum',subdivision:4,steps:'D___D_U___U_D_U_'.split('')} }];
  if (songRhythmRolls) { for (const key of [...songRhythmRolls.refs.keys()]) if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key); songRhythmRolls.sectionRolls.delete(1); }
  sections[0].strumPattern = null; return 0`);
console.log('до split  :', evl(`const r=songRhythmRolls&&songRhythmRolls.refs.get(rhythmRefKey(1,2,0)); const ro=r?songRhythmRolls.pool[r.roll]:null; return ro? ro.subdivision+' '+ro.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : '(нет рулона)'`));
evl('return addChordAfter(1,2,0), 0');
console.log('после split:', evl(`const r=songRhythmRolls&&songRhythmRolls.refs.get(rhythmRefKey(1,2,0)); const ro=r?songRhythmRolls.pool[r.roll]:null; return ro? ro.subdivision+' '+ro.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : '(нет рулона)'`));
console.log('cell0 sounding:', evl(`const sq=sections[0].squares[0]; const p=rhythmSoundingForEvent(sections[0],sq,sq.events[0],0); return p? p.subdivision+'|'+p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`));
console.log('cell1 sounding:', evl(`const sq=sections[0].squares[0]; const p=rhythmSoundingForEvent(sections[0],sq,sq.events[1],1); return p? p.subdivision+'|'+p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`));
