# Almazov Student — PRE-RELEASE 2.0

Пользовательская версия интерфейса: **PRE-RELEASE 2.0**.
Движок официального расписания: **4.3.0-pre5**.

## Установка

1. Распакуй ZIP локально.
2. Загрузи содержимое в корень GitHub-репозитория.
3. Обязательно сохрани `.github/workflows/sync-official-schedules.yml`.
4. Открой **Actions → Sync official Almazov schedules → Run workflow**.
5. GitHub Actions скачает актуальные PDF с официальной страницы НМИЦ Алмазова, распознает их универсальным parser и опубликует `data/official-schedules.json`.

## Важное

- Локальный `data/official-schedules.json` является bootstrap-слоем и не блокирует отображение уже имеющихся официальных событий.
- Полнота live-расписания 1–6 курсов проверяется отдельно CI и генератором перед публикацией.
- На Android, iPhone/iPad и ПК используются одинаковые премиальные выпадающие шторки; нативный `<select>` остаётся скрытым резервным элементом.
- Личные данные, задачи, заметки, ДЗ и ручное расписание не заменяются автоматической синхронизацией.
- GitHub Pages не распаковывает ZIP автоматически: в репозиторий загружается содержимое архива, а не сам ZIP.

Официальный источник расписания: https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/
