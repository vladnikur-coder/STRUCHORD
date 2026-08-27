# B-05 чистка-3: снос мёртвого CSS-правила .is-count-tight вместе с NB-комментарием.
# Класс нигде не ставится JS (греп по файлу: только сам селектор), правило никогда
# не применялось. Решения ask_user: снос целиком (full_remove), полный цикл (full_cycle).
# Идемпотентно: якорь не найден -> пропуск.
import io, sys

PATH = 'STRUCHORD.html'

OLD = """/* На узкой ячейке подписи сталкивались бы друг с другом: прячем их
   целиком. B-04: засечек, которые раньше оставались ориентирами, больше
   нет. NB: класс сейчас нигде не ставится (механика ушла когда-то раньше;
   правило живёт на будущее) — отмечено в ROADMAP B-05. */
.chord-wrapper.is-count-tight .chord-counts {
  display: none;
}


"""
NEW = "\n"

with io.open(PATH, 'r', encoding='utf-8', errors='surrogateescape') as f:
    src = f.read()

n = src.count(OLD)
if n == 0:
    print('B-05: якорь не найден (уже применено?) — пропуск')
    sys.exit(0)
assert n == 1, 'B-05: якорь встречается %d раз, ожидали 1' % n

src = src.replace(OLD, NEW, 1)

with io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(src)
print('B-05: правило .is-count-tight и NB-комментарий снесены')
