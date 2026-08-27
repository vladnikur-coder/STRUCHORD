#!/usr/bin/env python3
"""Вырезает из html посторонние <script>-вставки прокси (Cloudflare и т.п.).

История: файл, хоть раз прошедший через прокси Cloudflare (скачан по
ссылке, открыт через туннель, сохранён из браузера), получает от прокси
свой загрузчик перед </body>. В офлайн-приложении он лишний: на file://
и на localhost:5500 его цель не существует, и консоль засоряется
ошибками при каждой перезагрузке.

Ищет именно ТЕГИ <script> целиком с признаками чужих загрузчиков —
а не «всё после </html>»: так не срежется что-то своё. Кладёт рядом
.bak и отдельно предупреждает, если признаки остались вне <script>.

    python3 dev/tools/strip-injection.py STRUCHORD.html --dry   # показать
    python3 dev/tools/strip-injection.py STRUCHORD.html         # вырезать
"""
import re
import shutil
import sys

MARKERS = [
    'cdn-cgi',
    'challenge-platform',
    '__cf$cv$params',  # регистр нормализуем при сравнении
    'email-decode.min.js',
    'rocket-loader',
]

# Тег <script> целиком: самозакрытый или «открытие + тело + </script>».
# Тело нежадное — соседние свои скрипты под один матч не попадают.
SCRIPT_RE = re.compile(
    r'<script\b[^>]*/>|<script\b[^>]*>[\s\S]*?</script\s*>',
    re.IGNORECASE,
)


def marked(tag: str) -> bool:
    low = tag.lower()
    return any(k in low for k in MARKERS)


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        return 2
    dry = '--dry' in sys.argv[2:]
    extra = [a for a in sys.argv[2:] if a != '--dry']
    if extra:
        print('неизвестные аргументы: ' + ' '.join(extra))
        print(__doc__)
        return 2
    path = sys.argv[1]

    with open(path, encoding='utf-8') as f:
        text = f.read()

    hits = [m for m in SCRIPT_RE.finditer(text) if marked(m.group(0))]
    if not hits:
        print(f'{path}: чисто, посторонних <script> не найдено')
        return 0

    for m in hits:
        preview = ' '.join(m.group(0).split())
        if len(preview) > 200:
            preview = preview[:200] + '…'
        verb = 'НАШЁЛ ' if dry else 'РЕЖУ  '
        print(f'{verb} [{m.start()}:{m.end()}] ({m.end() - m.start()} байт): {preview}')

    if dry:
        print(f'--dry: файл не тронут, кандидатов: {len(hits)}')
        return 0

    shutil.copy2(path, path + '.bak')

    # Режем по уже найденным совпадениям, с конца — позиции не съезжают.
    cleaned = text
    for m in reversed(hits):
        cleaned = cleaned[: m.start()] + cleaned[m.end():]

    # Контроль: тех же признаков не должно остаться ВНЕ тегов <script>.
    rest = SCRIPT_RE.sub('', cleaned).lower()
    left = [k for k in MARKERS if k in rest]

    with open(path, 'w', encoding='utf-8') as f:
        f.write(cleaned)

    cut_bytes = len(text) - len(cleaned)
    print(f'{path}: вырезано тегов {len(hits)}, {cut_bytes} байт; копия: {path}.bak')
    if left:
        print('ВНИМАНИЕ: признаки остались вне <script>: ' + ', '.join(left))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
