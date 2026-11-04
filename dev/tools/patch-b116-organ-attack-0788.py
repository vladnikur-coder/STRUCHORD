#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-116 / 0.788 — орган: мягкая атака, без синтетического щелчка, WAV-сэмплы.

Патч по якорям, без `git apply`. Применяется один раз к 0.787:

    python3 dev/tools/patch-b116-organ-attack-0788.py --check
    python3 dev/tools/patch-b116-organ-attack-0788.py

Жалоба владельца после 0.787: «электроорган все ещё щелкает, атака
слишком жесткая». Read-only диагностика: сэмплы-mp3 сами по себе не
щелкают (фронт нарастает ~20 мс, ВЧ-доля атаки 0,1–0,9 %), щелчок давал
синтез в коде (organAttack: шум + синус 3-й гармоники на каждой ноте) и
слишком короткая (4 мс) рампа громкости самого сэмпла.

Решения владельца (R8 №4, все подтверждены 2026-11-04):
  * click2 = remove  — синтетический щелчок клавиши убран совсем;
  * perc2  = remove  — перкуссия 3-й гармоники убрана тоже, т.е.
    organAttack() удаляется целиком (функция + вызов), вместе с
   now мёртвыми полями life.clickVar / life.percussive;
  * attack = soft20  — рампа атаки сэмпла органа 4 мс -> ~20 мс;
  * onset  = wav_now — сэмплы органа переведены на WAV (npm-пакет
    tonejs-instrument-organ-wav 1.1.0, tonejs-instruments, MIT; сборка в
    dev/tools/build-keyboard-sounds.py --only organ, файлы sounds/organ/*.wav
    и manifest.json уже пер regenerated, патч их не трогает).

Текст кредитов в настройках обновлён: hammondman/piano-block ->
tonejs-instrument-organ-wav (MIT).

Не меняется: сэмплы остальных тембров, makeSustain, расписание pad,
метроном, экспорт, история, UI. R7: версия в шапке HTML и CACHE_NAME в
sw.js меняются парой.
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: якорь «%s» найден %d раз (нужен ровно 1)' % (label, n))
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. keyboard-audio.js — орган без синтетического щелчка, атака ~20 мс
# ---------------------------------------------------------------------------
A_COMMENT1_OLD = """    //  * У органа силы удара нет по природе: акцент даёт перкуссию
    //    тон-колёс (0.787 — только на новой атаке), а не громкость; тихий
    //    щелчок клавиши звучит на каждой ноте.
"""
A_COMMENT1_NEW = """    //  * У органа силы удара нет по природе: акцент — в атаке самого
    //    сэмпла, а не в громкости. 0.788 (B-116): синтетические щелчок
    //    клавиши и перкуссия тон-колёс удалены вовсе, атака сэмпла
    //    сглажена до ~20 мс — жёсткости не осталось ни в коде, ни в записи.
"""

# organAttack целиком (комментарий + функция) удаляется.
A_FUNC_OLD = """    // Щелчок клавиши и перкуссия тон-колёс: короткий шум и затухающий тон
    // на третьей гармонике. Именно этого не хватает «электронному» органу.
    // 0.787 (B-115): щелчок остался на КАЖДОЙ ноте — как механический
    // контакт у Hammond, — но стал тише (~×0.3) и получил
    // детерминированный разброс уровня от ноты и номера повтора
    // (life.clickVar). Перкуссия звучит только на новой атаке
    // (life.percussive): повтор той же ноты внутри рисунка её не даёт.
    function organAttack(ctx, target, midi, start, level, expression, life) {
      var e = strengthOf(expression), f0 = frequencyOf(midi);
      var clickVar = life && Number.isFinite(life.clickVar) ? life.clickVar : 1;
      var nb = hammerBuffer(ctx);
      if (nb && hasRoom() && typeof ctx.createBufferSource === 'function') {
        try {
          var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
          src.buffer = nb;
          bp.type = 'bandpass';
          bp.frequency.value = Math.min(5200, Math.max(900, f0 * 3.2));
          bp.Q.value = 1.1;
          src.connect(bp); bp.connect(g); g.connect(target);
          g.gain.setValueAtTime(Math.max(.0002, level * (.27 + .42 * e) * clickVar), start);
          g.gain.exponentialRampToValueAtTime(.0001, start + .012);
          src.start(start); src.stop(start + .02);
          register(src);
        } catch (err) {}
      }
      if ((!life || life.percussive !== false) && hasRoom()) {
        try {
          var osc = ctx.createOscillator(), pg = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = Math.min(8000, f0 * 3);
          osc.connect(pg); pg.connect(target);
          pg.gain.setValueAtTime(.0001, start);
          pg.gain.exponentialRampToValueAtTime(Math.max(.0002, level * (.18 + .38 * e)), start + .006);
          pg.gain.exponentialRampToValueAtTime(.0001, start + .28);
          osc.start(start); osc.stop(start + .3);
          register(osc);
        } catch (err) {}
      }
    }
    // Повтор одного и того же удара звучит как секвенсор: файл, громкость и
"""
A_FUNC_NEW = """    // 0.788 (B-116): синтетические щелчок клавиши и перкуссия тон-колёс
    // (бывшая organAttack, 0.786–0.787) удалены целиком: владелец посчитал
    // атаку слишком жёсткой, а настоящий фронт атаки теперь даёт сам
    // WAV-сэмпл органа + рампа громкости ~20 мс в playSample ниже.
    // Повтор одного и того же удара звучит как секвенсор: файл, громкость и
"""

A_LIFE_OLD = """      } else if (mode === 'organ') {
        out.jitter = (rnd(2) - .5) * .004;                       // контакты клавиш
        // 0.787 (B-115): щелчок клавиши звучит на каждой ноте, но тихо и с
        // детерминированным разбросом уровня — повторы не звучат машинно
        // бит-в-бит (та же схема, что расстройка у пианино/Rhodes выше).
        out.clickVar = .75 + rnd(4) * .5;
        // Перкуссия тон-колёс — только на НОВОЙ атаке: если та же нота этой
        // дорожки звучала менее 0,45 с назад, это повтор внутри рисунка,
        // а не смена аккорда, — перкуссии нет.
        var prevOrgan = lastHit.get(key);
        out.percussive = !(prevOrgan && at - prevOrgan.at >= 0 && at - prevOrgan.at < .45);
        lastHit.set(key, { at: at });
        if (lastHit.size > 2048) lastHit.clear();
      }
"""
A_LIFE_NEW = """      } else if (mode === 'organ') {
        // 0.788 (B-116): щелчка/перкуссии больше нет, из «жизни» у органа
        // остался только разброс момента нажатия клавиш.
        out.jitter = (rnd(2) - .5) * .004;                       // контакты клавиш
      }
"""

A_ATTACK_OLD = """      var attack=mode==='pad'?.14:.004,end=start+held;
"""
A_ATTACK_NEW = """      // 0.788 (B-116): у органа атака сэмпла ~20 мс вместо 4 мс —
      // нажатие не «втыкается» в звук, фронт мягкий.
      var attack=mode==='pad'?.14:mode==='organ'?.02:.004,end=start+held;
"""

A_CAL_OLD = """      // Калибровка по тембру: записи разной громкости, чтобы Rhodes не лез
      // вперёд, а pad не заливал. Орган на силу удара не реагирует: у него
      // акцент даёт перкуссию на новой атаке (0.787), а тихий щелчок клавиши
      // звучит на каждой ноте, поэтому громкость почти ровная.
"""
A_CAL_NEW = """      // Калибровка по тембру: записи разной громкости, чтобы Rhodes не лез
      // вперёд, а pad не заливал. Орган на силу удара не реагирует: акцент
      // — в атаке самого WAV-сэмпла (с 0.788 рампа ~20 мс), поэтому
      // громкость почти ровная.
"""

A_CALL_OLD = """      if(mode==='organ')organAttack(ctx,target,midi,start,level,expression,life);
      // Демпфер только у пианино: у Rhodes нота глохнет иначе, у органа и
"""
A_CALL_NEW = """      // Демпфер только у пианино: у Rhodes нота глохнет иначе, у органа и
"""

# Кредиты в настройках: орган теперь tonejs-instrument-organ-wav (MIT).
A_CREDITS_OLD = "Орган: tonewheel organ sound samples by hammondman, CC0 1.0, https://freesound.org/people/hammondman/packs/18844/ ; обработанные MP3 из https://github.com/t-hamano/piano-block/tree/897256cd5506a5c2cba14f6bb48fef8113dc39b5/assets/instruments/organ . Изменения: отбор нот, высота, огибающая и сглаженный цикл. Точная модель органа не подтверждена.\\n\\n"
A_CREDITS_NEW = "Орган: WAV-сэмплы из набора tonejs-instruments (проект Makefully-Studios), лицензия MIT, npm-пакет tonejs-instrument-organ-wav 1.1.0 (https://www.npmjs.com/package/tonejs-instrument-organ-wav), 44,1 кГц моно. Изменения: отбор 7 нот (Fs2/C3/Fs3/C4/Fs4/C5/Fs5), обрезка ведущей тишины и хвоста до 8 с, высота изменяется при проигрывании, огибающая и сглаженный цикл.\\n\\n"

# ---------------------------------------------------------------------------
# 2. R7: версия и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_OLD = """· ver 0.787</span></span>"""
HTML_NEW = """· ver 0.788</span></span>"""

SW_OLD = """const CACHE_NAME = 'struchord-v787';"""
SW_NEW = """const CACHE_NAME = 'struchord-v788';"""


def main():
    ap = argparse.ArgumentParser(description='B-116 / 0.788: орган — без щелчка/перкуссии, атака ~20 мс, WAV-сэмплы')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('keyboard-audio.js', [
            (A_COMMENT1_OLD, A_COMMENT1_NEW, 'комментарий 0.776 про орган'),
            (A_FUNC_OLD, A_FUNC_NEW, 'organAttack удалена целиком'),
            (A_LIFE_OLD, A_LIFE_NEW, 'lifeFor: organ без clickVar/percussive'),
            (A_ATTACK_OLD, A_ATTACK_NEW, 'атака органа ~20 мс'),
            (A_CAL_OLD, A_CAL_NEW, 'комментарий про калибровку органа'),
            (A_CALL_OLD, A_CALL_NEW, 'вызов organAttack удалён'),
            (A_CREDITS_OLD, A_CREDITS_NEW, 'кредиты: орган = tonejs-instrument-organ-wav'),
        ]),
        ('sw.js', [
            (SW_OLD, SW_NEW, 'CACHE_NAME'),
        ]),
    ]
    out = {}
    for rel, edits in jobs:
        p = ROOT / rel
        text = p.read_text(encoding='utf-8')
        for old, new, label in edits:
            text = replace_once(text, old, new, rel + ': ' + label)
        out[rel] = text
        print('  ok  %-32s %d якорей' % (rel, len(edits)))
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return 0
    for rel, text in out.items():
        (ROOT / rel).write_text(text, encoding='utf-8')
    print('ПАТЧ ПРИМЕНЁН: 0.787 -> 0.788 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
