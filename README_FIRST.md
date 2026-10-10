# Almazov Schedule Hub — release 2.8.0-rc.4 (Master RC)

Версия приложения: **2.8.0-rc.4** (кандидат в релиз).
Версия интерфейса: **2.8.0-rc.4**.
Движок официального расписания: **4.9.0-rc.1**.

> **Статус данных на 10.10.2026: BLOCKED_FOR_PRODUCTION.** Полный live-sync и SHA-256 проверка байтов официальных PDF не выполнены в этой среде (DNS недоступен). Локальный индекс явно помечен как `local-recovery-snapshot` и не является полным живым расписанием. В текущем локальном снимке отсутствуют прямые записи практики для 42 групп лечебного дела: группа 103, группы 217–222 и 225–229, группы 501–512 и группы 601–618. При этом официальные ссылки на соответствующие PDF существуют; эти группы нужно восстановить разбором опубликованных файлов, не синтетическими записями. Текущий официальный хаб публикует 10 комплектов КУГ из 17 возможных сочетаний: Лечебное дело 1–6, Педиатрия 1–2 и Клиническая психология 1–2; для остальных 7 курсов ссылки на хабе не опубликованы. Прямые URL всех 10 опубликованных КУГ внесены в `data/kug-source-manifest.json`, но SHA-256 остаётся пустым до live-загрузки. Практические матрицы 4/5/6 курсов содержат конфликтующие даты/годы в шапках; их нельзя превращать в датированные пары без официальной привязки к неделям. Подробности по каждой группе и источнику: [`reports/official-coverage-audit-2026-10-10.md`](reports/official-coverage-audit-2026-10-10.md) и [`docs/PRODUCTION_SYNC_AND_RELEASE.md`](docs/PRODUCTION_SYNC_AND_RELEASE.md). Не включай `productionEligible`, пока live-хеши, даты недель, все опубликованные группы/потоки и specialist snapshot не будут проверены.

## Установка и правильная публикация

1. Распакуй ZIP локально.
2. Загрузи **содержимое** архива в корень GitHub-репозитория, включая `.github/`, `public/`, `src/`, `scripts/`, `package.json` и актуальный `dist/`.
3. В GitHub открой **Settings → Pages → Build and deployment** и выбери **GitHub Actions** как источник публикации. Не выбирай `Deploy from a branch` для старой root-страницы.
4. Открой **Actions → Deploy GitHub Pages** и дождись зелёного завершения `build-deploy`. После публикации открывай адрес Pages **без `/dist/`** (например, `https://<owner>.github.io/<repo>/`): workflow публикует содержимое папки `dist/` как корень сайта. Для обновления официального расписания отдельно запускай workflow синхронизации.
5. В приложении открой **Настройки** и проверь значение «Версия сборки». Оно должно соответствовать файлу `dist/version.json` из последнего релиза.

Если адрес в браузере содержит `/dist/`, проверь **Settings → Pages → Build and deployment**: это обычно указывает на публикацию ветки вместо GitHub Actions либо на открытие вложенного каталога. При GitHub Actions правильный адрес — корень Pages-сайта. Service worker проверяет новый релиз, а HTML/JS/CSS получают content-based версию.

## Независимая перепроверка кода

По итогам аудита обновлены регрессионные контракты, исправлена текущая ссылка на ПЗ 4Б, добавлена узкая проверка метаданных Педиатрии 2 курса и введён строгий pre-deploy gate. `npm run qa` завершился с кодом 0 (последний локальный прогон); новая проверка Педиатрии закрыта отдельными позитивными/негативными тестами. Локальная сборка по-прежнему неминифицирована, live SHA-256 отсутствуют, и `python scripts/validate_production_release.py` обязан завершаться с BLOCKED до сетевой синхронизации. Подробности: [`docs/PRODUCTION_SYNC_AND_RELEASE.md`](docs/PRODUCTION_SYNC_AND_RELEASE.md).

## Установка (подробно)

1. Убедись, что `.github/workflows/sync-official-schedules.yml` сохранён.
2. Открой **Actions → Sync official schedules and deploy → Run workflow**.
3. GitHub Actions обнаружит официальные документы, обновит `data/official-schedules.json`, проверит данные и опубликует `dist/`.

