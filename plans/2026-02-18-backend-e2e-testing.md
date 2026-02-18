# Backend E2E Testing Setup — Implementation Plan

## Overview

Set up a state-of-the-art E2E testing infrastructure for the `@fleetwide/backend` NestJS application. Tests will exercise all 5 controllers (~34 endpoints) through real HTTP requests against a real PostgreSQL database, with external services (Docker, GitHub, Git) mocked at the NestJS DI layer. The setup uses Testcontainers for disposable PostgreSQL instances, Vitest + SWC for fast test execution with NestJS decorator support, and Supertest for HTTP assertions.

## Current State Analysis

- **Backend**: NestJS 11 with hexagonal architecture (`interfaces/` → `application/` → `ports/` → `infrastructure/`)
- **Database**: PostgreSQL via Drizzle ORM (`@fleetwide/database` package), 2 migration files
- **Test runner**: Vitest 3.0.5 already used in `@fleetwide/core` and `@fleetwide/database`
- **Existing tests**: Zero tests in backend; only unit tests in `@fleetwide/core`
- **Authentication**: None — all endpoints are public
- **External deps**: Docker SDK, GitHub Octokit, Git CLI — all injected via Symbol tokens in `CoreModule`

### Key Discoveries:

- All external services use Symbol-based injection tokens (`core/injection-tokens.ts:1-13`), making them easy to override via `.overrideProvider()`
- `CoreModule` is `@Global()` and runs lifecycle hooks (prune orphaned containers, start idle timeout manager) that must be disabled in tests (`modules/core.module.ts:118-139`)
- Domain ports use abstract classes (`WorkspaceRepository`, `SessionRepository`, `GitHubPullRequestService`, `UnitOfWork`) — these don't need mocking since they'll run against real Testcontainers PostgreSQL
- `main.ts` applies `setGlobalPrefix('api')` and `useGlobalFilters(new FleetwideExceptionFilter())` — these must be replicated in the test app setup (`main.ts:11-17`)
- The `@fleetwide/database` package exports `createDatabase()` which needs a connection string — easy to swap with Testcontainers URL

## Desired End State

A fully functional E2E test suite that:
1. Boots a real PostgreSQL via Testcontainers (once per test run)
2. Runs Drizzle migrations against it
3. Creates a real NestJS app with all controllers and DB-backed repositories
4. Mocks only external services (Docker, Git, GitHub API)
5. Tests every controller endpoint for happy path and key error cases
6. Cleans up between tests using table truncation
7. Runs in CI via GitHub Actions

### How to verify:
- `pnpm --filter @fleetwide/backend test:e2e` passes with all tests green
- Tests actually hit a real PostgreSQL (Testcontainers logs show container startup)
- No Docker daemon interaction occurs during tests (mocked)
- CI workflow runs successfully on ubuntu-latest

## What We're NOT Doing

- Unit tests for individual use cases (separate effort)
- Contract/API documentation testing (Swagger/OpenAPI)
- Load/performance testing
- Authentication testing (no auth exists yet)
- Testing the `@fleetwide/workspace-manager` or `@fleetwide/repo-manager` packages themselves
- Frontend E2E tests

## Implementation Approach

**Strategy**: Build the infrastructure layer first (Phase 1), then add test files incrementally per controller (Phases 2-6), and finish with CI integration (Phase 7).

