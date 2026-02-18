# Docker Workspace Architecture — Implementation Plan

## Overview

Replace the host-based agent execution model with **Docker-based workspaces** — isolated, reproducible environments where AI agents run inside ephemeral containers. A workspace is a persistent definition (Docker image + repos + setup commands + env vars); each agent session spins up a fresh container from that definition.

This plan is standalone and references the [main platform plan](./2026-02-17-platform-architecture-migration.md) where relevant.

---

## Current State Analysis

### What Exists (Updated 2026-02-18)

The codebase has been migrated to **NestJS 11 with hexagonal/clean architecture**. The foundational workspace infrastructure is **fully implemented**.

| Package | Status | Notes |
|---------|--------|-------|
| `packages/core` | **Complete** — Types, errors, validation, ID generation, logging | Workspace/session types & Zod schemas exist |
| `packages/database` | **Complete** — 6 tables across 2 migrations | Workspaces, workspace_repos, sessions tables exist |
| `packages/repo-manager` | **Complete** — GitService, RepoRegistry, GitHubAppService, GitHubDiscoveryService, GitHubImportService | ESM package consumed by backend via `require(esm)` |
| `packages/workspace-manager` | **Complete** — ContainerService, VolumeService, GitInContainer, SessionOrchestrator, IdleTimeoutManager | ESM package, full Docker lifecycle management |
| `apps/backend` | **Complete** — NestJS hexagonal architecture with controllers, use-cases, ports, infrastructure | Workspace + Session CRUD, approve/reject, exec, destroy |
| `apps/web` | **Partial** — React 19 + Vite 6 + Tailwind v4 shell | Needs workspace/session UI |
| `packages/agent-engine` | **Not started** | AI agent execution inside containers |

### Backend Architecture (NestJS Hexagonal)

The backend follows strict hexagonal/clean architecture:

```
interfaces/http/  →  application/  →  ports/  ←  infrastructure/
                                       ↑
                             modules/ (NestJS DI wiring)
```

**Only `interfaces/`, `modules/`, `filters/`, and `main.ts` may import from `@nestjs/*`.** Application and domain layers are framework-free.

- **`ports/`** — Abstract classes used as both DI tokens and contracts
- **`application/`** — Use-case classes (plain TypeScript, no framework imports)
- **`infrastructure/`** — Drizzle repositories, Octokit adapter, UnitOfWork impl
- **`interfaces/http/`** — Thin NestJS controllers delegating to use-cases
- **`modules/`** — NestJS composition root with `useFactory` DI wiring

**DI wiring pattern** (`CoreModule` is `@Global()`):

```typescript
// External services wired via Symbol tokens in core/injection-tokens.ts
TOKENS.DATABASE            ← createDatabase(DATABASE_URL)
TOKENS.DOCKER_CLIENT       ← createDockerClient()
TOKENS.GIT_SERVICE         ← new GitService()
TOKENS.REPO_REGISTRY       ← new RepoRegistry(db)
TOKENS.GITHUB_APP_SERVICE  ← new GitHubAppService(db)
TOKENS.CONTAINER_SERVICE   ← new ContainerService(docker)
TOKENS.VOLUME_SERVICE      ← new VolumeService(docker)
TOKENS.SESSION_ORCHESTRATOR ← new SessionOrchestrator(containerService, volumeService, db)
TOKENS.IDLE_TIMEOUT_MANAGER ← new IdleTimeoutManager(orchestrator)
```

**Feature modules** bind `Port → Infrastructure` and register use-cases:

```typescript
// Example: SessionsModule
{ provide: SessionRepository, useFactory: (db) => new DrizzleSessionRepository(db) }
{ provide: StartSession, useFactory: (repo, orch) => new StartSession(repo, orch) }
```

### E2E Testing Infrastructure

- **76 tests** across workspaces, sessions, repos, GitHub, health
- Vitest + `unplugin-swc` (SWC required for NestJS decorator metadata)
- `@testcontainers/postgresql` (real Postgres 16, disposable containers)
- Supertest for HTTP assertions, Fishery for factories
- All external services (Docker, Git, GitHub) mocked via `TOKENS.*` overrides
- Per-test DB cleanup via `TRUNCATE ... CASCADE`

### What Remains to Build

