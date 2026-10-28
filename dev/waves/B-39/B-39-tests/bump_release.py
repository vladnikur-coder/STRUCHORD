#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-39 STAGE6 · R7 + R6: поднять версию, кэш sw.js и строка реестра.

Рабочая версия STRUCHORD.html ушла вперёд от справочного снимка 0.691,
поэтому НИКАКОЙ номер версии не зашит в .patch: скрипт читает текущий
номер из самого файла и поднимает его на единицу. sw.js лежит отдельным
файлом и в HTML-патч не входит — поэтому он тоже обрабатывается здесь.

Использование:

    python3 B-39-tests/bump_release.py STRUCHORD.html [sw.js] [ROADMAP.md] \
        [--dry-run] [--wave "B-39 · Режим «Клавиши»"]

  * STRUCHORD.html — обязательно: ищется `<span id="devPanelTrigger">· ver 0.NNN`.
  * sw.js — необязательно: ищется `CACHE_NAME = 'struchord-vNNN'`.
  * ROADMAP.md — необязательно: готовая строка вставляется сразу под шапкой
    «Реестр релизов и сборок (Registry)», если файл передан.
  * --dry-run — ничего не писать, только показать, что получится.

Всегда создаёт резервные копии *.bak-<время> рядом с изменяемыми файлами.
"""
from pathlib import Path
import sys, re, hashlib, datetime, argparse

VERSION_RE = re.compile(r'(id="devPanelTrigger"[^>]*>\s*·\s*ver\s*)(\d+(?:\.\d+)*)')
CACHE_RE = re.compile(r'(CACHE_NAME\s*=\s*)([\'"])([^\'"]+)([\'"])')
REGISTRY_HEADER = '| Волна | Версия | Дата | SHA-256 (STRUCHORD.html) | Размер (байт) | SW Cache |'


def bump_version(text):
    m = VERSION_RE.search(text)
    if not m:
        raise SystemExit('❌ Не нашёл видимую версию: <span id="devPanelTrigger">· ver 0.NNN</span>')
    old = m.group(2)
    parts = old.split('.')
    parts[-1] = str(int(parts[-1]) + 1)
    new = '.'.join(parts)
    patch = int(parts[-1])
    return text[:m.start(2)] + new + text[m.end(2):], old, new, patch


def bump_cache(text, patch):
    m = CACHE_RE.search(text)
    if not m:
        return text, None, None, 'CACHE_NAME не найден — поправь sw.js вручную'
    old = m.group(3)
    mm = re.match(r'^(.*-v)(\d+)$', old)
    if mm:
        # Проект ведёт кэш как struchord-v<номер патча> — см. реестр релизов.
        new = mm.group(1) + str(patch)
    else:
        # Неизвестная схема: хотя бы нарастим хвост, чтобы кэш обновился.
        tail = re.search(r'(\d+)$', old)
        new = (old[:tail.start()] + str(int(tail.group(1)) + 1)) if tail else (old + '-v' + str(patch))
    return text[:m.start(3)] + new + text[m.end(3):], old, new, ''


def backup(path, data):
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    bak = path.with_name(path.name + '.bak-' + stamp)
    bak.write_bytes(data)
    return bak


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('html')
    ap.add_argument('sw', nargs='?', default=None)
    ap.add_argument('roadmap', nargs='?', default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--wave', default='B-39 · Режим «Клавиши» (волна не закрыта)')
    args = ap.parse_args()

    html = Path(args.html)
    if not html.is_file():
        raise SystemExit('❌ Нет файла: ' + str(html))
    raw = html.read_bytes()
    text = raw.decode('utf-8')
    bumped, old_v, new_v, patch = bump_version(text)
    new_raw = bumped.encode('utf-8')
    digest = hashlib.sha256(new_raw).hexdigest()
    size = len(new_raw)
    cache = 'struchord-v' + str(patch)
    cache_note = ''

    print('Версия:      %s -> %s' % (old_v, new_v))
    print('sha256 HTML: %s' % digest)
    print('Размер:      %s байт' % format(size, ','))
    print('Кэш sw.js:   %s' % cache)

    sw_path = Path(args.sw) if args.sw else None
    if sw_path and sw_path.is_file():
        sw_raw = sw_path.read_bytes()
        sw_bumped, old_c, new_c, note = bump_cache(sw_raw.decode('utf-8'), patch)
        cache = new_c or cache
        cache_note = note
        print('CACHE_NAME:  %s -> %s' % (old_c, new_c))
        if note:
            print('⚠️  ' + note)
        if not args.dry_run:
            backup(sw_path, sw_raw)
            sw_path.write_bytes(sw_bumped.encode('utf-8'))
            print('✅ sw.js обновлён')
    else:
        print('⚠️  sw.js не передан или не найден. ОБЯЗАТЕЛЬНО выложить HTML и sw.js ПАРОЙ:')
        print("    в sw.js замени CACHE_NAME на '%s'." % cache)

    row = ('| **%s** | %s | %s | `%s` | %s | `%s` |' %
           (args.wave, new_v, datetime.date.today().isoformat(), digest, size, cache))
    print('\nСтрока для реестра релизов ROADMAP.md (R6):\n' + row)

    if not args.dry_run:
        backup(html, raw)
        html.write_bytes(new_raw)
        print('\n✅ STRUCHORD.html обновлён (видимая версия %s)' % new_v)

    rm_path = Path(args.roadmap) if args.roadmap else None
    if rm_path and rm_path.is_file():
        rm_raw = rm_path.read_bytes()
        rm_text = rm_raw.decode('utf-8')
        if REGISTRY_HEADER in rm_text and row not in rm_text:
            idx = rm_text.index(REGISTRY_HEADER)
            line_end = rm_text.index('\n', idx) + 1
            sep_end = rm_text.index('\n', line_end) + 1  # строка |---|---|...
            rm_text = rm_text[:sep_end] + row + '\n' + rm_text[sep_end:]
            if not args.dry_run:
                backup(rm_path, rm_raw)
                rm_path.write_bytes(rm_text.encode('utf-8'))
                print('✅ строка добавлена в ROADMAP.md')
            else:
                print('(dry-run: в ROADMAP.md не записано)')
        else:
            print('⚠️  Шапка реестра не найдена или строка уже есть — вставь строку вручную.')
    elif args.roadmap:
        print('⚠️  ROADMAP.md не найден — вставь строку вручную.')

    if args.dry_run:
        print('\n(dry-run: файлы не изменены)')
    if cache_note:
        print('⚠️  ' + cache_note)


if __name__ == '__main__':
    main()
