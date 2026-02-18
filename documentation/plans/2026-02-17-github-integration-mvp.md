# GitHub Integration MVP — Implementation Plan

## Overview

Build the minimum viable product for Fleetwide's GitHub integration: a backend API and web frontend that allows users to connect their GitHub account via the GitHub App Manifest flow (one-click), install the app on their org, discover repos, and import (clone) them to local disk. This is a subset of the full platform plan, focused on the GitHub repo onboarding pipeline.

## Current State Analysis

### What Exists
- Monorepo scaffolding: pnpm workspaces, Turborepo, tsconfig, ESLint, Prettier
- `@fleetwide/core` package: types (repository, GitHub, auth, agent, schedule, integration), Zod validation schemas, event factories, utility functions (ID generation, logging, errors) — 53 tests passing
- Docker Compose, database, backend, web, and repo-manager do **not** exist yet

### Key Discoveries
- Core types already define `Repository`, `GitHubInstallation`, `GitHubAppConfig`, `GitHubDiscoveredRepo` (`packages/core/src/types/repository.ts`, `packages/core/src/types/github.ts` — noted but these types are not in a `github.ts` file; they're referenced in the main plan)
- Zod schemas exist for `registerRepoSchema`, `repoFilterSchema` in `packages/core/src/utils/validation.ts`
- ID generation uses cuid2 with optional prefix (`packages/core/src/utils/id.ts`)
- Structured logging via pino (`packages/core/src/utils/logger.ts`)
- All packages are ESM-native (`"type": "module"`, `"module": "ESNext"`)

## Desired End State

A running system where:
1. `docker compose -f docker-compose.dev.yml up` starts PostgreSQL
2. `pnpm --filter backend dev` starts the Hono API on `:8080`
3. `pnpm --filter web dev` starts the React app on `:3000`
4. User opens `http://localhost:3000`, clicks **"Connect to GitHub"**
5. Fleetwide redirects to GitHub with a pre-built App Manifest (permissions, callback URL auto-configured)
6. User clicks "Create GitHub App" on GitHub (one click) → GitHub redirects back with a temporary code
7. Fleetwide exchanges the code for full app credentials (App ID, private key, client ID/secret) — **user never sees or copies any secrets**
8. User clicks "Install on your organization" → redirected to GitHub → installs the app on their org
9. GitHub redirects back → installation stored in Fleetwide
10. User sees discovered repos grouped by org → selects repos → clicks "Import"
11. Selected repos are cloned to disk (including private repos via installation token)
12. Imported repos appear on a repo list page with metadata (name, source, status, language)

## What We're NOT Doing

- No agent engine or chat functionality (Phase 0 of the full plan)
- No scheduling, integrations, or plugins
- No authentication/authorization for the Fleetwide app itself (API keys, JWT, login — deferred)
- No GitHub webhooks (Phase 4 of the full plan)
- No CLI
- No branch-push-preview-approve workflow (Phase 1.5 of the full plan)
- No file browser or git operations UI
- No production Docker deployment

## Implementation Approach

Build bottom-up across 4 phases, each producing a working increment:

1. **Infrastructure** — Docker Compose + database package (Drizzle ORM, schema, migrations)
2. **Repo Manager** — GitHub App service, repo discovery, import, git clone
3. **Backend** — Hono REST API serving GitHub and repo endpoints
4. **Web Frontend** — React app with GitHub setup flow and repo import UI

---

## Phase 1: Infrastructure — Database & Docker

### Overview
Set up PostgreSQL via Docker Compose and create the `@fleetwide/database` package with Drizzle ORM schema and migrations for the GitHub integration tables.

### Changes Required

#### 1. Docker Compose for Development
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

volumes:
  pgdata:
```

#### 2. `packages/database` Package

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/database/package.json` | Package manifest with Drizzle ORM deps |
| `packages/database/tsconfig.json` | Extends base tsconfig |
| `packages/database/tsconfig.build.json` | Build-only tsconfig (excludes tests) |
| `packages/database/drizzle.config.ts` | Drizzle Kit config for migrations |
| `packages/database/src/index.ts` | Barrel export |
| `packages/database/src/connection.ts` | Database connection factory using `postgres` driver |
| `packages/database/src/schema/index.ts` | All schema exports |
| `packages/database/src/schema/repositories.ts` | Repositories table with GitHub fields |
| `packages/database/src/schema/github-installations.ts` | GitHub App installations table |
| `packages/database/src/schema/github-app-config.ts` | GitHub App configuration (singleton) |
| `packages/database/src/migrate.ts` | Programmatic migration runner |

**Dependencies:**
- `drizzle-orm` — ORM
- `postgres` — PostgreSQL driver (pg alternative, ESM-native)
- `drizzle-kit` (dev) — Migration tooling
- `@fleetwide/core` — Shared types

**Database schema (3 tables for MVP):**

```typescript
// schema/repositories.ts
export const repoStatusEnum = pgEnum('repo_status', [
  'synced', 'syncing', 'error', 'uninitialized'
]);

export const repoSourceEnum = pgEnum('repo_source', [
  'github', 'manual_url', 'local_path'
]);

export const repositories = pgTable('repositories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  remoteUrl: text('remote_url'),
  defaultBranch: text('default_branch').notNull().default('main'),
  source: repoSourceEnum('source').notNull().default('manual_url'),
  status: repoStatusEnum('status').notNull().default('uninitialized'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  // GitHub-specific fields (populated when source === 'github')
  githubId: integer('github_id'),
  githubFullName: text('github_full_name'),
  githubInstallationId: text('github_installation_id')
    .references(() => githubInstallations.id),
  githubPrivate: boolean('github_private'),
  githubHtmlUrl: text('github_html_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/github-installations.ts
export const githubInstallations = pgTable('github_installations', {
  id: text('id').primaryKey(),
  installationId: integer('installation_id').notNull().unique(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type').notNull(),
  accountAvatarUrl: text('account_avatar_url'),
  permissions: jsonb('permissions').$type<Record<string, string>>(),
  repositorySelection: text('repository_selection').notNull(),
  suspendedAt: timestamp('suspended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/github-app-config.ts (singleton — at most one row)
export const githubAppConfig = pgTable('github_app_config', {
  id: text('id').primaryKey().default('default'),
  appId: text('app_id').notNull(),
  appSlug: text('app_slug').notNull(),
  privateKey: text('private_key').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  webhookSecret: text('webhook_secret'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Connection factory:**

```typescript
// connection.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
```

### Success Criteria

#### Automated Verification:
- [ ] `docker compose -f docker-compose.dev.yml up -d` starts PostgreSQL
- [ ] `pnpm --filter database build` compiles without errors
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm --filter database db:generate` generates migration SQL
- [ ] `pnpm --filter database db:migrate` applies migrations to PostgreSQL
- [ ] Tables exist in database: `repositories`, `github_installations`, `github_app_config`

#### Manual Verification:
- [ ] Can connect to PostgreSQL at `localhost:5432` with `fleetwide/fleetwide_dev`
- [ ] Schema matches the type definitions in `@fleetwide/core`

---

## Phase 2: Repo Manager — GitHub App & Git Operations

### Overview
Create the `@fleetwide/repo-manager` package with GitHub App authentication, repo discovery, import (clone), and basic repo registry operations.

### Changes Required

#### 1. `packages/repo-manager` Package

**Files to create:**

| File | Purpose |
|------|---------|
| `packages/repo-manager/package.json` | Package manifest |
| `packages/repo-manager/tsconfig.json` | Extends base tsconfig |
| `packages/repo-manager/tsconfig.build.json` | Build-only tsconfig |
| `packages/repo-manager/src/index.ts` | Barrel export |
| `packages/repo-manager/src/github/github-app.service.ts` | GitHub App auth: JWT signing, installation token generation via Octokit |
| `packages/repo-manager/src/github/github-discovery.service.ts` | List repos accessible via installation (paginated) |
| `packages/repo-manager/src/github/github-import.service.ts` | Clone selected repos using installation token, register in DB |
| `packages/repo-manager/src/repo-registry.ts` | CRUD for repositories in database |
| `packages/repo-manager/src/repo-sync.service.ts` | Clone and pull repos from remote URLs |
| `packages/repo-manager/src/git.service.ts` | Git operations via `simple-git`: clone, pull, status, branch |
| `packages/repo-manager/src/__tests__/github-app.service.test.ts` | Unit tests (mock Octokit) |
| `packages/repo-manager/src/__tests__/repo-registry.test.ts` | Unit tests (mock DB) |
| `packages/repo-manager/src/__tests__/github-discovery.service.test.ts` | Unit tests (mock Octokit) |

**Dependencies:**
- `octokit` — GitHub API client (includes `@octokit/auth-app` for GitHub App auth)
- `simple-git` — Git operations (clone, pull, status)
- `@fleetwide/core` — Shared types, IDs, logging
- `@fleetwide/database` — Database types and connection

**Key implementation details:**

```typescript
// github-app.service.ts
import { App as OctokitApp, Octokit } from 'octokit';

export class GitHubAppService {
  private app: OctokitApp | null = null;

  // Initialize with config from DB (lazy — only when GitHub App is configured)
  async initialize(config: { appId: string; privateKey: string; clientId: string; clientSecret: string }): Promise<void>;

  // --- Manifest Flow ---

  // Generate the manifest JSON for GitHub App creation
  // Includes: app name, permissions (contents: read, metadata: read), callback URLs
  generateManifest(callbackUrl: string): GitHubAppManifest;

  // Build the GitHub URL to redirect the user to for App creation
  // Returns: https://github.com/settings/apps/new?manifest={encoded_manifest}
  getManifestCreationUrl(callbackUrl: string): string;

  // Exchange the temporary code from GitHub for full app credentials
  // POST https://api.github.com/app-manifests/{code}/conversions
  // Returns: { appId, slug, pem, clientId, clientSecret, webhookSecret }
  async exchangeManifestCode(code: string): Promise<GitHubAppCredentials>;

  // --- Installation ---

  // Get authenticated Octokit for a specific installation
  async getInstallationOctokit(installationId: number): Promise<Octokit>;

  // Process a new installation callback — fetch details from GitHub API, store in DB
  async handleInstallationCallback(installationId: number): Promise<GitHubInstallation>;

  // Get the GitHub App installation URL for user to install on their org
  // Returns: https://github.com/apps/{app-slug}/installations/new
  getInstallUrl(): string;

  // Check if GitHub App is configured (manifest flow completed)
  isConfigured(): boolean;
}

// Types for the manifest flow
export interface GitHubAppManifest {
  name: string;
  url: string;
  redirect_url: string;
  setup_url?: string;
  callback_urls: string[];
  hook_attributes: { url: string; active: boolean };
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
}

export interface GitHubAppCredentials {
  appId: string;
  appSlug: string;
  privateKey: string;  // PEM-encoded
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

// github-discovery.service.ts
export class GitHubDiscoveryService {
  constructor(
    private appService: GitHubAppService,
    private db: Database,
  ) {}

  // List all repos accessible via a specific installation
  async discoverRepos(installationId: number): Promise<GitHubDiscoveredRepo[]>;

  // List repos across all installations with `alreadyImported` flag
  async discoverAllRepos(): Promise<GitHubDiscoveredRepo[]>;
}

// github-import.service.ts
export class GitHubImportService {
  constructor(
    private appService: GitHubAppService,
    private gitService: GitService,
    private repoRegistry: RepoRegistry,
  ) {}

  // Import selected repos: generate authenticated clone URL, clone, register in DB
  async importRepos(opts: {
    installationId: number;
    repos: Array<{ githubId: number; fullName: string; cloneUrl: string; defaultBranch: string; private: boolean; htmlUrl: string }>;
    basePath: string;
  }): Promise<ImportResult[]>;
}

// repo-registry.ts
export class RepoRegistry {
  constructor(private db: Database) {}

  async register(data: RegisterRepoInput): Promise<Repository>;
  async list(filter?: RepoFilter): Promise<PaginatedResult<Repository>>;
  async getById(id: string): Promise<Repository | null>;
  async update(id: string, data: Partial<Repository>): Promise<Repository>;
  async remove(id: string): Promise<void>;
  async getByGithubId(githubId: number): Promise<Repository | null>;
}

// git.service.ts
export class GitService {
  // Clone a repo to target path (supports authenticated URLs for private repos)
  async clone(remoteUrl: string, targetPath: string): Promise<void>;

  // Pull latest changes
  async pull(repoPath: string): Promise<{ updated: boolean; commitHash: string }>;

  // Get current status
  async status(repoPath: string): Promise<GitStatus>;
}
```

**Clone authentication for private repos:**
```
git clone https://x-access-token:{installation-token}@github.com/org/repo.git
```
The token is generated per-clone via `GitHubAppService.getInstallationOctokit()` and is valid for ~1 hour.

### Success Criteria

#### Automated Verification:
- [ ] `pnpm --filter repo-manager build` compiles without errors
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm --filter repo-manager test` — unit tests pass (mocked Octokit and DB)
- [ ] GitHubAppService can generate a JWT from app credentials (unit test)
- [ ] GitHubDiscoveryService returns repos from mocked installation (unit test)
- [ ] RepoRegistry CRUD operations work against mocked database (unit test)

#### Manual Verification:
- [ ] N/A — this phase is tested via the backend API in Phase 3

---

## Phase 3: Backend — Hono REST API

### Overview
Create the `apps/backend` Hono application serving REST endpoints for GitHub App configuration, installation management, repo discovery, and import.

### Changes Required

#### 1. `apps/backend` Application

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/backend/package.json` | App manifest with Hono, dotenv deps |
| `apps/backend/tsconfig.json` | Extends base tsconfig |
| `apps/backend/tsconfig.build.json` | Build-only tsconfig |
| `apps/backend/.env.example` | Environment variable template |
| `apps/backend/src/index.ts` | Server entry: create Hono app, start `@hono/node-server` |
| `apps/backend/src/app.ts` | Hono app factory: mount routes, middleware |
| `apps/backend/src/config.ts` | Environment-based config (DB URL, port, repos base path) |
| `apps/backend/src/middleware/error-handler.ts` | Global error handler mapping FleetwideError to HTTP responses |
| `apps/backend/src/middleware/cors.ts` | CORS for local dev (allow `:3000`) |
| `apps/backend/src/middleware/logger.ts` | Request logging middleware |
| `apps/backend/src/routes/health.routes.ts` | `GET /api/health` — basic health check |
| `apps/backend/src/routes/github.routes.ts` | GitHub App config, installations, repo discovery, import |
| `apps/backend/src/routes/repos.routes.ts` | Repository CRUD (list, get, delete) |
| `apps/backend/src/services/index.ts` | Service factory — wires up all dependencies |

**Dependencies:**
- `hono` — HTTP framework
- `@hono/node-server` — Node.js adapter for Hono
- `dotenv` — Environment variable loading
- `@fleetwide/core` — Types, validation, logging, errors
- `@fleetwide/database` — DB connection and schema
- `@fleetwide/repo-manager` — GitHub and repo services

**App factory pattern (explicit DI, no decorators):**

```typescript
// services/index.ts — Composition root
export function createServices(config: AppConfig) {
  const db = createDatabase(config.databaseUrl);
  const gitService = new GitService();
  const repoRegistry = new RepoRegistry(db);
  const githubAppService = new GitHubAppService();
  const githubDiscovery = new GitHubDiscoveryService(githubAppService, db);
  const githubImport = new GitHubImportService(githubAppService, gitService, repoRegistry);

  return { db, gitService, repoRegistry, githubAppService, githubDiscovery, githubImport };
}

// app.ts
export function createApp(services: Services) {
  const app = new Hono();

  // Middleware
  app.use('*', corsMiddleware());
  app.use('*', loggerMiddleware());
  app.onError(errorHandler);

  // Routes
  app.route('/api', healthRoutes());
  app.route('/api/github', githubRoutes(services));
  app.route('/api/repos', repoRoutes(services));

  return app;
}
```

**API endpoints:**

```
# Health
GET  /api/health                          # → { status: 'ok', timestamp }

# GitHub App — Manifest Flow (one-click app creation)
GET  /api/github/status                   # Check if GitHub App is configured
GET  /api/github/manifest/start           # Get the GitHub manifest creation URL (redirect user here)
GET  /api/github/manifest/callback        # GitHub redirects here with ?code=... after app creation
DELETE /api/github/config                 # Remove GitHub App config (disconnect)

# GitHub Installations
GET  /api/github/installations            # List all stored installations
GET  /api/github/install-url              # Get the install URL for the existing GitHub App
GET  /api/github/installations/callback   # GitHub redirects here after app installation with ?installation_id=...
DELETE /api/github/installations/:id      # Remove an installation

# Repo Discovery & Import
GET  /api/github/repos                    # Discover repos across all installations
GET  /api/github/repos/:installationId    # Discover repos for specific installation
POST /api/github/repos/import             # Import selected repos (clone to disk)

# Repositories
GET  /api/repos                           # List all imported repos (paginated)
GET  /api/repos/:id                       # Get repo details
DELETE /api/repos/:id                     # Remove repo from Fleetwide
POST /api/repos/:id/sync                  # Re-sync (pull) a repo
```

**GitHub manifest flow — backend routes:**

```typescript
// routes/github.routes.ts
export function githubRoutes(services: Services) {
  const router = new Hono();

  // GET /status — check if GitHub App is configured
  router.get('/status', async (c) => {
    const config = await services.githubAppService.getStoredConfig();
    return c.json({
      configured: !!config,
      appSlug: config?.appSlug ?? null,
      installationsCount: config ? await services.githubAppService.getInstallationsCount() : 0,
    });
  });

  // GET /manifest/start — generate manifest and return the GitHub URL
  // Frontend redirects the user to this URL (opens in same tab or new tab)
  router.get('/manifest/start', async (c) => {
    const baseUrl = c.req.header('x-forwarded-host')
      ? `https://${c.req.header('x-forwarded-host')}`
      : `http://localhost:${config.port}`;
    const callbackUrl = `${baseUrl}/api/github/manifest/callback`;
    const url = services.githubAppService.getManifestCreationUrl(callbackUrl);
    return c.json({ url });
  });

  // GET /manifest/callback — GitHub redirects here after App creation
  // Query: ?code=TEMP_CODE
  // Exchanges code for credentials, stores in DB, redirects to frontend
  router.get('/manifest/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) return c.json({ error: 'Missing code parameter' }, 400);

    const credentials = await services.githubAppService.exchangeManifestCode(code);
    // Store credentials in github_app_config table
    // Initialize the GitHubAppService with the new credentials
    // Redirect to frontend setup page to continue with installation
    return c.redirect(`${config.frontendUrl}/settings/github?setup=complete`);
  });

  // GET /install-url — returns the URL to install the GitHub App on an org
  router.get('/install-url', async (c) => {
    const url = services.githubAppService.getInstallUrl();
    return c.json({ url });
  });

  // GET /installations/callback — GitHub redirects here after App installation
  // Query: ?installation_id=12345
  router.get('/installations/callback', async (c) => {
    const installationId = Number(c.req.query('installation_id'));
    if (!installationId) return c.json({ error: 'Missing installation_id' }, 400);

    const installation = await services.githubAppService.handleInstallationCallback(installationId);
    // Redirect to frontend import page
    return c.redirect(`${config.frontendUrl}/import`);
  });

  // GET /repos — discover repos from all installations
  router.get('/repos', async (c) => {
    const repos = await services.githubDiscovery.discoverAllRepos();
    return c.json({ repos });
  });

  // POST /repos/import — import selected repos
  router.post('/repos/import', async (c) => {
    const body = await c.req.json();
    const results = await services.githubImport.importRepos({
      ...body,
      basePath: config.reposBasePath,
    });
    return c.json({ results }, 201);
  });

  return router;
}
```

**Environment variables (`.env.example`):**

```env
# Database
DATABASE_URL=postgresql://fleetwide:fleetwide_dev@localhost:5432/fleetwide

