# Migrate Backend from Hono to NestJS (Clean / Hexagonal Architecture)

## Status: Implemented

## Context

The Fleetwide backend is an AI-orchestrator that manages workspaces, Docker containers, GitHub integrations, and session lifecycles. It previously used Hono with manual dependency injection and inline Drizzle queries scattered across route handlers. This migration replaced Hono with NestJS while introducing a clean/hexagonal architecture that enforces strict separation of concerns.

## Architecture

### Layer dependency direction
```
interfaces/ → application/ → ports/ ← infrastructure/
                              ↑
                        modules/ (wires ports to implementations)
```

### Import restriction — only these folders may import from `@nestjs/*`:
- `interfaces/`
- `modules/`
- `filters/`
- `main.ts`

### Layer responsibilities
| Layer | Responsibility | NestJS imports? |
|---|---|---|
| `ports/` | Abstract classes defining contracts | No |
| `application/` | Use-case classes coordinating domain + ports | No |
| `infrastructure/` | Drizzle repositories, Octokit adapter, UoW impl | No |
| `interfaces/http/` | Thin NestJS controllers | Yes |
| `modules/` | NestJS composition root | Yes |
| `filters/` | NestJS exception filter | Yes |
| `core/` | Injection token symbols | No |

## File Structure

```
apps/backend/src/
  main.ts

  core/
    injection-tokens.ts

  ports/
    repositories/
      WorkspaceRepository.ts
      SessionRepository.ts
    services/
      GitHubPullRequestService.ts
    uow/
      UnitOfWork.ts

  application/
    workspaces/
      CreateWorkspace.ts
      UpdateWorkspace.ts
      DeleteWorkspace.ts
      ManageWorkspaceRepos.ts
      WorkspaceQueries.ts
    sessions/
      StartSession.ts
      ApproveSession.ts
      RejectSession.ts
      ExecInSession.ts
      DestroySession.ts
      SessionQueries.ts
    repos/
      SyncRepo.ts

  infrastructure/
    repositories/
      DrizzleWorkspaceRepository.ts
      DrizzleSessionRepository.ts
    services/
      OctokitPullRequestService.ts
    uow/
      DrizzleUnitOfWork.ts

  interfaces/
    http/
      health.controller.ts
      github.controller.ts
      repos.controller.ts
      workspaces.controller.ts
      sessions.controller.ts

  modules/
    app.module.ts
    core.module.ts
    health.module.ts
    github.module.ts
    repos.module.ts
    workspaces.module.ts
    sessions.module.ts

  filters/
    fleetwide-exception.filter.ts
```

## Key Design Decisions

### CJS Backend
NestJS requires CJS (decorator metadata + reflect-metadata). Node 22.12+ `require(esm)` handles shared ESM packages.

### Shared-package services use Symbol tokens (not abstract-class ports)
`SessionOrchestrator`, `RepoRegistry`, etc. are already framework-agnostic. Ports only introduced where coupling problems existed (inline Drizzle queries, inline Octokit calls).

### SessionRepository is read-only
`SessionOrchestrator` owns session writes. The port only covers queries that lived in route handlers.

### Use-cases use the class itself as DI token
Registered via `useFactory` in modules. Controllers inject via `@Inject(CreateWorkspace)`.
