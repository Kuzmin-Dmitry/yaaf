# T5 — Manual verification on a live test issue

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Size:** S (~30m)
**Blocks:** —
**Blocked by:** T2, T3, T4

---

## Context

Автотесты (T4) покрывают логику через mock. Эта задача — финальная проверка на реальном GitHub-репозитории, что в момент transition **не возникает наблюдаемого окна** без `status:*` лейбла.

Запуск Symphony полезен как независимый наблюдатель: если окно есть, Symphony в этот момент может увидеть issue в unknown state и залогировать `[dispatcher] No workflow for state "..."`.

## Prerequisites

- `.env` с валидным `GITHUB_TOKEN` (scope: `repo`).
- Тестовый репозиторий, указанный в `config/projects.json`. Подойдёт основной `yaaf` (project alias `yaaf`/`factory`/`фабрика`), или создай тестовый fork — на усмотрение.
- Веб-доступ к GitHub (чтобы наблюдать лейблы через UI или `gh`).

## Scope

Только ручной прогон и фиксация результата. Никаких изменений кода.

## Steps

1. **Подготовить test issue.** Открой или создай issue в тестовом репо. Поставь на него лейбл `status:backlog` вручную (через UI или `gh issue edit <n> --add-label "status:backlog"`). Для чистоты теста добавь второй лейбл, не-status: например `type:chore`.

2. **Зафиксировать номер issue:** `ISSUE=<n>`.

3. **Запустить Symphony в фоне** (опционально, но желательно — он станет независимым наблюдателем окна без status-лейбла):
   ```bash
   npm run symphony &
   SYMPHONY_PID=$!
   ```
   Заметка: `npm run symphony` может быть сломан из-за отсутствующего `symphony/index.js` (CRITICAL #1 ревью). Если падает — пропусти этот шаг, верификацию сделай только через UI наблюдение, и зафиксируй это в отчёте.

4. **Запустить approveTask вручную.** Проще всего — через короткий скрипт:
   ```bash
   node -e "
     require('./lobster/lib/load-dotenv');
     const { approveTask } = require('./lobster/lib/tasks/approve-task');
     const { createGitHubTracker } = require('./lobster/lib/github/tracker-adapter');
     const tracker = createGitHubTracker({ token: process.env.GITHUB_TOKEN, owner: 'Kuzmin-Dmitry', repo: 'yaaf' });
     approveTask({ issue_id: process.env.ISSUE }, { tracker }).then(r => console.log(JSON.stringify(r, null, 2)));
   "
   ```
   Подставь свои `owner`/`repo`, если отличаются.

5. **Наблюдать.**
   - Во время выполнения (держи UI GitHub Issues открытым, `F5` агрессивно, или используй `gh issue view $ISSUE --json labels --jq '.labels'` в цикле с минимальной задержкой) — на issue **должен быть виден ровно один `status:*` лейбл** всё время. Переход: `status:backlog` → `status:ready` без промежутка.
   - Не-status лейбл `type:chore` должен сохраниться.
   - После команды `approveTask` вернёт `{ type: 'Ready', task: { ..., previousState: 'Backlog', newState: 'Ready' } }`.

6. **Если Symphony запущен в фоне:** просмотреть его stdout. В логах **не** должно быть строк вида `[dispatcher] No workflow for state "unknown"` в момент transition. Если такие строки есть — это регресс, зафиксируй и верни таск на доработку T2.

7. **Error path (опционально, но желательно):** отозови токен или временно подставь битый `GITHUB_TOKEN`, повтори шаг 4 на другом issue в состоянии `status:draft`. Ожидание: ответ `{ type: 'Rejected', reason: 'transition_failed', details: <...> }`. Issue остаётся с `status:draft` без изменений.

8. **Остановить Symphony:** `kill $SYMPHONY_PID` (если запускал).

9. **Очистить test issue:** вернуть лейбл в исходное состояние (или оставить, если тестовый репо).

## Deliverable

Короткий отчёт в том же каталоге, `docs/features/tasks/T5-verification-<YYYYMMDD>.md`, формата:

```md
# T5 verification — <date>

- Issue: <owner>/<repo>#<n>
- Transition tested: Backlog → Ready (S1 equivalent)
- Observed labels pre: [...]
- Observed labels post: [...]
- Window without status:* observed? Yes/No — <evidence: UI refresh count / gh polling count / Symphony logs>
- Error path tested: Yes/No — <result>
- Symphony behavior: <ok / skipped / anomaly>
- Conclusion: pass / fail / needs follow-up
```

## Acceptance Criteria

- [ ] Transition выполнен на реальном issue.
- [ ] В процессе transition лейбл `status:*` не пропадал (по свидетельству UI или `gh`-поллинга).
- [ ] Не-status лейблы сохранены.
- [ ] Error path проверен хотя бы через один негативный прогон.
- [ ] Отчёт `T5-verification-<date>.md` закоммичен.

## Non-goals

- Load-testing / нагрузочные прогоны.
- Тестирование race с ручной правкой лейблов через UI в момент transition — это сознательно out of scope фичи (см. Risks в `atomic-approval-transitions.md`).

## Escalation

Если на шаге 5 видно хотя бы один момент без `status:*` лейбла — фича **не** считается выполненной. Возвращай задачу в T2/T3 с приложенным скриншотом/логом.