# Server
PORT=8080
HOST=0.0.0.0

# Frontend URL (for redirects after GitHub callbacks)
FRONTEND_URL=http://localhost:3000

# Repository storage
REPOS_BASE_PATH=./repos

# Logging
LOG_LEVEL=info
```

### Success Criteria

#### Automated Verification:
- [ ] `pnpm --filter backend build` compiles without errors
- [ ] `pnpm turbo typecheck` passes
- [ ] `curl http://localhost:8080/api/health` → `{ "status": "ok" }`
- [ ] `GET /api/github/status` returns `{ configured: false }` initially
- [ ] `GET /api/github/manifest/start` returns a valid GitHub manifest creation URL
- [ ] `GET /api/github/manifest/callback?code=...` exchanges code and stores credentials (tested with mocked GitHub API)
- [ ] `GET /api/github/status` returns `{ configured: true, appSlug: "..." }` after setup
- [ ] `GET /api/github/install-url` returns the app installation URL
- [ ] `GET /api/github/installations/callback?installation_id=...` stores installation and redirects
- [ ] `GET /api/github/installations` returns stored installations
- [ ] `GET /api/github/repos` returns discovered repos from GitHub API
- [ ] `POST /api/github/repos/import` clones repos to `REPOS_BASE_PATH` and registers them in DB
- [ ] `GET /api/repos` returns list of imported repos
- [ ] `POST /api/repos/:id/sync` pulls latest changes for a repo
- [ ] Error responses follow `ErrorResponse` format from `@fleetwide/core`

