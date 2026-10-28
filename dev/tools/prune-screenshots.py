#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Чистка снимков проверок (правило R13).

Правило простое: снимок нужен, только если на него ссылается отчёт.
- отчёт своей папки (`dev/bench/results/<волна>/REPORT.md`) или соседний
  .md в той же папке — держит снимок этой папки;
- ссылка из README.md / ROADMAP.md / dev/specs — держит снимок с таким именем
  в любой папке.

Всё остальное — промежуточные кадры съёмки, которые никто не открывал.

Запуск:
    python3 dev/tools/prune-screenshots.py            # только показать
    python3 dev/tools/prune-screenshots.py --apply    # удалить (из git тоже)

Удалённое всегда можно вернуть из истории:
    git checkout <коммит> -- dev/bench/results/<папка>
"""
import glob
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS = 'dev/bench/results'
# Сокращения, которыми отчёты ссылаются на группу кадров.
# Внимание: счётчики вида «1/3», «360/3», «4/4» — это НЕ диапазон кадров.
# Диапазоном считается только запись, привязанная к имени кадра:
# «*.png», «A…G*.png», «05-bar-1440/1024/390» (в куске имени есть буква или дефис с числом).
RANGE = re.compile(r'\.\.\.png|\*\.png|…\*|[A-Za-z][\w.-]*\d/\d|[\w.-]+-\d+/\d')


def md_files():
    out = []
    for pat in ('README.md', 'ROADMAP.md', 'dev/**/*.md', 'docs/**/*.md'):
        out += glob.glob(os.path.join(ROOT, pat), recursive=True)
    return sorted(set(out))


def main():
    apply = '--apply' in sys.argv
    os.chdir(ROOT)

    # Текст отчётов: имена снимков ищутся подстрокой, потому что в таблицах
    # часто пишут «01-guitar-no-tracks» без «.png».
    local_text = {}
    global_text = ''
    for md in md_files():
        text = open(md, encoding='utf-8').read()
        folder = os.path.relpath(os.path.dirname(md), ROOT).replace(os.sep, '/')
        if folder.startswith(RESULTS + '/'):
            local_text[folder] = local_text.get(folder, '') + '\n' + text
        else:
            global_text += '\n' + text

    shots = sorted(glob.glob(os.path.join(RESULTS, '**', '*.png'), recursive=True))
    risky = set()
    keep, drop = [], []
    for path in shots:
        folder = os.path.relpath(os.path.dirname(path), ROOT).replace(os.sep, '/')
        name = os.path.basename(path)
        # Имя без расширения тоже считается ссылкой: в отчётах часто пишут
        # «01-guitar-no-tracks» в таблице, не добавляя «.png».
        base = name[:-4] if name.endswith('.png') else name
        context = local_text.get(folder, '') + global_text
        # Отчёт может ссылаться на кадры диапазоном: «A…G*.png», «05-bar-1440/1024/390».
        # Разбирать такие сокращения ненадёжно — такую папку не трогаем вовсе.
        if RANGE.search(local_text.get(folder, '')):
            risky.add(folder)
            keep.append(path)
            continue
        if name in context or base in context:
            keep.append(path)
        else:
            drop.append(path)

    mb = lambda files: sum(os.path.getsize(f) for f in files) / 1048576
    print('снимков всего: %d (%.1f МБ)' % (len(shots), mb(shots)))
    print('нужны отчётам: %d (%.1f МБ)' % (len(keep), mb(keep)))
    print('нигде не упомянуты: %d (%.1f МБ)' % (len(drop), mb(drop)))

    by_folder = {}
    for path in drop:
        by_folder.setdefault(os.path.dirname(path), []).append(os.path.basename(path))
    for folder in sorted(by_folder):
        print('  %-46s %2d шт' % (os.path.relpath(folder, ROOT), len(by_folder[folder])))
    for folder in sorted(risky):
        print('  пропущено (в отчёте диапазон кадров): %s' % os.path.relpath(folder, ROOT))

    if not apply:
        print('\nэто только показ. Чтобы удалить: --apply')
        return 0

    freed = mb(drop)
    subprocess.run(['git', 'rm', '-q', '--'] + drop, check=False)
    for path in drop:
        if os.path.exists(path):
            os.remove(path)
    print('\nудалено: %d файлов (%.1f МБ)' % (len(drop), freed))
    print('вернуть любой: git checkout <коммит> -- <папка>')
    return 0


if __name__ == '__main__':
    sys.exit(main())
