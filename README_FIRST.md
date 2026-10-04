# Almazov Student — GitHub-ready release

Корень репозитория уже готов для GitHub Pages: `index.html` лежит в корне.

## Расписание

Приложение использует два слоя расписания:

1. `data/official-schedules.json` — локальный восстановительный снимок, поэтому расписание не исчезает при первом запуске и отсутствии сети.
2. Официальный синхронизатор `scripts/build_official_schedule.py` — при запуске GitHub Actions скачивает актуальные PDF со страницы кабинета студента НМИЦ им. В. А. Алмазова, распознаёт лекции и ПЗ для 1–6 курсов и заменяет локальный снимок только после валидации.

Для 4–6 курсов используется универсальный геометрический парсер матриц недель; для 4Б, 5Б и 6 курса в репозитории также лежат реальные regression-fixtures.

## Публикация

В GitHub: **Settings → Pages → Source → GitHub Actions**.

После первого push можно вручную запустить workflow:
`Actions → Sync official schedules and deploy → Run workflow`.

Workflow не публикует неполный результат: если курс или поток потерял практические занятия, сборка завершается ошибкой до публикации.

## Локальная проверка

```bash
python scripts/validate_js.py
python scripts/validate_release.py
python scripts/validate_generated_index.py
python scripts/validate_schedule_data.py
python scripts/test_4k_matrix_real_pdf.py
python scripts/test_5k_matrix_real_pdf.py
python scripts/test_6k_matrix_real_pdf.py
```