#### Manual Verification:
- [ ] Full manifest flow: click start → create app on GitHub → callback stores credentials automatically
- [ ] Full installation flow: click install → install on org → callback stores installation
- [ ] Private repos are cloned successfully via installation token
- [ ] Repos appear on disk in the `REPOS_BASE_PATH` directory

**Implementation Note**: After completing Phase 3, the backend is fully functional. Test the complete flow via browser (manifest + installation redirects) before proceeding to Phase 4.

---

## Phase 4: Web Frontend — GitHub Setup & Repo Import

### Overview
Create the `apps/web` React application with Vite, Tailwind CSS, and Radix UI. The UI supports the GitHub App setup flow, installation management, repo discovery, and batch import.

### Changes Required

#### 1. `apps/web` Application

**Files to create:**

| File | Purpose |
|------|---------|
| `apps/web/package.json` | React, Vite, Tailwind, Radix deps |
| `apps/web/tsconfig.json` | Extends base, adds JSX support |
| `apps/web/tsconfig.build.json` | Build tsconfig |
| `apps/web/vite.config.ts` | Vite config with proxy to backend (`:8080`) |
| `apps/web/tailwind.config.ts` | Tailwind 4 configuration |
| `apps/web/postcss.config.js` | PostCSS with Tailwind |
| `apps/web/index.html` | HTML entry point |
| `apps/web/src/main.tsx` | React entry point |
| `apps/web/src/App.tsx` | Root component with routing (React Router) |
| `apps/web/src/styles/globals.css` | Tailwind base imports + global styles |
| **Pages** | |
| `apps/web/src/pages/DashboardPage.tsx` | Repo list — shows all imported repos |
| `apps/web/src/pages/GitHubSetupPage.tsx` | GitHub App setup: connect (manifest flow) + install on org |
| `apps/web/src/pages/ImportReposPage.tsx` | Repo discovery + selection + import |
| **Components** | |
| `apps/web/src/components/Layout.tsx` | App shell with sidebar/top navigation |
| `apps/web/src/components/RepoCard.tsx` | Repo card showing name, source, status, language |
| `apps/web/src/components/RepoList.tsx` | Grid/list of RepoCards with empty state |
| `apps/web/src/components/GitHubConnectButton.tsx` | "Connect to GitHub" button that triggers manifest flow |
| `apps/web/src/components/GitHubStatus.tsx` | Shows connected status, app slug, disconnect option |
| `apps/web/src/components/InstallationList.tsx` | List of GitHub App installations with "Install on org" button |
| `apps/web/src/components/RepoDiscoveryList.tsx` | Discovered repos with checkboxes for selection |
| `apps/web/src/components/ImportProgress.tsx` | Import progress indicator (per-repo status) |
| **State & Services** | |
| `apps/web/src/stores/github.store.ts` | Zustand store for GitHub state |
| `apps/web/src/stores/repos.store.ts` | Zustand store for repository state |
| `apps/web/src/services/api-client.ts` | Typed fetch wrapper for backend API |