**Key decisions**:
- **Vitest + unplugin-swc**: Required because NestJS uses `emitDecoratorMetadata` for DI, and Vitest's default esbuild doesn't support it. SWC handles this correctly.
- **Testcontainers (not docker-compose)**: Each test run gets a disposable PostgreSQL — no shared state, no port conflicts, works on any machine with Docker.
- **Table truncation (not transaction rollback)**: Our tests may span multiple transactions (e.g., `CreateWorkspace` uses `UnitOfWork.run()`). Truncation is safer and only slightly slower.
- **Shared container across all tests**: A single PostgreSQL container starts in `globalSetup` and is shared. Individual test files connect to it and truncate between tests.
- **Mock at DI token level**: Override `TOKENS.DOCKER_CLIENT`, `TOKENS.GIT_SERVICE`, `TOKENS.CONTAINER_SERVICE`, `TOKENS.VOLUME_SERVICE`, `TOKENS.SESSION_ORCHESTRATOR`, `TOKENS.IDLE_TIMEOUT_MANAGER`, `TOKENS.GITHUB_APP_SERVICE`, `TOKENS.GITHUB_DISCOVERY_SERVICE`, `TOKENS.GITHUB_IMPORT_SERVICE` with lightweight stubs.

---

## Phase 1: E2E Infrastructure Setup

### Overview
Install dependencies, configure Vitest for E2E, set up Testcontainers global setup/teardown, and create the shared test app helper + database utilities.

### Changes Required:

#### 1. Install dev dependencies
**File**: `apps/backend/package.json`
**Changes**: Add devDependencies:
```
@nestjs/testing
supertest
@types/supertest
testcontainers
@testcontainers/postgresql
unplugin-swc
@swc/core
fishery
@faker-js/faker
```

