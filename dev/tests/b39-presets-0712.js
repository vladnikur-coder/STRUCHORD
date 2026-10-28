/* B-39: пресеты клавиш, старые рисунки, фаза и подписи. */
const assert = require('assert');
const puppeteer = require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys')); await page.reload();
  await page.evaluate(()=>{startNewSongFromHome();addSection('A');sections[0].squares[0].events[0].chord='C';requestRender();});
  const results=await page.evaluate(()=>{
    const A=StruChordAccomp;
    const common={patternSource:'section',span:4,dur:4,ts:'4/4',chord:'C',key:'C',range:{low:36,high:84},notes:[48,60,64,67]};
    const presets=Object.fromEntries(A.list().map(p=>[p.id,A.plan({...common,pattern:{type:p.id,subdivision:p.subdivision}}).map(x=>({token:x.token,notes:x.notes}))]));
    const sq={events:[{span:.5},{span:1},{span:2.5}]};
    const arp={...common,pattern:{type:'keys-arp-up',subdivision:2},sq};
    const split=sq.events.flatMap((ev,ei)=>A.plan({...arp,ei,ev,span:ev.span,dur:ev.span}).map(x=>x.notes));
    const own=A.plan({...arp,patternSource:'cell',ei:1,span:1,dur:1}).map(x=>x.notes);
    const mixedPattern={type:'keys-arp-up',subdivision:2,steps:['A','B',['H','A'],null,'A']};
    const mixedWhole=A.plan({...arp,pattern:mixedPattern,span:10,dur:10}).map(x=>x.notes);
    const mq={events:[{span:2.5},{span:3},{span:4.5}]};
    const mixedSplit=mq.events.flatMap((ev,ei)=>A.plan({...arp,pattern:mixedPattern,sq:mq,ei,ev,span:ev.span,dur:ev.span}).map(x=>x.notes));
    const minor=A.plan({...common,chord:'Cm',notes:[48,60,63,67],pattern:{type:'keys-alberti',subdivision:2}}).map(x=>x.notes);
    const inversion=A.plan({...common,notes:[52,55,60,64],pattern:{type:'keys-octave-bass',subdivision:1}}).map(x=>x.notes);
    const explicit=A.plan({...common,pattern:{type:'keys-alberti',subdivision:2,steps:[['H','t1'],'t5','t3','t5']}}).map(x=>x.notes);
    return {presets,split,own,mixedWhole,mixedSplit,minor,inversion,explicit};
  });
  let p=results.presets;
  assert.deepStrictEqual(p['keys-block'].map(x=>x.token),['H','H','H','H']);
  assert.deepStrictEqual(p['keys-bass-chord'].map(x=>x.token),['B','H','B','H']);
  assert.deepStrictEqual(p['keys-waltz'].map(x=>x.token),['B','H','H','B']);
  assert.deepStrictEqual(p['keys-octave-bass'].map(x=>x.token),['O','H','O','H']);
  assert.deepStrictEqual(p['keys-alberti'].map(x=>x.token),['t1','t5','t3','t5','t1','t5','t3','t5']);
  assert.deepStrictEqual(p['keys-alberti'].slice(0,4).map(x=>x.notes),[[48],[67],[64],[67]],'Альберти: отдельные ступени, не полный аккорд');
  assert.deepStrictEqual(results.minor.slice(0,4),[[48],[67],[63],[67]],'минорная терция');
  assert.deepStrictEqual(results.split,p['keys-arp-up'].map(x=>x.notes),'арпеджио продолжает фазу на границах ячеек');
  assert.deepStrictEqual(results.own[0],[60],'собственный рисунок ячейки начинается сначала');
  assert.deepStrictEqual(results.mixedSplit,results.mixedWhole,'фаза считается по A, включая сочетания и повторы рисунка');
  assert.deepStrictEqual(results.inversion[0],[52,64],'октавный бас использует бас позиции, не обязательно корень');
  assert.deepStrictEqual(results.explicit[0],[48,60,64,67],'ручной сохранённый шаг не заменяется');
  // Старый пресет без шагов меняет звучание, а явно сохранённые шаги не трогаем.
  let legacy=await page.evaluate(()=>{const T=StruChordTracks,S=StruChordAccomp;let id=sections[0].id;T.setPattern(1,'s:'+id,{type:'keys-alberti',subdivision:2});const saved={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};T.attach(saved,saved);return {saved:T.track(1).patterns['s:'+id],resolved:S.resolve(1,null,id)};});
  assert.equal(legacy.saved.type,'keys-alberti'); assert.equal(legacy.saved.steps,undefined); assert.equal(legacy.resolved.type,'keys-alberti');
  const custom=await page.evaluate(()=>{const T=StruChordTracks,id=sections[0].id,key='s:'+id; T.setPattern(1,key,{type:'keys-alberti',subdivision:2,steps:[['H','t1'],'t5','t3','t5']}); const raw={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()}; T.attach(raw,raw); const result=T.track(1).patterns[key]; T.setPattern(1,key,{type:'keys-alberti',subdivision:2}); return result;});
  assert.deepStrictEqual(custom.steps,[['H','t1'],'t5','t3','t5'],'старый вручную изменённый рисунок не переписывается при загрузке');
  const open=()=>page.evaluate(()=>openStrumPatternEditor('section',sections[0].id));
  await open();
  const preview=id=>page.$$eval(`#b39AccPanel [data-preset="${id}"] .strum-step`,es=>es.map(e=>e.textContent));
  assert.deepStrictEqual(await preview('keys-alberti'),['1','5','3','5','1','5','3','5'],'миниатюра Альберти показывает ступени');
  assert.deepStrictEqual(await preview('keys-block'),['А','А','А','А']);
  assert.match(await page.$eval('[data-preset="keys-octave-bass"]',e=>e.title),/бас через октаву/);
  await page.click('#b39AccCancel');
  await page.evaluate(()=>{sections[0].timeSig='3/4';}); await open();
  assert.deepStrictEqual(await preview('keys-block'),['А','А','А'],'миниатюра пересчитана для 3/4');
  assert.deepStrictEqual(await preview('keys-waltz'),['Б','А','А']);
  await page.click('[data-preset="keys-alberti"]');
  const actual=await page.$$eval('#b39AccSteps button',es=>es.map(e=>e.textContent));
  assert.deepStrictEqual(actual.slice(0,6),await preview('keys-alberti'),'миниатюра совпадает с сеткой');
  await page.click('#b39AccCancel'); assert.deepStrictEqual(errors,[]);
  console.log('B-39: пресеты, ноты, фаза, миниатюры и старые песни — OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
