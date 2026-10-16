#!/usr/bin/env python3
"""Независимый оракул для B-12.9.9: читает наш .gp5 библиотекой PyGuitarPro 0.11.

Проект ничего не знает про Python — скрипт существует только для приёмки: он
открывает файл, который STRUCHORD отдал пользователю, сторонним парсером и печатает,
что тот действительно увидел. Ничего сюда не копируется из исходников STRUCHORD.

Запуск:
    /tmp/gpvenv/bin/python dev/tools/gp5-py-oracle.py [файл.gp5]
    /tmp/gpvenv/bin/python dev/tools/gp5-py-oracle.py файл.gp5 --json

Известное ограничение оракула: PyGuitarPro не читает капо из GP5 (в модуле
guitarpro/gp5.py о нём есть только текст документации), поэтому капо подтверждает
собственный независимый разборщик dev/tools/gp5-verify.js.
"""

import json
import sys

import guitarpro


def effect_dump(effect):
    """Разложенные приёмы ноты — то, что мы записали в файл."""
    slides = [str(slide).split(".")[-1] for slide in effect.slides] if effect.slides else []
    return {
        "letRing": bool(effect.letRing),
        "palmMute": bool(effect.palmMute),
        "staccato": bool(effect.staccato),
        "accent": bool(effect.accentuatedNote),
        "heavyAccent": bool(effect.heavyAccentuatedNote),
        "ghost": bool(effect.ghostNote),
        "vibrato": bool(effect.vibrato),
        "bend": bool(effect.bend),
        "harmonic": bool(effect.harmonic),
        "grace": bool(effect.grace),
        "slides": slides,
        "bend": None if not effect.bend else {
            "type": effect.bend.type.name,
            "value": effect.bend.value,
            "points": [[point.position, point.value] for point in effect.bend.points],
        },
        "harmonic": None if not effect.harmonic else type(effect.harmonic).__name__,
        "hammer": bool(getattr(effect, "hammer", False)),
        "grace": None if not effect.grace else {
            "fret": effect.grace.fret,
            "velocity": effect.grace.velocity,
            "duration": str(effect.grace.duration.value),
            "transition": effect.grace.transition.name,
        },
        "leftHandFinger": effect.leftHandFinger.value if effect.leftHandFinger else 0,
        "rightHandFinger": effect.rightHandFinger.value if effect.rightHandFinger else 0,
    }


def note_dump(note, percussion):
    out = {
        "fret": note.value,  # в перкуссии это номер ударного инструмента
        "velocity": note.velocity,
        "effect": effect_dump(note.effect),
        "durationPercent": round(note.durationPercent, 3),
        "type": note.type.name,
        "dead": note.type.name == "dead",
    }
    if not percussion:
        out["string"] = note.string + 1  # PyGuitarPro считает струны с 0
        out["note"] = note.value
    else:
        out["drum"] = note.value
    return out


def track_dump(index, track):
    percussion = bool(track.isPercussionTrack) or (
        track.channel is not None and bool(track.channel.isPercussionChannel))
    return {
        "index": index,
        "number": track.number,
        "name": track.name,
        "channel": track.channel.channel if track.channel else None,
        "instrument": track.channel.instrument if track.channel else None,
        "volume": track.channel.volume if track.channel else None,
        "balance": track.channel.balance if track.channel else None,
        "percussion": percussion,
        "strings": len(track.strings),
        "fretCount": track.fretCount,
        "offset": track.offset,
        "color": [track.color.r, track.color.g, track.color.b] if track.color else None,
        "tuning_high_to_low": [string.value for string in track.strings],
        "port": track.port,
        "notes": sum(len(beat.notes)
                     for measure in track.measures
                     for voice in measure.voices
                     for beat in voice.beats),
        "beats": sum(len(voice.beats)
                     for measure in track.measures
                     for voice in measure.voices),
        "voices": max([len(measure.voices) for measure in track.measures] or [0]),
    }


def repeat_passes(measure_headers):
    """Независимая проверка нативного повтора: сколько раз проигрывается секция.

    Повтор открыт флагом isRepeatOpen на первом такте секции, а закрывает его
    repeatClose. PyGuitarPro показывает сырой байт минус единицу: это число
    ДОПОЛНИТЕЛЬНЫХ повторов (-1 — закрытия нет), то есть проходов = 1 + это число.
    """
    passes = 0
    open_at = None
    for index, header in enumerate(measure_headers):
        if header.isRepeatOpen:
            open_at = index
        if open_at is None:
            continue
        passes += 1
        # repeatClose > 0 — закрытие (так же и в PyGuitarPro, и в TuxGuitar).
        # Это число ДОПОЛНИТЕЛЬНЫХ повторов, поэтому проходов = span * (1 + повторы).
        if header.repeatClose > 0:
            passes += (index - open_at + 1) * header.repeatClose
            open_at = None
    return passes


