# T1 — Add `setLabels` method to GitHub client

**Parent feature:** [`../atomic-approval-transitions.md`](../atomic-approval-transitions.md)
**Size:** S (~1h)
**Blocks:** T2, T4
**Blocked by:** —

---

## Context

`lobster/lib/github/client.js` — тонкая обёртка над GitHub REST, без внешних зависимостей. Сейчас там есть `addLabels(owner, repo, issueId, labelNames)` и `removeLabel(owner, repo, issueId, labelName)`, которые делают `POST /labels` и `DELETE /labels/{name}` соответственно. Для атомарного swap статусного лейбла нужен **replace-all** вариант: `PUT /repos/{owner}/{repo}/issues/{issue_number}/labels` с телом `{"labels": [...]}` — он полностью заменяет набор лейблов на issue одним вызовом.

## Objective

Добавить в `client.js` метод `setLabels(owner, repo, issueId, labelNames)`, который дергает `PUT /repos/{owner}/{repo}/issues/{issue_number}/labels` и возвращает parsed JSON с актуальным списком лейблов.

## Scope

**Менять только:** `lobster/lib/github/client.js`.

Не трогать: `tracker-adapter.js`, `symphony-adapter.js`, тесты — это T2/T3/T4.

## Requirements

1. Сигнатура: `async setLabels(owner, repo, issueId, labelNames)`.
2. `labelNames` — массив строк. Если пустой — отправляется `{"labels": []}` (это валидный запрос к GitHub и он снимает все лейблы; поведение задокументировать JSDoc-комментарием).
3. Возвращает `Promise<Array<{ name: string, ... }>>` — распарсенный JSON-ответ GitHub.
4. Запрос формируется в том же стиле, что и остальные мутирующие методы в этом файле: тот же authz-header (`Authorization: Bearer ...`), `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent`.
5. HTTP-ошибки (не-2xx) пробрасываются как `Error` с телом ответа — по тому же паттерну, что используют `addLabels`/`removeLabel`. **Не глотать ошибки** и **не ретраить** — ретраи это отдельная фича (HIGH #9 из ревью).
6. JSDoc-комментарий в стиле соседних методов: описание, `@param`, `@returns`, одно предложение о семантике replace-all.

## Non-goals

- Не реализовывать optimistic concurrency (`If-Match` / eTag).
- Не добавлять retry/backoff.
- Не менять остальные методы `client.js`.

## Acceptance Criteria

- [ ] В `lobster/lib/github/client.js` появился `async setLabels(owner, repo, issueId, labelNames)`, экспортированный из объекта, возвращаемого `createGitHubClient`.
- [ ] Метод делает ровно один HTTP-запрос: `PUT /repos/{owner}/{repo}/issues/{issueId}/labels` с body `JSON.stringify({ labels: labelNames })`.
- [ ] JSDoc над методом явно упоминает: «Replaces the full label set on the issue. Pass the complete desired label list, not a delta».
- [ ] Код проходит линтер / встроенные проверки Node без warning'ов.
- [ ] Smoke: вручную проверено, что `require('./lobster/lib/github/client').createGitHubClient({ token: '...' }).setLabels` — функция (без реального вызова к GitHub).

## Technical notes

- Существующие методы — ориентир по стилю. Открой `client.js`, найди `addLabels`, `removeLabel`, скопируй request-helper, поменяй метод на `PUT` и путь.
- Тело запроса — `JSON.stringify({ labels: labelNames })`. Не забудь `Content-Type: application/json` и `Content-Length` (если helper их не ставит автоматически).
- GitHub возвращает 200 OK с телом = актуальным массивом label-объектов.

## Definition of Done

```bash
# 1. Файл собирается (нет синтаксических ошибок):
node -e "require('./lobster/lib/github/client')"

# 2. Метод экспортирован:
node -e "const {createGitHubClient}=require('./lobster/lib/github/client'); const c=createGitHubClient({token:'x'}); if(typeof c.setLabels!=='function'){process.exit(1)}"

# 3. Регресс по тестам, которые уже есть и которые запустимы (T4 добавит специфичные для setLabels):
node test/tasks/approve-task.test.js
```

## Out of scope for this task

- Использование нового метода в `tracker-adapter.js` — это **T2**.
- Тесты на `setLabels` — это **T4**.