**Dependencies:**
- `react`, `react-dom` — UI framework
- `react-router-dom` — Client-side routing
- `zustand` — State management
- `@radix-ui/react-dialog`, `@radix-ui/react-checkbox`, `@radix-ui/react-toast`, `@radix-ui/react-dropdown-menu` — UI primitives
- `tailwindcss`, `@tailwindcss/vite` — Styling
- `vite`, `@vitejs/plugin-react` — Build tool
- `lucide-react` — Icons

**Vite config with API proxy:**

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```

**Page flow:**

1. **Dashboard** (`/`) — Shows all imported repos as cards in a grid
   - Empty state: "No repositories imported yet. Set up GitHub to get started."
   - Each card: repo name, org, source badge (GitHub), status, last synced
   - Link to GitHub Setup and Import pages

2. **GitHub Setup** (`/settings/github`) — Connect to GitHub via manifest flow
   - **Not connected state**: Big "Connect to GitHub" button → redirects to GitHub → user creates app in one click → redirected back automatically with credentials stored
   - **Connected state**: Shows app slug, connected status, "Disconnect" option
   - **Install on org**: "Install on your organization" button → redirects to GitHub → user installs → redirected back with installation stored
   - Shows list of current installations with org name, avatar, "Import repos" link

3. **Import Repos** (`/import`) — Discover and import repos
   - Dropdown to select installation (or "All installations")
   - List of discovered repos with checkboxes, search/filter
   - Already-imported repos are visually distinct and non-selectable
   - "Import Selected" button → shows progress → redirects to Dashboard

**API client (typed):**

```typescript
// services/api-client.ts
class ApiClient {
  private baseUrl = '/api';

