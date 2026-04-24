A blocker app, simply because no app provides real control over your system. work in the deep ocean.

## Download

Grab the latest installer from [Releases](https://github.com/emirks/deep-ocean/releases).

## Features

- **Folder blocking** — deny filesystem access to any folder via `icacls`
- **Scheduled rules** — set daily time windows (e.g. block 09:00–17:00)
- **App & website blockers** — stubs ready for extension
- **System tray** — runs quietly in the background with notifications

## Stack

Electron 33 · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Zustand · TanStack Router · electron-store · node-cron

## Dev

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build          # compile
node node_modules/electron-builder/cli.js   # package → dist-app/
```

> Requires admin privileges on first run (folder blocking uses `icacls`).
