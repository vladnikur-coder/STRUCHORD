#!/usr/bin/env python3
"""Собирает каталог sounds/ — записанные клавишные звуки STRUCHORD (0.776).

Что изменилось против 0.771 (keyboard-sounds.js, один файл с base64):

  * звуки лежат отдельными mp3 рядом (sounds/<тембр>/<нота>.mp3), браузер
    качает только выбранный тембр и только нужные ноты — не 10 МБ base64
    в одном скрипте, который парсится при каждой загрузке;
  * у пианино три слоя силы (Salamander v3 / v8 / v14 из npm-пакетов
    @audio-samples/piano-mp3-velocity*): тихая, средняя и громкая записи
    одной ноты — это и есть «живость» пианино, которой не даёт один слой.

Источники и лицензии не меняются: Salamander Grand Piano V3 (Alexander Holm,
CC BY 3.0, с 2022 в общественном достоянии), jRhodes GM (CC0), tonewheel
organ hammondman (CC0), FluidR3 warm pad (MIT / CC BY 3.0).

Запуск:
    python3 dev/tools/build-keyboard-sounds.py [--cache DIR]

Кэш скачанного — по умолчанию /tmp/struchord-samples; повторный запуск
не качает заново.
"""
import base64
import json
import os
import pathlib
import re
import subprocess
import sys
import tarfile
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'sounds'
CACHE = pathlib.Path(os.environ.get('STRUCHORD_SAMPLE_CACHE', '/tmp/struchord-samples'))
OLD = ROOT / 'keyboard-sounds.js'

# Ноты пианино: середина диапазона — тремя слоями силы, крайние регистры —
# одним средним слоем. Аккомпанемент живёт в C2..C6, там слои и нужны.
# В именах сэмплов C1 = MIDI 24 (научная нотация), поэтому C<n> = (n+1)*12.
PIANO_ALL = [(21, 'A0')]
for _n in range(1, 8):
    PIANO_ALL += [((_n + 1) * 12, 'C%d' % _n), ((_n + 1) * 12 + 6, 'F#%d' % _n)]
PIANO_ALL += [(108, 'C8')]
PIANO_LAYERED = {m for m, _ in PIANO_ALL if 36 <= m <= 84}
PIANO_LAYERS = {'soft': 3, 'mid': 8, 'loud': 14}
NPM = 'https://registry.npmjs.org/@audio-samples/piano-mp3-velocity%s/-/piano-mp3-velocity%s-1.0.5.tgz'


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return dest.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    dest.write_bytes(data)
    return data


def npm_layer(velocity):
    """Возвращает {имя_ноты: bytes} для одного слоя силы из npm-пакета."""
    tgz = CACHE / ('piano-mp3-velocity%s.tgz' % velocity)
    data = fetch(NPM % (velocity, velocity), tgz)
    out = {}
    import io
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            name = pathlib.PurePosixPath(member.name).name
            m = re.match(r'^([A-G]#?\d)v%s\.mp3$' % velocity, name)
            if not m:
                continue
            out[m.group(1)] = tar.extractfile(member).read()
    return out


# Прежние источники трёх тембров (те же, что в 0.769): нужны, если рядом нет
# старого keyboard-sounds.js. Файлы небольшие, качаются через GitHub API.
SOURCES = {
    'rhodes': ('sfzinstruments/Discord-SFZ-GM-Bank', '7a9c478fe331f94f246d33332f0adedb25bbbe27',
               [29, 35, 40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86, 91, 96]),
    'organ': ('t-hamano/piano-block', '897256cd5506a5c2cba14f6bb48fef8113dc39b5', None),
    'pad': ('educandu/abcjs-soundfonts', 'ebd5724f5d334b5b6347562b0044f75e16df90b7', None),
}
RHODES_FILES = {29: ('F1', 3), 35: ('B1', 3), 40: ('E2', 3), 45: ('A2', 3), 50: ('D3', 3),
                55: ('G3', 3), 59: ('B3', 3), 62: ('D4', 3), 65: ('F4', 3), 71: ('B4', 4),
                76: ('E5', 4), 81: ('A5', 4), 86: ('D6', 4), 91: ('G6', 4), 96: ('C7', 4)}
