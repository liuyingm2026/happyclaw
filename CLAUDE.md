# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

Monorepo containing two major projects:

- **`happy/`** - Happy Coder mobile/web client and sync server (yarn workspaces)
- **`openclaw/`** - OpenClaw AI terminal assistant (pnpm)

Each sub-project has its own CLAUDE.md with detailed guidance. Read the relevant one when working in that directory.

### Happy Workspace (`happy/`)

Yarn-based monorepo:
- `packages/happy-app` - React Native/Expo mobile app
- `packages/happy-server` - Fastify backend with Prisma/PostgreSQL
- `packages/happy-cli` - CLI wrapper for Claude Code
- `packages/happy-wire` - Shared wire protocol types

### OpenClaw (`openclaw/`)

pnpm-based multi-channel AI gateway with extensible messaging integrations. See `openclaw/AGENTS.md`.

## Commands

### Happy Workspace
```bash
cd happy

# Mobile app
yarn start                    # Expo dev server
yarn ios / yarn android       # Run on simulator
yarn web                      # Web version
yarn typecheck                # Run after all changes

# Server
cd packages/happy-server
yarn dev                      # Start with hot reload
yarn migrate                  # Prisma migrations
yarn db                       # Local PostgreSQL in Docker

# CLI
cd packages/happy-cli
yarn dev                      # Dev mode
yarn dev:local-server         # With local server
```

### OpenClaw
```bash
cd openclaw
pnpm install
pnpm dev                      # Run in dev mode
pnpm build
pnpm test                     # Vitest
pnpm check                    # Lint + format + typecheck
```

## Workflow

### Planning
- Enter plan mode for non-trivial tasks (3+ steps or architectural decisions)
- Write plans to `tasks/todo.md` with checkable items
- If something goes wrong, STOP and re-plan

### Session Continuity
At session start, read:
- `.claude/memo/memo.md` - Project context
- `.claude/memo/lessons.md` - Known issues

When encountering bugs, check `memo/lessons.md` first for similar issues.

### Verification
- Never mark complete without proving it works
- Run typecheck after TypeScript changes
- Verify git push with `git status` and `git log`

## Conventions

### Package Managers
- **Happy**: Use `yarn` (not npm)
- **OpenClaw**: Use `pnpm`

### Code Style
- 4 spaces indentation (both projects)
- TypeScript strict mode
- Path alias `@/` → `./sources/*` (Happy)

### Testing
- Vitest for both projects
- Test files: `*.test.ts` or `*.spec.ts`

## Windows Notes
- Bash syntax for shell commands (Git Bash)
- Use `uv run` for Python if not in PATH

## Project-Specific Docs

- `happy/packages/happy-app/CLAUDE.md` - Mobile app (i18n, Unistyles, components)
- `happy/packages/happy-server/CLAUDE.md` - Backend (Prisma, debugging)
- `happy/packages/happy-cli/CLAUDE.md` - CLI (SDK integration, session forking)
- `openclaw/AGENTS.md` - OpenClaw (plugins, releases, multi-agent safety)
