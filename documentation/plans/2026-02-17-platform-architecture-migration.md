# Fleetwide Platform — Implementation Plan

## Overview

Migrate from **Consola** (single-user Electron desktop AI chat app) to **Fleetwide** (self-hosted, multi-repo agent orchestration platform). The platform enables teams to manage fleets of repositories, orchestrate teams of AI agents, schedule recurring tasks, and integrate with external systems — all running on your own infrastructure.

This plan covers the full build from an empty repository to a production-ready self-hosted deployment across 6 phases (~15 weeks).

---

## Decisions Summary

All architectural decisions have been confirmed:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Database** | PostgreSQL only | Simplifies ORM layer, avoids dual-mode complexity, production-grade from day 1 |
| **Authentication** | API Keys + JWT now; OAuth/SAML later as plugin | Pragmatic for self-hosted v1, auth middleware abstraction allows future extension |
| **Agent SDK** | Abstract multi-provider | Provider interface allows Claude, OpenAI, and future providers to be swapped in |
| **Communication** | REST + WebSocket | REST for CRUD, WebSocket for real-time agent streaming. No gRPC complexity |
| **Plugin system** | In-process plugins (v1) | Simple, fast, admin-controlled. Container isolation deferred to v2 for untrusted plugins |
| **Repo access** | Git clone to local disk | Full git history available, fast operations, works offline |

---

## Current State Analysis

### What Exists in Consola (source repo: console-1)

The Consola codebase (~116 TypeScript files) is a three-process Electron app with a bridge pattern that isolates all IPC access. Key extractable components:

| Component | Source File | Extractable | Target Package |
|-----------|------------|-------------|----------------|
| ClaudeAgentService | `src/main/ClaudeAgentService.ts` | 95% (zero Electron deps) | `packages/agent-engine` |
| SessionDatabase | `src/main/database/SessionDatabase.ts` | 98% (change constructor) | `packages/database` |
| SessionStorageService | `src/main/SessionStorageService.ts` | 100% | `packages/agent-engine` |
| SessionNameGenerator | `src/main/SessionNameGenerator.ts` | 100% | `packages/agent-engine` |
| TerminalService | `src/main/TerminalService.ts` | 100% | `packages/agent-engine` |
| Git operations | `src/main/ipc-handlers.ts` (inline) | 100% (extract functions) | `packages/repo-manager` |
| Agent event types | `src/shared/types.ts` | 100% | `packages/core` |
| Chat UI components | `src/renderer/components/Agent/` (26 files) | 70% (remove bridge refs) | `packages/ui` |
| Markdown rendering | `src/renderer/components/Markdown/` (6 files) | 90% | `packages/ui` |
| Zustand store patterns | `src/renderer/stores/agentStore.ts` | 80% (patterns, not direct) | `apps/web` |

### What Cannot Be Reused

- `src/main/index.ts` — Electron app lifecycle
- `src/main/window-manager.ts` — BrowserWindow management
- `src/preload/preload.ts` — Electron context bridge
- All bridge services in `src/renderer/services/` — replaced by HTTP/WebSocket clients

### Desired End State

A running platform where:
1. A user opens `http://localhost:3000` and sees a fleet dashboard
2. They register repositories (git clone to local disk)
3. They can run AI agents against any repo, or across the entire fleet
4. Agents can be scheduled to run on cron expressions
5. GitHub, Slack, and CI/CD integrations deliver notifications and automate workflows
6. Everything runs self-hosted via `docker compose up`
7. All actions are audit-logged and permission-controlled

---

## What We're NOT Doing

- **No SaaS / cloud hosting** — self-hosted only, per OpenClaw principles
- **No multi-tenancy** — single org/team per deployment
- **No Electron desktop app** (yet) — web + CLI first; desktop becomes a future thin client
- **No OAuth/SAML in v1** — auth middleware is extensible, but v1 ships with API keys + JWT
- **No container-isolated plugins in v1** — in-process only; container isolation is v2
- **No mobile app** — web is responsive but no native mobile
- **No SQLite mode** — PostgreSQL only simplifies the data layer

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Monorepo** | pnpm workspaces + Turborepo | pnpm 9+, turbo 2+ |
| **Runtime** | Node.js (ESM native) | 22+ |
| **Backend Framework** | Hono | 4+ |
| **WebSocket** | ws | 8+ |
| **Database** | PostgreSQL | 16+ |
| **ORM** | Drizzle ORM | 0.38+ |
| **Queue/Jobs** | BullMQ + Redis | BullMQ 5+, Redis 7+ |
| **Frontend** | React + Vite | React 19, Vite 6+ |
| **State Management** | Zustand | 5+ |
| **UI Components** | Radix UI + Tailwind CSS | Radix latest, Tailwind 4+ |
| **CLI** | Commander.js | 12+ |
| **Testing** | Vitest + Testing Library | Latest |
| **Linting** | ESLint + Prettier | ESLint 9+, flat config |
| **Containerization** | Docker + Docker Compose | Latest |

---

## Monorepo Structure

```
fleetwide/
├── packages/
│   ├── core/                    # Shared types, events, utilities
│   ├── agent-engine/            # Agent orchestration (multi-provider)
│   ├── repo-manager/            # Repository fleet management
│   ├── scheduler/               # Time-based scheduling (BullMQ)
│   ├── integrations/            # External system connectors (in-process plugins)
│   ├── database/                # Drizzle ORM, migrations, models
│   └── ui/                      # Shared React components (from Consola)
├── apps/
│   ├── backend/                 # Hono REST + WebSocket server
│   ├── web/                     # React web frontend
│   └── cli/                     # Command-line interface
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
└── package.json
```

---

## Phase 0: Foundation & Monorepo Setup

**Duration**: Weeks 1–2
**Goal**: Monorepo scaffolding, core abstractions, database, agent engine extraction, minimal backend + web frontend that can run a single-agent chat session via the browser.

### 0.1 — Monorepo Scaffolding

**Files to create:**

| File | Purpose |
|------|---------|
| `package.json` | Root package.json with workspace scripts |
| `pnpm-workspace.yaml` | Defines `packages/*` and `apps/*` workspaces |
| `turbo.json` | Turborepo pipeline: `build`, `dev`, `test`, `lint`, `typecheck` |
| `tsconfig.base.json` | Base TypeScript config (ESM, strict, path aliases) |
| `.eslintrc.js` | ESLint flat config shared across all packages |
| `.prettierrc` | Prettier config |
| `.gitignore` | Node modules, dist, .env, coverage, etc. |
| `.nvmrc` | Pin Node.js 22+ |
| `.env.example` | Template for environment variables |