#### 2. Create SWC config for decorator metadata
**File**: `apps/backend/.swcrc` (new)
**Changes**: Create SWC configuration that enables `legacyDecorator` and `decoratorMetadata` transforms — required for NestJS DI to work with Vitest.

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    },
    "baseUrl": "./"
  },
  "minify": false
}
```

#### 3. Create E2E Vitest configuration
**File**: `apps/backend/vitest.config.e2e.ts` (new)
**Changes**: Separate Vitest config for E2E tests with:
- `include: ['test/e2e/**/*.e2e-spec.ts']`
- `globals: true`
- `testTimeout: 30_000` (containers need time)
- `hookTimeout: 60_000` (Testcontainers startup)
- `pool: 'forks'` with `singleFork: true` (sequential execution — shared DB)
- `globalSetup: ['./test/setup/global-setup.ts']`
- `setupFiles: ['./test/setup/setup.ts']`
- SWC plugin via `unplugin-swc`

#### 4. Create Testcontainers global setup
**File**: `apps/backend/test/setup/global-setup.ts` (new)
**Changes**: Start a PostgreSQL 16 container, run Drizzle migrations, expose connection string via a temp file (Vitest global setup runs in a separate process — `process.env` doesn't propagate to worker processes, so we write the URL to a file that `setup.ts` reads).

Key implementation details:
- Use `PostgreSqlContainer('postgres:16-alpine')`
- Run migrations using `drizzle-orm/postgres-js/migrator` with migrations from `../../packages/database/drizzle`
- Write connection URL to `.test-db-url` temp file
- Provide `teardown()` that stops the container and removes the temp file

#### 5. Create per-file setup
**File**: `apps/backend/test/setup/setup.ts` (new)
**Changes**: Read the connection string from the temp file and set `process.env.DATABASE_URL` so `CoreModule`'s database factory picks it up. This runs in the worker process before each test file.

#### 6. Create test app helper
**File**: `apps/backend/test/helpers/create-test-app.ts` (new)
**Changes**: Export a `createTestApp()` function that:
1. Creates a `TestingModule` from `AppModule`
2. Overrides all external service tokens with mock implementations (see mock details below)
3. Creates the NestJS app with the same configuration as `main.ts`:
   - `app.setGlobalPrefix('api')`
   - `app.useGlobalFilters(new FleetwideExceptionFilter())`
4. Calls `app.init()`
5. Returns `{ app, module }` for use in tests

**External service mocks** (all are no-op stubs):

| Token | Mock behavior |
|-------|---------------|
| `TOKENS.DOCKER_CLIENT` | Empty object `{}` |
| `TOKENS.GIT_SERVICE` | `{ pull: vi.fn().mockResolvedValue({ updated: true, commitHash: 'abc123' }) }` |
| `TOKENS.CONTAINER_SERVICE` | `{ getStatus: vi.fn().mockResolvedValue('running'), pruneOrphaned: vi.fn().mockResolvedValue(0) }` |
| `TOKENS.VOLUME_SERVICE` | `{ removeWorkspaceVolumes: vi.fn().mockResolvedValue(undefined) }` |
| `TOKENS.SESSION_ORCHESTRATOR` | `{ startSession: vi.fn(), approveSession: vi.fn(), rejectSession: vi.fn(), exec: vi.fn(), destroyContainer: vi.fn() }` |
| `TOKENS.IDLE_TIMEOUT_MANAGER` | `{ start: vi.fn(), stop: vi.fn() }` |
| `TOKENS.GITHUB_APP_SERVICE` | Stub methods: `getStoredConfig`, `getInstallationsCount`, `getManifestCreationUrl`, `exchangeManifestCode`, `disconnect`, `getInstallUrl`, `getInstallations`, `initialize`, `handleInstallationCallback`, `removeInstallation` |
| `TOKENS.GITHUB_DISCOVERY_SERVICE` | `{ discoverAllRepos: vi.fn(), discoverRepos: vi.fn() }` |
| `TOKENS.GITHUB_IMPORT_SERVICE` | `{ importRepos: vi.fn() }` |

#### 7. Create database cleanup utility
**File**: `apps/backend/test/helpers/db.ts` (new)
**Changes**: Export:
- `getTestDatabase()`: Returns Drizzle db instance from the test module
- `cleanDatabase(db)`: Truncates all tables in dependency order (sessions → workspace_repos → workspaces → repositories → github_installations → github_app_config) using `TRUNCATE ... CASCADE`

#### 8. Create test data factories
**File**: `apps/backend/test/factories/repository.factory.ts` (new)
**Changes**: Fishery factory for `RepositoryInsert` with sensible defaults:
- `id`: `repo-{sequence}`
- `name`: `test-repo-{sequence}`
- `path`: `/repos/test-repo-{sequence}`
- `source`: `manual_url`
- `status`: `synced`
- `defaultBranch`: `main`

**File**: `apps/backend/test/factories/workspace.factory.ts` (new)
**Changes**: Fishery factory for `WorkspaceInsert`:
- `id`: `ws-{sequence}`
- `name`: `Test Workspace {sequence}`
- `image`: `ubuntu:22.04`
- `status`: `active`

**File**: `apps/backend/test/factories/session.factory.ts` (new)
**Changes**: Fishery factory for `SessionInsert`:
- `id`: `session-{sequence}`
- `workspaceId`: required (no default — must be linked to workspace)
- `prompt`: `Test prompt {sequence}`
- `providerId`: `claude`
- `status`: `running`

**File**: `apps/backend/test/factories/index.ts` (new)
**Changes**: Re-export all factories. Also export a `seed` helper object with methods like:
- `seed.repository(db, overrides?)` — inserts via Drizzle and returns the row
- `seed.workspace(db, overrides?)` — inserts workspace
- `seed.workspaceWithRepos(db, repoCount?)` — creates repos + workspace + links them
- `seed.session(db, overrides?)` — inserts session (requires workspaceId)

#### 9. Add test scripts to backend package.json
**File**: `apps/backend/package.json`
**Changes**: Add scripts:
- `"test:e2e": "vitest run --config vitest.config.e2e.ts"`
- `"test:e2e:watch": "vitest --config vitest.config.e2e.ts"`

#### 10. Add test:e2e task to Turbo
**File**: `turbo.json`
**Changes**: Add `test:e2e` task:
```json
"test:e2e": {
  "dependsOn": ["^build"],
  "env": ["DATABASE_URL", "TEST_DATABASE_URL"]
}
```

#### 11. Add temp file to gitignore
**File**: `apps/backend/.gitignore` (create or append)
**Changes**: Add `.test-db-url` to prevent the temp file from being committed.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm install` succeeds (dependencies resolve)
- [ ] `pnpm --filter @fleetwide/backend typecheck` passes
- [ ] A trivial smoke test that just boots the app and calls GET /api/health passes

