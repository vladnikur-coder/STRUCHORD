'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(process.env.STRUCHORD_HTML||'STRUCHORD.html','utf8'),assetPath=path.resolve(process.env.STRUCHORD_SOUNDS||'keyboard-sounds.js'),manifest=require('../assets/keyboard/manifest.json');
assert(!html.includes('window.__b39SampleData='),'sample audio is not embedded in HTML');
assert(html.includes('<script src="./keyboard-sounds.js"></script>'),'HTML loads the separate sound file');
assert(html.includes('window.StruChordSampleCredits='),'licences stay available in app settings');
const asset=fs.readFileSync(assetPath,'utf8'),start=asset.indexOf('window.__b39SampleData=');assert(start>=0);const from=start+'window.__b39SampleData='.length,end=asset.indexOf(';\n',from);assert(end>from);const data=JSON.parse(asset.slice(from,end));let count=0,bytes=0;
for(const [bank,items] of Object.entries(manifest.banks))for(const x of items){const mode=bank==='piano'?'acoustic':bank,encoded=data[mode].find(y=>y.midi===x.midi);assert(encoded,mode+':'+x.midi);let b=Buffer.from(encoded.data,'base64');assert.equal(crypto.createHash('sha256').update(b).digest('hex'),x.sha256);assert.equal(b.length,x.bytes);if(bank==='rhodes'){assert.equal(encoded.loopStart,x.loopStart);assert.equal(encoded.loopEnd,x.loopEnd);}count++;bytes+=b.length}
assert.equal(Object.keys(data).length,4,'four banks');assert(bytes>7_000_000,'the sound file really contains the samples');
console.log(`Separate sound file: ${count} exact source hashes, ${(fs.statSync(assetPath).size/1048576).toFixed(2)} MB, HTML ${(Buffer.byteLength(html)/1048576).toFixed(2)} MB — OK`);
