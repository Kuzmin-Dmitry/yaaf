# T3 — Wrap transition failures in structured `TrackerError`

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Size:** S (~1h)
**Blocks:** T4, T5
**Blocked by:** T2

---

## Context

После T2 `approveIssue` делает один `await client.setLabels(...)`. Если он упадёт (network, 5xx, 403), сейчас сырой `Error` из `client.js` всплывёт в `approve-task.js` (`lobster/lib/tasks/approve-task.js:41, 54`), и оттуда — в caller pipeline. Это HIGH #5 из ревью для ветки approval: «raw errors leak into user-facing payloads».

Цель — не превращать это в большой рефакторинг. Локально, только для approval transition, обернуть ошибку в структурированный тип с полями `{ code, message, cause }`, который вызывающий pipeline уже сможет детерминированно транслировать в `RESULT_TYPES.Rejected`.

## Objective

1. Ввести лёгкий класс `TrackerError extends Error` с полями `code` и `cause`.
2. В `approveIssue` обернуть вызов `setLabels` в `try/catch`; при падении бросить `TrackerError` с `code: 'transition_failed'`.
3. `approve-task.js` — адаптировать обработку так, чтобы при `TrackerError` возвращать структурированный `Rejected`, а не пропускать raw exception наверх.

## Scope

**Менять только:**

- `lobster/lib/github/tracker-adapter.js` — добавить класс + обёртка в `approveIssue`.
- `lobster/lib/tasks/approve-task.js` — обработка `TrackerError` в `Rejected`.

Не трогать: `client.js`, `symphony-adapter.js`, остальные pipelines, тесты (они в T4).

## Requirements

### `tracker-adapter.js`

1. Добавить класс `TrackerError` в начало файла (после `require`'ов):
   ```js
   class TrackerError extends Error {
     constructor(code, message, cause) {
       super(message);
       this.name = 'TrackerError';
       this.code = code;
       if (cause !== undefined) this.cause = cause;
     }
   }
   ```
2. Экспортировать его из `module.exports` в конце файла (вместе с `createGitHubTracker`, `mapIssueState`, `resolveToken`).
3. В `approveIssue` обернуть `setLabels`:
   ```js
   try {
     await client.setLabels(owner, repo, issueId, nextLabels);
   } catch (e) {
     throw new TrackerError(
       'transition_failed',
       `Failed to transition issue #${issueId} from ${currentState} to ${nextState}: ${e.message}`,
       e
     );
   }
   ```
4. **Не оборачивать** существующие `getIssue`, `updateIssue`, `fetchIssue` в этом же таске — скоуп строго `approveIssue`. Их обёртка — тема следующей фичи (HIGH #5 из ревью целиком).

### `approve-task.js`

1. Импортировать `TrackerError` из `tracker-adapter`:
   ```js
   const { TrackerError } = require('../github/tracker-adapter');
   ```
   Если абсолютный путь в require'е отличается — подставить существующий стиль (текущий `approve-task.js` уже импортит что-то из `tracker-adapter`, смотри строку `require('...tracker-adapter')`; добавить второй импорт тем же путём).
2. Обернуть `await tracker.approveIssue(...)` в `try/catch`. На `TrackerError`:
   ```js
   return {
     type: RESULT_TYPES.Rejected,
     reason: 'transition_failed',
     details: err.message,
   };
   ```
   На любые другие `Error` — пока **пробрасывать дальше** (это тема HIGH #5 целиком, не расширять тут).
3. Убедиться, что existing happy-path ветка возвращает `{ type: RESULT_TYPES.Ready, task: { ... } }` без изменений.

## Non-goals

- Не оборачивать `fetchIssue`, `updateIssue`, не менять другие pipeline'ы (`review-task.js`, `publish-task.js`).
- Не вводить глобальный error middleware.
- Не логировать ошибку из `approveIssue` — это забота вызывающего слоя и Symphony.

## Acceptance Criteria

- [ ] `lobster/lib/github/tracker-adapter.js` экспортирует `TrackerError` (проверка: `node -e "console.log(!!require('./lobster/lib/github/tracker-adapter').TrackerError)"` → `true`).
- [ ] `TrackerError` instance имеет поля `code` (string), `message` (string), `cause` (Error|undefined), `name === 'TrackerError'`.
- [ ] `approveIssue` при падении `setLabels` бросает `TrackerError` с `code === 'transition_failed'`, а не сырой `Error`.
- [ ] `approveIssue` при падении на любом **другом** этапе (`getIssue`, валидация transition) бросает **не**-обёрнутую ошибку — этот таск их не трогает.
- [ ] `approve-task.js` при перехвате `TrackerError` возвращает `{ type: 'Rejected', reason: 'transition_failed', details: <string> }`. Не возвращает `Ready`, не падает.
- [ ] Регресс `test/tasks/approve-task.test.js` проходит.

## Technical notes

- `Error.cause` — стандартное поле с Node 16.9+. В `package.json` нет явного `engines`, но весь репо на современном Node (LTS). Использовать `cause` без опаски.
- `TrackerError` — **domain**-уровневый тип. Он не должен содержать HTTP-специфичные поля типа `status`. Если нужно — положи в `cause.message`.
- Название `code: 'transition_failed'` зафиксировано. Не используй `APPROVAL_FAILED`, `STATUS_UPDATE_ERROR` и т.п. — это расходится с конвенцией `snake_case` reason'ов в `RESULT_TYPES`.

## Definition of Done

```bash
# 1. Синтаксис обоих файлов:
node -e "require('./lobster/lib/github/tracker-adapter'); require('./lobster/lib/tasks/approve-task')"

# 2. Экспорт TrackerError:
node -e "const m=require('./lobster/lib/github/tracker-adapter'); if(!m.TrackerError||new m.TrackerError('x','y').code!=='x'){process.exit(1)}"

# 3. Регресс:
node test/tasks/approve-task.test.js
```

## Out of scope

- Тесты на структурированный error flow — **T4** (там новый тест: `setLabels` mock возвращает 500 → `approveIssue` бросает `TrackerError` → `approve-task.js` возвращает `Rejected`).
- Оборачивание остальных tracker-методов (`fetchIssue`, `updateIssue`) — отдельная фича на HIGH #5 целиком.
