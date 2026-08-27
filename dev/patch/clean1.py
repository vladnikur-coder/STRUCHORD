#!/usr/bin/env python3
# Чистка-1 (2026-08-25): вырезание подтверждённого аудитом хлама + хука square.timeSig.
# Решения ask_user: accept_drop (транспон-формы — осознанно оставляем), remove_hook, cut_confirmed.
# Железные гварды: каждый якорь — точный count; после резки — имена должны исчезнуть полностью,
# а зависимости второго эшелона — остаться живыми.
import io, sys

PATH = '/home/user/STRUCHORD.html'

src = io.open(PATH, 'r', encoding='utf-8', errors='surrogateescape').read()
orig_len = len(src)

def cut(anchor, repl, expect=1, label=''):
    global src
    n = src.count(anchor)
    assert n == expect, f'ЯКОРЬ [{label}]: ожидали {expect}, нашли {n}'
    src = src.replace(anchor, repl)
    print(f'  ok  {label} (было {expect})')

print('== 1. CSS-каркас схемы (двойник внедрённого кода) ==')
css_block = """/* ------------------------------------------------------------
   Переключатель схемы (вставить рядом с toggleTheme в JS):

   const SCHEMES = ['forest','plum','sunset','dawn','raspberry','ocean','pea','bean','pepper','bed','cloud','storm','frost','heat','fog'];
   function applyScheme(id) {
     const root = document.documentElement;
     root.classList.add('theme-transition');
     if (id) root.setAttribute('data-scheme', id);
     else root.removeAttribute('data-scheme');  // без атрибута — исходная палитра приложения
     try { localStorage.setItem('struchord-scheme', id); } catch (e) {}
     setTimeout(() => root.classList.remove('theme-transition'), 400);
   }
   // и в раннем инлайн-скрипте в <head>, рядом с чтением struchord-theme:
   //   var sc = localStorage.getItem('struchord-scheme');
   //   if (sc) document.documentElement.setAttribute('data-scheme', sc);
   ------------------------------------------------------------ */




"""
cut(css_block, '', 1, 'css-scaffold')

print('== 2. getMetricBeatsPerBar (с её док-комментарием) ==')
metric = """// Количество ощущаемых метрических долей в такте — то, что музыкант
// реально считает "раз-два-три...". Для составных размеров (x/8, где x
// кратно 3 и x >= 6) это в 3 раза меньше числителя.
function getMetricBeatsPerBar(ts) {
  const { numerator, denominator } = parseTimeSig(ts);
  if (denominator === 8 && numerator >= 6 && numerator % 3 === 0) {
    return numerator / 3; // 6/8→2, 9/8→3, 12/8→4
  }
  return numerator;
}

"""
cut(metric, '', 1, 'getMetricBeatsPerBar')

print('== 3. clearPreferredFingering (замещена dropPreferredFingeringsAt) ==')
cpf = """function clearPreferredFingering(posKey, ev) {
  const target = ev || findEventByPosKey(posKey);
  if (target) {
    delete target.fingering;
    delete target.fingeringTuning;
  }
  if (posKey) preferredFingeringByChord.delete(posKey);
}

"""
cut(cpf, '', 1, 'clearPreferredFingering')

print('== 4. normalizeChordSpellingForKey ==')
nck = """function normalizeChordSpellingForKey(chordName, key) {
  if (!key) return chordName;

  const sharpKeys = [
    'G',
    'D',
    'A',
    'E',
    'B',
    'F#',
    'C#',
    'Em',
    'Bm',
    'F#m',
    'C#m',
    'G#m',
    'D#m',
    'A#m',
  ];

  const useSharps = sharpKeys.includes(key);

  if (useSharps) {
    return chordName
      .replace(/^Db/, 'C#')
      .replace(/^Eb/, 'D#')
      .replace(/^Gb/, 'F#')
      .replace(/^Ab/, 'G#')
      .replace(/^Bb/, 'A#')
      .replace(/\\/Db/, '/C#')
      .replace(/\\/Eb/, '/D#')
      .replace(/\\/Gb/, '/F#')
      .replace(/\\/Ab/, '/G#')
      .replace(/\\/Bb/, '/A#');
  }

  return normalizeChordSpelling(chordName);
}

"""
cut(nck, '', 1, 'normalizeChordSpellingForKey')

print('== 5. keyDisplayLabel ==')
kdl = """function keyDisplayLabel(k) {
  const opt = [...DOM.rootKey.options].find((o) => o.value === k);
  return opt ? opt.textContent.replace(/^[A-G][#b]?m?\\s*/, '') || k : k;
}

"""
cut(kdl, '', 1, 'keyDisplayLabel')