## Важное

- Локальный `data/official-schedules.json` является bootstrap-слоем и не блокирует отображение уже имеющихся официальных событий.
- Полнота live-расписания 1–6 курсов проверяется отдельно CI и генератором перед публикацией.
- Нативные `<select>`, `<input type="date">` и `<input type="datetime-local">` визуально заменяются единым UI Kit с клавиатурной навигацией, доступностью и поддержкой обеих тем. Исходные поля остаются синхронизированными с моделью приложения.
- Персонализация хранится в `localStorage`, бинарные пользовательские материалы — в IndexedDB браузера (до 25 MiB на файл). Первая миграция схемы делает резервную копию прежнего центрального JSON и не удаляет legacy-ключи. Личные данные не синхронизируются между устройствами автоматически; очистка хранилища браузера может удалить локальные материалы.
- GitHub Pages не распаковывает ZIP автоматически: в репозиторий загружается содержимое архива, а не сам ZIP.

**Ручной импорт расписания:** PDF, XLSX/XLS, ODS, CSV/TSV, DOCX, PPTX, HTML, TXT/RTF и изображения с OCR; формат определяется по содержимому, а не только по расширению.

**Пользовательские материалы:** PDF, DOCX, XLSX, PPTX, ZIP, JPG/JPEG и PNG; файлы доступны в том же браузере для выбранной программы/курса/группы.

Официальный источник расписания: https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/


## Установка на телефон (Master RC)

Подробная инструкция Android APK и iPhone PWA находится в [`docs/ANDROID_INSTALL.md`](docs/ANDROID_INSTALL.md). APK создаётся вручную через GitHub Actions workflow `Build Android APK (RC)`; ссылка на APK начнёт работать после успешной сборки и прикрепления файла к GitHub Release.

## Official data recovery status (RC4)

- `npm run recover:offline-safe` applies the official week-number calendar to cached 4A/4B/5B rotation matrices, rebuilds the clearly marked local recovery snapshot for the currently published Pediatrics/Clinical Psychology 1–2 course rules, and refreshes the per-group coverage audit. This is for local review only; it does not pass the production gate.
- `npm run sync:official` is the production synchronization path. It must run with network access, fetch current official PDFs, record content hashes, build all snapshots and pass `scripts/validate_production_release.py`. Do not replace it with the offline command for deployment.
- Current hard blockers: official PDF raw-byte SHA-256 and checkedAt missing in this runtime; course 2 Flow B practice remains a partial 12-event cache (official PDF has groups 217–229); course 5 Flow A has no parsed event assignments; course 6 practice is quarantined due a corrupt local text layer; Pediatrics/Clinical Psychology rules are recovery-only. `version.json` remains `BLOCKED_FOR_PRODUCTION_UNTIL_LIVE_SYNC_GATE_PASSES`.
- The 2026/2027 week calendar has been reviewed in official PDF text, but the raw PDF bytes could not be downloaded in this runtime. It includes a source anomaly `31.12.2027` inside the 2026/2027 calendar. This anomaly is preserved, not silently corrected.
- The recovered weekly rotation mapping preserves `matrixWeekNumber` and maps it directly to `calendarWeekNumber = matrixWeekNumber` (offset 0). The official PDF preview shows a single date label `03.09.2025` under matrix week 1 (inside official calendar week 1, `2026-09-01`–`2026-09-05`) and `07.09.2025–12.09.2025` under matrix week 2 (official calendar week 2, `2026-09-07`–`2026-09-12`). The 2025 date labels are quarantined; no weekday or actual lesson date is inferred from a matrix column. The production gate enforces this direct mapping and exact official calendar ranges.

## Full project package (2026-10-11)

This archive contains the complete current project tree, generated `dist`, schedule data, tests, fixtures, workflows and audit reports. See [`PACKAGE_STATUS_2026-10-11.md`](PACKAGE_STATUS_2026-10-11.md) for the latest package scope and exact production blockers. `npm run qa` passed locally, but the build is not minified in this runtime and official live-sync/SHA-256 verification has not passed; the project remains `BLOCKED_FOR_PRODUCTION` until the live release gate is zero.
