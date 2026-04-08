# Архитектура YAAF: Уровень C2 (Компоненты)

Эта диаграмма описывает внутренние компоненты контейнеров Symphony и Lobster.

```mermaid
graph TB
    subgraph Symphony_Components [Symphony Orchestrator]
        Tracker[Tracker: Поллинг GitHub API]
        Dispatcher[Dispatcher: Сопоставление Labels -> Workflow]
        ChildProc[Process Manager: Запуск Lobster]
        
        Tracker -- "Issue Status" --> Dispatcher
        Dispatcher -- "Workflow CLI Command" --> ChildProc
    end

    subgraph Lobster_Components [Lobster Pipeline Engine]
        WorkflowEngine[Workflow Engine: Парсер YAML]
        StepLibrary[Step Library: Модули шагов]
        RetryLib[Retry Library: Сетевая устойчивость]
        
        subgraph Steps [Библиотека шагов]
            LLMStep[llm-task.js]
            GHStep[update-issue.js]
            DocStep[get-project-docs.js]
        end
        
        WorkflowEngine -- "Run each step" --> StepLibrary
        StepLibrary -- "Use" --> Steps
        Steps -- "Network calls" --> RetryLib
    end

    ChildProc -- "Execute" --> WorkflowEngine
    Tracker -- "Polling HTTP" --> GitHub
    Steps -- "Mutate State" --> GitHub
    Steps -- "Prompt/Generate" --> OpenClaw

    GitHub[(GitHub REST API)]
    OpenClaw[LLM Gateway API]
```

### Компоненты Symphony
*   **Tracker**: Модуль, отвечающий за связь с GitHub API и определение текущего состояния задач.
*   **Dispatcher**: Логическое ядро, решающее, какой `.lobster` файл запустить для текущего состояния задачи.
*   **Process Manager**: Компонент для системного запуска Lobster как дочернего процесса.

### Компоненты Lobster
*   **Workflow Engine**: Парсит `.lobster` (YAML-подобные) файлы и управляет потоком данных между шагами через stdin/stdout.
*   **Step Library**: Набор атомарных функций (чтение доков, отправка промпта, обновление GitHub).
*   **Retry Library**: Общий компонент для обеспечения надежности сетевых запросов с экспоненциальной задержкой.