1. **Agent Engine** (`packages/agent-engine`) — AI provider integration, container-native tools, agent runner
2. **WebSocket streaming** — Real-time session output to frontend
3. **FinalizeSession use-case** — Orchestrator method exists, needs HTTP endpoint + use-case
4. **Web frontend** — Workspace management UI, session detail, live agent output

---

## Desired End State

A user can:
1. Create a workspace: pick a Docker image, select repos, define setup commands and env vars
2. Run an agent against that workspace → a fresh container starts, repos clone, deps install (cached), agent executes
3. Agent finishes → commits changes to a branch, pushes to GitHub (while still inside the container)
4. Container stays alive (idle) — user can still inspect files, re-run commands, or check status
5. User previews changes locally (`git fetch && git checkout <branch>`), approves via CLI → PR created on GitHub
6. Container is destroyed after: approval/rejection, or idle timeout (default 30 min), or explicit user action
7. Session data (conversation, diffs, metadata) persists in DB — user can review even after container is gone

```
Workspace (persistent definition)          Agent Session (ephemeral container, persistent data)
┌─────────────────────────────┐           ┌─────────────────────────────────────────────────┐
│ Docker image: node:22       │           │ Fresh container from workspace                  │
│ Repos: [repo-A, repo-B]    │──spawn──▶ │ /workspace/repo-A/ (fresh clone)                │
│ Setup: "pnpm install"       │           │ /workspace/repo-B/ (fresh clone)                │
│ Env: { NODE_ENV: "dev" }   │           │ Dep cache: named volume (fast)                  │
│ Resources: 1 CPU, 512MB    │           │ Agent works → pushes branch → container idles   │
└─────────────────────────────┘           │ Session data persisted to DB throughout          │
                                          │ Container destroyed on timeout/approval/rejection│
                                          └─────────────────────────────────────────────────┘
```

### Container Lifecycle

```
Container alive:
  starting → setup → running → finalizing → preview (idle, waiting for user)
                                                ↓
Container destroyed on ANY of:
  ✓ Push succeeded + user approved/rejected
  ✓ Push succeeded + idle timeout (default 30 min with no activity)
  ✓ Explicit user action (DELETE /api/sessions/:id)
  ✗ Push failed after retries → status: 'failed', container KEPT for debugging

Session data available after container dies:
  ✓ Conversation messages (streamed to DB in real-time during 'running')
  ✓ Diff summary (computed during 'finalizing', stored in DB)
  ✓ Branch name, PR URL, cost/token tracking (all in DB)
  ✓ Setup command logs (stored in DB)
  ✗ Container filesystem (gone — but changes are in the remote branch)
```

---

## What We're NOT Doing

- **No long-lived dev environments** — containers are ephemeral per session (idle up to 30 min after agent finishes, then destroyed)
- **No devcontainer.json support in v1** — users define workspaces in Fleetwide UI/CLI, not via repo config files
- **No custom Dockerfile builds in v1** — users reference pre-built images (e.g., `node:22`, `python:3.12`); Dockerfile building is a future enhancement
- **No Docker-in-Docker** — agents cannot run Docker commands inside their containers
- **No GPU support** — CPU-only workloads in v1
- **No workspace sharing** — each workspace belongs to one Fleetwide deployment
- **No resource tier presets** — single default allocation per workspace with optional override

---

## Technology

| Component | Technology | Notes |
|-----------|-----------|-------|
| Docker SDK | `dockerode` + `@types/dockerode` | Already installed in `@fleetwide/workspace-manager` |
| Container runtime | Docker Engine | Already required by `docker-compose.dev.yml` |
| Volume driver | `local` (default) | Named volumes for dependency caches |
| Stream handling | Node.js `PassThrough` + `modem.demuxStream` | Implemented in `ContainerService.exec()` |
| Backend framework | NestJS 11 | CommonJS, hexagonal architecture |
| Database ORM | Drizzle ORM | PostgreSQL, schema in `@fleetwide/database` |
| AI SDK | `@anthropic-ai/sdk` | For Claude provider (agent-engine, not yet built) |

---

## Data Model

### Types (Already exist in `packages/core/src/types/workspace.ts`)

```typescript
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  image: string;
  setupCommands: string[];
  environmentVariables: Record<string, string>;
  memorySizeMb: number;
  cpuCount: number;
  repositoryIds: string[];
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceStatus = 'active' | 'error' | 'archived';

export type WorkspaceSessionStatus =
  | 'starting' | 'setup' | 'running' | 'finalizing' | 'preview'
  | 'approved' | 'rejected' | 'completed' | 'failed' | 'expired';

// Also: WorkspaceSession, ContainerExecResult, DiffSummary, SetupLogEntry
```

