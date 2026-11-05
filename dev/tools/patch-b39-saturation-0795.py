#!/usr/bin/env python3
"""B-39, этап 2 итерации 0.795 (бэклог №22): ползунок «Насыщенность» 0–100.

Новое поле дорожки track.saturation (0–100, у старых песен absent = прежнее
поведение). Управляет: preferDoubling в генераторе notes-v1 (октавные удвоения
корня/квинты — формы как в uploads/акк.mov), плотностью по роли (масштаб ROLE)
и акцентом 13/9 в конце такта (endAccentEnabled). UI-ползунок — в диалоге
автоаккомпанемента. R8 final=yes 2026-11-05, спек dev/specs/b39-saturation-anchor-0795.md.
"""
import sys

HTML = "STRUCHORD.html"
ACC = "keyboard-accompaniment.js"

HTML_ANCHORS = [
    # 1. Новая дорожка получает насыщенность по умолчанию.
    (
        "...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false, voicingsVersion:2} : {}),   // 0.793: endAccent выкл у новых; 0.794: voicingsVersion=2 — новый порядок вариантов",
        "...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false, voicingsVersion:2, saturation:50} : {}),   // 0.795 (№22): насыщенность по умолчанию; 0.793: endAccent выкл у новых; 0.794: voicingsVersion=2 — новый порядок вариантов",
    ),
    # 2. API setSaturation рядом с setEndAccent.
    (
        """  function setEndAccent(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if((t.endAccent!==false)===on)return true;
    return dispatch('b39/end-accent',function(){if(on)delete t.endAccent;else t.endAccent=false;return true;});
  }""",
        """  function setEndAccent(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if((t.endAccent!==false)===on)return true;
    return dispatch('b39/end-accent',function(){if(on)delete t.endAccent;else t.endAccent=false;return true;});
  }
  // 0.795 (№22): ползунок «Насыщенность» 0–100. absent у старых песен — прежнее поведение.
  function setSaturation(id, value) {
    var t=findTrack(id); if(!t || t.instrument!=='keys')return false;
    var n=Number(value);
    if(!Number.isInteger(n) || n<0 || n>100)return false;
    if(t.saturation===n)return true;
    return dispatch('b39/saturation',function(){t.saturation=n;return true;});
  }""",
    ),
    # 3. Экспорт API.
    (
        "    setLinkedVoicings:setLinkedVoicings, setEndAccent:setEndAccent, clearVoicingChoice:clearVoicingChoice,",
        "    setLinkedVoicings:setLinkedVoicings, setEndAccent:setEndAccent, setSaturation:setSaturation, clearVoicingChoice:clearVoicingChoice,",
    ),
    # 4. prepare() передаёт насыщенность в генератор.
    (
        "rhythmVersion:overrideRhythmVersion===2 || (overrideRhythmVersion==null && track.patterns['s:'+sec.id] && track.patterns['s:'+sec.id].rhythmVersion===2)?2:1,seed:seed|0});",
        "rhythmVersion:overrideRhythmVersion===2 || (overrideRhythmVersion==null && track.patterns['s:'+sec.id] && track.patterns['s:'+sec.id].rhythmVersion===2)?2:1,seed:seed|0,saturation:Number.isInteger(track.saturation)?track.saturation:null});   // 0.795 (№22)",
    ),
    # 5. bridge.prepareSection -> buildSection.
    (
        "const result=buildSection({cells,low:range.low,high:range.high,bpm:o.bpm,meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:o.seed});",
        "const result=buildSection({cells,low:range.low,high:range.high,bpm:o.bpm,meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:o.seed,saturation:Number.isInteger(o.saturation)?o.saturation:null});   // 0.795 (№22)",
    ),
    # 6. buildSection -> generatePerformance.
    (
        "const gen=generatePerformance({chords,low:o.low,high:o.high,bpm:o.bpm,meter:o.meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:(o.seed+i)|0});",
        "const gen=generatePerformance({chords,low:o.low,high:o.high,bpm:o.bpm,meter:o.meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:(o.seed+i)|0,saturation:Number.isInteger(o.saturation)?o.saturation:null});   // 0.795 (№22)",
    ),
    # 7. generatePerformance: насыщенность в planSequence и масштаб плотности по роли.
    (
        "  const {chords, low, high, bpm, meter, genre, secondary, role, swing, sectionSwing, seed} = o;",
        "  const {chords, low, high, bpm, meter, genre, secondary, role, swing, sectionSwing, seed, saturation} = o;   // 0.795 (№22)",
    ),
    (
        "  const planned=planSequence({chords,low,high,bpm,role});",
        "  const planned=planSequence({chords,low,high,bpm,role,saturation});   // 0.795 (№22)",
    ),
    (
        "      const strength = ROLE[role], strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);",
        "      const satN = Number.isInteger(saturation) ? saturation : null;   // 0.795 (№22): ползунок насыщенности масштабирует плотность роли\n      const strength = ROLE[role]*(satN===null?1:0.75+satN/250), strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);",
    ),
    # 8. planSequence: preferDoubling управляется насыщенностью.
    (
        "function planSequence({chords,low,high,bpm,role}) {",
        "function planSequence({chords,low,high,bpm,role,saturation}) {   // 0.795 (№22)",
    ),
    (
        "    const preferDoubling=role==='chorus' && chord.beats>=2 && bpm<=140;",
        "    // 0.795 (№22): удвоение корня/квинты — по ползунку насыщенности; absent — прежнее правило припева.\n    const satN=Number.isInteger(saturation)?saturation:null;\n    const preferDoubling=chord.beats>=2 && bpm<=140 && (satN===null ? role==='chorus' : satN>=60);",
    ),
    # 9. Диалог авто: ползунок «Насыщенность» после swing.
    (
        "swingRow.appendChild(element('span','','Swing'));box.appendChild(swingRow);",
        """    swingRow.appendChild(element('span','','Swing'));box.appendChild(swingRow);
    var satRow=element('label','tools-label b39-auto-select'), sat=element('input');sat.type='range';sat.id='b39AutoSaturation';sat.min='0';sat.max='100';sat.step='1';sat.value=String(Number.isInteger(track.saturation)?track.saturation:50);sat.setAttribute('aria-label','Насыщенность');   // 0.795 (№22)
    var satVal=element('span','b39-auto-sat-val',sat.value);sat.addEventListener('input',function(){satVal.textContent=sat.value;});
    satRow.appendChild(element('span','','Насыщенность'));satRow.appendChild(sat);satRow.appendChild(satVal);box.appendChild(satRow);saturationInput=sat;""",
    ),
    # 10. Переменная ползунка в области диалога.
    (
        "  var doc=HOST.document, box=null, primary=null, secondary=null, planBox=null, dialogTrack=null;",
        "  var doc=HOST.document, box=null, primary=null, secondary=null, planBox=null, dialogTrack=null, saturationInput=null;   // 0.795 (№22)",
    ),
    (
        "    var old=autoOverlay; autoOverlay=null; box=null;primary=null;secondary=null;planBox=null;",
        "    var old=autoOverlay; autoOverlay=null; box=null;primary=null;secondary=null;planBox=null;saturationInput=null;   // 0.795 (№22)",
    ),
    # 11. Применение: сохраняем насыщенность на дорожке.
    (
        "        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);T().setEndAccent(dialogTrack,acc.checked);",
        "        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);T().setEndAccent(dialogTrack,acc.checked);T().setSaturation(dialogTrack,Number(saturationInput.value));   // 0.795 (№22)",
    ),
]

ACC_ANCHORS = [
    # endAccentEnabled: насыщенность >= 80 включает акцент 13/9.
    (
        """    function endAccentEnabled(o) {
      var T = HOST.StruChordTracks, t = T && typeof T.track === 'function' && o && o.trackId ? T.track(o.trackId) : null;
      return !t || t.endAccent !== false;
    }""",
        """    function endAccentEnabled(o) {
      var T = HOST.StruChordTracks, t = T && typeof T.track === 'function' && o && o.trackId ? T.track(o.trackId) : null;
      if (t && Number.isInteger(t.saturation)) return t.saturation >= 80;   // 0.795 (№22): акцент 13/9 от ползунка насыщенности
      return !t || t.endAccent !== false;
    }""",
    ),
]


def apply(path, anchors):
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
    for i, (old, new) in enumerate(anchors, 1):
        n = s.count(old)
        if n != 1:
            print(f"ПАТЧ НЕ ПРИМЕНЁН: {path} якорь {i} найден {n} раз (ожидался 1)")
            sys.exit(1)
        s = s.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK {path}: якорей {len(anchors)}")


def main():
    apply(HTML, HTML_ANCHORS)
    apply(ACC, ACC_ANCHORS)


if __name__ == "__main__":
    main()
