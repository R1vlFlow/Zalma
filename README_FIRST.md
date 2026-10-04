# Almazov Student — GitHub Pages release

Готовый статический релиз Almazov Student для GitHub Pages. Приложение работает из `index.html`, а актуальное расписание 1–6 курсов собирается GitHub Actions из официальной страницы кабинета студента НМИЦ им. В. А. Алмазова.

## Публикация

1. Загрузите **всё содержимое архива** в корень GitHub-репозитория.
2. В `Settings → Pages` выберите **GitHub Actions**.
3. Workflow `Sync official schedules and deploy` запускается при push в `main/master`, вручную и каждые 6 часов.
4. После первого успешного запуска в `data/official-schedules.json` появятся актуальные события; workflow также публикует Pages artifact.

### Что делает workflow

- получает актуальную страницу расписаний НМИЦ;
- находит лекционные и практические PDF для 1–6 курсов;
- разбирает потоки A/B и индивидуальные группы;
- разбирает диапазоны недель `(2–16)`, списки `(2, 4, 6, 8)` и несколько предметов внутри одной PDF-ячейки;
- сохраняет реальные одинаковые последовательные лекции как две части сдвоенной пары;
- проверяет, что для каждого курса есть лекции и ПЗ;
- проверяет группы, время, даты, недели и дубликаты;
- только после успешной проверки публикует GitHub Pages.

Если официальный PDF временно недоступен или parser не смог уверенно разобрать данные, workflow **останавливает публикацию**, а не создаёт выдуманное расписание.

## Архитектура

Браузер не скачивает PDF. Он читает только `data/official-schedules.json`. Это устраняет CORS-зависимость и делает мобильную версию стабильнее.

В браузере пользовательские данные хранятся локально через `localStorage`. Cookies для пользовательских данных не используются.

## Локальная проверка

```bash
python scripts/validate_js.py
python scripts/validate_release.py
python tests/test_sync_parser.py
```

Для реальной синхронизации:

```bash
python -m pip install pymupdf pdfplumber beautifulsoup4 requests
python scripts/sync_official.py
```

## Версии

- UI: **2.0.5**
- Runtime: **4.6.0**
- Schedule schema: **10**

Официальная страница расписания:
https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/