### DB Schema (Already exists in `packages/database/src/schema/workspaces.ts`)

Tables: `workspaces`, `workspace_repos`, `sessions` — all with Drizzle enums, JSON columns, and foreign keys. Two migrations applied.

### Validation Schemas (Already exist in `packages/core/src/utils/validation.ts`)

- `createWorkspaceSchema`, `updateWorkspaceSchema` — workspace CRUD validation
- `runAgentInWorkspaceSchema` — session creation with prompt, providerId, model
- `sessionStatusSchema`, `paginationSchema`

---

## Phase 1: Workspace Manager Package ✅ COMPLETE

**Status**: Fully implemented and tested.

### What Was Built

| File | Class/Function | Status |
|------|---------------|--------|
| `packages/workspace-manager/src/docker-client.ts` | `createDockerClient()` | ✅ |
| `packages/workspace-manager/src/container.service.ts` | `ContainerService` | ✅ |
| `packages/workspace-manager/src/volume.service.ts` | `VolumeService` | ✅ |
| `packages/workspace-manager/src/git-in-container.ts` | `GitInContainer` | ✅ |
| `packages/workspace-manager/src/session-orchestrator.ts` | `SessionOrchestrator` | ✅ |
| `packages/workspace-manager/src/idle-timeout-manager.ts` | `IdleTimeoutManager` | ✅ |
| `packages/core/src/types/workspace.ts` | All workspace/session types | ✅ |
| `packages/core/src/utils/validation.ts` | Zod schemas | ✅ |
| `packages/database/src/schema/workspaces.ts` | DB tables + migrations | ✅ |

### Key Implementation Details

**ContainerService** — Docker lifecycle via `dockerode`:
- `createAndStart()` — Creates container named `fleetwide-session-{sessionId}`, labels `fleetwide.managed=true`
- `exec()` / `execStream()` — Command execution with `demuxStream` for stdout/stderr separation
- `stop()` / `remove()` — Graceful shutdown
- `pruneOrphaned()` — Cleanup on startup

**SessionOrchestrator** — Full session lifecycle:
- `startSession()` — Load workspace → ensure volumes → create container → configure git → checkout repos → create branch → run setup → status: running
- `finalizeSession()` — Commit changes → push branch → compute diff → status: preview (or completed if no changes)
- `approveSession()` — Create PR via GitHub API → destroy container
- `rejectSession()` — Delete remote branch → destroy container
- `destroyContainer(reason)` — Stop + remove container, session data preserved in DB

**IdleTimeoutManager** — Polls every 60s, destroys expired preview containers.

### Success Criteria — Phase 1 ✅

All criteria met. Integration tests exist in `packages/workspace-manager/`.

---

## Phase 2: Workspace API & Backend Integration ✅ MOSTLY COMPLETE

**Status**: All workspace/session routes, use-cases, ports, and infrastructure implemented. WebSocket streaming remains.

### What Was Built

#### Hexagonal Architecture Layers

**Ports** (`apps/backend/src/ports/`):

| File | Abstract Class | Contract |
|------|---------------|----------|
| `repositories/WorkspaceRepository.ts` | `WorkspaceRepository` | `findById()`, `findAll()`, `create()`, `update()`, `delete()`, `addRepo()`, `removeRepo()` |
| `repositories/SessionRepository.ts` | `SessionRepository` | `findById()`, `findAll()`, `findByWorkspaceId()` (read-only — writes go through `SessionOrchestrator`) |
| `services/GitHubPullRequestService.ts` | `GitHubPullRequestService` | `createPullRequest()`, `deleteRemoteBranch()` |
| `uow/UnitOfWork.ts` | `UnitOfWork` | `transaction()` for workspace operations |

**Infrastructure** (`apps/backend/src/infrastructure/`):

| File | Class | Implements |
|------|-------|-----------|
| `repositories/DrizzleWorkspaceRepository.ts` | `DrizzleWorkspaceRepository` | `WorkspaceRepository` |
| `repositories/DrizzleSessionRepository.ts` | `DrizzleSessionRepository` | `SessionRepository` |
| `services/OctokitPullRequestService.ts` | `OctokitPullRequestService` | `GitHubPullRequestService` |
| `uow/DrizzleUnitOfWork.ts` | `DrizzleUnitOfWork` | `UnitOfWork` |

