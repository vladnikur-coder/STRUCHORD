#!/usr/bin/env python3
"""Пересобирает встроенный в STRUCHORD.html сабсет иконочного шрифта Tabler.

Приложение — один файл без сборки, поэтому шрифт живёт прямо в CSS в
data:URI. Чтобы не таскать полный Tabler (сотни килобайт), здесь держим
сабсет только из тех иконок, которые реально встречаются в разметке
(`ti ti-…`). Запускать после добавления/удаления иконки в приложении:

    python3 dev/tools/subset-icons.py            # пересобрать и записать
    python3 dev/tools/subset-icons.py --dry-run  # только показать список

Полный шрифт-источник лежит рядом со скриптом: dev/tools/tabler-full.woff2
(в репозиторий не входит, файл бинарный — передаётся отдельно). Он нужен,
чтобы узнать кодпоинты иконок, которых ещё нет в текущем сабсете, и как
источник глифов для пересборки.

Требуются пакеты: pip install fonttools brotli
"""
from pathlib import Path
import base64
import re
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "STRUCHORD.html"
FULL_FONT = Path(__file__).resolve().parent / "tabler-full.woff2"

# Сабсет — это всегда заметно меньше полного шрифта. Если встроенный
# шрифт больше этого порога, считаем, что в CSS лежит ПОЛНЫЙ Tabler
# (первый прогон) и кодпоинты берём из него самого.
ALREADY_SUBSET_KB = 50


def find_font_style(html):
    """Блок <style>, содержащий @font-face иконочного шрифта."""
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S)
    fonts = [b for b in blocks if "@font-face" in b]
    if not fonts:
        sys.exit("В STRUCHORD.html нет <style> с @font-face — шрифт не найден.")
    css = max(fonts, key=len)
    pos = html.index(css)
    start = html.rfind("<style", 0, pos)
    end = html.index("</style>", pos) + len("</style>")
    return css, (start, end)


def collect_used_icons(html, font_span):
    """Имена иконок ti ti-*, реально используемые в документе."""
    doc = html[:font_span[0]] + html[font_span[1]:]
    names = set()
    for pat in (r'class="ti ti-([a-z0-9-]+)"',
                r"'ti ti-([a-z0-9-]+)'",
                r'"ti ti-([a-z0-9-]+)"',
                r'\bti ti-([a-z0-9-]+)'):
        names |= set(re.findall(pat, doc))
    return sorted(n for n in names if not n.isdigit())


def read_codepoints(css):
    """Карта имя → кодпоинт из CSS-правил .ti-*:before."""
    return dict(re.findall(
        r'\.ti-([a-z0-9-]+):before\{content:"\\([0-9a-f]{4,6})"\}', css))


def font_bytes_from_css(css):
    m = re.search(r'url\("data:font/woff2;base64,([^"]+)"\)', css)
    if not m:
        sys.exit("В блоке шрифта нет data:font/woff2;base64 — "
                 "нечего резать.")
    return base64.b64decode(m.group(1))


def main():
    dry = "--dry-run" in sys.argv
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        import brotli  # noqa: F401 — нужен fontTools для записи woff2
    except ImportError:
        sys.exit("Нужны пакеты: pip install fonttools brotli")

    html = SRC.read_text(encoding="utf-8")
    css, font_span = find_font_style(html)
    used = collect_used_icons(html, font_span)
    codepoints = read_codepoints(css)

    css_bytes = font_bytes_from_css(css)
    if len(css_bytes) < ALREADY_SUBSET_KB * 1024:
        # В CSS уже сабсет: неизвестные кодпоинты и глифы берём из
        # полного шрифта-источника.
        if not FULL_FONT.exists():
            sys.exit(f"В CSS уже сабсет ({len(css_bytes) // 1024} КБ), "
                     f"а полного шрифта {FULL_FONT.name} нет рядом со "
                     f"скриптом — новые иконки не из чего вырезать.")
        font_bytes = FULL_FONT.read_bytes()
    else:
        # Первый прогон: в CSS лежит полный шрифт, режем его самого.
        font_bytes = css_bytes

    missing = [n for n in used if n not in codepoints]
    if missing:
        # Имя глифа → кодпоинт из cmap полного шрифта.
        import io
        cmap = TTFont(io.BytesIO(font_bytes)).getBestCmap()
        by_glyph = {}
        for code, gname in cmap.items():
            by_glyph.setdefault(gname, code)
            # Допускаем префикс «ti-»/«ti_» в имени глифа.
            by_glyph.setdefault(re.sub(r"^ti[-_]", "", gname), code)
        for n in missing:
            if n in by_glyph:
                codepoints[n] = format(by_glyph[n], "04x")
            else:
                sys.exit(f"Иконка «{n}» есть в разметке, но её нет "
                         f"ни в CSS, ни в полном шрифте {FULL_FONT.name}.")

    extra = sorted(set(codepoints) - set(used))
    for n in extra:
        del codepoints[n]

    print(f"Иконок в разметке: {len(used)}"
          + (f" (новых: {', '.join(missing)})" if missing else ""))
    for name in used:
        print(f"  {name:<22} U+{codepoints[name].upper()}")

    # Сабсет: оставляем только используемые юникоды, без хинтинга и
    # layout-фич — иконкам они не нужны.
    import io
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.hinting = False
    opts.desubroutinize = True
    opts.layout_features = []
    opts.notdef_outline = False
    font = subset.load_font(io.BytesIO(font_bytes), opts)
    ss = subset.Subsetter(opts)
    ss.populate(unicodes=[int(codepoints[n], 16) for n in used])
    ss.subset(font)
    tmp_out = io.BytesIO()
    font.save(tmp_out)
    sub_b64 = base64.b64encode(tmp_out.getvalue()).decode("ascii")

    # Собираем новый CSS: шапка-отчёт, @font-face с новым data:URI,
    # базовое правило .ti { … } — как было, и по правилу на иконку.
    face = re.search(r"@font-face\{[^}]*\}", css) or \
        re.search(r"@font-face\s*\{[\s\S]*?\}", css)
    if not face:
        sys.exit("Не нашёл правило @font-face в блоке шрифта.")
    new_face = re.sub(r'url\("data:font/woff2;base64,[^"]+"\)',
                      f'url("data:font/woff2;base64,{sub_b64}")',
                      face.group(0))
    base_rule = re.search(r"\.ti\s*\{[^}]*\}", css)
    rules = "\n".join(
        f'.ti-{n}:before{{content:"\\{codepoints[n]}"}}' for n in used)
    header = (f"/* Tabler Icons — сабсет из {len(used)} иконок. "
              f"Пересобирается dev/tools/subset-icons.py из "
              f"{FULL_FONT.name}; было {len(font_bytes) // 1024} КБ, "
              f"стало {len(tmp_out.getvalue()) // 1024} КБ. */")
    new_css = "\n" + header + "\n" + new_face + "\n" + \
        (base_rule.group(0) if base_rule else "") + "\n" + rules + "\n"

    old_kb = len(css) // 1024
    new_kb = len(new_css) // 1024
    print(f"Блок <style>: {old_kb} КБ -> {new_kb} КБ")
    if dry:
        print("--dry-run: файл не тронут.")
        return
    out = html[:font_span[0]] + "<style>" + new_css + "</style>" + \
        html[font_span[1]:]
    SRC.write_text(out, encoding="utf-8")
    print(f"Записано в {SRC.name}.")


if __name__ == "__main__":
    main()
