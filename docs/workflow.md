# YAAF — Полный воркфлоу процессов

Эта диаграмма описывает жизненный цикл задачи (GitHub Issue) и взаимодействие Symphony с воркфлоу Lobster.

```mermaid
graph TD
    %% Элементы
    Start([User creates Issue]) --> LabelDraft[Label: draft]
    
    subgraph Symphony_Polling [Symphony Orchestrator]
        Poll{Poll GitHub}
    end

    subgraph Lobster_Workflows [Lobster Pipeline Engine]
        Review[issue-review.lobster]
        ApproveReq[get-user-approve.lobster]
        Decompose[decompose-issue.lobster]
        Rework[update-issue.lobster]
        Callback[user-approve-callback.lobster]
    end

    subgraph External [External Systems / HITL]
        Jarvis[Jarvis Agent / Telegram]
        UserChoice{User Decision}
    end

    %% Потоки
    LabelDraft --> Poll
    Poll -- "state: draft" --> Review
    Review -- "Update Label" --> LabelReviewed[Label: reviewed_by_pm]
    
    LabelReviewed --> Poll
    Poll -- "state: reviewed_by_pm" --> ApproveReq
    ApproveReq -- "Update Label" --> LabelAwait[Label: awaiting_user_approval]
    ApproveReq -- "Notify User" --> Jarvis
    
    Jarvis --> UserChoice
    UserChoice -- "Approve" --> Callback
    UserChoice -- "Reject" --> Callback
    
    Callback -- "If Approve" --> LabelApproved[Label: approved_after_pm]
    Callback -- "If Reject" --> LabelNeedsRework[Label: needs_rework_after_pm]
    
    LabelApproved --> Poll
    Poll -- "state: approved_after_pm" --> Decompose
    Decompose -- "Update Label" --> LabelDecomposed[Label: decomposed]
    LabelDecomposed --> End([End: Task Ready for Implementation])

    LabelNeedsRework --> Poll
    Poll -- "state: needs_rework_after_pm" --> Rework
    Rework -- "Request Details" --> Jarvis
    Rework -- "Update Label" --> LabelDraft
```

### Описание этапов

1.  **Draft**: Начальное состояние. Система анализирует текст задачи и обогащает его контекстом проекта.
2.  **Review**: AI-агент проверяет задачу на полноту и соответствие стандартам.
3.  **HITL (Human-in-the-loop)**: Запрос на одобрение отправляется человеку в Telegram через агента Jarvis.
4.  **Approve/Reject**: 
    *   При одобрении задача уходит на **Декомпозицию** (разбиение на мелкие подзадачи).
    *   При отклонении задача возвращается на стадию **Draft** после сбора уточнений от пользователя.
5.  **Decomposed**: Финальное состояние архитектурного цикла. Задача готова к реализации разработчиком (или AI-разработчиком).