**Use-Cases** (`apps/backend/src/application/`):

| File | Class | Responsibility |
|------|-------|---------------|
| `workspaces/CreateWorkspace.ts` | `CreateWorkspace` | Validate + create workspace + link repos |
| `workspaces/UpdateWorkspace.ts` | `UpdateWorkspace` | Validate + update workspace fields |
| `workspaces/DeleteWorkspace.ts` | `DeleteWorkspace` | Delete workspace (+ cascade) |
| `workspaces/ManageWorkspaceRepos.ts` | `ManageWorkspaceRepos` | Add/remove repos from workspace |
| `workspaces/WorkspaceQueries.ts` | `WorkspaceQueries` | List/get workspace queries |
| `sessions/StartSession.ts` | `StartSession` | Validate → workspace exists + active → orchestrator.startSession() |
| `sessions/ApproveSession.ts` | `ApproveSession` | Session exists + preview status → create PR → destroy container |
| `sessions/RejectSession.ts` | `RejectSession` | Session exists + preview status → delete branch → destroy container |
| `sessions/ExecInSession.ts` | `ExecInSession` | Session exists + container alive → orchestrator.exec() |
| `sessions/DestroySession.ts` | `DestroySession` | Session exists → orchestrator.destroyContainer() |
| `sessions/SessionQueries.ts` | `SessionQueries` | List/get sessions, messages, logs, diff, branch info |

**Controllers** (`apps/backend/src/interfaces/http/`):

| File | Routes |
|------|--------|
| `workspaces.controller.ts` | `POST /api/workspaces`, `GET /api/workspaces`, `GET /api/workspaces/:id`, `PATCH /api/workspaces/:id`, `DELETE /api/workspaces/:id`, `POST /api/workspaces/:id/repos`, `DELETE /api/workspaces/:id/repos/:repoId` |
| `sessions.controller.ts` | `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/exec`, `DELETE /api/sessions/:id`, `GET /api/sessions/:id/messages`, `GET /api/sessions/:id/logs`, `GET /api/sessions/:id/diff`, `GET /api/sessions/:id/branch`, `POST /api/sessions/:id/approve`, `POST /api/sessions/:id/reject` |

**Modules** (`apps/backend/src/modules/`):

| File | Wires |
|------|-------|
| `core.module.ts` | `@Global()` — all Symbol tokens, lifecycle hooks (start idle timeout manager, prune orphaned containers) |
| `workspaces.module.ts` | WorkspaceRepository → DrizzleWorkspaceRepository, all workspace use-cases |
| `sessions.module.ts` | SessionRepository → DrizzleSessionRepository, GitHubPullRequestService → OctokitPullRequestService, all session use-cases. Imports `WorkspacesModule` for `WorkspaceRepository` access. |

#### E2E Tests

- `test/e2e/workspaces.e2e-spec.ts` — Full workspace CRUD + repo management
- `test/e2e/sessions.e2e-spec.ts` — Start, exec, approve, reject, destroy, queries
- External services (Docker, Git, GitHub) mocked via `TOKENS.*` overrides in `createTestApp()`
- Factories: `workspaceFactory`, `sessionFactory`, `repositoryFactory` (Fishery)
- Seed helpers: `seed.workspace(db)`, `seed.workspaceWithRepos(db, n)`, `seed.session(db, overrides)`

### What Remains — Phase 2

#### 2.1 — FinalizeSession Use-Case + Endpoint

The `SessionOrchestrator.finalizeSession()` method exists but lacks an HTTP endpoint and application use-case.

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/src/application/sessions/FinalizeSession.ts` | Use-case: validate session state → call orchestrator.finalizeSession() |

**Files to modify:**

| File | Change |
|------|--------|
| `apps/backend/src/interfaces/http/sessions.controller.ts` | Add `POST /api/sessions/:id/finalize` route |
| `apps/backend/src/modules/sessions.module.ts` | Wire `FinalizeSession` use-case |

```typescript
// application/sessions/FinalizeSession.ts
import { NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import { SessionRepository } from '../../ports/repositories/SessionRepository';

export class FinalizeSession {
  constructor(
    private sessionRepo: SessionRepository,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status !== 'running') {
      throw new ValidationError('Session must be in running state to finalize', {
        currentStatus: session.status,
      });
    }

    return this.orchestrator.finalizeSession(sessionId);
  }
}
```

#### 2.2 — WebSocket Integration for Session Streaming

Real-time session output to the frontend. NestJS WebSocket gateway.

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/src/interfaces/ws/sessions.gateway.ts` | NestJS `@WebSocketGateway()` for session events |
| `apps/backend/src/modules/ws.module.ts` | WebSocket module wiring |

