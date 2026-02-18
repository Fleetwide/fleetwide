# Docker Workspace Architecture — Implementation Plan

## Overview

Replace the host-based agent execution model with **Docker-based workspaces** — isolated, reproducible environments where AI agents run inside ephemeral containers. A workspace is a persistent definition (Docker image + repos + setup commands + env vars); each agent session spins up a fresh container from that definition.

This plan is standalone and references the [main platform plan](./2026-02-17-platform-architecture-migration.md) where relevant.

---

## Current State Analysis

### What Exists

| Package | Status | Relevance |
|---------|--------|-----------|
| `packages/core` | Fully built (types, events, utils, 53 tests) | Needs new workspace/container types |
| `packages/database` | Fully built (3 tables, 1 migration) | Needs new workspace tables |
| `packages/repo-manager` | Fully built (git, registry, GitHub App) | Stays as-is; clones target container volumes instead of host disk |
| `apps/backend` | Fully built (health, GitHub, repos routes) | Needs workspace routes |
| `apps/web` | Partial (API client + repos store) | Needs workspace UI |
| `packages/agent-engine` | Not started | Should be designed from scratch to target containers |

### What the Main Plan Assumed

The [main plan](./2026-02-17-platform-architecture-migration.md) assumes agents run directly on the host:
- `AgentConfig.workingDirectory` points to a host path
- `TerminalService` manages PTYs on the host
- No isolation between agent sessions or repos

### What This Plan Changes

- Agents run inside Docker containers via `docker exec`
- Repos are cloned inside containers (into mounted volumes)
- Each agent session gets a fresh container — no state leaks between runs
- Dependency caches (npm, pnpm, pip) persist across sessions for speed
- The `packages/agent-engine` (not yet built) should be designed from the start to target containers

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
  ✓ Explicit user action (fleetwide agent destroy <session-id>)
  ✗ Push failed after retries → status: 'failed', container KEPT for debugging

Session data available after container dies:
  ✓ Conversation messages (streamed to DB in real-time during 'running')
  ✓ Diff summary (computed during 'finalizing', stored in DB)
  ✓ Branch name, PR URL, cost/token tracking (all in DB)
  ✓ Setup command logs (stored in DB)
  ✗ Container filesystem (gone — but changes are in the remote branch)
```

### Verification

- `fleetwide workspace create --image node:22 --repo my-repo` → creates workspace definition
- `fleetwide agent run <workspace-id> "fix the auth bug"` → container starts, agent runs, branch pushed, container idles
- `fleetwide agent preview <session-id>` → user checks out branch locally
- `fleetwide agent approve <session-id>` → PR created on GitHub, container destroyed
- After 30 min idle without approval → container auto-destroyed, session still reviewable in DB
- `fleetwide agent inspect <session-id>` → view conversation/diffs even after container is gone

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
| Docker SDK | `dockerode` + `@types/dockerode` | Full Docker Engine API coverage, native TypeScript types |
| Container runtime | Docker Engine | Already required by `docker-compose.dev.yml` |
| Volume driver | `local` (default) | Named volumes for dependency caches |
| Stream handling | Node.js `PassThrough` + `modem.demuxStream` | Correctly separates stdout/stderr from multiplexed Docker streams |

---

## Data Model

### New Types (`packages/core/src/types/workspace.ts`)

```typescript
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  // Container definition
  image: string;                        // Docker image (e.g., 'node:22', 'python:3.12-slim')
  setupCommands: string[];              // Run after clone (e.g., ['pnpm install', 'pnpm build'])
  environmentVariables: Record<string, string>;  // Injected into container (non-secret)
  // Resource limits
  memorySizeMb: number;                 // Default: 512
  cpuCount: number;                     // Default: 1 (maps to NanoCpus)
  // Repos
  repositoryIds: string[];              // Repos cloned into /workspace/{repo-name}/
  // Metadata
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceStatus = 'active' | 'error' | 'archived';

export interface WorkspaceSession {
  id: string;
  workspaceId: string;
  containerId?: string;                 // Docker container ID (null after container destroyed)
  containerName: string;                // e.g., 'fleetwide-session-abc123'
  status: WorkspaceSessionStatus;
  // Branch-push-preview workflow
  branchName?: string;                  // e.g., 'fleetwide/session-abc123'
  branchPushed: boolean;
  prUrl?: string;
  prNumber?: number;
  diffSummary?: DiffSummary;
  // Persisted session data (survives container destruction)
  messages: SessionMessage[];           // Agent conversation (streamed to DB in real-time)
  setupLogs: SetupLogEntry[];           // Setup command outputs
  // Container lifecycle
  containerAlive: boolean;              // Derived: container still exists
  idleTimeoutMinutes: number;           // Default: 30
  lastActivityAt?: Date;                // Last exec/agent action
  containerDestroyedAt?: Date;          // When container was removed
  // Cost tracking
  costUsd: number;
  tokenCount: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface SetupLogEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export type WorkspaceSessionStatus =
  | 'starting'       // Container is being created/started
  | 'setup'          // Running setup commands (clone, install)
  | 'running'        // Agent is executing
  | 'finalizing'     // Agent done, committing + pushing changes (container alive)
  | 'preview'        // Branch pushed, container idle, awaiting user review
  | 'approved'       // User approved, PR created, container destroyed
  | 'rejected'       // User rejected, branch deleted, container destroyed
  | 'completed'      // Session finished (no code changes), container destroyed
  | 'failed'         // Error during any phase (container kept if push failed)
  | 'expired';       // Container destroyed by idle timeout (session data still in DB)

export interface ContainerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: Array<{
    path: string;
    repoName: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    insertions: number;
    deletions: number;
  }>;
}
```

### New DB Schema

```typescript
// packages/database/src/schema/workspaces.ts
export const workspaceStatusEnum = pgEnum('workspace_status', [
  'active', 'error', 'archived'
]);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Container definition
  image: text('image').notNull(),                    // e.g., 'node:22'
  setupCommands: jsonb('setup_commands').$type<string[]>().default([]),
  environmentVariables: jsonb('environment_variables').$type<Record<string, string>>().default({}),
  // Resource limits
  memorySizeMb: integer('memory_size_mb').notNull().default(512),
  cpuCount: integer('cpu_count').notNull().default(1),
  // State
  status: workspaceStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Many-to-many: workspace ↔ repositories
