const fs = require('fs');
const html = fs.readFileSync('STRUCHORD.html', 'utf8');
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(html.includes("satInput.id='b39KeysSaturation'"), 'header saturation range remains');
assert(html.includes("sat.id='b39AutoSaturation'"), 'dialog saturation range remains');
assert(html.includes("T.setSaturation(a.track.id, Number(satInput.value))") || html.includes("T.setSaturation(a.track.id, Number(satInput.value))"), 'header still applies value');
assert(html.includes("T().setSaturation(dialogTrack,Number(saturationInput.value))"), 'dialog still saves value');
assert(!html.includes("el('span', 'b39-keys-sat-val'") && !html.includes("element('span','b39-auto-sat-val'"), 'numeric readout elements removed');
assert(!html.includes('satVal.textContent'), 'no script updates numeric readouts');
console.log('OK: оба ползунка сохранены, числовые readout отсутствуют');