**Dependencies to install:**

```bash
pnpm --filter @fleetwide/backend add @nestjs/websockets @nestjs/platform-socket.io socket.io
```

**Protocol:**

```typescript
// Server → Client messages
type ServerMessage =
  | { type: 'session_status'; sessionId: string; status: WorkspaceSessionStatus }
  | { type: 'session_output'; sessionId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'session_setup_progress'; sessionId: string; command: string; exitCode: number }
  | { type: 'session_message'; sessionId: string; message: SessionMessage }
  | { type: 'session_idle_warning'; sessionId: string; minutesRemaining: number }
  | { type: 'session_expired'; sessionId: string }
```

**Architecture note**: The WebSocket gateway lives in `interfaces/ws/` (parallel to `interfaces/http/`). It injects use-case classes and Symbol tokens from `CoreModule`, following the same hexagonal pattern — no framework imports in application or domain layers.

### Success Criteria — Phase 2

#### Automated Verification:
- [x] `pnpm turbo build && pnpm turbo typecheck` passes
- [x] All workspace CRUD routes work (POST, GET, PATCH, DELETE)
- [x] All session lifecycle routes work (POST, exec, approve, reject, destroy)
- [x] Session query routes work (messages, logs, diff, branch)
- [x] E2E tests pass (76 tests across all modules)
- [x] `POST /api/sessions/:id/finalize` transitions session to preview/completed
- [x] WebSocket gateway streams session events in real-time

#### Manual Verification:
- [x] Can create a workspace via API and see it listed
- [x] Can start a session, exec commands, approve/reject
- [ ] Session streaming shows real-time output over WebSocket
- [ ] Idle timeout warning sent via WebSocket before container expires

---

## Phase 3: Agent Execution in Workspaces

**Goal**: Build the agent engine from scratch to target workspace containers. This is the **primary remaining work** for making the platform functional end-to-end.

**Dependencies**: Phase 2 FinalizeSession endpoint complete.

### 3.1 — Agent Engine Package (Container-Native)

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/package.json` | Dependencies: `@anthropic-ai/sdk`, `@fleetwide/core`, `@fleetwide/workspace-manager` |
| `packages/agent-engine/tsconfig.json` | ESM, extends base tsconfig |
| `packages/agent-engine/src/index.ts` | Barrel export |
| `packages/agent-engine/src/providers/provider.interface.ts` | `AgentProvider` interface |
| `packages/agent-engine/src/providers/claude.provider.ts` | Claude implementation using `@anthropic-ai/sdk` |
| `packages/agent-engine/src/providers/provider-registry.ts` | Provider registry |
| `packages/agent-engine/src/agent-runner.ts` | Runs agent inside a workspace session |
| `packages/agent-engine/src/tools/container-bash.tool.ts` | Bash tool: exec inside container via `SessionOrchestrator` |
| `packages/agent-engine/src/tools/container-file.tool.ts` | File read/write: exec inside container via `SessionOrchestrator` |
| `packages/agent-engine/src/cost-tracker.ts` | Token and cost tracking |

**Key design**: All agent tools execute inside the container via `SessionOrchestrator.exec()`, never on the host:

```typescript
// tools/container-bash.tool.ts
export class ContainerBashTool {
  constructor(private orchestrator: SessionOrchestrator) {}

  async execute(sessionId: string, command: string): Promise<ToolResult> {
    const result = await this.orchestrator.exec(sessionId, ['/bin/sh', '-c', command]);
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }
}
```

### 3.2 — Backend Integration (Hexagonal Architecture)

Integrate the agent engine into the backend following established hexagonal patterns.

**New port:**

```typescript
// apps/backend/src/ports/services/AgentRunnerService.ts
export abstract class AgentRunnerService {
  abstract run(opts: {
    sessionId: string;
    prompt: string;
    providerId: string;
    model?: string;
    systemPrompt?: string;
    onMessage: (message: SessionMessage) => void;
    onStatusChange: (status: WorkspaceSessionStatus) => void;
  }): Promise<void>;

