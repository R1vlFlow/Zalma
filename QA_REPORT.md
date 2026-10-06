# Almazov Schedule Hub 2.3.0 — Production QA

Дата финальной проверки: 2026-10-06

## Исправления и hardening

- Event-first отображение расписания вместо большой пустой time-grid.
- HTML adapter реконструирует `rowspan`/`colspan` до semantic extraction и поддерживает две распространённые ориентации таблиц.
- XLSX adapter расширяет merged cells, поддерживает group-per-row и group-per-column схемы, диапазоны и несколько групп в одной ячейке.
- PDF adapter использует координаты колонок, проверяет специальность документа и не превращает номер аудитории вроде `2.11` в дату.
- Strict group/stream isolation: stream-specific `ALL` события не утекут в другой поток, пустая группа не считается общей.
- Дедупликация не зависит от source `id`; `1/2` и `2/2` не схлопываются.
- `1/2` и `2/2` не интерпретируются как номера недель.
- Нормализация групп поддерживает `101-103`, `101П 102П 103П`, разделители и диапазоны.
- Static snapshot fallback использует относительные URL и поэтому работает в GitHub Pages project-site path.
- Service worker не применяет cache-first к API: API работает network-first с fallback на последний ответ; static assets работают cache-first.
- CSP переведён на same-origin external scripts; FOUC-safe theme boot вынесен в `boot.js`.
- API имеет rate limits, body-size guard, CSP/security headers и method guards.
- Синхронизация snapshots принудительно обновляет источники и атомарно пишет только непустой валидный результат; пустой published course делает sync job failed и не должен публиковаться.
- Все 18 комбинаций программа/курс присутствуют в каталоге и server source registry; для ещё не опубликованных курсов используются явные `unpublished` descriptors без выдуманных событий.
- GitHub Pages workflow выполняет `npm install` → `npm run sync` → `npm run qa` → deploy `dist/`; schedule запускается каждые 6 часов.

## Тесты

Команда: `npm run qa`

Результат: **PASS**

- TypeScript strict typecheck: PASS
- Build: PASS
- Distribution validation: PASS
- Relative JS-import integrity: PASS
- Project-level validation: PASS
- Node syntax checks: PASS
- Parser/domain tests: **21/21 PASS**
- HTML rowspan/colspan fixtures: PASS
- HTML row-group orientation: PASS
- PDF coordinate fixture: PASS
- XLSX merge fixture: PASS
- Stream isolation: PASS
- Exact group isolation: PASS
- Semantic dedupe: PASS
- 1/2 vs 2/2: PASS
- No invented date: PASS
- GitHub Pages static snapshot fallback: PASS
- Source-format detection: PASS
- 10,000-event filter stress test: PASS
- 18 program/course catalog matrix: PASS
- HTTP runtime smoke: PASS

## Runtime smoke

Локально запущен Node HTTP server и проверены:

- `GET /api/health` → 200
- `GET /api/schedule?program=31.05.01&course=1` → 200
- неверные параметры расписания → 400
- недопустимый HTTP method для health → 405
- CSP и `nosniff` headers → PASS
- корневой static asset → 200

Полный Chromium E2E в текущем sandbox не засчитан как PASS: headless Chromium нестабилен в предоставленной среде (zygote/DBus termination). Для production рекомендуется выполнить реальный Playwright smoke job на GitHub runner после push.

## Проверка официальной синхронизации

`npm run sync` в этой среде был запущен отдельно. Он завершился без публикации новых snapshots, потому что контейнер не имеет DNS-доступа к внешним источникам (`raw.githubusercontent.com` и внешние URL не разрешаются). Это ограничение среды выполнения, а не parser/test failure. Важная защита синхронизатора при этом подтверждена: при ошибке источника существующий валидный snapshot не заменяется пустым или повреждённым файлом, а job возвращает ненулевой exit code для ожидаемого опубликованного курса.

## Источники

Текущая официальная страница кабинета студентов содержит отдельные контуры Лечебного дела, Педиатрии и Клинической психологии. Для Педиатрии и Клинической психологии на опубликованной странице сейчас доступны расписательные документы 1–2 курсов; для Лечебного дела — 1–6. Поэтому selector содержит 1–6 для всех трёх программ, но курсы без официально опубликованного расписания остаются в состоянии `unpublished` и не заполняются вымышленными событиями.

## Dependencies

В архив не включён `node_modules/`. `package-lock.json` не добавлен, потому что среда проверки не имела доступа к npm registry для получения точных `resolved/integrity` полей; попытка `npm install --package-lock-only` завершилась timeout. Репозиторий намеренно использует `npm install` в GitHub Actions. После загрузки в GitHub зависимости устанавливаются штатно с публичного npm registry.

## GitHub

Архив можно распаковать в новый repository. После push workflow выполняет сборку и QA. Для GitHub Pages достаточно включить Pages через Actions; `pages.yml` уже присутствует. Для full-stack запуска используйте `npm start` или Docker Compose с опциональным Redis.