  // GitHub App Status & Manifest Flow
  async getGitHubStatus(): Promise<{ configured: boolean; appSlug: string | null; installationsCount: number }>;
  async getManifestStartUrl(): Promise<{ url: string }>;  // Frontend redirects user to this URL
  async disconnectGitHub(): Promise<void>;

  // Installations
  async getInstallations(): Promise<GitHubInstallation[]>;
  async getInstallUrl(): Promise<{ url: string }>;  // Frontend redirects user to this URL
  async removeInstallation(id: string): Promise<void>;

  // Repo Discovery
  async discoverRepos(installationId?: number): Promise<GitHubDiscoveredRepo[]>;

  // Import
  async importRepos(installationId: number, repos: GitHubDiscoveredRepo[]): Promise<ImportResult[]>;

  // Repos
  async getRepos(filter?: RepoFilter): Promise<PaginatedResult<Repository>>;
  async getRepo(id: string): Promise<Repository>;
  async deleteRepo(id: string): Promise<void>;
  async syncRepo(id: string): Promise<SyncResult>;
}
```

**Zustand stores:**

```typescript
// stores/github.store.ts
interface GitHubStore {
  configured: boolean;
  appSlug: string | null;
  installations: GitHubInstallation[];
  discoveredRepos: GitHubDiscoveredRepo[];
  isLoading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  startConnect: () => Promise<void>;     // Gets manifest URL and redirects to GitHub
  disconnect: () => Promise<void>;
  fetchInstallations: () => Promise<void>;
  startInstall: () => Promise<void>;     // Gets install URL and redirects to GitHub
  discoverRepos: (installationId?: number) => Promise<void>;
  importRepos: (installationId: number, repos: GitHubDiscoveredRepo[]) => Promise<ImportResult[]>;
}

