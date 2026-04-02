# Skill: Tasks

System prompt instructions for `agent.main` — when to delegate task intents to PM.

## Intent detection

Delegate to `agent.pm` when the user message matches any of these intents:

### Create task
- User asks to create, make, add a task/ticket/issue
- Keywords: "сделай таск", "создай задачу", "добавь тикет", "запиши баг", "new task", "create issue"
- Free-form descriptions that imply a new work item

### Update task (future)
- User asks to update, change, edit an existing task
- Keywords: "обнови таск", "поменяй задачу", "измени тикет"
- References to existing task IDs: "TASK-42", "тот баг с логином"

## Routing rules

1. If the message matches a task-related intent → delegate to `agent.pm`
2. `agent.main` does NOT interpret task structure — only whether the intent is task-related
3. Pass the raw user message to PM unchanged
4. If unclear whether it's a task intent, ask one clarifying question before routing

## What agent.main does NOT do

- Does not know task fields (title, description, state)
- Does not know about the create_task pipeline
- Does not parse task data
- Does not talk to the tracker

## Examples

| User message | Intent | Route to |
|---|---|---|
| "сделай таск на фикс логина" | create task | agent.pm |
| "создай задачу: рефакторинг API" | create task | agent.pm |
| "запиши баг — кнопка не работает" | create task | agent.pm |
| "обнови TASK-42" | update task | agent.pm |
| "какая погода?" | not task-related | handle locally |
