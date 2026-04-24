A blocker app, simply because no app provides real source-agnostic control over your system for free. 

Work in the deep ocean.

**_Download_**

Grab the latest installer from [Releases](https://github.com/emirks/deep-ocean/releases).

**_Features_**

- **Folder blocking** — deny filesystem access to any folder via `icacls`
- **Scheduled rules** — set daily time windows (e.g. block 09:00–17:00)
- **App & website blockers** — stubs ready for extension
- **System tray** — runs quietly in the background with notifications

**_Stack_**

Electron 33 · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Zustand · TanStack Router · electron-store · node-cron

**_Dev_**

```bash
pnpm install
pnpm dev
```

**_Build_**

```bash
pnpm build          # compile
node node_modules/electron-builder/cli.js   # package → dist-app/
```

> Requires admin privileges on first run (folder blocking uses `icacls`).
