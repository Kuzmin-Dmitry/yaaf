# Архитектура YAAF: Уровень C1 (Контейнеры)

Эта диаграмма детализирует основные контейнеры внутри системы YAAF и их взаимодействие.

```mermaid
graph TB
    subgraph GitHub_Storage [GitHub System]
        Issues[(GitHub Issues - State Store)]
        Repos[(GitHub Repos - Codebase)]
    end

    subgraph YAAF_Containers [YAAF System]
        Symphony[Symphony Orchestrator: Node.js Daemon]
        Lobster[Lobster Pipeline Engine: Node.js CLI]
    end

    OpenClaw[LLM Gateway / OpenClaw]

    Symphony -- "1. Poll issues (Labels/Status)" --> Issues
    Symphony -- "2. Dispatch Workflow" --> Lobster
    
    Lobster -- "3. Fetch context/docs" --> Repos
    Lobster -- "4. Generate response" --> OpenClaw
    Lobster -- "5. Update Issue (Labels/Body/Comments)" --> Issues

    OpenClaw -- "Response" --> Lobster
```

### Контейнеры
*   **Symphony**: Постоянно работающий демон, который следит за изменениями меток (labels) в GitHub и запускает нужные процессы.
*   **Lobster**: CLI-инструмент для выполнения детерминированных шагов (LLM-запросы, чтение доков, обновление GitHub).
*   **GitHub (State Store)**: Используется как база данных состояния через механизм меток (Labels).
*   **OpenClaw**: Унифицированный шлюз для доступа к агентам и LLM.