  abstract abort(sessionId: string): Promise<void>;
}
```

**New infrastructure:**

```typescript
// apps/backend/src/infrastructure/services/AgentEngineRunnerService.ts
// Implements AgentRunnerService using @fleetwide/agent-engine
```

**New use-case:**

```typescript
// apps/backend/src/application/sessions/RunAgent.ts
// Validates session → invokes AgentRunnerService → persists messages → triggers finalize
```

**New DI wiring:**

```typescript
// apps/backend/src/core/injection-tokens.ts
TOKENS.AGENT_PROVIDER_REGISTRY  // Symbol('AGENT_PROVIDER_REGISTRY')

// apps/backend/src/modules/sessions.module.ts
// Add: AgentRunnerService → AgentEngineRunnerService binding
// Add: RunAgent use-case factory
```

**New endpoint:**

```typescript
// apps/backend/src/interfaces/http/sessions.controller.ts
// Add: POST /api/sessions/:id/run — triggers agent execution in existing session
// OR modify StartSession to optionally trigger agent run after container setup
```

**Architecture note**: The `AgentRunnerService` port is framework-free. The `AgentEngineRunnerService` infrastructure class imports from `@fleetwide/agent-engine`. The use-case only depends on the port abstraction.

### 3.3 — Agent Run Flow

The complete flow when a user runs an agent against a workspace:

```
1.  POST /api/sessions { workspaceId, prompt }
    → SessionsController → StartSession use-case
    → Validates workspace exists + active
    → SessionOrchestrator.startSession()
    → Container starts, repos pulled, branch created, setup commands run
    → Setup logs persisted to DB

2.  POST /api/sessions/:id/run (or auto-triggered after startSession)
    → SessionsController → RunAgent use-case
    → AgentRunnerService.run() → agent-engine AgentRunner
    → Claude/OpenAI API called with container-native tools

3.  Agent executes:
    → ContainerBashTool.execute() → SessionOrchestrator.exec()
    → All commands run inside the container, never on host
    → Each message persisted via SessionOrchestrator.persistMessage()
    → Each exec updates lastActivityAt (resets idle timer)
    → Events streamed via WebSocket gateway

4.  Agent completes:
    → POST /api/sessions/:id/finalize (auto or manual)
    → FinalizeSession use-case → SessionOrchestrator.finalizeSession()
    → Commits + pushes branch to GitHub
    → If push fails: status: 'failed', container KEPT for debugging
    → If push succeeds: status: 'preview', container stays alive (idle)
    → If no changes: status: 'completed', container destroyed

5.  User previews + approves/rejects:
    → POST /api/sessions/:id/approve → ApproveSession use-case → PR created
    → POST /api/sessions/:id/reject → RejectSession use-case → branch deleted
    → Works whether container is alive or already destroyed (uses GitHub API)

6.  Session reviewable forever:
    → GET /api/sessions/:id — shows conversation, diffs, logs even after container gone
