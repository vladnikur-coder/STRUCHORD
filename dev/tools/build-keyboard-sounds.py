#!/usr/bin/env python3
"""Собирает каталог sounds/ — записанные клавишные звуки STRUCHORD (0.776).

Что изменилось против 0.771 (keyboard-sounds.js, один файл с base64):

  * звуки лежат отдельными mp3 рядом (sounds/<тембр>/<нота>.mp3), браузер
    качает только выбранный тембр и только нужные ноты — не 10 МБ base64
    в одном скрипте, который парсится при каждой загрузке;
  * у пианино три слоя силы (Salamander v3 / v8 / v14 из npm-пакетов
    @audio-samples/piano-mp3-velocity*): тихая, средняя и громкая записи
    одной ноты — это и есть «живость» пианино, которой не даёт один слой.

Источники и лицензии: Salamander Grand Piano V3 (Alexander Holm,
CC BY 3.0, с 2022 в общественном достоянии), jRhodes GM (CC0), FluidR3 warm
pad (MIT / CC BY 3.0). 0.788 (B-116): орган переведён на WAV — пакет
tonejs-instrument-organ-wav 1.1.0 (набор tonejs-instruments,
https://www.npmjs.com/package/tonejs-instrument-organ-wav, MIT); прежние
MP3 t-hamano/piano-block убраны, у MP3 нет петли по сэмплам и на стыке
цикла слышен щелчок кодера.

Запуск:
    python3 dev/tools/build-keyboard-sounds.py [--only organ]

--only organ — пересобрать только тембр органа и обновить manifest.json
на месте (остальные тембры не трогает). Кэш скачанного — по умолчанию
/tmp/struchord-samples; повторный запуск не качает заново.
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
# 0.780: слои — на всём диапазоне банка, а не только в среднем регистре.
# Владелец сказал, что вес не важен (лишь бы в лимиты GitHub), поэтому
# крайние октавы получают те же три записи, что и середина.
PIANO_LAYERED = {m for m, _ in PIANO_ALL}
PIANO_LAYERS = {'soft': 3, 'mid': 8, 'loud': 14}
# Записанные release-сэмплы Salamander: 88 файлов rel1..rel88, по одной ноте
# от A0 (MIDI 21) до C8 (MIDI 108).
NPM_RELEASE = 'https://registry.npmjs.org/@audio-samples/piano-mp3-release/-/piano-mp3-release-1.0.5.tgz'
NPM = 'https://registry.npmjs.org/@audio-samples/piano-mp3-velocity%s/-/piano-mp3-velocity%s-1.0.5.tgz'
# 0.788 (B-116): орган — WAV из npm-пакета tonejs-instrument-organ-wav
# (tonejs-instruments, MIT). В пакете ноты A/C/Ds/Fs, поэтому берём
# ближайшие к прежним нотам: сдвиг не больше 2 полутонов, а высоту всё
# равно меняет playbackRate при проигрывании.
NPM_ORGAN = 'https://registry.npmjs.org/tonejs-instrument-organ-wav/-/tonejs-instrument-organ-wav-1.1.0.tgz'
ORGAN_SOURCES = [(42, 'Fs2'), (48, 'C3'), (54, 'Fs3'), (60, 'C4'), (66, 'Fs4'), (72, 'C5'), (78, 'Fs5')]


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return dest.read_bytes()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    dest.write_bytes(data)
    return data


def npm_release():
    """Записанные release-сэмплы: {midi: bytes}. rel1 — A0, rel88 — C8."""
    tgz = CACHE / 'piano-mp3-release.tgz'
    data = fetch(NPM_RELEASE, tgz)
    out = {}
    import io
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            name = pathlib.PurePosixPath(member.name).name
            m = re.match(r'^rel(\d+)\.mp3$', name)
            if not m:
                continue
            index = int(m.group(1))
            if 1 <= index <= 88:
                out[20 + index] = tar.extractfile(member).read()
    return out


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


# Прежние источники тембров (те же, что в 0.769): нужны, если рядом нет
# старого keyboard-sounds.js. Файлы небольшие, качаются через GitHub API.
# Орган с 0.788 из GitHub не берётся — только WAV-пакет из npm (см. ниже).
SOURCES = {
    'rhodes': ('sfzinstruments/Discord-SFZ-GM-Bank', '7a9c478fe331f94f246d33332f0adedb25bbbe27',
               [29, 35, 40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86, 91, 96]),
    'pad': ('educandu/abcjs-soundfonts', 'ebd5724f5d334b5b6347562b0044f75e16df90b7', None),
}
RHODES_FILES = {29: ('F1', 3), 35: ('B1', 3), 40: ('E2', 3), 45: ('A2', 3), 50: ('D3', 3),
                55: ('G3', 3), 59: ('B3', 3), 62: ('D4', 3), 65: ('F4', 3), 71: ('B4', 4),
                76: ('E5', 4), 81: ('A5', 4), 86: ('D6', 4), 91: ('G6', 4), 96: ('C7', 4)}
PAD_FILES = [(m, ('%s%d' % (('C' if m % 12 == 0 else 'Gb'), m // 12 - 1))) for m in
             [(n + 1) * 12 + pc for n in range(1, 8) for pc in (0, 6)]]


def trim_wav(data, max_seconds=8.0, threshold=0.004, preroll=0.005):
    """Обрезает WAV: ведущую тишину (с коротким упреждением) и хвост.

    В tonejs-instrument-organ-wav у каждой ноты ~30 мс тишины в начале —
    если не убрать, атака ноты начнётся позже нажатия. Чистый stdlib,
    новых зависимостей нет. Возвращает байты mono 16-bit WAV.
    """
    import io
    import struct
    import wave
    with wave.open(io.BytesIO(data), 'rb') as w:
        channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        if width != 2:
            raise RuntimeError('ожидался 16-bit WAV')
        raw = w.readframes(frames)
    count = len(raw) // (2 * channels)
    samples = struct.unpack('<%dh' % (count * channels), raw)
    mono = list(samples) if channels == 1 else [sum(samples[i * channels:(i + 1) * channels]) // channels
                                                  for i in range(count)]
    limit = threshold * 32768
    window = max(1, rate // 1000)                      # окно 1 мс
    start = 0
    for i in range(0, count, window):
        if max((abs(x) for x in mono[i:i + window]), default=0) > limit:
            start = max(0, i - int(preroll * rate))
            break
    end = min(count, start + int(max_seconds * rate))
    trimmed = mono[start:end]
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack('<%dh' % len(trimmed), *trimmed))
    return buf.getvalue()


def npm_organ():
    """Орган 0.788: WAV-ноты из tonejs-instrument-organ-wav (MIT).

    Возвращает [(midi источника, байты WAV), ...]; midi записи стоит в
    manifest, поэтому playbackRate сам подгоняет высоту под нужную ноту.
    """
    import io
    tgz = CACHE / 'tonejs-instrument-organ-wav-1.1.0.tgz'
    data = fetch(NPM_ORGAN, tgz)
    wanted = {name: midi for midi, name in ORGAN_SOURCES}
    out = []
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            name = pathlib.PurePosixPath(member.name).name
            base = name[:-4] if name.lower().endswith('.wav') else None
            if base in wanted:
                out.append((wanted[base], trim_wav(tar.extractfile(member).read())))
    if len(out) != len(ORGAN_SOURCES):
        raise RuntimeError('в пакете нашлось не все ноты органа: %d из %d' % (len(out), len(ORGAN_SOURCES)))
    return out


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
    # Орган с 0.788 — из npm (npm_organ), см. main().
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


def organ_rows():
    """Записи органа [(midi, payload, extra)] для manifest/сборки."""
    return [(midi, payload, {}) for midi, payload in npm_organ()]


def rebuild_only(mode):
    """--only organ: пересобрать один тембр и обновить manifest.json на
    месте, не трогая остальные. Старые файлы этого тембра удаляются."""
    if mode != 'organ':
        sys.exit('--only пока поддерживает только organ')
    rows = []
    for midi, payload, extra in organ_rows():
        entry = {'midi': midi, 'file': write_sample(mode, midi, payload)}
        for key in ('loopStart', 'loopEnd'):
            if key in extra:
                entry[key] = extra[key]
        rows.append(entry)
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    keep = {r['file'] for r in rows}
    folder = OUT / mode
    folder.mkdir(parents=True, exist_ok=True)
    for f in folder.iterdir():
        if f.is_file() and ('%s/%s' % (mode, f.name)) not in keep:
            f.unlink()
    manifest[mode] = rows
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    size = sum((OUT / r['file']).stat().st_size for r in rows)
    print('organ: %d нот, %d файлов, %.2f МБ' % (len(rows), len(rows), size / 1e6))
    print('ноты-источники: %s' % ', '.join('%d=%s' % (m, n) for m, n in ORGAN_SOURCES))


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    if '--only' in sys.argv:
        rebuild_only(sys.argv[sys.argv.index('--only') + 1])
        return
    banks = old_bank()
    banks['organ'] = organ_rows()
    manifest = {}

    # ---- Пианино: три слоя силы на всём диапазоне ----
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
            blob = layered['mid'].get(name)
            if not blob:
                continue
            entries.append({'midi': midi, 'velocity': PIANO_LAYERS['mid'],
                            'file': write_sample('acoustic', midi, blob)})
    manifest['acoustic'] = entries

    # ---- Записанные release-сэмплы пианино (демпфер) ----
    releases = npm_release()
    manifest['release'] = [{'midi': midi, 'file': write_sample('release', midi, releases[midi])}
                           for midi in sorted(releases)]

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
    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file() and f.name != 'manifest.json')
    print('файлов: %d, звуков: %.1f МБ' % (sum(1 for f in OUT.rglob('*') if f.is_file() and f.name != 'manifest.json'), total / 1e6))
    for mode, rows in manifest.items():
        files = [r['file'] for r in rows if 'file' in r]
        files += [layer['file'] for r in rows for layer in r.get('layers', [])]
        size = sum((OUT / f).stat().st_size for f in files)
        print('  %-9s %2d нот, %d файлов, %.1f МБ' % (mode, len(rows), len(files), size / 1e6))


if __name__ == '__main__':
    main()
