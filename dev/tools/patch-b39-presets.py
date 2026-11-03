#!/usr/bin/env python3
"""B-39: исправление пресетов клавишного аккомпанемента поверх 0.711."""
from pathlib import Path
p = Path('STRUCHORD.html'); text = p.read_text(encoding='utf-8')
a = text.index('// >>> B-39 STAGE5 BEGIN'); b = text.index('// <<< B-39 STAGE5 END', a)
s = text[a:b]
def replace(old, new):
    global s
    count = s.count(old)
    if count != 1: raise SystemExit(f'ПАТЧ НЕ ПРИМЕНЁН: {count} совпадений: {old[:140]!r}')
    s = s.replace(old, new, 1)
replace("hint: 'бас на 1 и 3, аккорд на 2 и 4'", "hint: 'бас и аккорд через долю'")
replace("hint: 'бас — аккорд — аккорд'", "hint: 'бас — аккорд — аккорд; обычно для размера 3/4'")
replace("hint: 'корень через октаву + аккорд'", "hint: 'бас через октаву и аккорд по очереди'")
replace("var out = [], alberti = [['H', 't1'], 't5', 't3', 't5'], i, beat;", "var out = [], alberti = ['t1', 't5', 't3', 't5'], i, beat;")
replace("    var C = tokenContext(o, notes);\n    var arp = 0, out = [];", """    var C = tokenContext(o, notes);
    // Номер звука арпеджио принадлежит всему рисунку секции, а не отдельной
    // ячейке. Считаем только шаги A (в том числе в сочетаниях) до её начала.
    // Свой рисунок ячейки начинается с нуля, как и раньше. Массив base
    // ограничен 64 элементами; циклы считаем арифметически, без длинного цикла.
    function arpCount(token) {
      return (Array.isArray(token) ? token : [token]).filter(function (v) { return v === 'A'; }).length;
    }
    var perCycle = base.reduce(function (sum, token) { return sum + arpCount(token); }, 0);
    var arp = own ? 0 : Math.floor(baseNode / base.length) * perCycle;
    if (!own) for (var j = 0; j < startStep; j++) arp += arpCount(base[j]);
    var out = [];""")
replace("      buildSteps(p.id, p.subdivision, numerator(current.ts)).slice(0,8).forEach(function (token) { preview.appendChild(el('span', 'strum-step', glyph(token))); });\n", "")
# Единые обозначения в миниатюрах и на редактируемых шагах. Миниатюра
# пересчитывается для текущего размера/длины ячейки при каждом открытии.
replace("    presetButtons.forEach(function (b) { var selected = b.getAttribute('data-preset') === draft.type && !draft.steps; b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected); });", """    presetButtons.forEach(function (b) {
      var id = b.getAttribute('data-preset'), p = preset(id), selected = id === draft.type && !draft.steps;
      b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected);
      var preview = b.querySelector('.strum-preview');
      if (preview && p) {
        preview.textContent = '';
        buildSteps(p.id, p.subdivision, scopeUnits()).slice(0, 8).forEach(function (token) {
          preview.appendChild(el('span', 'strum-step', token === null ? '·' : stepGlyph(token)));
        });
      }
    });""")
p.write_text(text[:a] + s + text[b:], encoding='utf-8')
print('Патч применён')
