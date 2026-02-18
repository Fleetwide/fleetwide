# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

This is a **pnpm + Turborepo** monorepo. Node 22+ required.

```bash
pnpm build              # Build all packages (dependency-ordered)
pnpm dev                # Watch mode for all packages
pnpm test               # Run all tests (builds first)
pnpm lint               # Lint all packages
pnpm typecheck          # Type-check all packages
pnpm format             # Prettier format all files
pnpm format:check       # Prettier check (CI)

# Single package
pnpm --filter @fleetwide/<pkg> build
pnpm --filter @fleetwide/<pkg> test
pnpm --filter @fleetwide/<pkg> dev

# Database
pnpm --filter @fleetwide/database db:generate   # Generate migration
pnpm --filter @fleetwide/database db:migrate    # Apply migrations
pnpm --filter @fleetwide/database db:studio     # Drizzle Studio

# Local PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Integration tests (requires Docker)
pnpm --filter @fleetwide/workspace-manager test:integration
```

## Architecture

**Fleetwide** is a self-hosted multi-repo agent orchestration platform. It spins up Docker containers, runs AI agents inside them against cloned repos, and manages a branch-push-preview approval workflow ending in pull requests.

### Monorepo Layout

- `apps/backend/` — NestJS API server (CommonJS, `emitDecoratorMetadata`)
- `apps/web/` — React 19 + Vite 6 + Tailwind v4 + Zustand SPA
- `packages/core/` — Shared types, errors (`FleetwideError` subclasses), Zod validation schemas, ID generation, logging
- `packages/database/` — Drizzle ORM schema + migrations (PostgreSQL)
- `packages/repo-manager/` — GitHub App integration, git clone/pull operations
- `packages/workspace-manager/` — Docker container lifecycle, session orchestrator, idle timeout management

All shared packages are **ESM**. The backend is **CommonJS** (NestJS requirement) and consumes ESM packages via Node 22's `require(esm)` interop.

### Backend: Clean/Hexagonal Architecture

```
interfaces/http/  →  application/  →  ports/  ←  infrastructure/
                                       ↑
                             modules/ (NestJS DI wiring)
```

**Only `interfaces/`, `modules/`, `filters/`, and `main.ts` may import from `@nestjs/*`.** Application and domain layers are framework-free.

- **`ports/`** — Abstract classes defining contracts (used as DI tokens)
- **`application/`** — Use-case classes (used as DI tokens, registered via `useFactory`)
- **`infrastructure/`** — Drizzle repositories, Octokit adapter, UnitOfWork impl
- **`interfaces/http/`** — Thin NestJS controllers delegating to use-cases
- **`modules/`** — NestJS composition root. `CoreModule` is global, provides DB, Docker, and all shared-package services via Symbol tokens from `core/injection-tokens.ts`

### Domain Model

**Workspace**: Persistent Docker environment definition (image + repos + setup commands + env vars + resource limits). Status: `active | error | archived`.

**Session**: Ephemeral container running an AI agent task. Lifecycle: `starting → setup → running → finalizing → preview → approved/rejected → completed/failed/expired`.

- `SessionOrchestrator` owns all session writes (the `SessionRepository` port is read-only for route handlers)
- Finalization: commits changes, pushes `fleetwide/session-{id}` branch, computes diff
- Approval: creates GitHub PRs via Octokit, destroys container
- Rejection: deletes remote branch, destroys container
- `IdleTimeoutManager` polls every 60s to destroy idle `preview` containers

## Conventions

- **IDs**: Always `cuid2` via `generateId()` / `generatePrefixedId()` from `@fleetwide/core`. Never UUIDs.
- **Type imports**: Always `import type` for type-only imports (ESLint-enforced).
- **Validation**: Zod schemas in `@fleetwide/core/utils/validation.ts` with `validate(schema, data)` returning `ValidationResult<T>`.
- **Logging**: `createLogger({ name: 'component' })` from `@fleetwide/core` (pino, structured JSON in prod, pretty in dev).
- **Errors**: Extend `FleetwideError` from `@fleetwide/core`. Each carries `code`, `status`, `details`. Global `FleetwideExceptionFilter` formats all API error responses.
- **Container naming**: `fleetwide-session-{sessionId}`, labeled `fleetwide.managed=true`.
- **Branch naming**: `fleetwide/session-{sessionId}`.
- **Git identity in containers**: `Fleetwide Bot <bot@fleetwide.dev>`.
- **Formatting**: Prettier — single quotes, trailing commas, 100 char width, semicolons.
- **ESLint**: `@typescript-eslint/no-unused-vars` errors (except `_` prefixed), `no-explicit-any` warns.
- **Testing**: Vitest with globals enabled. Tests in `src/__tests__/`, named `*.test.ts`.