```

### Success Criteria — Phase 3

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes with `@fleetwide/agent-engine`
- [ ] `pnpm turbo test` — agent-engine unit tests pass (mock provider + mock orchestrator)
- [ ] Agent bash tool executes commands inside the container (not on host)
- [ ] Agent file operations read/write files inside the container
- [ ] Agent messages are persisted to DB in real-time during agent run
- [ ] After agent completes, changes are committed and pushed to GitHub
- [ ] Session status transitions correctly: starting → setup → running → finalizing → preview
- [ ] Container stays alive in 'preview' status (not immediately destroyed)
- [ ] Approve/reject work both when container is alive and after it's been destroyed
- [ ] Agent abort stops the agent and updates session status
- [ ] E2E tests cover the full agent run lifecycle (with mocked AI provider)

#### Manual Verification:
- [ ] Run agent against a Node.js workspace → agent can `npm test`, edit files, etc.
- [ ] Agent changes are visible in the pushed branch on GitHub
- [ ] Container remains alive after agent finishes (status: 'preview')
- [ ] Can still exec commands in container during 'preview' state
- [ ] Approve creates a PR and destroys container
- [ ] After container destroyed: session shows full conversation + diffs
- [ ] After idle timeout: container destroyed, but approve/reject still works
- [ ] Agent cannot access files outside `/workspace/` in the container

**Implementation Note**: This phase makes the platform functional end-to-end for the first time. After Phase 3, a user can create a workspace, run an agent, preview changes, and create a PR — all via the REST API.

---

## Phase 4: Workspace UI & Multi-Repo

**Goal**: Web frontend for workspace management and multi-repo workspace support.

**Dependencies**: Phase 3 complete.

### 4.1 — Workspace Management UI

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/pages/WorkspacesPage.tsx` | Workspace list with status |
| `apps/web/src/pages/WorkspaceDetailPage.tsx` | Workspace details, sessions, repo list |
| `apps/web/src/pages/CreateWorkspacePage.tsx` | Workspace creation wizard |
| `apps/web/src/pages/SessionDetailPage.tsx` | Live session view (agent output, diff preview) |
| `apps/web/src/components/WorkspaceCard.tsx` | Workspace card with image, repos, status |
| `apps/web/src/components/DockerImagePicker.tsx` | Image selection (common presets + custom) |
| `apps/web/src/components/SetupCommandEditor.tsx` | Setup command list editor |
| `apps/web/src/components/EnvVarEditor.tsx` | Environment variable key-value editor |
| `apps/web/src/components/SessionPreview.tsx` | Diff view + approve/reject buttons |
| `apps/web/src/components/SessionOutput.tsx` | Real-time agent output (terminal-style) |
| `apps/web/src/stores/workspace.store.ts` | Zustand workspace state management |
| `apps/web/src/stores/session.store.ts` | Zustand session state management |
| `apps/web/src/services/workspace-client.ts` | HTTP client for workspace/session endpoints |

**Tech stack**: React 19 + Vite 6 + Tailwind v4 + Zustand (already set up in `apps/web/`).

### 4.2 — Multi-Repo Workspace Details

When a workspace has multiple repos, the container mounts each at `/workspace/{repo-name}/`:

```
/workspace/
├── frontend-app/      (repo A)
├── backend-api/       (repo B)
└── shared-config/     (repo C)
```

The agent's system prompt includes the workspace structure:

```
You are working in a workspace with the following repositories:
- /workspace/frontend-app/ — React frontend (github.com/org/frontend-app)
- /workspace/backend-api/ — Node.js API (github.com/org/backend-api)
Each repo is on a working branch: fleetwide/session-{id}
```

When the session finalizes, each repo with changes gets its own commit and branch push. Approval creates one PR per repo.

### 4.3 — Session Detail Page

The session detail page shows:
- **Status bar**: current session status (starting → setup → running → finalizing → preview → approved/rejected/expired)
- **Container indicator**: shows whether container is still alive or has been destroyed
- **Agent conversation**: full conversation history (streamed in real-time during 'running', loaded from DB after)
- **Setup log**: collapsible section showing setup command output (always available from DB)
- **Diff view**: file-by-file diff (per repo) when status is `preview` or later (always available from DB)
- **Actions**:
  - During `preview` (container alive): Approve / Reject / Exec command / Destroy container
  - During `preview` (container expired): Approve / Reject (still work via GitHub API)
  - During `expired`: Approve / Reject (session data fully available)
  - After `approved`/`rejected`: Read-only view with links to PRs
- **Idle timeout warning**: shows countdown when container is about to expire

### Success Criteria — Phase 4

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] Web app builds and serves without errors
- [ ] Workspace creation wizard completes and creates workspace via API
- [ ] Session streaming displays output in real-time via WebSocket

#### Manual Verification:
- [ ] Can create a workspace via the wizard with image + repos + setup commands
- [ ] Workspace list shows all workspaces with correct status and repo count
- [ ] Can start an agent run from the workspace detail page
- [ ] Agent output streams in real-time during execution
- [ ] Diff view shows changes after agent completes (grouped by repo)
- [ ] Approve button creates PRs (one per changed repo)
- [ ] Reject button deletes remote branches and marks session as rejected
- [ ] Multi-repo workspace: agent can work across repos, each gets its own PR

---

## How This Integrates with the Main Plan

This plan replaces/modifies the following sections of the [main platform plan](./2026-02-17-platform-architecture-migration.md):

