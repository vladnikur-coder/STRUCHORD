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


def md_files():
    out = []
    for pat in ('README.md', 'ROADMAP.md', 'dev/**/*.md', 'docs/**/*.md'):
        out += glob.glob(os.path.join(ROOT, pat), recursive=True)
    return sorted(set(out))


def main():
    apply = '--apply' in sys.argv
    os.chdir(ROOT)

    # (папка, имя файла) -> держится ли отчётом этой папки
    local_refs = {}
    global_refs = set()
    for md in md_files():
        text = open(md, encoding='utf-8').read()
        names = set(re.findall(r'([\w\-.0-9]+\.png)', text))
        folder = os.path.relpath(os.path.dirname(md), ROOT).replace(os.sep, '/')
        if folder.startswith(RESULTS + '/'):
            local_refs.setdefault(folder, set()).update(names)
        else:
            global_refs.update(names)

    shots = sorted(glob.glob(os.path.join(RESULTS, '**', '*.png'), recursive=True))
    keep, drop = [], []
    for path in shots:
        folder = os.path.relpath(os.path.dirname(path), ROOT).replace(os.sep, '/')
        name = os.path.basename(path)
        if name in local_refs.get(folder, set()) or name in global_refs:
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