**Key configuration details:**

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```json
// turbo.json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### 0.2 — packages/core

**Purpose**: Shared types, event definitions, utilities, and constants used by all packages.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/core/package.json` | Package manifest, exports config |
| `packages/core/tsconfig.json` | Extends base tsconfig |
| `packages/core/src/index.ts` | Barrel export |
| `packages/core/src/types/agent.ts` | Agent types: `AgentConfig`, `AgentStatus`, `AgentEvent`, `AgentProvider` |
| `packages/core/src/types/repository.ts` | Repo types: `Repository`, `RepoStatus`, `RepoMetadata` |
| `packages/core/src/types/schedule.ts` | Schedule types: `Schedule`, `ScheduleStatus`, `CronExpression` |
| `packages/core/src/types/integration.ts` | Integration types: `Integration`, `IntegrationConfig`, `IntegrationType` |
| `packages/core/src/types/auth.ts` | Auth types: `ApiKey`, `JwtPayload`, `User`, `Permission` |
| `packages/core/src/types/common.ts` | Common types: `PaginatedResult`, `ErrorResponse`, `ID` |
| `packages/core/src/events/agent-events.ts` | Agent event enum and payload types |
| `packages/core/src/events/system-events.ts` | System events (repo sync, schedule trigger, etc.) |
| `packages/core/src/utils/id.ts` | ID generation (nanoid or cuid2) |
| `packages/core/src/utils/logger.ts` | Structured logger (pino) |
| `packages/core/src/utils/errors.ts` | Custom error classes with error codes |
| `packages/core/src/utils/validation.ts` | Zod schemas for all types (shared validation) |

**Key type definitions:**

```typescript
// types/agent.ts
export interface AgentProvider {
  id: string;
  name: string; // 'claude', 'openai', 'anthropic', etc.
  createAgent(config: AgentConfig): Promise<AgentInstance>;
  streamResponse(agent: AgentInstance, prompt: string): AsyncIterable<AgentEvent>;
  abort(agent: AgentInstance): Promise<void>;
}

export interface AgentConfig {
  providerId: string;
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  workingDirectory: string;
  permissions: AgentPermissions;
}

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

export interface AgentEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'status_change' | 'cost_update';
  timestamp: number;
  data: unknown;
}
```

```typescript
// types/repository.ts
export interface Repository {
  id: string;
  name: string;
  path: string;          // Local disk path
  remoteUrl?: string;    // Git remote URL
  defaultBranch: string;
  status: RepoStatus;
  metadata: RepoMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type RepoStatus = 'synced' | 'syncing' | 'error' | 'uninitialized';

export interface RepoMetadata {
  languages: Record<string, number>;  // language -> percentage
  fileCount: number;
  lastCommitHash: string;
  lastCommitDate: Date;
}
```

### 0.3 — packages/database