// stores/repos.store.ts
interface ReposStore {
  repos: Repository[];
  isLoading: boolean;
  error: string | null;

  fetchRepos: () => Promise<void>;
  deleteRepo: (id: string) => Promise<void>;
  syncRepo: (id: string) => Promise<void>;
}
```

### Success Criteria

#### Automated Verification:
- [ ] `pnpm --filter web build` compiles without errors
- [ ] `pnpm turbo typecheck` passes (all packages + apps)
- [ ] `pnpm --filter web dev` starts Vite dev server on `:3000`
- [ ] Proxy to backend works: requests to `/api/*` forwarded to `:8080`

#### Manual Verification:
- [ ] Open `http://localhost:3000` → Dashboard page loads with empty state
- [ ] Navigate to GitHub Setup → shows "Connect to GitHub" button (not connected state)
- [ ] Click "Connect to GitHub" → redirected to GitHub → create app in one click → redirected back
- [ ] GitHub Setup now shows connected state with app slug and "Install on organization" button
- [ ] Click "Install on your organization" → redirected to GitHub → install on org → redirected back
- [ ] Installation appears in the list with org name and avatar
- [ ] Navigate to Import → repos discovered from GitHub installation
- [ ] Private repos are visible in the list
- [ ] Already-imported repos are visually distinct
- [ ] Select repos → click Import → repos cloned → appear on Dashboard
- [ ] Repo cards show correct metadata (name, org, status, source badge)
- [ ] Can sync (pull) a repo from the Dashboard
- [ ] Can remove a repo from the Dashboard
- [ ] Can disconnect GitHub from settings → returns to "Connect" state
- [ ] Error states render correctly (API errors, clone failures)

---

## Phase 2.5: Core Package Updates (if needed)

### Overview
The existing `@fleetwide/core` package may need minor additions to support the MVP. These changes are made as needed during Phases 2-4.

### Potential Changes:

1. **Add `types/github.ts`** if GitHub-specific types (`GitHubAppConfig`, `GitHubInstallation`, `GitHubDiscoveredRepo`) are not already separate from the main plan types. Check if they exist in the current core package.

2. **Add Zod schemas** for GitHub-specific validation:
   - `githubAppConfigSchema` — validates App credentials input
   - `installationCallbackSchema` — validates installation callback body
   - `importReposSchema` — validates import request body

3. **Update barrel exports** in `packages/core/src/index.ts` and `packages/core/src/types/index.ts`

---

## Testing Strategy

### Unit Tests
- **`packages/repo-manager`**: Mock Octokit, mock database, mock simple-git
  - `GitHubAppService`: JWT generation, installation token retrieval
  - `GitHubDiscoveryService`: Repo listing, pagination, `alreadyImported` flag
  - `GitHubImportService`: Clone URL generation, batch import flow
  - `RepoRegistry`: CRUD operations
  - `GitService`: Clone, pull operations

### Integration Tests (stretch goal for MVP)
- Backend API: Full request/response cycle with test PostgreSQL (via docker)
- GitHub flow: Configure → install callback → discover → import (mocked GitHub API)

### Manual Testing Checklist
1. [ ] Click "Connect to GitHub" → create GitHub App via manifest flow (one click on GitHub)
2. [ ] Verify credentials are stored automatically (user never sees secrets)
3. [ ] Install app on a GitHub org with both public and private repos
4. [ ] Verify installation callback stores the installation automatically
5. [ ] Discover repos — verify all accessible repos are listed
6. [ ] Import 3+ repos (mix of public and private)
7. [ ] Verify repos are cloned to disk with correct contents
8. [ ] Verify repo metadata is correct in the database
9. [ ] Sync a repo after making changes on GitHub
10. [ ] Remove a repo — verify it's removed from DB (files can stay on disk)
11. [ ] Disconnect GitHub → verify config removed, back to "Connect" state
12. [ ] Error scenario: clone fails (network error) → repo marked as `error` status

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Cloning large repos | Could be slow. For MVP, synchronous is fine. Future: background jobs via BullMQ |
| Many repos in discovery | GitHub API pagination. Frontend shows all results (for MVP, no virtual scrolling) |
| Database connections | Single connection pool via `postgres` driver. Fine for MVP |
| Private key storage | Stored in PostgreSQL as plaintext for MVP. Future: encrypt at rest |

## Migration Notes

- This is a greenfield build — no data migration needed
- Database migrations are forward-only via Drizzle Kit
- The database schema in this MVP is a subset of the full plan schema. Future phases add tables (agents, sessions, schedules, etc.) via new migrations — no schema conflicts

## References

- Full platform plan: `documentation/plans/2026-02-17-platform-architecture-migration.md`
- Core package source: `packages/core/src/`
- [Hono documentation](https://hono.dev/)
- [Drizzle ORM documentation](https://orm.drizzle.team/)
- [GitHub Apps documentation](https://docs.github.com/en/apps/creating-github-apps)
- [Octokit.js documentation](https://github.com/octokit/octokit.js)
- [Radix UI documentation](https://www.radix-ui.com/)
- [Tailwind CSS v4 documentation](https://tailwindcss.com/)
