# Feature decomposition: Atomic approval transitions

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Target role:** middle developer
**Total estimated effort:** ~1–1.5 dev-days

## Tasks

| ID | Title | Size | Blocked by |
|----|-------|------|------------|
| [T1](T1-add-setlabels-client.md) | Add `setLabels` method to GitHub client | S (~1h) | — |
| [T2](T2-refactor-approve-issue.md) | Refactor `approveIssue` to use single-call label replace | M (~2h) | T1 |
| [T3](T3-structured-transition-error.md) | Wrap transition failures in structured `TrackerError` | S (~1h) | T2 |
| [T4](T4-test-atomic-transitions.md) | Cover atomic transitions in `tracker-adapter.test.js` | M (~3h) | T1, T2, T3 |
| [T5](T5-manual-verification.md) | Manual verification on a live test issue | S (~30m) | T2, T3, T4 |

Рекомендуемый порядок: T1 → T2 → T3 → T4 → T5. T2 и T3 можно оформить одним PR; остальные — своими.

## Conventions for every task

- **Файлы меняются только те, что явно перечислены в таске.** Всё остальное — скоуп следующей фичи.
- **Контракт возвращаемого значения `approveIssue`** (`{ id, title, previousState, newState }`) — не меняется ни в одном таске.
- **Никакого `Promise.all`** вокруг mutating-вызовов к GitHub; только sequential await.
- **Никаких новых npm dependencies.** Stdlib only (`https`, `assert`, и т.п.). См. `package.json` — секция `dependencies` должна остаться отсутствующей.
- **CommonJS**, как везде в репо.

## Definition of Done (глобальное)

Каждый таск считается закрытым, когда:

1. Код соответствует AC таска.
2. Запуск релевантных тестов через `node <test-file>` проходит (см. DoD-блок в каждом таске).
3. `approve-task.test.js` (регресс) проходит: `node test/tasks/approve-task.test.js`.
4. Нет новых warning'ов в stderr при прогоне указанных тестов.
5. PR/коммит содержит ровно ту scope, что описана в таске — без «заодно почистил вот это».