export const workspaceRepos = pgTable('workspace_repos', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').references(() => workspaces.id).notNull(),
  repositoryId: text('repository_id').references(() => repositories.id).notNull(),
  // Mount path inside container (default: /workspace/{repo-name})
  mountPath: text('mount_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Agent sessions — replaces the simpler sessions table from the main plan
export const sessionStatusEnum = pgEnum('session_status', [
  'starting', 'setup', 'running', 'finalizing', 'preview',
  'approved', 'rejected', 'completed', 'failed', 'expired'
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').references(() => workspaces.id).notNull(),
  // Container tracking
  containerId: text('container_id'),
  containerName: text('container_name'),
  status: sessionStatusEnum('status').notNull().default('starting'),
  // Agent details
  prompt: text('prompt').notNull(),
  providerId: text('provider_id').notNull().default('claude'),
  model: text('model'),
  systemPrompt: text('system_prompt'),
  messages: jsonb('messages').$type<SessionMessage[]>().default([]),
  // Branch-push-preview workflow
  branchName: text('branch_name'),
  branchPushed: boolean('branch_pushed').default(false),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  diffSummary: jsonb('diff_summary').$type<DiffSummary>(),
  // Persisted session data (survives container destruction)
  setupLogs: jsonb('setup_logs').$type<SetupLogEntry[]>().default([]),     // Setup command outputs
  // Cost tracking
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
  tokenCount: integer('token_count').default(0),
  // Container lifecycle
  idleTimeoutMinutes: integer('idle_timeout_minutes').notNull().default(30),
  lastActivityAt: timestamp('last_activity_at'),                            // Updated on each exec/agent action
  containerDestroyedAt: timestamp('container_destroyed_at'),                // When container was removed
  // Timestamps
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
```

---

## Phase 1: Workspace Manager Package

**Goal**: New `packages/workspace-manager` package that manages Docker container lifecycle, volumes, and command execution.

**Dependencies**: Phase 0 of the main plan (core, database) must be complete.

### 1.1 — Core Types & DB Schema

**Files to create/modify:**

| File | Purpose |
|------|---------|
| `packages/core/src/types/workspace.ts` | Workspace, WorkspaceSession, ContainerExecResult types |
| `packages/core/src/types/index.ts` | Re-export workspace types |
| `packages/core/src/utils/validation.ts` | Add Zod schemas for workspace creation/update |
| `packages/core/src/events/system-events.ts` | Add workspace/session events |
| `packages/database/src/schema/workspaces.ts` | workspaces + workspace_repos + sessions tables |
| `packages/database/src/schema/index.ts` | Re-export new schema |

**New system events:**

```typescript
// Added to packages/core/src/events/system-events.ts
'session.starting'        // Container being created
'session.setup'           // Setup commands running
'session.running'         // Agent executing
'session.finalizing'      // Agent done, committing + pushing changes
'session.preview_ready'   // Branch pushed, container idle, awaiting review
'session.approved'        // User approved, PR created, container destroyed
'session.rejected'        // User rejected, branch deleted, container destroyed
'session.completed'       // Session done (no changes)
'session.failed'          // Session errored (container kept if push failed)
'session.expired'         // Container destroyed by idle timeout
'session.message'         // Agent conversation message persisted to DB
```

**Zod schemas:**

```typescript
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  image: z.string().min(1),                          // Docker image reference
  repositoryIds: z.array(z.string()).min(1),          // At least one repo
  setupCommands: z.array(z.string()).default([]),
  environmentVariables: z.record(z.string()).default({}),
  memorySizeMb: z.number().int().min(128).max(8192).default(512),
  cpuCount: z.number().int().min(1).max(8).default(1),
});

export const runAgentInWorkspaceSchema = z.object({
  workspaceId: z.string(),
  prompt: z.string().min(1),
  providerId: z.string().default('claude'),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});
```

### 1.2 — Container Service

**Purpose**: Low-level Docker operations — create, start, exec, stop, remove containers.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/workspace-manager/package.json` | Dependencies: dockerode, @types/dockerode, @fleetwide/core |
| `packages/workspace-manager/tsconfig.json` | Extends base |
| `packages/workspace-manager/src/index.ts` | Barrel export |
| `packages/workspace-manager/src/container.service.ts` | Docker container lifecycle |
| `packages/workspace-manager/src/docker-client.ts` | Dockerode client factory |

**Key implementation:**

```typescript
// docker-client.ts
import Docker from 'dockerode';

export function createDockerClient(): Docker {
  return new Docker({ socketPath: '/var/run/docker.sock' });
}

// container.service.ts
export class ContainerService {
  constructor(private docker: Docker) {}

  async createAndStart(opts: {
    sessionId: string;
    image: string;
    env: Record<string, string>;
    binds: string[];          // Volume mounts
    memorySizeMb: number;
    cpuCount: number;
    labels: Record<string, string>;
  }): Promise<{ containerId: string; containerName: string }>;

  async exec(
    containerId: string,
    cmd: string[],
    opts?: { workingDir?: string; env?: string[] },
  ): Promise<ContainerExecResult>;

  async execStream(
    containerId: string,
    cmd: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    opts?: { workingDir?: string; env?: string[] },
  ): Promise<number>; // exit code

  async stop(containerId: string, timeoutSeconds?: number): Promise<void>;

  async remove(containerId: string): Promise<void>;

  async getStatus(containerId: string): Promise<'running' | 'stopped' | 'not_found'>;

  // Cleanup orphaned fleetwide containers on startup
  async pruneOrphaned(): Promise<number>;
}
```

**Container creation details:**

```typescript
// Inside createAndStart():
const containerName = `fleetwide-session-${opts.sessionId}`;

const container = await this.docker.createContainer({
  name: containerName,
  Image: opts.image,
  Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'],  // Keep-alive sentinel
  WorkingDir: '/workspace',
  Env: Object.entries(opts.env).map(([k, v]) => `${k}=${v}`),
  Labels: {
    'fleetwide.managed': 'true',
    'fleetwide.session-id': opts.sessionId,
    ...opts.labels,
  },
  HostConfig: {
    Binds: opts.binds,
    Memory: opts.memorySizeMb * 1024 * 1024,
    MemorySwap: opts.memorySizeMb * 1024 * 1024,  // No swap
    NanoCpus: opts.cpuCount * 1_000_000_000,
    NetworkMode: 'bridge',  // Needs internet for git push, API calls
    AutoRemove: false,      // Manual cleanup for error inspection
  },
});

await container.start();
```

**Exec with demuxStream:**

```typescript
// Inside exec():
import { PassThrough } from 'stream';

const execInstance = await container.exec({
  Cmd: cmd,
  AttachStdout: true,
  AttachStderr: true,
  WorkingDir: opts?.workingDir ?? '/workspace',
  Env: opts?.env,
});

const stream = await execInstance.start({ hijack: false, stdin: false });

const stdoutPass = new PassThrough();
const stderrPass = new PassThrough();
let stdout = '';
let stderr = '';

stdoutPass.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
stderrPass.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

// Poll exec.inspect() for completion (stream 'end' is unreliable)
const exitCode = await this.waitForExec(execInstance);
```

### 1.3 — Volume Service

**Purpose**: Manage named Docker volumes for dependency caches.

**File**: `packages/workspace-manager/src/volume.service.ts`

```typescript
export class VolumeService {
  constructor(private docker: Docker) {}

  // Ensure a named volume exists (idempotent)
  async ensureVolume(name: string): Promise<void>;

  // Get volume mounts for a session
  getBindMounts(opts: {
    repos: Array<{ id: string; name: string; hostPath: string }>;
    image: string;  // Used to determine which cache volumes to mount
  }): string[];

  // Remove volumes for a workspace (when workspace deleted)
  async removeWorkspaceVolumes(workspaceId: string): Promise<void>;

  // List all fleetwide-managed volumes
  async listManagedVolumes(): Promise<Array<{ name: string; sizeBytes: number }>>;

  // Prune unused cache volumes
  async pruneUnused(): Promise<number>;
}
```

**Volume naming convention:**

```
fleetwide-deps-{workspaceId}          Shared dependency cache for the workspace
                                      Mounted to language-specific paths inside container:
                                        /root/.npm          (npm cache)
                                        /root/.pnpm-store   (pnpm content-addressable store)
                                        /root/.cache/pip    (pip cache)
                                        /root/.cargo        (Rust cargo registry)
```

**Bind mount strategy:**

For each session, the VolumeService generates a list of Docker bind mount strings:

```typescript
getBindMounts(opts) {
  const binds: string[] = [];

  // Repo source code — bind mount from host (read-write)
  for (const repo of opts.repos) {
    binds.push(`${repo.hostPath}:/workspace/${repo.name}:rw`);
  }

  // Dependency cache — named volume (persistent across sessions)
  binds.push(`fleetwide-deps-${workspaceId}:/root/.cache:rw`);

  return binds;
}
```

**Important**: Repos are bind-mounted from the host path where `repo-manager` cloned them. The agent works on a branch inside the container — changes are written to the host filesystem via the bind mount, so `git push` from inside the container works against the actual repo files.

### 1.4 — Session Orchestrator

**Purpose**: High-level orchestration of a workspace session lifecycle — from container creation through setup, agent execution, branch push, and cleanup.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/workspace-manager/src/session-orchestrator.ts` | Full session lifecycle |
| `packages/workspace-manager/src/git-in-container.ts` | Git operations inside containers (branch, commit, push) |

```typescript
// session-orchestrator.ts
export class SessionOrchestrator {
  constructor(
    private containerService: ContainerService,
    private volumeService: VolumeService,
    private githubAppService: GitHubAppService,
    private repoRegistry: RepoRegistry,
    private db: DatabaseService,
  ) {}

  // Full lifecycle: create container → clone/pull repos → run setup → ready for agent
  async startSession(opts: {
    workspaceId: string;
    sessionId: string;
    prompt: string;
    idleTimeoutMinutes?: number;        // Default: 30
    onStatusChange: (status: WorkspaceSessionStatus) => void;
  }): Promise<{ containerId: string }>;

  // Execute a command inside the session's container (updates lastActivityAt)
  async exec(sessionId: string, cmd: string[]): Promise<ContainerExecResult>;

  // Stream exec output (for WebSocket forwarding to UI)
  async execStream(
    sessionId: string,
    cmd: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
  ): Promise<number>;

  // Persist an agent message to DB in real-time (called per message during agent run)
  async persistMessage(sessionId: string, message: SessionMessage): Promise<void>;

  // After agent completes: commit changes, push branch, update session status
  // Container stays alive after this — moves to 'preview' status
  async finalizeSession(sessionId: string): Promise<{
    branchName: string;
    diffSummary: DiffSummary;
    hasChanges: boolean;
  }>;

  // Create PR from preview branch, then destroy container
  async approveSession(sessionId: string): Promise<{ prUrl: string; prNumber: number }>;

  // Delete remote branch, then destroy container
  async rejectSession(sessionId: string): Promise<void>;

  // Explicitly stop and remove container (user-initiated or timeout)
  // Session data remains in DB — user can still review conversation, diffs, etc.
  async destroyContainer(sessionId: string, reason: 'user' | 'timeout' | 'approved' | 'rejected'): Promise<void>;

  // Check if session container has exceeded idle timeout
  async isExpired(sessionId: string): Promise<boolean>;

  // Get session data (works even after container is destroyed)
  async getSession(sessionId: string): Promise<WorkspaceSession>;
}
```

**Session lifecycle in detail:**

```
startSession():
  1. Load workspace definition from DB
  2. Load repos associated with workspace
  3. For each GitHub-sourced repo: generate fresh installation token
  4. Ensure dependency cache volume exists
  5. Create container:
     - Image from workspace definition
     - Bind mounts: repo host paths → /workspace/{name}
     - Named volume: dependency cache
     - Env vars: workspace env + GITHUB_TOKEN + git identity
  6. Start container → status: 'starting'
  7. For each repo: exec `git checkout {defaultBranch} && git pull` → fresh state
  8. Create working branch: exec `git checkout -b fleetwide/session-{id}`
  9. Run setup commands (e.g., `pnpm install`) → status: 'setup'
     - Each setup command output is persisted to DB as a SetupLogEntry
  10. Set lastActivityAt = now(), start idle timeout timer
  11. Ready for agent → status: 'running'

exec() / persistMessage():
  - Every exec call updates lastActivityAt in DB (resets idle timer)
  - Every agent message is persisted to session.messages in DB in real-time
  - This ensures conversation is never lost, even if container crashes

finalizeSession():
  status: 'running' → 'finalizing'
  1. For each repo with changes:
     a. exec `git add -A && git commit -m "fleetwide: {summary}"`
     b. Generate fresh GitHub installation token
     c. exec `git push https://x-access-token:{token}@github.com/{org}/{repo}.git`
     d. If push fails after 3 retries → status: 'failed', container KEPT for debugging
  2. Compute diff summary, persist to session.diffSummary in DB
  3. Update session: status → 'preview', branchPushed → true
  4. Container stays alive (idle) — user can still exec commands, inspect files
  5. Reset lastActivityAt = now(), idle timeout timer continues

  If no changes detected:
  1. Update session: status → 'completed'
  2. Destroy container (nothing to preview)

approveSession():
  (Works whether container is alive or already destroyed — only needs GitHub API)
  1. For each repo with a pushed branch:
     a. Create PR via GitHub API (Octokit)
  2. Update session: status → 'approved', prUrl, prNumber
  3. Destroy container if still alive

rejectSession():
  (Works whether container is alive or already destroyed — only needs GitHub API)
  1. For each repo with a pushed branch:
     a. Delete remote branch via GitHub API
  2. Update session: status → 'rejected'
  3. Destroy container if still alive

destroyContainer(reason):
  1. Stop container (graceful: SIGTERM → 10s → SIGKILL)
  2. Remove container
  3. Update session: containerDestroyedAt = now(), containerId = null
  4. If reason === 'timeout': status → 'expired'
  5. Session data remains in DB — fully reviewable without container

idleTimeoutCheck() (runs on interval, e.g., every 60 seconds):
  1. Query sessions WHERE status = 'preview' AND lastActivityAt < (now - idleTimeoutMinutes)
  2. For each expired session: destroyContainer(sessionId, 'timeout')
  3. Emit 'session.expired' event
```

**Key invariant**: Session data (messages, diffs, branch info, logs) is persisted to DB throughout the lifecycle. The container is a runtime resource that can be destroyed at any time without losing session history. A user can always run `fleetwide agent inspect <session-id>` to review a session, regardless of whether its container still exists.

### 1.5 — Idle Timeout Manager

**Purpose**: Background process that checks for expired preview containers and destroys them.

**File**: `packages/workspace-manager/src/idle-timeout-manager.ts`

```typescript
export class IdleTimeoutManager {
  private intervalId?: NodeJS.Timeout;

  constructor(
    private sessionOrchestrator: SessionOrchestrator,
    private db: DatabaseService,
    private checkIntervalMs: number = 60_000,  // Check every 60 seconds
  ) {}

  // Start the background check loop
  start(): void {
    this.intervalId = setInterval(() => this.checkExpiredSessions(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async checkExpiredSessions(): Promise<void> {
    // Query: status = 'preview' AND lastActivityAt < (now - idleTimeoutMinutes)
    const expired = await this.db.getExpiredPreviewSessions();
    for (const session of expired) {
      await this.sessionOrchestrator.destroyContainer(session.id, 'timeout');
      // Emits 'session.expired' event → WebSocket notifies connected clients
    }
  }
}
```

Started by the backend on boot, alongside the existing health check and orphan pruning.

### Success Criteria — Phase 1

#### Automated Verification:
- [x] `pnpm turbo build` succeeds with new packages
- [x] `pnpm turbo typecheck` passes
- [x] `pnpm turbo test` — workspace-manager unit tests pass:
  - ContainerService: create, exec, stop, remove (mock dockerode)
  - VolumeService: ensure, list, prune (mock dockerode)
  - SessionOrchestrator: lifecycle states (mock container + volume services)
  - IdleTimeoutManager: expires sessions past timeout (mock DB + orchestrator)
- [x] DB migration applies: workspaces, workspace_repos, sessions tables created
- [x] Docker socket accessible: ContainerService can `docker.ping()`

#### Manual Verification:
- [x] Can create a container from `node:22`, exec `node --version`, get output, destroy it
- [x] Named volume persists across container create/destroy cycles
- [x] Orphaned container pruning works after simulated crash
- [ ] Session orchestrator runs full lifecycle with a test repo
- [ ] Container stays alive in 'preview' state, exec still works
- [ ] Container destroyed after idle timeout, session data still in DB
- [ ] Session messages persisted in real-time during agent run

**Implementation Note**: Phase 1 is the foundation. It can be tested standalone without the agent engine. After Phase 1, pause for verification.

---

## Phase 2: Workspace API & Backend Integration

**Goal**: Backend routes for workspace management + session lifecycle control.

**Dependencies**: Phase 1 complete.

### 2.1 — Workspace CRUD Routes

**File**: `apps/backend/src/routes/workspaces.routes.ts`

```
# Workspaces
POST   /api/workspaces                     # Create workspace
GET    /api/workspaces                     # List workspaces
GET    /api/workspaces/:id                 # Get workspace details
PATCH  /api/workspaces/:id                 # Update workspace
DELETE /api/workspaces/:id                 # Delete workspace + cleanup volumes

# Workspace Repos
POST   /api/workspaces/:id/repos           # Add repo to workspace
DELETE /api/workspaces/:id/repos/:repoId   # Remove repo from workspace
```

### 2.2 — Session Lifecycle Routes

**File**: `apps/backend/src/routes/sessions.routes.ts`

```
# Sessions
POST   /api/sessions                       # Start a new session (creates container)
GET    /api/sessions                       # List sessions (filter by workspace, status)
GET    /api/sessions/:id                   # Get session details (works after container destroyed)
POST   /api/sessions/:id/exec             # Execute command in session container (only if container alive)
DELETE /api/sessions/:id                   # Destroy container (session data preserved in DB)

# Session Data (works regardless of container state)
GET    /api/sessions/:id/messages          # Get persisted conversation messages
GET    /api/sessions/:id/logs              # Get setup command logs
GET    /api/sessions/:id/diff              # Get diff summary
GET    /api/sessions/:id/branch            # Get branch info + checkout instructions

# Preview Workflow (works regardless of container state — uses GitHub API)
POST   /api/sessions/:id/approve           # Approve → create PR, destroy container if alive
POST   /api/sessions/:id/reject            # Reject → delete branch, destroy container if alive
```

### 2.3 — Service Wiring

**File**: `apps/backend/src/services.ts` — update to include workspace services

```typescript
// Add to createServices():
import Docker from 'dockerode';
import { ContainerService, VolumeService, SessionOrchestrator } from '@fleetwide/workspace-manager';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const containerService = new ContainerService(docker);
const volumeService = new VolumeService(docker);
const sessionOrchestrator = new SessionOrchestrator(
  containerService,
  volumeService,
  githubAppService,
  repoRegistry,
  db,
);
```

### 2.4 — Docker Socket Access in Development

**File**: `docker-compose.dev.yml` — update to mount Docker socket

```yaml
services:
  postgres:
    # ... existing config

  redis:
    # ... existing config

# Note: The Fleetwide backend runs on the HOST (not in Docker) during development,
# so it can access /var/run/docker.sock directly. The Docker socket mount is only
# needed for the production docker-compose.yml where the backend itself runs in a
# container.
```

For production (`docker-compose.yml`), the backend container needs the Docker socket:

```yaml
services:
  backend:
    # ... existing config
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Docker socket for workspace management
      - repos:/repos
```

### 2.5 — WebSocket Integration for Session Streaming

Update the WebSocket protocol from the [main plan](./2026-02-17-platform-architecture-migration.md) to support session events:

```typescript
// Server → Client messages (additions)
type ServerMessage =
  | { type: 'session_status'; sessionId: string; status: WorkspaceSessionStatus }
  | { type: 'session_output'; sessionId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'session_setup_progress'; sessionId: string; command: string; exitCode: number }
  | { type: 'session_message'; sessionId: string; message: SessionMessage }       // Real-time conversation
  | { type: 'session_idle_warning'; sessionId: string; minutesRemaining: number } // Idle timeout approaching
  | { type: 'session_expired'; sessionId: string }                                // Container destroyed by timeout
  // ... existing agent_event, error, pong messages
```

### Success Criteria — Phase 2

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] `POST /api/workspaces` → creates workspace with image + repos
- [ ] `GET /api/workspaces` → lists workspaces with repo details
- [ ] `POST /api/sessions` with workspaceId → container starts, repos clone, setup runs
- [ ] `POST /api/sessions/:id/exec` with `{ cmd: ["node", "--version"] }` → returns output
- [ ] `GET /api/sessions/:id/diff` → returns diff summary after agent makes changes
- [ ] `POST /api/sessions/:id/approve` → creates PR on GitHub
- [ ] `POST /api/sessions/:id/reject` → deletes remote branch
- [ ] `DELETE /api/sessions/:id` → stops and removes container

#### Manual Verification:
- [ ] Can create a workspace via API and see it listed
- [ ] Session container starts and runs setup commands
- [ ] Can exec arbitrary commands inside the session container
- [ ] Session streaming shows real-time output over WebSocket
- [ ] Container is cleaned up after session ends

**Implementation Note**: Phase 2 is backend-only. The web UI comes in Phase 4. Use CLI/curl for testing.

---

## Phase 3: Agent Execution in Workspaces

**Goal**: Build the agent engine from scratch to target workspace containers. This replaces the host-based agent engine described in the [main plan](./2026-02-17-platform-architecture-migration.md) Phase 0.4.

**Dependencies**: Phase 2 complete.

### 3.1 — Agent Engine (Container-Native)

The `packages/agent-engine` package from the main plan is built with container execution as the primary target.

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/agent-engine/package.json` | Dependencies: @anthropic-ai/sdk, @fleetwide/core, @fleetwide/workspace-manager |
| `packages/agent-engine/src/index.ts` | Barrel export |
| `packages/agent-engine/src/providers/provider.interface.ts` | AgentProvider interface (from main plan) |
| `packages/agent-engine/src/providers/claude.provider.ts` | Claude implementation |
| `packages/agent-engine/src/providers/provider-registry.ts` | Provider registry |
| `packages/agent-engine/src/agent-runner.ts` | Runs agent inside a workspace session |
| `packages/agent-engine/src/tools/container-bash.tool.ts` | Bash tool: exec inside container |
| `packages/agent-engine/src/tools/container-file.tool.ts` | File read/write: exec inside container |
| `packages/agent-engine/src/cost-tracker.ts` | Token and cost tracking |

**Key difference from the main plan's agent engine:**

The main plan assumed tools (bash, file read/write) execute on the host via `TerminalService`. In the workspace model, all tools execute inside the container via `SessionOrchestrator.exec()`:

```typescript
// tools/container-bash.tool.ts
export class ContainerBashTool {
  constructor(private sessionOrchestrator: SessionOrchestrator) {}

  async execute(sessionId: string, command: string): Promise<ToolResult> {
    const result = await this.sessionOrchestrator.exec(sessionId, [
      '/bin/sh', '-c', command,
    ]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }
}

// tools/container-file.tool.ts
export class ContainerFileTool {
  constructor(private sessionOrchestrator: SessionOrchestrator) {}

  async read(sessionId: string, path: string): Promise<string> {
    const result = await this.sessionOrchestrator.exec(sessionId, ['cat', path]);
    if (result.exitCode !== 0) throw new NotFoundError(`File not found: ${path}`);
    return result.stdout;
  }

  async write(sessionId: string, path: string, content: string): Promise<void> {
    // Write via heredoc to handle special characters
    const result = await this.sessionOrchestrator.exec(sessionId, [
      '/bin/sh', '-c', `cat > '${path}'`,
    ]);
    // Note: actual implementation will pipe content via stdin
  }

  async list(sessionId: string, dir: string): Promise<FileEntry[]> {
    const result = await this.sessionOrchestrator.exec(sessionId, [
      'find', dir, '-maxdepth', '1', '-printf', '%y %s %f\n',
    ]);
    // Parse output into FileEntry[]
  }
}
```

### 3.2 — Agent Run Flow

The complete flow when a user runs an agent against a workspace:

```
1.  POST /api/agents/run { workspaceId, prompt }
2.  Backend creates a session via SessionOrchestrator.startSession()
    → Container starts, repos pulled, branch created, setup commands run
    → Setup logs persisted to DB
3.  Backend creates AgentRunner with ContainerBashTool + ContainerFileTool
4.  AgentRunner calls Claude/OpenAI API with tools pointing at the container
5.  Agent streams events → forwarded via WebSocket to UI
    → Each message persisted to DB in real-time via SessionOrchestrator.persistMessage()
    → Each exec updates lastActivityAt (resets idle timer)
6.  Agent completes → SessionOrchestrator.finalizeSession()
    → status: 'finalizing' — commits + pushes branch to GitHub
    → If push fails: status: 'failed', container KEPT for debugging
    → If push succeeds: status: 'preview', container stays alive (idle)
    → If no changes: status: 'completed', container destroyed
7.  Container idles in 'preview' — user can still exec commands if needed
8.  User previews locally: `fleetwide agent preview <session-id>`
    → Works whether container is alive or not (branch is on GitHub)
9.  User approves: `fleetwide agent approve <session-id>` → PR created, container destroyed
    OR user rejects: `fleetwide agent reject <session-id>` → branch deleted, container destroyed
    OR idle timeout (30 min): container destroyed, session data still in DB → user can still approve/reject
10. User can review session at any time: `fleetwide agent inspect <session-id>`
    → Shows conversation, diffs, logs — even after container is gone
```

### 3.3 — Agent Run API

**File**: `apps/backend/src/routes/agents.routes.ts`

```
# Agent Operations
POST   /api/agents/run                     # Start agent in workspace (creates session)
  body: {
    workspaceId: string;
    prompt: string;
    providerId?: string;
    model?: string;
    systemPrompt?: string;
  }
  returns: { sessionId: string }

POST   /api/agents/abort/:sessionId        # Abort running agent + stop container

# WebSocket
WS     /ws/session/:sessionId             # Real-time agent events + container output
```

### Success Criteria — Phase 3

#### Automated Verification:
- [ ] `pnpm turbo build && pnpm turbo typecheck` passes
- [ ] `pnpm turbo test` — agent-engine unit tests pass (mock provider + mock container)
- [ ] Agent run creates a session container
- [ ] Agent bash tool executes commands inside the container (not on host)
- [ ] Agent file operations read/write files inside the container
- [ ] Agent messages are persisted to DB in real-time during agent run
- [ ] After agent completes, changes are committed and pushed to GitHub
- [ ] Session status transitions correctly: starting → setup → running → finalizing → preview
- [ ] Container stays alive in 'preview' status (not immediately destroyed)
- [ ] Approve/reject work both when container is alive and after it's been destroyed
- [ ] Agent abort stops the container
- [ ] Setup command logs are persisted in DB

#### Manual Verification:
- [ ] Run agent against a Node.js workspace → agent can `npm test`, edit files, etc.
- [ ] Agent changes are visible in the pushed branch on GitHub
- [ ] Container remains alive after agent finishes (status: 'preview')
- [ ] Can still exec commands in container during 'preview' state
- [ ] `fleetwide agent preview <session-id>` checks out the branch locally
- [ ] `fleetwide agent approve <session-id>` creates a PR and destroys container
- [ ] After container destroyed: `fleetwide agent inspect <session-id>` shows full conversation + diffs
- [ ] After idle timeout: container destroyed, but approve/reject still works
- [ ] Agent cannot access files outside `/workspace/` in the container

**Implementation Note**: This phase makes the platform functional end-to-end for the first time. After Phase 3, a user can create a workspace, run an agent, preview changes, and create a PR.

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
| `apps/web/src/stores/workspace.store.ts` | Workspace state management |
| `apps/web/src/stores/session.store.ts` | Session state management |
| `apps/web/src/services/workspace-client.ts` | HTTP client for workspace/session endpoints |

**Workspace creation wizard flow:**

```
Step 1: Name & Image
  - Workspace name
  - Docker image (presets: node:22, python:3.12, golang:1.22, ubuntu:24.04, custom)

Step 2: Repositories
  - Select from imported repos (checkboxes)
  - Shows repo name, source badge, language

Step 3: Setup & Environment
  - Setup commands (ordered list, e.g., "pnpm install", "pip install -r requirements.txt")
  - Environment variables (key-value pairs, with "secret" toggle for sensitive values)

Step 4: Resources (optional)
  - Memory: slider (128MB - 8GB, default 512MB)
  - CPU: slider (1-8, default 1)

Step 5: Review & Create
```

### 4.2 — Multi-Repo Workspace Details

When a workspace has multiple repos, the container mounts each at `/workspace/{repo-name}/`:

```
/workspace/
├── frontend-app/      (repo A)
├── backend-api/       (repo B)
└── shared-config/     (repo C)
```

The agent is told about the workspace structure in its system prompt:

```
You are working in a workspace with the following repositories:
- /workspace/frontend-app/ — React frontend (github.com/org/frontend-app)
- /workspace/backend-api/ — Node.js API (github.com/org/backend-api)
- /workspace/shared-config/ — Shared configuration (github.com/org/shared-config)

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
- [ ] Session streaming displays output in real-time

#### Manual Verification:
- [ ] Can create a workspace via the wizard with image + repos + setup commands
- [ ] Workspace list shows all workspaces with correct status and repo count
- [ ] Can start an agent run from the workspace detail page
- [ ] Agent output streams in real-time during execution
- [ ] Diff view shows changes after agent completes (grouped by repo)
- [ ] Approve button creates PRs (one per changed repo)
- [ ] Reject button deletes remote branches and marks session as rejected
- [ ] Multi-repo workspace: agent can work across repos, each gets its own PR

**Implementation Note**: Phase 4 completion means the platform is usable end-to-end via the web UI.

---

## How This Integrates with the Main Plan

This plan replaces/modifies the following sections of the [main platform plan](./2026-02-17-platform-architecture-migration.md):

| Main Plan Section | Change |
|-------------------|--------|
| Phase 0.4 (agent-engine) | **Replaced** by this plan's Phase 3 — agent engine targets containers |
| Phase 0.5 (backend, agent routes) | **Modified** — agent routes reference workspaces instead of repos directly |
| Phase 1.5 (workspace-scoped sessions) | **Replaced** by this plan's workspace sessions |
| Phase 2 (fleet operations) | **Unaffected** — fleet operations run across workspaces (or repos within workspaces) |
| Phase 3 (scheduling) | **Modified** — scheduled runs target workspaces, spin up containers |
| Phase 5 (Docker, CLI) | **Modified** — CLI includes workspace + session commands; Docker compose mounts socket |

**Additions to the main plan's Decisions Summary:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Agent isolation** | Docker containers per session | Security, reproducibility, multi-runtime support |
| **Workspace model** | Hybrid (ephemeral containers, persistent dep caches) | Clean state per run, fast setup via cached dependencies |
| **Docker SDK** | dockerode | Full Docker API, native TypeScript types, active maintenance |

**Additions to the main plan's CLI:**

```bash
# Workspace management
fleetwide workspace create --name "my-api" --image node:22 --repo my-repo
fleetwide workspace list
fleetwide workspace delete <id>

# Session management (replaces direct agent run)
fleetwide agent run <workspace-id> "fix the auth bug"
fleetwide agent preview <session-id>          # Checkout branch locally
fleetwide agent approve <session-id>          # Create PR (works even after container destroyed)
fleetwide agent reject <session-id>           # Delete branch (works even after container destroyed)
fleetwide agent inspect <session-id>          # View conversation, diffs, logs (always works)
fleetwide agent destroy <session-id>          # Explicitly destroy container (session data preserved)
```

---

## Testing Strategy

### Unit Tests

- **workspace-manager/container.service**: Create, exec, stop, remove (mock dockerode)
- **workspace-manager/volume.service**: Ensure, list, prune (mock dockerode)
- **workspace-manager/session-orchestrator**: Full lifecycle transitions (mock container + volume + git)
- **agent-engine/container-bash.tool**: Commands exec inside container, not on host
- **agent-engine/container-file.tool**: File operations target container filesystem

### Integration Tests

- **Backend → workspace-manager → Docker**: Full session lifecycle with real Docker (requires Docker daemon in CI)
- **Agent → container exec → git push**: End-to-end agent run with branch push
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
| Disk space (volumes) | `pruneUnused()` on startup + periodic cleanup. Monitor via `/api/health/deep` |
| Image pulls | First workspace creation may be slow if image not cached. Pre-pull common images |

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Agent escaping container | Default Docker isolation (namespaces, cgroups). No `--privileged`. No Docker socket inside container |
| Access to host filesystem | Only explicitly bind-mounted repo paths are accessible |
| Secret leakage | Env vars injected at runtime, never baked into images. Secrets cleared on container destroy. Conversation logs in DB may contain sensitive output — access-controlled |
| Idle container exposure | Containers in 'preview' state still have network access. Idle timeout limits exposure window. Consider dropping network after finalize in future |
| GitHub token scope | Installation tokens are short-lived (~1 hour) and repo-scoped |
| Resource exhaustion | Memory + CPU limits per container. `OomKillDisable: false` (fail fast) |
| Network access | Containers get `bridge` network (needed for git push + API calls). Consider restricting egress in future |

---

## References

- [Main Platform Plan](./2026-02-17-platform-architecture-migration.md) — Overall Fleetwide architecture
- [GitHub Integration MVP](./2026-02-17-github-integration-mvp.md) — GitHub App setup
- [dockerode](https://github.com/apocas/dockerode) — Docker SDK for Node.js
- [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [Dev Containers Specification](https://containers.dev/implementors/spec/) — Future reference for devcontainer.json support
