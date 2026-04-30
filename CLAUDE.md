# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # install dependencies
pnpm dev              # start Electron + Vite dev server (hot reload)
pnpm build            # compile TypeScript → out/
pnpm package          # build + package → dist-app/ (requires admin on Windows)
```

There are no tests. TypeScript type-checking is the primary correctness mechanism; run `pnpm build` to catch type errors across all three Vite targets (main, preload, renderer).

## Architecture

DeepOcean is a Windows-only Electron desktop app that enforces productivity blocks at the OS level using scheduled rules.

### Three build targets (electron-vite)

`electron.vite.config.ts` configures three separate Vite bundles:

| Target | Entry | Output |
|--------|-------|--------|
| `main` | `electron/main.ts` | `out/main/` |
| `preload` | `electron/preload.ts` | `out/preload/` |
| `renderer` | `index.html` / `src/` | `out/renderer/` |

The renderer uses `@` as an alias for `src/` and `@types` for `types/`.

### IPC bridge

All communication between renderer and main process goes through the typed API exposed in `electron/preload.ts` via `contextBridge.exposeInMainWorld('api', ...)`. The shape is typed in `types/ipc.ts`. In the renderer, call `window.api.*` — never `ipcRenderer` directly.

Main-to-renderer pushes use `win.webContents.send('rules:status-update', ...)` and `win.webContents.send('settings:theme-changed', ...)`. The renderer subscribes via `window.api.onStatusUpdate` and `window.api.onThemeChanged`, both of which return cleanup functions.

### Rule lifecycle & status model

`types/index.ts` defines the two orthogonal fields on every `Rule`:

- **`enabled`** — the user's intent (armed/disarmed). Only the user changes this.
- **`status`** — the actual OS lock state (`blocked | unblocked | locking | unlocking | error`). Only the scheduler and enable/disable actions change this.

When a rule is enabled and the current time falls within a schedule window, it is locked immediately. The scheduler (`electron/scheduler.ts`) uses `node-cron` to fire lock/unlock/pre-notification jobs at the scheduled times, and reconciles state on startup.

### Blocker plugin system

`electron/blockers/BaseBlocker.ts` defines the `IBlocker` interface. `BlockerEngine.ts` holds a registry keyed by `BlockerType` string. To add a new blocker type:

1. Create a class implementing `IBlocker` in `electron/blockers/`.
2. Register it in `BlockerEngine.ts`.
3. Add the type to `BlockerType` in `types/index.ts`.

The three current blockers:
- **FolderBlocker** — uses `icacls` to add/remove a Full-Control DENY ACE for the current Windows user. Requires admin privileges.
- **AppBlocker** — uses `icacls` to deny execute permission on the `.exe` path.
- **WebsiteBlocker** — stub, not yet implemented.

`processMonitor.ts` polls `tasklist` every 5 s and force-kills any running executable matching a currently-blocked app rule (closes the "copy the exe to a different path" bypass).

### Renderer state

Three Zustand stores in `src/stores/`:
- `rulesStore` — list of `Rule` objects + loading flag.
- `settingsStore` — `AppSettings` + a `loaded` flag.
- `targetStatusStore` — per-rule, per-target OS status (`Record<ruleId, TargetStatus[]>`).

`src/routes/__root.tsx` (the `RootLayout` component) is the single place that fetches initial state and wires all event subscriptions. It also runs a safety-net poll every 8 s for target statuses while the window is visible.

### Routing

TanStack Router with a flat route tree:
- `/` — Dashboard (`src/routes/index.tsx`)
- `/add-rule` — Add Rule form (`src/routes/add-rule.tsx`)
- `/settings` — Settings page (`src/routes/settings.tsx`)

### Persistence

`electron/store.ts` uses `electron-store` with a typed schema (`rules: Rule[]`, `settings: AppSettings`). Data is stored in the OS user-data directory. `migrateRules()` in `main.ts` patches any rules missing the `enabled` or `gateways` fields added in later versions.

### Admin requirement

The app is packaged with `requestedExecutionLevel: requireAdministrator` in `electron-builder.yml`. During development (`pnpm dev`) you must run the terminal as administrator, otherwise `icacls` calls will fail.

### Logging

`electron/logger.ts` provides a `createLogger(scope)` factory. Each electron module creates its own scoped logger; structured log lines go to stdout/the Electron console. There is no renderer-side logger.
