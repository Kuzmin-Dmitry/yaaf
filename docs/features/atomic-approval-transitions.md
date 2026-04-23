# Feature: Atomic approval transitions

**Type:** feature
**Priority:** P0 (critical)
**Source:** Code review 2026-04-23, CRITICAL #3 (see `docs/code-review-2026-04-23.md`)
**Area:** `lobster/lib/github/tracker-adapter.js`
**Status:** proposed

---

## Context

Статус задачи в YAAF хранится как GitHub-лейбл вида `status:draft` / `status:backlog` / `status:ready` / `status:in-progress` / `status:in-review` / `status:done`. GitHub-лейбл **и есть** state store — никакой отдельной БД нет (`lobster/lib/tasks/model.js:19-26`).

Текущая реализация перехода состояний в `tracker-adapter.js#approveIssue` (lines 183–186) выполняется двумя последовательными REST-вызовами:

```js
if (labelNames.includes(oldLabel)) {
  await client.removeLabel(owner, repo, issueId, oldLabel);
}
await client.addLabels(owner, repo, issueId, [newLabel]);
```

Между двумя вызовами есть окно, в котором issue не имеет ни одного `status:*` лейбла.

## Objective

Сделать approval transition **атомарным** с точки зрения наблюдаемого состояния: у issue в любой момент должен быть ровно один `status:*` лейбл — либо старый, либо новый, но не ноль и не оба.

## Requirements / Proposed Solution

### Design options

| # | Подход | Плюсы | Минусы |
|---|--------|-------|--------|
| A | `PUT /repos/{o}/{r}/issues/{n}/labels` с полным набором лейблов (status-новый + все неstatus-лейблы исходного issue) | Один API-вызов, настоящая атомарность на стороне GitHub | Требует знать полный текущий список лейблов issue; гонка с параллельными мутациями лейблов от других процессов |
| B | Сохранить два вызова, но добавить rollback: если `addLabels` упал — восстановить старый лейбл через `addLabels([oldLabel])` | Минимум диффа | Rollback сам может упасть; логически не атомарно, только self-healing |
| C | Добавить новый лейбл **первым**, затем удалить старый | Issue никогда не остаётся без `status:*` | Промежуточное состояние с **двумя** `status:*` лейблами; `mapIssueState` должен корректно резолвить такое |

**Выбранный подход: A** — настоящая атомарность через `PUT /labels`. B принят как резервный сценарий, если единичный тест покажет неприемлемую сложность захвата текущих лейблов.

### Scope of changes

1. **`lobster/lib/github/client.js`**
   - Добавить `setLabels(owner, repo, issueId, labelNames)` — обёртка над `PUT /repos/{owner}/{repo}/issues/{n}/labels` с body `{ labels: [...] }`.
   - Сохранить существующие `addLabels` / `removeLabel` (используются вне approval transition).

2. **`lobster/lib/github/tracker-adapter.js#approveIssue`** (lines 158–189)
   - Заменить пару `removeLabel` + `addLabels` одним вызовом `client.setLabels(owner, repo, issueId, nextLabels)`, где `nextLabels = labelNames.filter(l => !isStatusLabel(l)).concat([newLabel])`.
   - Определить локально хелпер `isStatusLabel(name)` = `name.startsWith('status:')` (не вводить новый публичный API).
   - Сохранить текущий возвращаемый контракт: `{ id, title, previousState, newState }`.