#### Manual Verification:
- [ ] Testcontainers logs show PostgreSQL container starting
- [ ] The smoke test completes in under 15 seconds (most time is container startup)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Health Controller E2E Tests

### Overview
Start with the simplest controller as a proof of concept for the entire setup.

### Changes Required:

#### 1. Health controller tests
**File**: `apps/backend/test/e2e/health.e2e-spec.ts` (new)
**Changes**: Test the single endpoint:

```
GET /api/health
  ✓ returns 200 with status ok and timestamp
  ✓ timestamp is a valid ISO date string
```

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm --filter @fleetwide/backend test:e2e` passes with health tests green

---

## Phase 3: Repos Controller E2E Tests

### Overview
Test the repository CRUD endpoints. These interact with `RepoRegistry` (from `@fleetwide/repo-manager`) which queries the database directly, and `SyncRepo` which uses `GitService`.

### Changes Required:

#### 1. Repos controller tests
**File**: `apps/backend/test/e2e/repos.e2e-spec.ts` (new)
**Changes**: Test all 4 endpoints:

```
GET /api/repos
  ✓ returns empty array when no repos exist
  ✓ returns repos with pagination defaults
  ✓ filters by status
  ✓ filters by search term
  ✓ respects pagination (page, limit)

GET /api/repos/:id
  ✓ returns repo by id
  ✓ returns 404 for non-existent repo

DELETE /api/repos/:id
  ✓ deletes repo and returns success
  ✓ returns 404 for non-existent repo

POST /api/repos/:id/sync
  ✓ syncs repo and returns result (git service is mocked)
  ✓ returns 404 for non-existent repo
```

### Success Criteria:

#### Automated Verification:
- [ ] All repos E2E tests pass

---

## Phase 4: Workspaces Controller E2E Tests

### Overview
Test workspace CRUD and repo management. These run against real database via `DrizzleWorkspaceRepository` and `DrizzleUnitOfWork`. The `DeleteWorkspace` use case calls `VolumeService.removeWorkspaceVolumes()` which is mocked.

### Changes Required:

#### 1. Workspaces controller tests
**File**: `apps/backend/test/e2e/workspaces.e2e-spec.ts` (new)
**Changes**: Test all 7 endpoints:

```
POST /api/workspaces
  ✓ creates workspace with valid data and linked repos (201)
  ✓ returns validation error for missing name (422)
  ✓ returns validation error for missing image (422)
  ✓ returns validation error for empty repositoryIds (422)
  ✓ returns validation error for non-existent repositoryIds (422)

GET /api/workspaces
  ✓ returns empty array when no workspaces exist
  ✓ returns workspaces with their linked repos

GET /api/workspaces/:id
  ✓ returns workspace with repos by id
  ✓ returns 404 for non-existent workspace

PATCH /api/workspaces/:id
  ✓ updates workspace fields
  ✓ returns 404 for non-existent workspace
  ✓ returns validation error for invalid data

DELETE /api/workspaces/:id
  ✓ deletes workspace and returns success
  ✓ returns 404 for non-existent workspace
  ✓ calls volume service cleanup (mock verified)

POST /api/workspaces/:id/repos
  ✓ links repo to workspace (201)
  ✓ returns 404 for non-existent workspace
  ✓ returns 404 for non-existent repo

DELETE /api/workspaces/:id/repos/:repoId
  ✓ unlinks repo from workspace
  ✓ returns 404 for non-existent workspace
  ✓ returns 404 for repo not linked to workspace
