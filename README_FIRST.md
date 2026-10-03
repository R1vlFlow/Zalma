# Almazov Student — Beta 4.0

Пользовательская версия интерфейса: **4.0 BETA**.
Движок официального расписания: **4.3.0-pre2**.

Сборка сохраняет текущую premium-систему интерфейса, автоматическую синхронизацию официального расписания и локальные данные пользователя.

# Almazov Student 4.3.0-pre2 — first upload

1. Распакуй этот ZIP.
2. Загрузи ВСЕ файлы и папки из распакованного содержимого в корень GitHub-репозитория `R1vlFlow/Almazov_Test`.
3. В репозитории обязательно должна появиться скрытая папка `.github/workflows/`.
4. В ней должен находиться `sync-official-schedules.yml`.
5. Открой GitHub → Actions → `Sync official Almazov schedules` → `Run workflow`.
6. Не загружай сам ZIP-файл в репозиторий: GitHub Pages не распаковывает архив автоматически.

Ожидаемая структура в корне:

.github/workflows/sync-official-schedules.yml
scripts/build_official_schedule.py
scripts/test_schedule_parser.py
scripts/verify_release.py
data/official-schedules.json
index.html
sw.js

Если `.github` не отображается, создай через GitHub `Add file → Create new file` с именем:
`.github/workflows/sync-official-schedules.yml`
и скопируй содержимое одноимённого файла из архива.

## Beta PRE-RELEASE 2.0 — важно

Версия PRE-RELEASE 2.0 сначала использует локальный `data/official-schedules.json`. Если локальный снимок неполный, приложение автоматически пытается получить полный актуальный индекс из `R1vlFlow/Zalma` и только при отсутствии сети оставляет локальный резерв.

Для расписания группа определяется до фильтрации событий. Значение `ALL` означает общую лекцию, а не пустую группу: лекция попадает только в соответствующий поток A/B. События не объединяются по названию предмета — две пары одного предмета остаются двумя отдельными занятиями.