3. **`lobster/lib/github/tracker-adapter.js#approveIssue` error handling** (покрывает HIGH #5 из ревью для этой ветки)
   - Ловить ошибки `client.setLabels` и выбрасывать структурированный `TrackerError` с полями `{ code: 'transition_failed', cause }`. Вызывающая сторона (`approve-task.js`) уже умеет транслировать это в `RESULT_TYPES.Rejected`.

4. **Тесты**
   - Новый `test/github/tracker-adapter.test.js` (файл уже есть, но не запускается из `npm test` — см. CRITICAL #2 ревью): расширить mock HTTP и покрыть:
     - Happy path: `Draft → Backlog` и `Backlog → Ready` одним `PUT`, который отправляет правильный набор лейблов (старый `status:*` отсутствует, новый `status:*` добавлен, прочие лейблы сохранены).
     - `setLabels` завершается с 5xx → `approveIssue` выбрасывает `TrackerError`, состояние issue на стороне mock не меняется.
     - Параллельная мутация (eTag-mismatch / 409 при будущем добавлении If-Match): корректная ошибка, без частичного обновления.
     - `knownIssue` с уже мутированными лейблами используется без дополнительного GET.

### Out of scope

- Защита от гонки с **другими** процессами, одновременно редактирующими лейблы того же issue. GitHub не даёт optimistic concurrency на /labels. Если возникнет симптом — выносим в отдельный P2: "lease on transition via issue comment marker".
- Подпись / tamper-proofing `partial_state` счётчиков (отдельная фича — см. HIGH #4 ревью).
- Retry/backoff на уровне `client.js` (отдельная фича — HIGH #9 ревью).

## Acceptance Criteria

- [ ] В `lobster/lib/github/client.js` экспортируется `setLabels(owner, repo, issueId, labelNames)`, бьющий `PUT /repos/{o}/{r}/issues/{n}/labels` с `{ labels }` в теле.
- [ ] `tracker-adapter.js#approveIssue` использует ровно один mutating-вызов на транзит (`setLabels`). `removeLabel` + `addLabels` из ветки approve удалены.
- [ ] Набор лейблов, уходящий в `setLabels`, = `(labelNames без status:*)` + `[newLabel]`. Все прочие лейблы (например, `type:bug`, `reviewed:architecture`) сохраняются.
- [ ] Падение `setLabels` не меняет состояние issue (верифицируется в mock-тесте счётчиком вызовов и финальным состоянием лейблов).
- [ ] Контракт возвращаемого значения `approveIssue` сохранён: `{ id, title, previousState, newState }`.
- [ ] `test/github/tracker-adapter.test.js` покрывает 4 сценария из раздела "Тесты" выше и выполняется через `node test/github/tracker-adapter.test.js` (файл должен стабильно проходить).
- [ ] `approve-task.test.js` по-прежнему проходит (регресс-проверка `approveIssue` на уровне pipeline).
- [ ] Проверено вручную на тестовом issue в `config/projects.json`-проекте: отсутствие окна без `status:*` лейбла при параллельном поллинге из Symphony (логи Symphony не содержат записей "No workflow for state 'unknown'" в момент транзита).

## Technical Notes

### GitHub API reference

- Endpoint: `PUT /repos/{owner}/{repo}/issues/{issue_number}/labels`
- Body: `{"labels": ["a", "b", "c"]}` — **заменяет** полный набор лейблов.
- Required auth: PAT с `repo` scope (у нас уже есть).
- Quotas: считается как одна mutating операция против rate-limit (то же, что и текущая пара вызовов, даже лучше).

### Affected code references

- `lobster/lib/github/tracker-adapter.js:183-186` — точка изменения.
- `lobster/lib/github/tracker-adapter.js:175-178` — существующий guard по `APPROVAL_TRANSITIONS`. Не трогаем.
- `lobster/lib/tasks/model.js:19-26` (`STATE_LABELS`) / `lobster/lib/tasks/model.js:31-34` (`APPROVAL_TRANSITIONS`) — источник истины, не меняется.
- `lobster/lib/tasks/approve-task.js:41, 54` — обрабатывает результат `approveIssue`; контракт сохранён.
- `test/github/tracker-adapter.test.js` — существующий файл тестов, который **не запускается** в `npm test` (см. CRITICAL #2 ревью). В рамках этой фичи допустимо сразу починить `package.json#scripts.test`, но как подзадачу в PR-описании, не расширяя AC.

### Risks

1. **Потеря лейблов при багe в фильтрации.** Если `isStatusLabel` пропустит лейбл вида `Status: Draft` (с пробелом/регистром), лейбл будет стёрт. Мы контролируем формат через `STATE_LABELS` (все начинаются с `status:` нижним регистром), но для защиты добавить точный `=== oldLabel` плюс prefix-check.
2. **Конкурентные ручные правки лейблов на issue.** Если кто-то из людей добавит лейбл между `fetchIssue` и `setLabels`, его правка будет перезаписана. Принимаемо: это зона ответственности автоматики, ручные правки через UI в процессе approval не предполагаются. Если понадобится — отдельный P2 (см. Out of scope).
3. **`client.setLabels` новый и непокрытый.** Требует минимум один test на уровне HTTP-мока, иначе риск замаскированного бага.

### Rollout

- Без миграции данных: existing issue state не требует переноса, лейблы те же.
- Без feature flag: изменение инвариантное, старые и новые транзиты наблюдаемо эквивалентны в успешных случаях.
- PR-границы: один PR, примерно 40 строк prod + 80 строк тестов.
- Откат: revert одного коммита; ничего на стороне GitHub не надо чинить.

## Related

- **Блокирует:** ничего.
- **Блокируется:** ничего.
- **Связано:** HIGH #4 (partial_state tamper-proofing), HIGH #5 (structured error wrapping в pipelines), HIGH #9 (retry/backoff для GitHub) — из того же review, но каждая — самостоятельная фича.
