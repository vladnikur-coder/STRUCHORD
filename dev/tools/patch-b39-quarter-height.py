#!/usr/bin/env python3
"""B-39: клавиатура вместе с плеером занимает максимум четверть окна, поверх 0.725."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise SystemExit(f'Патч не применён: {n} совпадений: {a[:110]!r}')
 s=s.replace(a,b,1)
rep('''  max-height: max(3rem, min(60vh, calc(100vh - var(--b39-keys-stack, 0px) - 4rem)));''','''  max-height: max(0px, calc(25vh - var(--b39-keys-stack, 0px) - .9rem));''')
rep('''  box-shadow: var(--shadow-card); padding: .5rem .65rem; scroll-margin-top: 8rem; }''','''  box-shadow: var(--shadow-card); padding: .2rem .65rem; scroll-margin-top: 8rem; }''')
rep('''.b39-keys-head { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-bottom: .35rem; }''','''.b39-keys-head { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-bottom: .1rem; }''')
rep('''.b39-keys-close, .b39-keys-settings-toggle { flex:0 0 auto; min-width:2.2rem; min-height:2.2rem; border-radius:.5rem;''','''.b39-keys-close, .b39-keys-settings-toggle { flex:0 0 auto; min-width:1.7rem; min-height:1.7rem; border-radius:.5rem;''')
rep('''.b39-keys-nav button { min-width: 2.2rem; min-height: 2.2rem; border-radius: .5rem;''','''.b39-keys-nav button { min-width: 1.7rem; min-height: 1.7rem; border-radius: .5rem;''')
rep('''.b39-keys-foot { margin: .2rem 0 0; font-size: .7rem; line-height: 1.35;''','''.b39-keys-foot { margin: .05rem 0 0; font-size: .7rem; line-height: 1.2;''')
rep('''  var timbreSel = null;
  var booted = false, wrapped = false;''','''  var timbreSel = null;
  var keyboardWhiteHeight = 40, keyboardFingers = false;
  var booted = false, wrapped = false;''')
rep('''    var value = stack + 'px';
    if (panel.style.getPropertyValue('--b39-keys-stack') !== value) panel.style.setProperty('--b39-keys-stack', value);
  }
  function openPanel()''','''    var value = stack + 'px';
    if (panel.style.getPropertyValue('--b39-keys-stack') !== value) panel.style.setProperty('--b39-keys-stack', value);
    // Вычисляется только при изменении размеров/настроек, не при pointermove
    // и не на каждом событии проигрывания. Высота клавиш подстраивается под
    // оставшееся место, ширина остаётся прежней и прокручивается отдельно.
    if (!panel.hidden) {
      var rem = parseFloat(HOST.getComputedStyle(doc.documentElement).fontSize) || 16;
      var head = panel.querySelector('.b39-keys-head');
      var headHeight = head ? head.offsetHeight : rem * 1.7;
      var fingers = showFingersEnabled();
      var panelBudget = (HOST.innerHeight || 900) * .25 - stack - rem * .9;
      // Отступы, нижняя подпись и границы с небольшим запасом на округление.
      var free = panelBudget - headHeight - rem * 1.8;
      var h = Math.max(20, Math.min(78, Math.floor(free * 16 / rem - 20 - (fingers ? 16 : 0))));
      if (h !== keyboardWhiteHeight || fingers !== keyboardFingers) {
        keyboardWhiteHeight = h; keyboardFingers = fingers; renderPanel();
      }
    }
  }
  function openPanel()''')
rep('''    var whiteW = 20;
    var res = keyboardSVG(range.low, range.high, notes, {
      whiteW: whiteW, whiteH: 78, showFingers: showFingersEnabled(),''','''    var whiteW = 20;
    var fingersVisible = showFingersEnabled();
    if (fingersVisible !== keyboardFingers) { keyboardFingers = fingersVisible; syncStickyOffset(); }
    var res = keyboardSVG(range.low, range.high, notes, {
      whiteW: whiteW, whiteH: keyboardWhiteHeight, showFingers: fingersVisible,''')
rep('''      var layout = keyLayout(range.low, range.high, whiteW, 78);''','''      var layout = keyLayout(range.low, range.high, whiteW, keyboardWhiteHeight);''')
rep('.b39-keys-foot { margin: .05rem 0 0; font-size: .7rem; line-height: 1.2;\n  color: var(--color-text-secondary, #666); }','.b39-keys-foot { margin: 0; font-size: .7rem; line-height: 1.2; max-width:45%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n  color: var(--color-text-secondary, #666); }')
rep("    foot = el('div', 'b39-keys-foot', '');","    foot = el('div', 'b39-keys-foot', ''); head.insertBefore(foot, nav);")
rep('    panel.appendChild(head);panel.appendChild(body);panel.appendChild(foot);panel.appendChild(settings);','    panel.appendChild(head);panel.appendChild(body);panel.appendChild(settings);')
rep('      // Отступы, нижняя подпись и границы с небольшим запасом на округление.\n      var free = panelBudget - headHeight - rem * 1.8;\n      var h = Math.max(20, Math.min(78, Math.floor(free * 16 / rem - 20 - (fingers ? 16 : 0))));','      // Заголовок, отступы и границы с запасом на округление.\n      var free = panelBudget - headHeight - rem * .75;\n      var h = Math.max(14, Math.min(78, Math.floor(free * 16 / rem - 16 - (fingers ? 16 : 0))));')
rep('      rootPc: f ? f.rootPc : undefined, labelSpace: 20\n    });\n    titleEl.textContent = chord;','      rootPc: f ? f.rootPc : undefined, labelSpace: 16\n    });\n    titleEl.textContent = chord;')
rep('.b39-keys-head { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-bottom: .1rem; }','.b39-keys-head { position:sticky; top:0; z-index:1; background:var(--color-surface, #fff); display:flex; align-items:center; gap:.3rem; flex-wrap:wrap; margin-bottom:.1rem; }')
rep('      stackObserver.observe(transport);\n      var pinnedRow','      stackObserver.observe(transport); stackObserver.observe(head);\n      var pinnedRow')
rep('.b39-keys-panel { box-sizing: border-box;','body.b39-keys-open .transport-bar { padding-top:.2rem; padding-bottom:.2rem; }\n.b39-keys-panel { box-sizing: border-box;')
rep('.b39-keys-head { position:sticky; top:0; z-index:1; background:var(--color-surface, #fff); display:flex;','.b39-keys-head { display:flex;')
rep('var h = Math.max(14, Math.min(78,','var h = Math.max(12, Math.min(78,')
rep("    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel(); syncStickyOffset();","    doc.body.classList.add('b39-keys-open'); panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel(); syncStickyOffset();")
rep("    panel.hidden = true; btn.setAttribute('aria-pressed', 'false');","    panel.hidden = true; doc.body.classList.remove('b39-keys-open'); btn.setAttribute('aria-pressed', 'false');")
rep('var height = whiteH + labelSpace + (o.showFingers ? 16 : 0);','var height = whiteH + labelSpace + (o.showFingers && o.showFingerWarning !== false ? 16 : 0);')
rep('    if (o.showFingers) {\n      parts.push(\'<text x="2" y="\' + (whiteH + labelSpace + 11)','    if (o.showFingers && o.showFingerWarning !== false) {\n      parts.push(\'<text x="2" y="\' + (whiteH + labelSpace + 11)')
rep('Math.floor(free * 16 / rem - 16 - (fingers ? 16 : 0))','Math.floor(free * 16 / rem - 16)')
rep('      rootPc: f ? f.rootPc : undefined, labelSpace: 16\n    });\n    titleEl.textContent = chord;','      rootPc: f ? f.rootPc : undefined, labelSpace: 16, showFingerWarning: false\n    });\n    titleEl.textContent = chord;')
rep('max-height: max(0px, calc(25vh - var(--b39-keys-stack, 0px) - .9rem));','max-height: max(0px, calc(25vh - var(--b39-keys-bar-height, 0px) - .9rem));')
rep("    var value = stack + 'px';\n    if (panel.style.getPropertyValue('--b39-keys-stack') !== value)","    var barHeight = bar.offsetHeight + 'px';\n    if (panel.style.getPropertyValue('--b39-keys-bar-height') !== barHeight) panel.style.setProperty('--b39-keys-bar-height', barHeight);\n    var value = stack + 'px';\n    if (panel.style.getPropertyValue('--b39-keys-stack') !== value)")
rep('var panelBudget = (HOST.innerHeight || 900) * .25 - stack - rem * .9;','var panelBudget = (HOST.innerHeight || 900) * .25 - bar.offsetHeight - rem * .9;')
rep('parts.push(\'<circle cx="\' + cx + \'" cy="\' + (whiteH - 10) + \'" r="3.2" fill="#fff" opacity="0.9"/>\');','parts.push(\'<circle cx="\' + cx + \'" cy="\' + (whiteH < 20 ? 2 : whiteH - 10) + \'" r="\' + (whiteH < 20 ? 1.5 : 3.2) + \'" fill="#fff" opacity="0.9"/>\');')
rep('          \'text-anchor="middle" fill="\' + text + \'">\' + f + \'</text>\');','          \'text-anchor="middle" fill="var(--color-surface, #fff)">\' + f + \'</text>\');')
rep("    if (bass !== null) footParts.push('бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp'));\n    if (body.scrollWidth > body.clientWidth) footParts.push('↔ прокрутка клавиш');\n    if (showFingersEnabled()) footParts.push('цифры условны, это не аппликатура');","    if (showFingersEnabled()) footParts.push('цифры условны, это не аппликатура');\n    if (bass !== null) footParts.push('бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp'));\n    if (body.scrollWidth > body.clientWidth) footParts.push('↔ прокрутка клавиш');")
p.write_text(s,encoding='utf-8');print('Ограничение общей высоты применено')
