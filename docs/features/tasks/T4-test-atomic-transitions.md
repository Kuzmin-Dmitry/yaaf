# T4 — Cover atomic transitions in `tracker-adapter.test.js`

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Size:** M (~3h)
**Blocks:** T5
**Blocked by:** T1, T2, T3

---

## Context

`test/github/tracker-adapter.test.js` уже существует, но **не запускается** в `npm test` (см. CRITICAL #2 ревью: файл не перечислен в `package.json:7`). В рамках этого таска его нужно расширить 4 сценариями и убедиться, что он стабильно проходит при запуске напрямую `node test/github/tracker-adapter.test.js`.

Тесты — zero external deps, assert-based, паттерн как в `test/tasks/*.test.js`.

## Objective

Добавить 4 сценария, покрывающих новую атомарную семантику `approveIssue` и структурированный error flow из T1–T3.

## Scope

**Менять только:**

- `test/github/tracker-adapter.test.js` — расширить.
- (Опционально) `package.json` — добавить файл в `test` script. Если делаешь — отдельным коммитом внутри этого PR и с заметкой «unblocks CI for orphan test».

Не трогать: prod-код, другие тесты.

## Requirements

### Существующий стиль

Открой файл и посмотри структуру: inline mock HTTP-клиента, счётчики вызовов, `assert.strictEqual` / `assert.deepStrictEqual`. Повторяй этот стиль — не вводи moka, tap, jest.

### Mock HTTP-клиента

Тебе нужен мок с двумя возможностями:

1. Возвращать фиксированное состояние `getIssue` (labels, title).
2. Подсчитывать вызовы `setLabels` и ловить их аргументы (для проверки отправленного набора лейблов).
3. Опционально — падать на `setLabels` для error-сценария.

Если в файле уже есть mock-фабрика — переиспользуй. Если нет — сделай маленькую локальную в верхней части файла.

### Сценарии

**S1. Happy path Draft → Backlog**

Setup: issue с labels `['status:draft', 'type:bug']`. Вызов `tracker.approveIssue('42')`.

Ожидания:
- `client.setLabels` вызван ровно 1 раз.
- Аргументы: `(owner, repo, '42', arr)` где `arr` = любой порядок `['type:bug', 'status:backlog']`. Сравнивать через `Set` эквивалентность, не строгий порядок.
- `client.removeLabel` и `client.addLabels` **не** вызваны.
- Возврат: `{ id: '42', title: <from mock>, previousState: 'Draft', newState: 'Backlog' }`.

**S2. Happy path Backlog → Ready с несколькими не-status лейблами**

Setup: issue с labels `['status:backlog', 'type:feature', 'reviewed:architecture', 'priority:p1']`.

Ожидания:
- `setLabels` получает в точности `{type:feature, reviewed:architecture, priority:p1, status:ready}` (как `Set`).
- Нет потери не-status лейблов.
- `previousState === 'Backlog'`, `newState === 'Ready'`.

**S3. Idempotency: issue без status-лейбла**

Setup: labels `['type:bug']` — issue в состоянии без `status:*`. Вызов `approveIssue('42')`.

Ожидания: `approveIssue` бросает ошибку на guard'е `APPROVAL_TRANSITIONS[currentState]` (см. `tracker-adapter.js:175-178`), потому что `mapIssueState` вернёт дефолтное состояние, у которого нет валидного transition. `setLabels` **не** должен быть вызван.

Уточни поведение `mapIssueState` при пустом status-наборе — возможно вернёт `'Draft'` по умолчанию, тогда transition валидный. Тест должен верифицировать **актуальное** поведение, не желаемое. Если `mapIssueState` возвращает `'Draft'` → тест становится позитивным «`setLabels` вызван с добавлением `status:backlog`». Если что-то другое и transition невалидный — assert на throw. Прочитай `mapIssueState` и зафиксируй — **не меняй его в этом таске**.

**S4. Error path: `setLabels` падает**

Setup: issue с labels `['status:draft']`, mock `setLabels` бросает `new Error('500 Internal Server Error')`.

Ожидания:
- `approveIssue` бросает `TrackerError` (проверить `err instanceof TrackerError` и `err.code === 'transition_failed'`).
- `err.cause` указывает на исходную ошибку (`err.cause.message === '500 Internal Server Error'`).
- `client.removeLabel` и `client.addLabels` не вызваны (ничего не осталось в «полуприменённом» состоянии, потому что метод один).

### Дополнительно

- Все новые сценарии — в том же файле, отдельные функции `testXxx()`, вызываемые из нижнего `runTests()` / `main()` блока (как в существующем файле).
- Каждый тест печатает `console.log('Test: ...')` в начале — стиль репо.
- В конце файла — сводка `console.log('All tracker-adapter tests passed.')` если уже есть — не дублируй.

## Non-goals

- Не писать тесты на `setLabels` сам по себе — это метод `client.js`, его тестирование — отдельный таск при необходимости (не запланирован в этой фиче). Мы тестируем его только через `tracker-adapter`.
- Не менять prod-код. Если тест вскрывает баг в T1–T3 — зафиксируй findings и попроси пересмотреть предыдущие таски, не чини здесь.

## Acceptance Criteria

- [ ] В `test/github/tracker-adapter.test.js` есть 4 новых тест-функции, покрывающие S1–S4.
- [ ] Все 4 сценария проходят: `node test/github/tracker-adapter.test.js` завершается с exit 0.
- [ ] Mock `setLabels` проверяет набор лейблов через Set-эквивалентность, а не строгий порядок.
- [ ] В S4 проверяется `err instanceof TrackerError`, `err.code`, `err.cause`.
- [ ] Никаких изменений prod-кода в этом PR.
- [ ] Регресс: `node test/tasks/approve-task.test.js` проходит.

## Technical notes

- Для сравнения массивов как set'ов: `assert.deepStrictEqual([...set].sort(), [...expected].sort())` или `assert.strictEqual(set.size, expected.size) && [...expected].every(x => set.has(x))`.
- `TrackerError` импортируется так же, как в `approve-task.js` (см. T3): `const { TrackerError } = require('../../lobster/lib/github/tracker-adapter')`. Проверь относительный путь из `test/github/`.
- В моке `getIssue` должен вернуть форму, совместимую с `tracker-adapter.js:168-172`: `{ number, title, state, labels: [{ name }] }`. Если в существующем файле уже есть фабрика такого mock'а — переиспользуй.

## Definition of Done

```bash
# 1. Новый tracker-adapter.test.js зелёный:
node test/github/tracker-adapter.test.js

# 2. Регресс:
node test/tasks/approve-task.test.js

# 3. Если решили включить файл в npm test — проверка, что package.json парсится:
node -e "require('./package.json')"
```

## Out of scope

- Ручная проверка на живом issue — **T5**.
- Фикс `npm test` в целом (удаление отсутствующих файлов из скрипта) — отдельная фича (CRITICAL #2 ревью).