```

### Success Criteria:

#### Automated Verification:
- [ ] All workspaces E2E tests pass

---

## Phase 5: Sessions Controller E2E Tests

### Overview
Test session lifecycle endpoints. The `SessionOrchestrator` and `ContainerService` are mocked — tests verify the HTTP → use case → database flow, with mock verification for orchestrator calls.

### Changes Required:

#### 1. Sessions controller tests
**File**: `apps/backend/test/e2e/sessions.e2e-spec.ts` (new)
**Changes**: Test all 11 endpoints:

```
POST /api/sessions
  ✓ creates session with valid workspace (201, orchestrator.startSession called)
  ✓ returns validation error for missing prompt
  ✓ returns 404 for non-existent workspace
  ✓ returns validation error for non-active workspace

GET /api/sessions
  ✓ returns all sessions
  ✓ filters by workspaceId
  ✓ filters by status

GET /api/sessions/:id
  ✓ returns session with containerAlive status
  ✓ returns 404 for non-existent session

POST /api/sessions/:id/exec
  ✓ executes command (orchestrator.exec called with correct args)
  ✓ returns 404 for non-existent session
  ✓ returns validation error for empty cmd array

DELETE /api/sessions/:id
  ✓ destroys session (orchestrator.destroyContainer called)
  ✓ returns 404 for non-existent session

GET /api/sessions/:id/messages
  ✓ returns messages array
  ✓ returns 404 for non-existent session

GET /api/sessions/:id/logs
  ✓ returns setup logs
  ✓ returns 404 for non-existent session

GET /api/sessions/:id/diff
  ✓ returns diff summary
  ✓ returns 404 for non-existent session

GET /api/sessions/:id/branch
  ✓ returns branch info with PR details when branch is pushed
  ✓ returns null branch when no branch exists
  ✓ returns 404 for non-existent session

POST /api/sessions/:id/approve
  ✓ approves session (orchestrator.approveSession called, returns PR data)
  ✓ returns validation error when no branch pushed
  ✓ returns validation error for invalid session status

POST /api/sessions/:id/reject
  ✓ rejects session (orchestrator.rejectSession called)
  ✓ returns validation error for invalid session status
```

### Success Criteria:

#### Automated Verification:
- [ ] All sessions E2E tests pass

---

## Phase 6: GitHub Controller E2E Tests

### Overview
Test GitHub integration endpoints. All GitHub service interactions are mocked. Some endpoints use `@Res()` for redirects — test those with `expect(302)` and verify the `Location` header.

### Changes Required:

#### 1. GitHub controller tests
**File**: `apps/backend/test/e2e/github.e2e-spec.ts` (new)
**Changes**: Test all 11 endpoints:

```
GET /api/github/status
  ✓ returns unconfigured status when no config exists
  ✓ returns configured status with app details when configured

GET /api/github/manifest/start
  ✓ returns manifest creation URL

GET /api/github/manifest/callback
  ✓ exchanges code and redirects to frontend
  ✓ returns 400 when code is missing

DELETE /api/github/config
  ✓ disconnects GitHub app

GET /api/github/install-url
  ✓ returns installation URL

GET /api/github/installations
  ✓ returns list of installations

GET /api/github/installations/callback
  ✓ handles installation callback and redirects
  ✓ returns 400 for missing installation_id

DELETE /api/github/installations/:id
  ✓ removes installation

GET /api/github/repos
  ✓ returns discovered repos from all installations

GET /api/github/repos/:installationId
  ✓ returns repos for specific installation

POST /api/github/repos/import
  ✓ imports repos (201)