print('== 6. хук square.timeSig + чистка сигнатуры getEffectiveTimeSigForEvent ==')
hook_sig = """function getEffectiveTimeSigForEvent(event, square, section) {
  if (event && event.timeSig) return event.timeSig;
  if (square && square.timeSig) return square.timeSig; // пока не используется, но оставлено для расширения
  if (section && section.timeSig) return section.timeSig;
  return globalTimeSig;
}"""
hook_new = """function getEffectiveTimeSigForEvent(event, section) {
  if (event && event.timeSig) return event.timeSig;
  if (section && section.timeSig) return section.timeSig;
  return globalTimeSig;
}"""
cut(hook_sig, hook_new, 1, 'hook-square.timeSig')
cut('getEffectiveTimeSigForEvent(ev, sq, sec)', 'getEffectiveTimeSigForEvent(ev, sec)', 2, 'вызовы (ev, sq, sec) ×2')
cut('getEffectiveTimeSigForEvent(next.event, next.square, next.section)',
    'getEffectiveTimeSigForEvent(next.event, next.section)', 1, 'вызов (next.*)')

print('== 7. getBeatDurationForTimeSig (обёртка-гонка) ==')
gbd = """function getBeatDurationForTimeSig(bpm, ts) {
  return getGridUnitDurationSeconds(bpm, ts);
}
"""
cut(gbd, '', 1, 'getBeatDurationForTimeSig')

print('== 8. gcd ==')
gcdb = """function gcd(a, b) {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
"""
cut(gcdb, '', 1, 'gcd')

print('== 9. highlightActiveEvent (clearActiveHighlight НЕ трогаем) ==')
hae = """function highlightActiveEvent(sid, sqid, ei) {
  clearActiveHighlight();

  const w = document.querySelector(
    `.chord-wrapper[data-sec="${sid}"][data-square="${sqid}"][data-ei="${ei}"]`
  );

  if (w) {
    w.classList.add('playback-active');
    playbackState.activeElements.push(w);
    w.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const input = w.querySelector('.chord-input');
    if (input && input.value.trim()) {
      const chord = input.value.trim();
      showFingeringTooltip(chord, w, false);

      if (window._fingeringTimeout) {
        clearTimeout(window._fingeringTimeout);
        window._fingeringTimeout = null;
      }
    }
  }
}
"""
cut(hae, '', 1, 'highlightActiveEvent')

print('== 10. formatPatternPreview (с её строкой-комментарием) ==')
fpp = """// Компактный текстовый предпросмотр паттерна для бейджей.
function formatPatternPreview(pattern) {
  if (!pattern || !Array.isArray(pattern.steps)) return '♪';
  const symbols = pattern.steps.map((s) => {
    if (pattern.mode === 'pick') {
      const nums = normalizePickStep(s);
      return nums.length
        ? nums
            .slice()
            .sort((a, b) => pickStepSortValue(b) - pickStepSortValue(a))
            .map(pickTokenLabel)
            .join('+')
        : '·';
    }
    if (s === 'D') return '↓';
    if (s === 'U') return '↑';
    if (s === 'X') return '×';
    return '·';
  });
  return symbols.join(pattern.mode === 'pick' ? ' ' : '');
}

"""
cut(fpp, '', 1, 'formatPatternPreview')

print('== 11. закомментированный макет migrateV2toV3 ==')
mig = """    // Пример на будущее:
    // 2: function migrateV2toV3(song) { return { ...song, schemaVersion: 3, /* ... */ }; },
"""
cut(mig, '', 1, 'migrateV2toV3-макет')

print('== ГВАРДЫ ПОСЛЕ РЕЗКИ ==')
gone = ['clearPreferredFingering', 'formatPatternPreview', 'getMetricBeatsPerBar',
        'normalizeChordSpellingForKey', 'keyDisplayLabel', 'getBeatDurationForTimeSig',
        'highlightActiveEvent', 'migrateV2toV3', 'square.timeSig', 'getEffectiveTimeSigForEvent(event, square']
for name in gone:
    n = src.count(name)
    assert n == 0, f'ДОЛЖНО ИСЧЕЗНУТЬ [{name}]: осталось {n}'
    print(f'  исчезло: {name}')

# gcd и getEventDurationForTimeSig: gcd — короткое слово, проверяем как вызов/объявление
import re
assert not re.search(r'function gcd\(', src), 'gcd-объявление осталось'
assert not re.search(r'\bgcd\(', src), 'gcd-вызов остался?!'
print('  исчезло: gcd')

alive = ['function clearActiveHighlight', 'function showFingeringTooltip',
         'function normalizeChordSpelling(', 'function getGridUnitDurationSeconds',
         'function findEventByPosKey', 'function getEventSpanInParentUnits',
         'pickTokenLabel', 'pickStepSortValue', 'normalizePickStep',
         'getEffectiveTimeSigForEvent(event, section)',
         'getEffectiveTimeSigForEvent(ev, sec)',
         'getEffectiveTimeSigForEvent(next.event, next.section)']
for name in alive:
    n = src.count(name)
    assert n >= 1, f'НЕ ДОЛЖНО ПОСТРАДАТЬ [{name}]: {n}'
    print(f'  живо (×{n}): {name}')

io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
print(f'\nЗАПИСАНО. Было {orig_len} символов → стало {len(src)} (ушло {orig_len - len(src)}).')
