const fs=require('fs'),path=require('path'),crypto=require('crypto');
const chromium=require('@sparticuz/chromium').default,puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'../../../..'),out=__dirname;
const expected='dacf7dcc832a7d03eaa6869d52eb5c43a607ee9d6c71a6717335a153658230cc';
if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'STRUCHORD.html'))).digest('hex')!==expected)throw Error('Этот исторический аудит предназначен только для сборки 0.675 с указанным SHA-256');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,env:{...process.env,LD_LIBRARY_PATH:'/tmp/al2023/lib'}});const cases=[],errors=[];
try{const p=await b.newPage();await p.setViewport({width:1280,height:900});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');addTabInsert(sections[0].id)});await p.waitForSelector('.tab-at-host svg');await wait(350);
const n=(start,fret=3,dur=1,string=0)=>({start,string,fret,dur});
const snap=()=>p.evaluate(()=>({cursor:{...tabAtCursor},input:{...tabAtInput},beats:tabInsertEditorState.draft.beats,notes:structuredClone(tabInsertEditorState.draft.notes),history:tabInsertEditorState.history?.length||0,forward:tabInsertEditorState.forward?.length||0}));
async function setup(notes=[],cursor=0,beats=4){await p.evaluate(({notes,cursor,beats})=>{const e=tabInsertEditorState;e.draft.notes=notes;e.draft.beats=beats;e.history=[];e.forward=[];tabAtLastDigit=null;tabAtInput={dValue:4,dots:0,triplet:false};tabAtCursor={start:cursor,string:0};tabAtRender(e)},{notes,cursor,beats});await wait(180);await p.evaluate(cursor=>tabAtSetCursor(cursor,0),cursor);await p.$eval('.tab-at-host',e=>e.focus());}
async function key(k){await p.keyboard.press(k);await wait(70)}
async function combo(mod,k){await p.keyboard.down(mod);await key(k);await p.keyboard.up(mod)}
async function run(id,notes,cursor,actions,fn,beats=4){await setup(notes,cursor,beats);const before=await snap();await fn();const after=await snap();cases.push({id,actions,before,after});console.log(id,JSON.stringify(after));}
await run('digit.no-auto',[],0,['5','wait 850ms'],async()=>{await key('Digit5');await wait(850)});
await run('digit.double',[],0,['1','2','wait 850ms'],async()=>{await key('Digit1');await key('Digit2');await wait(850)});
await run('chord',[],0,['3','ArrowUp','5'],async()=>{await key('Digit3');await key('ArrowUp');await key('Digit5')});
for(const k of ['Equal','NumpadAdd','Minus','NumpadSubtract'])await run('duration.'+k,[n(0)],0,[k],()=>key(k));
await run('dot',[n(0)],0,['Period'],()=>key('Period'));
await run('triplet',[n(0)],0,['Slash'],()=>key('Slash'));
await run('rest',[n(0),n(0,5,1,1),n(1,7)],0,['KeyR'],()=>key('KeyR'));
await run('home',[n(0),n(2,5)],2,['Home'],()=>key('Home'),8);
await run('end',[n(0),n(2,5)],0,['End'],()=>key('End'),8);
await run('ctrl-home',[n(0),n(5,5)],5,['Ctrl+Home'],()=>combo('Control','Home'),8);
await run('ctrl-end',[n(0),n(5,5)],0,['Ctrl+End'],()=>combo('Control','End'),8);
await run('insert-beat',[n(0),n(1,5)],0,['Ctrl+Insert'],()=>combo('Control','Insert'));
await run('insert-bar',[n(0),n(1,5)],0,['Insert'],()=>key('Insert'));
await run('undo',[],0,['3','Ctrl+Z'],async()=>{await key('Digit3');await combo('Control','KeyZ')});
await run('redo-windows',[],0,['3','Ctrl+Z','Ctrl+Y'],async()=>{await key('Digit3');await combo('Control','KeyZ');await combo('Control','KeyY')});
await run('redo-shift-z',[],0,['3','Ctrl+Z','Ctrl+Shift+Z'],async()=>{await key('Digit3');await combo('Control','KeyZ');await p.keyboard.down('Control');await p.keyboard.down('Shift');await key('KeyZ');await p.keyboard.up('Shift');await p.keyboard.up('Control')});
await run('delete-note-from-chord',[n(0),n(0,5,1,1),n(1,7)],0,['Backspace'],()=>key('Backspace'));
await run('delete-beat-from-chord',[n(0),n(0,5,1,1),n(1,7)],0,['Shift+Delete'],()=>combo('Shift','Delete'));
await run('delete-last-note',[n(0),n(1,7)],0,['Backspace'],()=>key('Backspace'));
await run('mixed-left',[n(0,3,2),n(2,5,.5),n(2.5,7,.5)],2,['ArrowLeft'],()=>key('ArrowLeft'));
await run('bar-end',[n(3)],3,['ArrowRight'],()=>key('ArrowRight'));
const html=fs.readFileSync(path.join(root,'STRUCHORD.html'));fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify({date:'2026-10-22',version:'0.675',sha256:crypto.createHash('sha256').update(html).digest('hex'),viewport:{width:1280,height:900},method:'Chromium; fixture setup via model; all audited actions via real keyboard; Guitar Pro itself not launched; observations are not a GP pass count.',cases,errors},null,2)+'\n');if(errors.length)throw Error(errors.join('\n'));console.log('RECORDED',cases.length,'cases / JS errors',errors.length);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