**Purpose**: Drizzle ORM setup, PostgreSQL schema, migration system, and data access layer.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/database/package.json` | Dependencies: drizzle-orm, drizzle-kit, postgres (pg driver) |
| `packages/database/tsconfig.json` | Extends base |
| `packages/database/src/index.ts` | Barrel export |
| `packages/database/src/connection.ts` | Database connection factory |
| `packages/database/src/schema/index.ts` | All schema exports |
| `packages/database/src/schema/agents.ts` | Agents table |
| `packages/database/src/schema/repositories.ts` | Repositories table |
| `packages/database/src/schema/sessions.ts` | Agent sessions table |
| `packages/database/src/schema/schedules.ts` | Schedules table |
| `packages/database/src/schema/integrations.ts` | Integrations table |
| `packages/database/src/schema/audit-logs.ts` | Audit log table |
| `packages/database/src/schema/api-keys.ts` | API keys table |
| `packages/database/src/schema/users.ts` | Users table |
| `packages/database/src/repositories/base.ts` | Base repository class (CRUD patterns) |
| `packages/database/src/repositories/agent.repository.ts` | Agent data access |
| `packages/database/src/repositories/repo.repository.ts` | Repository data access |
| `packages/database/src/repositories/session.repository.ts` | Session data access |
| `packages/database/drizzle.config.ts` | Drizzle Kit migration config |

**Database schema (key tables):**

```typescript
// schema/agents.ts
import { pgTable, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const agentStatusEnum = pgEnum('agent_status', [
  'idle', 'running', 'paused', 'completed', 'failed', 'aborted'
]);

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  providerId: text('provider_id').notNull().default('claude'),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  config: jsonb('config').$type<Record<string, unknown>>(),
  status: agentStatusEnum('status').notNull().default('idle'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/repositories.ts
export const repoStatusEnum = pgEnum('repo_status', [
  'synced', 'syncing', 'error', 'uninitialized'
]);

export const repositories = pgTable('repositories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  remoteUrl: text('remote_url'),
  defaultBranch: text('default_branch').notNull().default('main'),
  status: repoStatusEnum('status').notNull().default('uninitialized'),
  metadata: jsonb('metadata').$type<RepoMetadata>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/sessions.ts
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').references(() => agents.id),
  repositoryId: text('repository_id').references(() => repositories.id),
  name: text('name'),
  messages: jsonb('messages').$type<SessionMessage[]>().default([]),
  status: text('status').notNull().default('active'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
  tokenCount: integer('token_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/api-keys.ts
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),  // SHA-256 hash, never store plaintext
  keyPrefix: text('key_prefix').notNull(),        // First 8 chars for identification
  permissions: jsonb('permissions').$type<string[]>().default([]),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// schema/audit-logs.ts
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),         // 'agent.run', 'repo.sync', 'schedule.create', etc.
  actorType: text('actor_type').notNull(),  // 'user', 'system', 'schedule', 'integration'
  actorId: text('actor_id'),
  resourceType: text('resource_type'),      // 'agent', 'repository', 'schedule'
  resourceId: text('resource_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### 0.4 — packages/agent-engine

**Purpose**: Core agent orchestration, extracted from Consola's `ClaudeAgentService.ts` and abstracted for multi-provider support.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/package.json` | Dependencies: @anthropic-ai/sdk, openai (optional), event emitter |
| `packages/agent-engine/tsconfig.json` | Extends base |
| `packages/agent-engine/src/index.ts` | Barrel export |
| `packages/agent-engine/src/providers/provider.interface.ts` | `AgentProvider` interface definition |
| `packages/agent-engine/src/providers/claude.provider.ts` | Claude/Anthropic implementation (from Consola) |
| `packages/agent-engine/src/providers/provider-registry.ts` | Registry for available providers |
| `packages/agent-engine/src/agent-instance.ts` | Single agent instance lifecycle |
| `packages/agent-engine/src/agent-runner.ts` | Runs an agent against a prompt in a working directory |
| `packages/agent-engine/src/session-manager.ts` | Session creation, persistence, resumption |
| `packages/agent-engine/src/permission-manager.ts` | Tool permission checking (trust modes) |
| `packages/agent-engine/src/terminal-service.ts` | PTY management for agent tool use (from Consola) |
| `packages/agent-engine/src/cost-tracker.ts` | Token and cost tracking per session/agent |

**Key abstraction — Provider Interface:**

```typescript
// providers/provider.interface.ts
export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly models: string[];

  initialize(config: ProviderConfig): Promise<void>;
  createConversation(options: ConversationOptions): AgentConversation;
  validateConfig(config: ProviderConfig): boolean;
}

export interface AgentConversation {
  sendMessage(prompt: string): AsyncIterable<AgentEvent>;
  abort(): void;
  getTokenUsage(): TokenUsage;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  maxConcurrentRequests?: number;
}
```

**Extraction plan from Consola:**

1. Copy `ClaudeAgentService.ts` → refactor into `claude.provider.ts` implementing `AgentProvider`
2. Extract the event emission patterns into `agent-instance.ts`
3. Extract session handling into `session-manager.ts`
4. Copy `TerminalService.ts` directly (already zero Electron deps)
5. Extract permission/trust mode logic into `permission-manager.ts`
6. Keep all agent event types from `src/shared/types.ts` in `packages/core`

### 0.5 — apps/backend

**Purpose**: Hono HTTP server with REST API routes and WebSocket streaming for real-time agent communication.

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/package.json` | Dependencies: hono, @hono/node-server, ws, dotenv |
| `apps/backend/tsconfig.json` | Extends base |
| `apps/backend/src/index.ts` | Server entry point (start Hono + WebSocket) |
| `apps/backend/src/config.ts` | Environment-based configuration (port, db url, redis url, etc.) |
| `apps/backend/src/app.ts` | Hono app factory with middleware |
| `apps/backend/src/middleware/auth.ts` | API key + JWT authentication middleware |
| `apps/backend/src/middleware/audit.ts` | Audit logging middleware |
| `apps/backend/src/middleware/error-handler.ts` | Global error handler |
| `apps/backend/src/middleware/cors.ts` | CORS configuration |
| `apps/backend/src/routes/health.routes.ts` | Health check endpoint |
| `apps/backend/src/routes/agents.routes.ts` | Agent CRUD + run endpoints |
| `apps/backend/src/routes/sessions.routes.ts` | Session management endpoints |
| `apps/backend/src/websocket/gateway.ts` | WebSocket upgrade handler + connection manager |
| `apps/backend/src/websocket/agent-stream.ts` | Stream agent events over WebSocket |
| `apps/backend/Dockerfile` | Multi-stage Docker build |

**API endpoints (Phase 0 — minimal set):**

```
# Health
GET  /api/health

# Auth
POST /api/auth/keys              # Create API key
GET  /api/auth/keys              # List API keys
DELETE /api/auth/keys/:id        # Revoke API key

# Agents
POST /api/agents/run             # Start an agent run (returns session ID)
POST /api/agents/abort/:sessionId # Abort a running agent
GET  /api/agents/sessions        # List sessions
GET  /api/agents/sessions/:id    # Get session details + messages

# WebSocket
WS   /ws/agent/:sessionId       # Real-time agent event stream
```

**WebSocket protocol:**

```typescript
// Client → Server messages
type ClientMessage =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'send_message'; sessionId: string; content: string }
  | { type: 'abort'; sessionId: string }
  | { type: 'ping' };

// Server → Client messages
type ServerMessage =
  | { type: 'agent_event'; sessionId: string; event: AgentEvent }
  | { type: 'session_update'; sessionId: string; status: AgentStatus }
  | { type: 'error'; message: string; code: string }
  | { type: 'pong' };
```

### 0.6 — apps/web (Minimal Chat UI)

**Purpose**: Minimal React frontend that connects to the backend and allows chatting with an agent in a selected working directory.

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/package.json` | Dependencies: react, react-dom, zustand, tailwindcss, radix-ui |
| `apps/web/tsconfig.json` | Extends base |
| `apps/web/vite.config.ts` | Vite config with proxy to backend |
| `apps/web/tailwind.config.ts` | Tailwind configuration |
| `apps/web/index.html` | HTML entry point |
| `apps/web/src/main.tsx` | React entry point |
| `apps/web/src/App.tsx` | Root component with router |
| `apps/web/src/pages/ChatPage.tsx` | Single-agent chat page |
| `apps/web/src/stores/agent.store.ts` | Agent state (from Consola patterns) |
| `apps/web/src/stores/session.store.ts` | Session state |
| `apps/web/src/services/api-client.ts` | HTTP client (fetch wrapper) |
| `apps/web/src/services/ws-client.ts` | WebSocket connection manager |
| `apps/web/src/components/ChatInput.tsx` | Message input (from Consola) |
| `apps/web/src/components/ChatMessage.tsx` | Message display (from Consola) |
| `apps/web/src/components/AgentStatus.tsx` | Agent status indicator |

**Note**: In Phase 0, this is intentionally minimal — a single chat page. Dashboard, fleet view, and other pages come in later phases.

### 0.7 — Docker Compose (Development)

**File**: `docker-compose.dev.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fleetwide
      POSTGRES_USER: fleetwide
      POSTGRES_PASSWORD: fleetwide_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### Success Criteria — Phase 0

#### Automated Verification:
- [x] `pnpm install` completes without errors
- [x] `pnpm turbo build` builds all packages and apps successfully
- [x] `pnpm turbo typecheck` passes with zero errors
- [x] `pnpm turbo lint` passes with zero errors
- [x] `pnpm turbo test` — unit tests pass for `packages/core` (53 tests, 4 files)
- [ ] `pnpm turbo test` — unit tests pass for `packages/database`, `packages/agent-engine`
- [ ] `docker compose -f docker-compose.dev.yml up` starts PostgreSQL and Redis
- [ ] Database migrations run successfully: `pnpm --filter database migrate`
- [ ] Backend starts: `pnpm --filter backend dev` → server listening on :8080
- [ ] Web frontend starts: `pnpm --filter web dev` → serving on :3000
- [ ] `curl http://localhost:8080/api/health` returns 200

#### Manual Verification:
- [ ] Open `http://localhost:3000` in browser → chat UI loads
- [ ] Type a message → agent responds in real-time via WebSocket streaming
- [ ] Agent can read files in the specified working directory
- [ ] Agent can execute tools (file read, write, bash) with permission checks
- [ ] Session is persisted in PostgreSQL and survives server restart
- [ ] Cost/token tracking is visible in session details

**Implementation Note**: After completing Phase 0 and all automated verification passes, pause for manual confirmation before proceeding to Phase 1.

---

## Phase 1: Repository Fleet Management

**Duration**: Weeks 3–4
**Goal**: Repository registration, sync, fleet dashboard, and workspace-scoped agent sessions.
**Dependencies**: Phase 0 complete.

### 1.1 — packages/repo-manager

**Purpose**: Repository fleet management — register repos, clone/sync them, perform git operations.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/repo-manager/package.json` | Dependencies: simple-git |
| `packages/repo-manager/src/index.ts` | Barrel export |
| `packages/repo-manager/src/repo-registry.ts` | Register, list, update, remove repos |
| `packages/repo-manager/src/repo-sync.service.ts` | Clone, pull, fetch repos from remote |
| `packages/repo-manager/src/git.service.ts` | Git operations: status, diff, log, branch (from Consola) |
| `packages/repo-manager/src/file-browser.service.ts` | Browse files/directories in a repo |
| `packages/repo-manager/src/repo-analyzer.ts` | Detect languages, file count, last commit |
| `packages/repo-manager/src/fleet-operations.ts` | Stub for Phase 2 cross-repo operations |

**Key implementation details:**

```typescript
// repo-registry.ts
export class RepoRegistry {
  constructor(private db: DatabaseService) {}

  async register(opts: { name: string; path?: string; remoteUrl?: string }): Promise<Repository>;
  async list(filter?: RepoFilter): Promise<PaginatedResult<Repository>>;
  async get(id: string): Promise<Repository | null>;
  async update(id: string, data: Partial<Repository>): Promise<Repository>;
  async remove(id: string, deleteFiles?: boolean): Promise<void>;
  async getByPath(path: string): Promise<Repository | null>;
}

// repo-sync.service.ts
export class RepoSyncService {
  async cloneRepo(remoteUrl: string, targetPath: string): Promise<Repository>;
  async pullRepo(repoId: string): Promise<SyncResult>;
  async syncAll(): Promise<SyncResult[]>;
  async getStatus(repoId: string): Promise<RepoSyncStatus>;
}
```

**Extraction plan from Consola:**
- Extract git operations from `src/main/ipc-handlers.ts` (lines with `simpleGit` calls)
- These are already Electron-independent, just need to be refactored into a proper service class

### 1.2 — Repository API Routes

**Files to modify/create:**

| File | Purpose |
|------|---------|
| `apps/backend/src/routes/repos.routes.ts` | Repository CRUD + sync endpoints |
| `apps/backend/src/routes/files.routes.ts` | File browsing + git operations |

**New API endpoints:**

```
# Repositories
POST   /api/repos                    # Register a repository
GET    /api/repos                    # List all repositories
GET    /api/repos/:id                # Get repository details
PATCH  /api/repos/:id                # Update repository config
DELETE /api/repos/:id                # Remove repository
POST   /api/repos/:id/sync           # Trigger sync (pull)
POST   /api/repos/sync-all           # Sync all repositories

# File Operations
GET    /api/repos/:id/files          # List files in directory (path query param)
GET    /api/repos/:id/files/content   # Read file content
GET    /api/repos/:id/git/status     # Git status
GET    /api/repos/:id/git/diff       # Git diff
GET    /api/repos/:id/git/log        # Git log
GET    /api/repos/:id/git/branches   # List branches
```

### 1.3 — Fleet Dashboard UI

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/pages/DashboardPage.tsx` | Fleet overview — repo grid/list, stats, quick actions |
| `apps/web/src/pages/RepoDetailPage.tsx` | Single repo view — files, git status, agent chat |
| `apps/web/src/components/RepoCard.tsx` | Repository card with status, language, last sync |
| `apps/web/src/components/RepoList.tsx` | Repository list/grid with filtering |
| `apps/web/src/components/AddRepoDialog.tsx` | Dialog to register a new repo (path or URL) |
| `apps/web/src/components/FileBrowser.tsx` | File tree browser |
| `apps/web/src/components/GitStatus.tsx` | Git status display |
| `apps/web/src/stores/repo.store.ts` | Repository state management |
| `apps/web/src/services/repo-client.ts` | HTTP client for repo endpoints |

**Layout:**
- Top nav: Dashboard | Repos | Agents | Schedules (greyed out) | Integrations (greyed out)
- Dashboard: Grid of repo cards showing name, status, languages, last commit
- Repo detail: Split view — file browser on left, agent chat on right

### 1.4 — Workspace-Scoped Agent Sessions

**Modifications:**

Update `apps/backend/src/routes/agents.routes.ts`:
```
POST /api/agents/run
  body: {
    repositoryId: string;     # NEW — scope agent to a repository
    prompt: string;
    providerId?: string;      # Default: 'claude'
    model?: string;
    systemPrompt?: string;
  }
```

The agent runner now:
1. Looks up the repository by ID
2. Sets the working directory to the repo's local path
3. Passes repo context (name, branch, recent commits) to the system prompt
4. All file operations are scoped to the repo directory

### Success Criteria — Phase 1

#### Automated Verification:
- [ ] `pnpm turbo build` succeeds
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` — repo-manager unit tests pass (registry, sync, git ops)
- [ ] `POST /api/repos` with a valid git URL → returns 201 with repo object
- [ ] `GET /api/repos` → returns list of registered repos
- [ ] `POST /api/repos/:id/sync` → clones/pulls the repo to local disk
- [ ] `GET /api/repos/:id/files` → returns directory listing
- [ ] `GET /api/repos/:id/git/status` → returns git status

#### Manual Verification:
- [ ] Dashboard shows all registered repos with correct metadata
- [ ] Can add a new repo via the UI (both local path and remote URL)
- [ ] Can browse files in a repo from the dashboard
- [ ] Can open a repo and chat with an agent scoped to that repo
- [ ] Agent correctly references files in the selected repo
- [ ] Repo sync (pull) works and updates metadata

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Agent Orchestration

**Duration**: Weeks 5–7
**Goal**: Multi-agent teams, concurrent agent management, fleet-wide operations across repositories.
**Dependencies**: Phase 1 complete.

### 2.1 — AgentPool

**Purpose**: Manage a pool of concurrent agent instances with resource limits.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/src/agent-pool.ts` | Concurrent agent instance management |
| `packages/agent-engine/src/agent-pool.config.ts` | Pool configuration (max concurrent, timeouts) |

```typescript
// agent-pool.ts
export class AgentPool {
  constructor(private config: AgentPoolConfig, private providerRegistry: ProviderRegistry) {}

  async acquire(options: AgentConfig): Promise<AgentInstance>;
  async release(instanceId: string): Promise<void>;
  getActive(): AgentInstance[];
  getStats(): PoolStats;     // active, queued, completed, failed counts
  async shutdown(): Promise<void>;   // Graceful shutdown of all agents
}

export interface AgentPoolConfig {
  maxConcurrent: number;       // Max simultaneous agents (e.g., 10)
  queueSize: number;           // Max queued requests
  defaultTimeout: number;      // Per-agent timeout in ms
  costLimit?: number;          // Max USD spend per hour
}
```

### 2.2 — AgentOrchestrator

**Purpose**: Coordinate multi-agent workflows — define a plan, assign sub-tasks to agents, aggregate results.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/src/agent-orchestrator.ts` | Multi-agent workflow coordination |
| `packages/agent-engine/src/workflow.ts` | Workflow definition types |
| `packages/agent-engine/src/agent-communication.ts` | Shared context and handoff between agents |

```typescript
// agent-orchestrator.ts
export class AgentOrchestrator {
  constructor(private pool: AgentPool, private db: DatabaseService) {}

  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult>;
  async executeParallel(tasks: AgentTask[]): Promise<AgentTaskResult[]>;
  async executeSequential(tasks: AgentTask[]): Promise<AgentTaskResult[]>;
}

// workflow.ts
export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  type: 'parallel' | 'sequential';
  tasks: AgentTask[];
  dependsOn?: string[];  // Step IDs this step depends on
}

export interface AgentTask {
  repositoryId: string;
  prompt: string;
  providerId?: string;
  model?: string;
  context?: Record<string, unknown>;  // Shared context from previous steps
}
```

### 2.3 — FleetAgent (Cross-Repo Operations)

**Purpose**: Execute the same operation across multiple repositories with result aggregation.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/src/fleet-agent.ts` | Cross-repo operations |
| `packages/agent-engine/src/fleet-proposal.ts` | Fleet change proposal (review before apply) |

```typescript
// fleet-agent.ts
export class FleetAgent {
  constructor(
    private orchestrator: AgentOrchestrator,
    private repoRegistry: RepoRegistry,
  ) {}

  // Run the same prompt across selected repos
  async runAcrossFleet(opts: FleetRunOptions): Promise<FleetRunResult>;

  // Create a fleet-wide change proposal (dry run)
  async proposeFleetChange(opts: FleetChangeOptions): Promise<FleetProposal>;

  // Apply an approved proposal
  async applyProposal(proposalId: string): Promise<FleetApplyResult>;
}

export interface FleetRunOptions {
  repositoryIds: string[] | 'all';
  prompt: string;
  concurrency: number;       // How many repos to process in parallel
  providerId?: string;
  stopOnError?: boolean;
}
```

### 2.4 — Permission & Approval Workflows

**Files to create/modify:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/src/approval.service.ts` | Approval workflow for fleet operations |
| `packages/database/src/schema/approvals.ts` | Approvals table |
| `apps/backend/src/routes/fleet.routes.ts` | Fleet operation endpoints |

**New API endpoints:**

```
# Fleet Operations
POST /api/fleet/run               # Run prompt across repos
POST /api/fleet/propose           # Create fleet change proposal (dry run)
GET  /api/fleet/proposals         # List proposals
GET  /api/fleet/proposals/:id     # Get proposal details
POST /api/fleet/proposals/:id/approve  # Approve and apply proposal
POST /api/fleet/proposals/:id/reject   # Reject proposal

# Agent Pool
GET  /api/agents/pool/stats       # Pool status (active, queued, etc.)
```

### 2.5 — Orchestration UI

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/pages/FleetPage.tsx` | Fleet operations page |
| `apps/web/src/components/FleetRunDialog.tsx` | Dialog to configure fleet-wide agent run |
| `apps/web/src/components/FleetProposal.tsx` | Display proposal with per-repo diffs |
| `apps/web/src/components/AgentPoolStatus.tsx` | Real-time pool status display |
| `apps/web/src/components/WorkflowBuilder.tsx` | Visual workflow step builder |
| `apps/web/src/stores/fleet.store.ts` | Fleet state management |

### Success Criteria — Phase 2

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` — agent-pool, orchestrator, fleet-agent unit tests pass
- [ ] Agent pool respects `maxConcurrent` limit (test with concurrent requests)
- [ ] Fleet run across 3+ test repos completes and returns aggregated results
- [ ] Fleet proposal creates a reviewable diff for each repo
- [ ] Approval workflow correctly blocks unapproved proposals

#### Manual Verification:
- [ ] Can initiate a fleet-wide run from the UI (e.g., "add LICENSE file to all repos")
- [ ] Agent pool status updates in real-time on the dashboard
- [ ] Fleet proposal shows per-repo diffs with approve/reject actions
- [ ] Can run multiple agents concurrently (visible in pool status)
- [ ] Cross-repo operation with 10+ repos completes within reasonable time

**Implementation Note**: After completing Phase 2 and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Scheduling & Automation

**Duration**: Weeks 8–9
**Goal**: Time-based recurrent agent tasks, event-driven triggers, and comprehensive audit logging.
**Dependencies**: Phase 2 complete, Redis running.

### 3.1 — packages/scheduler

**Purpose**: Schedule agent tasks using cron expressions, with BullMQ for reliable job processing.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/scheduler/package.json` | Dependencies: bullmq, cron-parser |
| `packages/scheduler/src/index.ts` | Barrel export |
| `packages/scheduler/src/scheduler.service.ts` | CRUD for schedules, cron parsing |
| `packages/scheduler/src/job-processor.ts` | BullMQ worker that executes scheduled agent tasks |
| `packages/scheduler/src/recurrent-task-runner.ts` | Create BullMQ repeatable jobs from schedules |
| `packages/scheduler/src/trigger-engine.ts` | Event-driven triggers (webhook, git push, etc.) |
| `packages/scheduler/src/schedule-templates.ts` | Predefined templates (daily review, weekly cleanup) |

```typescript
// scheduler.service.ts
export class SchedulerService {
  constructor(
    private db: DatabaseService,
    private queue: Queue,   // BullMQ queue
  ) {}

  async create(schedule: CreateScheduleInput): Promise<Schedule>;
  async update(id: string, data: UpdateScheduleInput): Promise<Schedule>;
  async delete(id: string): Promise<void>;
  async list(filter?: ScheduleFilter): Promise<PaginatedResult<Schedule>>;
  async enable(id: string): Promise<void>;
  async disable(id: string): Promise<void>;
  async getNextRuns(id: string, count: number): Promise<Date[]>;
  async getHistory(id: string): Promise<ScheduleRun[]>;
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  cronExpression: string;       // e.g., '0 9 * * MON-FRI' (weekdays at 9am)
  timezone: string;             // e.g., 'Europe/Amsterdam'
  repositoryIds: string[] | 'all';
  prompt: string;
  providerId?: string;
  model?: string;
  enabled: boolean;
}
```

**Database additions:**

```typescript
// schema/schedules.ts — extend existing stub
export const schedules = pgTable('schedules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  repositoryIds: jsonb('repository_ids').$type<string[]>().notNull(),
  prompt: text('prompt').notNull(),
  providerId: text('provider_id').default('claude'),
  model: text('model'),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  runCount: integer('run_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const scheduleRuns = pgTable('schedule_runs', {
  id: text('id').primaryKey(),
  scheduleId: text('schedule_id').references(() => schedules.id).notNull(),
  status: text('status').notNull(),   // 'running', 'completed', 'failed'
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  results: jsonb('results'),          // Per-repo results
  error: text('error'),
});
```

### 3.2 — Scheduler API Routes

**File**: `apps/backend/src/routes/schedules.routes.ts`

```
# Schedules
POST   /api/schedules                # Create schedule
GET    /api/schedules                # List schedules
GET    /api/schedules/:id            # Get schedule details
PATCH  /api/schedules/:id            # Update schedule
DELETE /api/schedules/:id            # Delete schedule
POST   /api/schedules/:id/enable     # Enable schedule
POST   /api/schedules/:id/disable    # Disable schedule
POST   /api/schedules/:id/run-now    # Trigger immediate run
GET    /api/schedules/:id/history    # Get run history
GET    /api/schedules/:id/next-runs  # Preview next N run times

# Triggers (event-driven)
POST   /api/triggers                 # Create event trigger
GET    /api/triggers                 # List triggers
POST   /api/webhooks/:triggerId      # Inbound webhook endpoint
```

### 3.3 — Scheduler UI

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/pages/SchedulesPage.tsx` | Schedule list + create/edit |
| `apps/web/src/components/ScheduleForm.tsx` | Create/edit schedule form with cron builder |
| `apps/web/src/components/CronBuilder.tsx` | Visual cron expression builder |
| `apps/web/src/components/ScheduleHistory.tsx` | Run history table with status |
| `apps/web/src/components/ScheduleCard.tsx` | Schedule card with next run, status |
| `apps/web/src/stores/schedule.store.ts` | Schedule state management |

### 3.4 — Audit Logging Enhancement

**Files to modify/create:**

| File | Purpose |
|------|---------|
| `apps/backend/src/middleware/audit.ts` | Enhance: log all agent actions, schedule runs, fleet operations |
| `apps/backend/src/routes/audit.routes.ts` | Audit log query endpoints |
| `apps/web/src/pages/AuditLogPage.tsx` | Audit log viewer with filtering |

```
# Audit
GET /api/audit                     # Query audit logs (with filters)
GET /api/audit/stats               # Audit statistics (actions per day, top actors)
```

### Success Criteria — Phase 3

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` — scheduler unit tests pass (CRUD, cron parsing, job processing)
- [ ] BullMQ worker processes jobs from the queue
- [ ] Cron expression `*/5 * * * *` (every 5 min) creates repeatable job in BullMQ
- [ ] Schedule run creates audit log entries
- [ ] `GET /api/schedules/:id/next-runs` returns correct future times

#### Manual Verification:
- [ ] Can create a schedule via UI with cron builder
- [ ] Schedule triggers at expected time and runs agent across selected repos
- [ ] Schedule run history shows results with per-repo status
- [ ] Can enable/disable schedules from UI
- [ ] "Run Now" triggers immediate execution
- [ ] Audit log shows all scheduled runs and agent actions

**Implementation Note**: After completing Phase 3 and all automated verification passes, pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Integrations

**Duration**: Weeks 10–12
**Goal**: Plugin architecture for external system connectors — GitHub, Slack, CI/CD, observability.
**Dependencies**: Phase 3 complete.

### 4.1 — Integration Hub (Plugin Architecture)

**Purpose**: In-process plugin system that allows connectors to register, receive events, and perform actions.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/integrations/package.json` | Base package for integration framework |
| `packages/integrations/src/index.ts` | Barrel export |
| `packages/integrations/src/integration-hub.ts` | Plugin registry, lifecycle management |
| `packages/integrations/src/plugin.interface.ts` | Interface all plugins must implement |
| `packages/integrations/src/webhook-receiver.ts` | Inbound webhook handling + routing |
| `packages/integrations/src/notification.service.ts` | Outbound notification abstraction |
| `packages/integrations/src/event-bridge.ts` | Routes internal events to interested plugins |

```typescript
// plugin.interface.ts
export interface IntegrationPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly configSchema: ZodSchema;  // Zod schema for config validation

  initialize(config: unknown, context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;

  // Receive events from the platform
  onEvent?(event: PlatformEvent): Promise<void>;

  // Webhook handling
  onWebhook?(request: WebhookRequest): Promise<WebhookResponse>;

  // Health check
  healthCheck(): Promise<HealthStatus>;
}

export interface PluginContext {
  logger: Logger;
  db: DatabaseService;
  agentEngine: AgentEngine;
  repoManager: RepoRegistry;
  scheduler: SchedulerService;
  sendNotification(target: NotificationTarget, message: NotificationMessage): Promise<void>;
}
```

### 4.2 — GitHub Connector

**File**: `packages/integrations/src/connectors/github.connector.ts`

**Capabilities:**
- **Inbound webhooks**: PR opened, push, issue created → trigger agent tasks
- **Outbound actions**: Create PRs, comment on issues, create releases
- **Data queries**: List repos, PRs, issues
- **Auth**: GitHub App or Personal Access Token

### 4.3 — Slack Connector

**File**: `packages/integrations/src/connectors/slack.connector.ts`

**Capabilities:**
- **Inbound**: Slash commands (`/fleetwide run "prompt"`), mentions, message actions
- **Outbound**: Send notifications, thread replies, rich block messages
- **Interactive**: Approval buttons for fleet proposals

### 4.4 — CI/CD Connector

**File**: `packages/integrations/src/connectors/cicd.connector.ts`

**Capabilities:**
- **Inbound webhooks**: Build completed, deploy finished
- **Outbound actions**: Trigger builds/pipelines
- **Supported**: GitHub Actions, Jenkins, CircleCI (via generic webhook adapter)

### 4.5 — Integration Configuration UI

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/pages/IntegrationsPage.tsx` | Integration marketplace / list |
| `apps/web/src/components/IntegrationCard.tsx` | Integration card with status |
| `apps/web/src/components/IntegrationConfig.tsx` | Dynamic config form from schema |
| `apps/web/src/components/WebhookLog.tsx` | Incoming webhook log viewer |

**New API endpoints:**

```
# Integrations
GET    /api/integrations                    # List available integrations
POST   /api/integrations/:type/configure    # Configure an integration
GET    /api/integrations/:type/status       # Get integration status
DELETE /api/integrations/:type              # Remove integration
POST   /api/integrations/:type/test         # Test integration connection
GET    /api/integrations/webhooks/log       # View incoming webhook log
```

### Success Criteria — Phase 4

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` — integration hub, plugin loading, event routing tests pass
- [ ] GitHub connector: mock webhook → triggers agent run
- [ ] Slack connector: mock incoming message → processes command
- [ ] Plugin lifecycle: initialize → event → shutdown works correctly
- [ ] Config validation rejects invalid integration configs

#### Manual Verification:
- [ ] Can configure GitHub integration via UI with PAT
- [ ] GitHub webhook (PR opened) triggers agent review on the repo
- [ ] Agent creates a PR comment via GitHub connector
- [ ] Can configure Slack integration via UI
- [ ] Agent completion sends notification to Slack channel
- [ ] Integration status page shows health of all connectors

**Implementation Note**: After completing Phase 4 and all automated verification passes, pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Production Readiness

**Duration**: Weeks 13–15
**Goal**: Docker containerization, auth hardening, monitoring, CLI, and documentation.
**Dependencies**: Phase 4 complete.

### 5.1 — Docker Containerization

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/Dockerfile` | Multi-stage build for backend |
| `apps/web/Dockerfile` | Build + nginx for static frontend |
| `docker-compose.yml` | Production compose file |
| `docker-compose.dev.yml` | Update dev compose with all services |
| `.dockerignore` | Ignore node_modules, .git, etc. |

**Production docker-compose.yml:**

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    ports:
      - "${BACKEND_PORT:-8080}:8080"
    environment:
      DATABASE_URL: postgresql://fleetwide:${DB_PASSWORD}@postgres:5432/fleetwide
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      REPOS_BASE_PATH: /repos
    volumes:
      - repos:/repos
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "${WEB_PORT:-3000}:80"

  worker:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    command: ["node", "dist/worker.js"]
    environment:
      DATABASE_URL: postgresql://fleetwide:${DB_PASSWORD}@postgres:5432/fleetwide
      REDIS_URL: redis://redis:6379
    volumes:
      - repos:/repos
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fleetwide
      POSTGRES_USER: fleetwide
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
  repos:
```

**Goal**: `docker compose up` starts the entire platform from scratch.

### 5.2 — Auth Hardening

**Files to create/modify:**

| File | Purpose |
|------|---------|
| `apps/backend/src/middleware/auth.ts` | Enhance: JWT token issuance, refresh, revocation |
| `apps/backend/src/routes/auth.routes.ts` | Login, token refresh, key management |
| `packages/database/src/schema/users.ts` | Users table with password hashing (argon2) |
| `apps/web/src/services/auth-client.ts` | Auth client with token management |
| `apps/web/src/stores/auth.store.ts` | Auth state (user, tokens) |
| `apps/web/src/components/LoginPage.tsx` | Login page |

**Auth flow:**
1. First run: CLI generates initial admin API key → displayed once
2. Admin creates users via API or UI
3. Users log in with username/password → receive JWT
4. JWT used for all subsequent API requests
5. API keys still supported for programmatic access (CI, scripts)

### 5.3 — Monitoring & Health

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/src/routes/health.routes.ts` | Enhance: deep health check (db, redis, disk) |
| `apps/backend/src/monitoring/metrics.ts` | Prometheus-compatible metrics endpoint |
| `apps/backend/src/monitoring/health-checker.ts` | Periodic health checks for all services |

**Endpoints:**

```
GET /api/health           # Quick health check (200/503)
GET /api/health/deep      # Detailed check: db, redis, disk, agent pool
GET /api/metrics          # Prometheus metrics (optional)
```

### 5.4 — CLI

**Purpose**: Command-line interface for managing the platform without the web UI.

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/cli/package.json` | Dependencies: commander, chalk, ora |
| `apps/cli/src/index.ts` | CLI entry point |
| `apps/cli/src/commands/start.ts` | `fleetwide start` — start backend daemon |
| `apps/cli/src/commands/status.ts` | `fleetwide status` — platform status |
| `apps/cli/src/commands/repo.ts` | `fleetwide repo add/list/sync/remove` |
| `apps/cli/src/commands/agent.ts` | `fleetwide agent run/list/abort` |
| `apps/cli/src/commands/schedule.ts` | `fleetwide schedule create/list/enable/disable` |
| `apps/cli/src/commands/auth.ts` | `fleetwide auth create-key/login` |
| `apps/cli/src/api-client.ts` | HTTP client pointing to backend |
| `apps/cli/src/config.ts` | CLI config (~/.fleetwide/config.json) |

**CLI commands:**

```bash
# Platform management
fleetwide start                          # Start backend + worker
fleetwide status                         # Show platform health
fleetwide stop                           # Stop all services

# Repository management
fleetwide repo add <url-or-path>         # Register repository
fleetwide repo list                      # List all repositories
fleetwide repo sync [--all]              # Sync repositories
fleetwide repo remove <id>               # Remove repository

# Agent operations
fleetwide agent run <repo> "prompt"      # Run agent on repo
fleetwide agent run --fleet "prompt"     # Run across all repos
fleetwide agent list                     # List active agents
fleetwide agent abort <session-id>       # Abort running agent

# Scheduling
fleetwide schedule create --cron "0 9 * * *" --repos all "Review code"
fleetwide schedule list
fleetwide schedule enable <id>
fleetwide schedule disable <id>

# Auth
fleetwide auth create-key --name "ci-key"
fleetwide auth login
```

### 5.5 — Documentation

**Files to create:**

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start |
| `docs/getting-started.md` | Installation, first run, configuration |
| `docs/architecture.md` | System architecture overview |
| `docs/api-reference.md` | Full REST API documentation |
| `docs/cli-reference.md` | CLI command reference |
| `docs/integrations.md` | Integration setup guides |
| `docs/deployment.md` | Docker, production deployment guide |
| `docs/development.md` | Contributing, development setup |

### Success Criteria — Phase 5

#### Automated Verification:
- [ ] `docker compose build` succeeds
- [ ] `docker compose up` starts all services (backend, web, worker, postgres, redis)
- [ ] Health check passes: `curl http://localhost:8080/api/health` → 200
- [ ] Deep health check confirms db + redis connectivity
- [ ] CLI builds: `pnpm --filter cli build`
- [ ] `fleetwide status` returns platform health
- [ ] `fleetwide repo list` returns registered repos
- [ ] Auth: create API key → use it to authenticate API requests
- [ ] Auth: login → receive JWT → use JWT for subsequent requests

#### Manual Verification:
- [ ] Fresh `docker compose up` on a new machine → platform fully functional
- [ ] Can complete full workflow: register repo → run agent → see results
- [ ] Scheduled tasks run at correct times in Docker deployment
- [ ] GitHub integration works end-to-end in Docker deployment
- [ ] CLI provides equivalent functionality to web UI for core operations
- [ ] Documentation is clear enough for a new user to get started

**Implementation Note**: Phase 5 completion marks the v1.0 release milestone.

---

## Testing Strategy

### Unit Tests (per package)
- **packages/core**: Type validation, utility functions, error classes
- **packages/database**: Repository classes, migration scripts (test PostgreSQL via testcontainers)
- **packages/agent-engine**: Provider interface, agent pool limits, permission checks, session management
- **packages/repo-manager**: Registry CRUD, git operations (mock simple-git), file browsing
- **packages/scheduler**: Cron parsing, schedule CRUD, job processing (mock BullMQ)
- **packages/integrations**: Plugin lifecycle, event routing, webhook handling

### Integration Tests
- **Backend API**: Full request/response cycle with test database
- **WebSocket**: Agent streaming end-to-end
- **Scheduler → Agent**: Scheduled job triggers agent run
- **Integration → Agent**: Webhook triggers agent run

### End-to-End Tests
- Register repo → run agent → verify file changes
- Create schedule → wait for trigger → verify run
- Fleet operation → approve proposal → verify changes across repos

### Manual Testing Checklist
- [ ] Complete user journey: install → configure → register repos → run agents → schedule
- [ ] Error scenarios: invalid API key, bad cron expression, network failure during sync
- [ ] Performance: 10+ concurrent agents, 50+ registered repos
- [ ] Interruption: server restart during agent run → session recovery

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Many concurrent agents | AgentPool with configurable `maxConcurrent` limit |
| Large fleets (100+ repos) | Paginated APIs, lazy-loaded metadata, background sync |
| WebSocket scaling | Connection pooling, heartbeat, automatic reconnection |
| Database performance | Indexes on frequently queried columns, connection pooling |
| Redis memory | BullMQ job cleanup policies, TTL on completed jobs |
| Disk space (cloned repos) | Shallow clones where possible, cleanup stale repos |
| Cost control | Per-session and per-hour cost limits in AgentPool |

---

## Migration Notes

### From Consola to Fleetwide
- Consola session data (SQLite) is **not** migrated — this is a fresh start
- Consola users can continue using Consola for single-repo work
- Future: Consola desktop app could become a thin client connecting to Fleetwide backend (Option B from research)

### Database Migrations
- All migrations managed via Drizzle Kit (`drizzle-kit generate` → `drizzle-kit migrate`)
- Migrations are forward-only (no down migrations in v1)
- Each phase adds its own migration files

---

## References

### Source Repository (Consola)
- Repository: `console-1` at commit `fbec51e`
- `src/main/ClaudeAgentService.ts` — Core agent wrapper to extract
- `src/main/ipc-handlers.ts` — Git operations to extract (lines ~390-820)
- `src/shared/types.ts` — Agent event types to port
- `src/renderer/components/Agent/` — 26 UI component files to adapt
- `src/renderer/components/Markdown/` — 6 markdown rendering files to adapt
- `src/renderer/stores/agentStore.ts` — State management patterns (24KB)

### Research Document
- `documentation/research/2026-02-17-platform-architecture-migration-analysis.md`

### Technology Documentation
- [Hono](https://hono.dev/) — Backend framework
- [Drizzle ORM](https://orm.drizzle.team/) — Database ORM
- [BullMQ](https://docs.bullmq.io/) — Job queue
- [Turborepo](https://turbo.build/repo) — Monorepo build system
- [Radix UI](https://www.radix-ui.com/) — UI component primitives