| Main Plan Section | Change |
|-------------------|--------|
| Phase 0.4 (agent-engine) | **Replaced** by this plan's Phase 3 — agent engine targets containers |
| Phase 0.5 (backend, agent routes) | **Replaced** — backend is NestJS hexagonal, routes already built |
| Phase 1.5 (workspace-scoped sessions) | **Replaced** — workspace sessions fully implemented |
| Phase 2 (fleet operations) | **Unaffected** — fleet operations run across workspaces |
| Phase 3 (scheduling) | **Modified** — scheduled runs target workspaces, spin up containers |
| Phase 5 (Docker, CLI) | **Modified** — Docker compose mounts socket; CLI deferred |

---

## Testing Strategy

### Unit Tests

- **workspace-manager**: ContainerService, VolumeService, SessionOrchestrator, IdleTimeoutManager (✅ exist)
- **agent-engine**: AgentRunner, ContainerBashTool, ContainerFileTool, CostTracker (mock provider + mock orchestrator)

### E2E Tests (Backend)

- **Existing** (76 tests): Workspace CRUD, session lifecycle, repos, GitHub, health
- **New**: Agent run lifecycle (mock AI provider, mock Docker via `TOKENS.*`)
- **Pattern**: Use `createTestApp()` which overrides all external service tokens with mocks
- **Factories**: `workspaceFactory`, `sessionFactory`, `repositoryFactory` (Fishery)
- **DB cleanup**: `TRUNCATE ... CASCADE` between tests

### Integration Tests

- **workspace-manager → Docker**: Full session lifecycle with real Docker (requires Docker daemon)
- **Agent → container exec → git push**: End-to-end with real containers
- **Multi-repo workspace**: Session with 2+ repos, changes in each, separate PRs

### Manual Testing Checklist

- [ ] Create workspace → run agent → preview → approve → PR created
- [ ] Multi-repo workspace: changes in 2 repos → 2 separate PRs
- [ ] Container stays alive in preview state: `docker ps` shows container running
- [ ] Container destroyed after approve/reject: `docker ps -a` shows no orphans
- [ ] Idle timeout: container auto-destroyed after 30 min idle, session still reviewable
- [ ] Session data survives container destruction: inspect shows conversation + diffs
- [ ] Approve works after container expired (uses GitHub API, not container)
- [ ] Push failure: container KEPT for debugging, status shows 'failed'
- [ ] Dependency caching: second run's `npm install` is near-instant
- [ ] Resource limits enforced: container with 256MB OOMs on heavy allocation
- [ ] Container cannot access host filesystem outside mounted repos
- [ ] Session survives backend restart (container keeps running, backend reconnects)
- [ ] Agent messages persisted in real-time: kill backend mid-run, restart, messages are in DB

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Container startup time | Use lightweight images (`-slim`, `-alpine`). Typical: 1-3 seconds |
| Repo clone on every session | Repos already on host (via repo-manager). Bind mount = instant, then `git pull` |
| Dependency install time | Named volumes cache npm/pip/etc. Second run: `npm install` < 5 seconds |
| Many concurrent sessions | Resource limits per container prevent runaway usage. Backend tracks total allocation |
| Docker socket security | Socket access = root-equivalent. Production should use Docker auth plugin or rootless Docker |
| Disk space (volumes) | `pruneUnused()` on startup + periodic cleanup. Monitor via `/api/health` |
| Image pulls | First workspace creation may be slow if image not cached. Pre-pull common images |

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Agent escaping container | Default Docker isolation (namespaces, cgroups). No `--privileged`. No Docker socket inside container |
| Access to host filesystem | Only explicitly bind-mounted repo paths are accessible |
| Secret leakage | Env vars injected at runtime, never baked into images. Secrets cleared on container destroy |
| Idle container exposure | Containers in 'preview' state still have network access. Idle timeout limits exposure window |
| GitHub token scope | Installation tokens are short-lived (~1 hour) and repo-scoped |
| Resource exhaustion | Memory + CPU limits per container. `OomKillDisable: false` (fail fast) |
| Network access | Containers get `bridge` network (needed for git push + API calls) |

---

## References

- [Main Platform Plan](./2026-02-17-platform-architecture-migration.md) — Overall Fleetwide architecture
- [GitHub Integration MVP](./2026-02-17-github-integration-mvp.md) — GitHub App setup
- [dockerode](https://github.com/apocas/dockerode) — Docker SDK for Node.js
- [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/)