```

### Success Criteria:

#### Automated Verification:
- [ ] All GitHub E2E tests pass
- [ ] Full test suite: `pnpm --filter @fleetwide/backend test:e2e` runs all ~65 tests successfully

---

## Phase 7: GitHub Actions CI Integration

### Overview
Add a GitHub Actions workflow that runs E2E tests on pull requests and pushes to main.

### Changes Required:

#### 1. CI workflow
**File**: `.github/workflows/e2e-tests.yml` (new)
**Changes**: Create workflow:
- **Trigger**: Push to `main`, pull requests to `main`
- **Runner**: `ubuntu-latest` (Docker is pre-installed — Testcontainers works out of the box)
- **Steps**:
  1. Checkout code
  2. Setup pnpm (via `pnpm/action-setup@v4`)
  3. Setup Node.js 22 (via `actions/setup-node@v4` with pnpm cache)
  4. Install dependencies (`pnpm install`)
  5. Build workspace packages (`pnpm turbo build --filter=@fleetwide/backend...`)
  6. Run E2E tests (`pnpm --filter @fleetwide/backend test:e2e`)

### Success Criteria:

#### Automated Verification:
- [ ] Workflow YAML is valid (`actionlint` or dry-run)
- [ ] CI passes when pushed

#### Manual Verification:
- [ ] GitHub Actions shows the workflow running with Testcontainers PostgreSQL

---

## Final File Tree

```
apps/backend/
  .swcrc                                    # NEW - SWC config for decorators
  .gitignore                                # NEW - Ignore .test-db-url
  vitest.config.e2e.ts                      # NEW - E2E Vitest config
  package.json                              # MODIFIED - New deps + scripts
  test/
    setup/
      global-setup.ts                       # NEW - Testcontainers lifecycle
      setup.ts                              # NEW - Per-worker env setup
    helpers/
      create-test-app.ts                    # NEW - NestJS test app bootstrap
      db.ts                                 # NEW - Database cleanup utilities
    factories/
      index.ts                             # NEW - Factory re-exports + seed helpers
      repository.factory.ts                # NEW - Repository test data
      workspace.factory.ts                 # NEW - Workspace test data
      session.factory.ts                   # NEW - Session test data
    e2e/
      health.e2e-spec.ts                   # NEW - Health endpoint tests
      repos.e2e-spec.ts                    # NEW - Repos endpoint tests
      workspaces.e2e-spec.ts               # NEW - Workspaces endpoint tests
      sessions.e2e-spec.ts                 # NEW - Sessions endpoint tests
      github.e2e-spec.ts                   # NEW - GitHub endpoint tests
turbo.json                                  # MODIFIED - Add test:e2e task
.github/workflows/e2e-tests.yml            # NEW - CI workflow
```

## Testing Strategy

### What's real (not mocked):
- PostgreSQL database (via Testcontainers)
- Drizzle ORM queries and migrations
- All NestJS controllers, modules, pipes, filters
- All application use cases (CreateWorkspace, StartSession, etc.)
- All infrastructure repositories (DrizzleWorkspaceRepository, DrizzleSessionRepository)
- Request validation (Zod schemas from `@fleetwide/core`)
- Error handling (FleetwideExceptionFilter)

### What's mocked (external services):
- Docker client and container operations
- Git CLI operations (pull, clone)
- GitHub API (Octokit) operations
- Session orchestrator (container lifecycle)
- Volume service (cleanup)
- Idle timeout manager (background job)

### Test isolation:
- Each test file: `beforeAll` → create app; `afterAll` → close app
- Each test: `beforeEach` → truncate all tables (clean slate)
- Each test: seed only the data it needs using factories

## Performance Considerations

- **Container startup**: ~3-5s for PostgreSQL (one-time cost in globalSetup)
- **App bootstrap**: ~1-2s per test file (NestJS module compilation)
- **Table truncation**: ~5ms per test (fast TRUNCATE CASCADE)
- **Expected total time**: ~15-25 seconds for full suite (~65 tests)
- **CI time**: ~30-45 seconds including Docker pull and cold start

## References
- NestJS Testing: https://docs.nestjs.com/fundamentals/testing
- Testcontainers for Node.js: https://node.testcontainers.org/
- SWC + NestJS: https://docs.nestjs.com/recipes/swc
- Fishery factories: https://github.com/thoughtbot/fishery
- Similar patterns: `packages/core/src/__tests__/validation.test.ts` (existing Vitest usage)
- Injection tokens: `apps/backend/src/core/injection-tokens.ts:1-13`
- Core module (what to mock): `apps/backend/src/modules/core.module.ts:28-116`
- Global prefix + filters: `apps/backend/src/main.ts:11-17`