def dump(song):
    tracks = [track_dump(i, t) for i, t in enumerate(song.tracks)]
    measures = [{
        "number": header.number,
        "marker": header.marker.title if header.marker else "",
        "markerColor": ([header.marker.color.r, header.marker.color.g, header.marker.color.b]
                         if header.marker and header.marker.color else None),
        "repeatOpen": bool(header.isRepeatOpen),
        "repeatClose": header.repeatClose,
        "repeatAlternative": header.repeatAlternative,
        "key": str(header.keySignature).replace("KeySignature.", ""),
        "time": "%d/%d" % (header.timeSignature.numerator, header.timeSignature.denominator.value),
        "tripletFeel": str(header.tripletFeel).replace("TripletFeel.", ""),
    } for header in song.measureHeaders]

    notes = []
    for track in song.tracks:
        percussion = bool(track.isPercussionTrack) or (
            track.channel is not None and bool(track.channel.isPercussionChannel))
        for measure in track.measures:
            for voice in measure.voices:
                for beat in voice.beats:
                    for note in beat.notes:
                        notes.append({
                            "track": track.number,
                            "measure": measure.number,
                            "start": str(beat.start),
                            "duration": str(beat.duration),
                            "text": beat.text or "",
                            **note_dump(note, percussion),
                        })

    lyrics = [line.lyrics for line in song.lyrics.lines] if song.lyrics else []
    return {
        "header": str(song.version).strip(),
        "title": song.title,
        "subtitle": song.subtitle,
        "artist": song.artist,
        "album": song.album,
        "music": song.music,
        "words": song.words,
        "copyright": song.copyright,
        "lyrics": lyrics,
        "tempoName": song.tempoName,
        "tempo": song.tempo,
        "key": str(song.key).replace("KeySignature.", ""),
        "channels": sorted({track.channel.channel for track in song.tracks if track.channel}),
        "measureCount": len(song.measureHeaders),
        "tracks": tracks,
        "measures": measures,
        "repeatPasses": repeat_passes(song.measureHeaders),
        "notes": notes,
        "noteCount": len(notes),
    }


def main():
    args = sys.argv[1:]
    as_json = "--json" in args
    paths = [a for a in args if a != "--json"]
    path = paths[0] if paths else "/tmp/struchord-gp5-roundtrip.gp5"
    with open(path, "rb") as handle:
        song = guitarpro.parse(handle, encoding="cp1251")
    data = dump(song)

    if as_json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return

    print("=== независимый разбор PyGuitarPro 0.11: %s ===" % path)
    print("заголовок:      %s" % data["header"])
    print("паспорт:       «%s» / «%s», исполнитель %s, автор слов %s, автор музыки %s" % (
        data["title"], data["subtitle"], data["artist"], data["words"], data["music"]))
    print("темп:           %s (%s), тональность: %s" % (data["tempo"], data["tempoName"], data["key"]))
    print("текст песни:    %s" % ("; ".join(data["lyrics"]) or "—"))
    print("MIDI-каналы:    %s" % data["channels"])
    print("тактов: %d, нот: %d, проходов повтора: %d" % (
        data["measureCount"], data["noteCount"], data["repeatPasses"]))
    for track in data["tracks"]:
        print("-- дорожка %d «%s»: канал %s, инструмент %s, громкость %s, баланс %s%s, "
              "струн %d (от высокой к низкой: %s), октава %+d, порт %s, долей %d, голосов %d, нот %d" % (
                  track["index"] + 1, track["name"], track["channel"], track["instrument"],
                  track["volume"], track["balance"], " (перкуссия)" if track["percussion"] else "",
                  track["strings"], track["tuning_high_to_low"], track["offset"] - 2,
                  track["port"], track["beats"], track["voices"], track["notes"]))
    for measure in data["measures"]:
        print("-- такт %d: маркер «%s», повтор открыт %s, повторов закрыто %s, альтернативы %s, "
              "ключ %s, размер %s, триоли %s" % (
                  measure["number"], measure["marker"], measure["repeatOpen"], measure["repeatClose"],
                  measure["repeatAlternative"], measure["key"], measure["time"], measure["tripletFeel"]))
    for note in data["notes"]:
        effect = note["effect"]
        marks = ",".join(name for name, value in effect.items()
                         if value is True and name != "vibrato") or "обычная"
        place = ("ударный %d" % note["drum"]) if "drum" in note else \
                ("струна %d лад %d" % (note["string"], note["fret"]))
        print("     %s:%d доля %-6s %-6s %-18s vel %3d %s%s текст «%s»" % (
            "дорожка", note["track"], note["start"], note["duration"], place,
            note["velocity"], marks,
            " слайд %s" % ",".join(effect["slides"]) if effect["slides"] else "",
            note["text"]))


if __name__ == "__main__":
    main()