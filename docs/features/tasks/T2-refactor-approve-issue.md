# T2 — Refactor `approveIssue` to single-call label replace

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Size:** M (~2h)
**Blocks:** T3, T4, T5
**Blocked by:** T1

---

## Context

`lobster/lib/github/tracker-adapter.js#approveIssue` (lines 158–189) выполняет approval transition двумя REST-вызовами:

```js
// lines 183-186
if (labelNames.includes(oldLabel)) {
  await client.removeLabel(owner, repo, issueId, oldLabel);
}
await client.addLabels(owner, repo, issueId, [newLabel]);
```

Между ними issue остаётся без `status:*` лейбла. В этот момент Symphony-поллер (`symphony/dispatcher.js`) может увидеть issue в «unknown» state. Это CRITICAL #3 из ревью 2026-04-23.

После T1 в `client.js` доступен `setLabels(owner, repo, issueId, labelNames)` — replace-all за один `PUT`.

## Objective

Заменить пару `removeLabel` + `addLabels` одним вызовом `setLabels` с корректно вычисленным набором лейблов. Сохранить **все неstatus-лейблы** issue (`type:bug`, `reviewed:architecture`, кастомные и т.п.).

## Scope

**Менять только:** `lobster/lib/github/tracker-adapter.js`.

Не трогать: `client.js` (готов в T1), `approve-task.js`, `symphony-adapter.js`, тесты (это T4).

## Requirements

1. Внутри `approveIssue` вычислить итоговый набор лейблов:
   ```
   nextLabels = labelNames.filter(l => !isStatusLabel(l)).concat([newLabel])
   ```
2. Определить локальный хелпер `isStatusLabel(name)`:
   ```js
   const isStatusLabel = (name) => typeof name === 'string' && name.startsWith('status:');
   ```
   — **локальная** функция в области видимости `approveIssue` (или наверху модуля). Не экспортировать. `STATE_LABELS` — источник истины, но фильтрация по префиксу устойчивее к появлению новых состояний.
3. Вызвать `await client.setLabels(owner, repo, issueId, nextLabels)` ровно один раз.
4. Удалить старые строки с `client.removeLabel` и `client.addLabels` из тела `approveIssue`.
5. Сохранить всё, что сверху по функции:
   - guard `APPROVAL_TRANSITIONS[currentState]` (lines 175–178) — не трогать.
   - Нормализация `knownIssue` vs fetch через `client.getIssue` (lines 162–173) — не трогать.
6. Возвращаемое значение остаётся прежним: `{ id, title, previousState: currentState, newState: nextState }`.

## Non-goals

- Не добавлять try/catch вокруг `setLabels` в рамках этого таска (это **T3**).
- Не менять сигнатуру `approveIssue`.
- Не менять `approve-task.js`.

## Acceptance Criteria

- [ ] `approveIssue` делает **ровно один** mutating-вызов на GitHub API — `client.setLabels(...)`. Grep: `grep -n "client\.(addLabels\|removeLabel)" lobster/lib/github/tracker-adapter.js` внутри функции `approveIssue` — пусто (другие функции файла могут использовать — они вне скоупа).
- [ ] Итоговый набор лейблов, передаваемый в `setLabels`: все лейблы issue **кроме** начинающихся с `status:`, плюс новый `STATE_LABELS[nextState]`.
- [ ] `isStatusLabel` — приватный хелпер, не экспортирован из модуля (проверить `module.exports` в конце файла — не должен измениться).
- [ ] Контракт возврата сохранён: тест `approve-task.test.js` проходит без изменений самих тестов.
- [ ] Нет изменений в `client.js`, `approve-task.js`, `symphony-adapter.js`.

## Technical notes

- Если на issue **не было** `oldLabel` (вообще не был в `status:*`), всё равно отрабатываем: фильтр статусных лейблов даст пустое множество status-лейблов, к нему добавим `newLabel` — issue получит правильный статус. Это слегка расширяет семантику (старая версия могла оставлять issue без статуса, если `oldLabel` отсутствовал — странный кейс, но реальный после ручной правки). Документировать в JSDoc одной строкой: «Idempotent w.r.t. pre-existing status label set: target state is asserted unconditionally.»
- `labelNames` берётся из `raw.labels.map(l => l.name)` при fetch-ветке и из `knownIssue.labels` при prefetched-ветке. Проверь: в `knownIssue.labels` уже ожидаются **строки**, не объекты (см. line 166 и JSDoc на 152–156). Если кто-то передаст объекты — упадёт на `.startsWith`. Достаточный защитный код: `typeof name === 'string'` в `isStatusLabel` (уже учтено выше).

## Example diff sketch (non-binding)

```diff
-    if (labelNames.includes(oldLabel)) {
-      await client.removeLabel(owner, repo, issueId, oldLabel);
-    }
-    await client.addLabels(owner, repo, issueId, [newLabel]);
+    const isStatusLabel = (name) => typeof name === 'string' && name.startsWith('status:');
+    const nextLabels = labelNames.filter((l) => !isStatusLabel(l)).concat([newLabel]);
+    await client.setLabels(owner, repo, issueId, nextLabels);
```

Объявление `isStatusLabel` можно поднять к началу функции или модуля — на усмотрение, лишь бы не экспортировалось.

## Definition of Done

```bash
# 1. Синтаксис:
node -e "require('./lobster/lib/github/tracker-adapter')"

# 2. Регресс по существующему pipeline-тесту:
node test/tasks/approve-task.test.js

# 3. Ручной grep-чек (должен быть пусто):
#    внутри функции approveIssue не должно остаться addLabels/removeLabel
```

## Out of scope

- Обёртка ошибок в структурированный `TrackerError` — **T3**.
- Новые тесты под replace-all семантику — **T4**.
- Починка `npm test` для запуска `test/github/tracker-adapter.test.js` — этот файл уже существует, но не в `npm test` (CRITICAL #2 ревью). Если хочешь — добавь одной строкой в PR T4, но не здесь.