ORGAN_FILES = [(43, 'G2'), (48, 'C3'), (55, 'G3'), (60, 'C4'), (67, 'G4'), (72, 'C5'), (79, 'G5')]
PAD_FILES = [(m, ('%s%d' % (('C' if m % 12 == 0 else 'Gb'), m // 12 - 1))) for m in
             [(n + 1) * 12 + pc for n in range(1, 8) for pc in (0, 6)]]


def github_raw(repo, sha, path):
    url = 'https://api.github.com/repos/%s/contents/%s?ref=%s' % (
        repo, urllib.parse.quote(path, safe='/'), sha)
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.raw+json',
                                               'User-Agent': 'struchord-build'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def wav_loop(data):
    """Петля из WAV-чанка smpl (начало/конец в сэмплах при 44,1 кГц)."""
    import struct
    offset = 12
    while offset + 8 < len(data):
        kind, size = struct.unpack_from('<4sI', data, offset)
        offset += 8
        if kind == b'smpl':
            values = struct.unpack_from('<9I', data, offset)
            if values[7]:
                _cue, _type, start, end, _frac, _count = struct.unpack_from('<6I', data, offset + 36)
                return start / 44100, (end + 1) / 44100
            break
        offset += size + (size % 2)
    return None


def downloaded_bank():
    """Банки Rhodes, органа и pad из их репозиториев, если старого файла нет."""
    out = {}
    repo, sha, _ = SOURCES['rhodes']
    rows = []
    for midi in SOURCES['rhodes'][2]:
        note, layer = RHODES_FILES[midi]
        data = github_raw(repo, sha, 'Discord GM/Melodic/005-Electric Piano 1/A_%03d__%s_%d.wav' % (midi, note, layer))
        loop = wav_loop(data)
        extra = {'loopStart': loop[0], 'loopEnd': loop[1]} if loop else {}
        rows.append((midi, data, extra))
    out['rhodes'] = rows
    repo, sha, _ = SOURCES['organ']
    out['organ'] = [(midi, github_raw(repo, sha, 'assets/instruments/organ/%s.mp3' % name), {})
                    for midi, name in ORGAN_FILES]
    repo, sha, _ = SOURCES['pad']
    out['pad'] = [(midi, github_raw(repo, sha, 'FluidR3_Salamander_GM/pad_2_warm-mp3/%s.mp3' % name), {})
                  for midi, name in PAD_FILES]
    return out


def old_bank():
    """Прежний keyboard-sounds.js: Rhodes, орган, pad и один слой пианино."""
    if not OLD.exists():
        # Старого единого файла нет — берём те же записи из их репозиториев.
        return downloaded_bank()
    src = OLD.read_text(encoding='utf-8')
    start = src.index('{', src.index('__b39SampleData='))
    data = json.loads(src[start:].rstrip().rstrip(';'))
    return {mode: [(int(e['midi']), base64.b64decode(e['data']), e) for e in rows]
            for mode, rows in data.items()}


def write_sample(mode, midi, payload, name=None):
    """Кладёт запись в sounds/. WAV (Rhodes) остаётся WAV: у него петля по
    сэмплам, а mp3 туда добавил бы задержку кодера и щелчок на стыке."""
    folder = OUT / mode
    folder.mkdir(parents=True, exist_ok=True)
    kind = 'wav' if payload[:4] == b'RIFF' else 'mp3'
    name = name or ('%d.%s' % (midi, kind))
    (folder / name).write_bytes(payload)
    return '%s/%s' % (mode, name)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    banks = old_bank()
    manifest = {}

    # ---- Пианино: три слоя силы + средний слой для крайних регистров ----
    layered = {k: npm_layer(v) for k, v in PIANO_LAYERS.items()}
    entries = []
    for midi, name in PIANO_ALL:
        if midi in PIANO_LAYERED:
            variants = []
            for key, velocity in PIANO_LAYERS.items():
                blob = layered[key].get(name)
                if not blob:
                    sys.exit('нет слоя %s для ноты %s' % (key, name))
                variants.append({'velocity': velocity,
                                 'file': write_sample('acoustic', midi, blob, '%d-v%d.mp3' % (midi, velocity))})
            entries.append({'midi': midi, 'layers': variants})
        else:
            # Крайние регистры — один средний слой: слоёв там всё равно не
            # хватает на слух, а файл экономится.
            blob = layered['mid'].get(name)
            if not blob:
                continue
            entries.append({'midi': midi, 'velocity': PIANO_LAYERS['mid'],
                            'file': write_sample('acoustic', midi, blob)})
    manifest['acoustic'] = entries

    # ---- Остальные тембры: как были, но отдельными файлами ----
    for mode in ('rhodes', 'organ', 'pad'):
        rows = []
        for midi, payload, extra in banks[mode]:
            entry = {'midi': midi, 'file': write_sample(mode, midi, payload)}
            for key in ('loopStart', 'loopEnd'):
                if key in extra:
                    entry[key] = extra[key]
            rows.append(entry)
        manifest[mode] = rows

    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n',
                                       encoding='utf-8')
    total = sum(f.stat().st_size for f in OUT.rglob('*.mp3'))
    print('файлов: %d, звуков: %.1f МБ' % (sum(1 for _ in OUT.rglob('*.mp3')), total / 1e6))
    for mode, rows in manifest.items():
        files = [r['file'] for r in rows if 'file' in r]
        files += [layer['file'] for r in rows for layer in r.get('layers', [])]
        size = sum((OUT / f).stat().st_size for f in files)
        print('  %-9s %2d нот, %d файлов, %.1f МБ' % (mode, len(rows), len(files), size / 1e6))


if __name__ == '__main__':
    main()
