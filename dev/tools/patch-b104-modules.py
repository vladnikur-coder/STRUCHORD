#!/usr/bin/env python3
"""B-104 (0.776): вынести звук клавишных и аккомпанемент из HTML в модули.

Почему: с 0.764 один HTML-файл был требованием — его удобно скопировать одним
кликом. Сейчас есть git pull, и приоритет — удобство кода и производительность.
Два больших блока из 3-мегабайтного встроенного скрипта переезжают в отдельные
файлы:

  * STAGE3 (KEYS AUDIO)         -> keyboard-audio.js
  * STAGE5 (KEYS ACCOMPANIMENT) -> keyboard-accompaniment.js

Важно: блоки не просто выносятся, они ещё и СОБИРАЮТСЯ в отдельный файл, но
ЗАПУСКАЮТСЯ там же, где лежали. Файл регистрирует фабрику
`window.__b39Modules.<имя>`, а в HTML на прежнем месте остаётся её вызов.
Причина: порядок исполнения внутри того гигантского скрипта значим, и первая
попытка «просто вставить <script src> перед скриптом» сдвинула запуск на
4 тысячи строк раньше — аккомпанемент перестал открывать редактор рисунка
(тест b39-auto-variations-0767 это поймал).

Патч идемпотентен: если файлы уже вынесены, он ничего не делает.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HTML = ROOT / 'STRUCHORD.html'
SW = ROOT / 'sw.js'

BLOCKS = [
    ('3', 'audio', 'keyboard-audio.js', 'Звук клавишных дорожек'),
    ('5', 'accomp', 'keyboard-accompaniment.js', 'Клавишный аккомпанемент'),
]


def script_tag_start(html):
    """Начало тега <script>, внутри которого лежит вынесенный блок.

    Ориентир — маркер STAGE1: он остаётся во встроенном скрипте, поэтому по
    нему находим объемлющий тег и ставим <script src> ровно перед ним.
    """
    probe = html.find('// >>> B-39 STAGE1 BEGIN')
    if probe < 0:
        raise SystemExit('не найден маркер STAGE1 для поиска объемлющего скрипта')
    at = html.rfind('<script', 0, probe)
    if at < 0:
        raise SystemExit('не найден объемлющий <script>')
    end = html.find('>', at)
    if end < 0 or 'src=' in html[at:end]:
        raise SystemExit('объемлющий тег неожиданно внешний')
    return at


def block_region(html, stage):
    """Регион с маркерами BEGIN/END включительно."""
    begin = '// >>> B-39 STAGE%s BEGIN' % stage
    end = '// <<< B-39 STAGE%s END' % stage
    a = html.find(begin)
    if a < 0:
        return None
    b = html.find(end, a)
    if b < 0:
        raise SystemExit('нет конца блока STAGE%s' % stage)
    b = html.find('\n', b)
    b = len(html) if b < 0 else b + 1
    return a, b


def main():
    html = HTML.read_text(encoding='utf-8')
    anchor = script_tag_start(html)
    report = []
    for stage, key, name, title in BLOCKS:
        region = block_region(html, stage)
        if region is None:
            if not (ROOT / name).exists():
                raise SystemExit('не найден блок STAGE%s и нет файла %s' % (stage, name))
            report.append('%s: уже вынесен' % name)
            continue
        a, b = region
        body = html[a:b].rstrip('\n')
        header = (
            '// STRUCHORD · %s\n'
            '// Вынесено из STRUCHORD.html (0.776). Блок по-прежнему исполняется\n'
            '// в прежнем месте встроенного скрипта: файл только регистрирует\n'
            '// фабрику window.__b39Modules.%s, а HTML вызывает её там, где блок\n'
            '// лежал раньше. Порядок запуска поэтому не меняется.\n'
            '\n'
            '(function () {\n'
            '  var HOST = window;\n'
            '  HOST.__b39Modules = HOST.__b39Modules || {};\n'
            '  HOST.__b39Modules.%s = function () {\n' % (title, key, key)
        )
        footer = '\n  };\n})();\n'
        indented = '\n'.join(('  ' + ln) if ln.strip() else ln for ln in body.split('\n'))
        (ROOT / name).write_text(header + indented + footer, encoding='utf-8')
        html = html[:a] + 'window.__b39Modules.%s();\n' % key + html[b:]
        report.append('%s: %d байт' % (name, len(body) + len(header) + len(footer)))

    tags = ''.join('<script src="./%s"></script>\n' % name for _, _, name, _ in BLOCKS)
    if './keyboard-audio.js' not in html:
        html = html[:anchor] + tags + html[anchor:]
    HTML.write_text(html, encoding='utf-8')

    sw = SW.read_text(encoding='utf-8')
    shell = re.search(r"const APP_SHELL = \[(.*?)\];", sw, re.S)
    if not shell:
        raise SystemExit('в sw.js нет APP_SHELL')
    items = [s.strip() for s in shell.group(1).split(',') if s.strip()]
    for _, _, name, _ in BLOCKS:
        entry = "'./%s'" % name
        if entry not in items:
            items.insert(1, entry)
    SW.write_text(sw[:shell.start(1)] + ', '.join(items) + sw[shell.end(1):], encoding='utf-8')

    print('\n'.join(report))
    print('HTML: %d байт' % len(html.encode('utf-8')))


if __name__ == '__main__':
    sys.exit(main())
