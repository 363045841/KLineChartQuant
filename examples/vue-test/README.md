# KLineChart Vue Test

Pre-publish smoke test for `@363045841yyt/klinechart`. Installs from **npm registry** via `npm install` — not linked to the monorepo workspace.

> **Note**: This app imports the package by name, so it resolves to the built `dist` artifacts via package `exports`. Changes to `packages/*/src` are not hot-reloaded here — run `pnpm build:packages` after editing library source. For source-level HMR use `pnpm dev` (the `packages/vue` preview server).

## Usage

```bash
# Install from npm (not workspace)
npm install

# Dev server
npm run dev

# Production build (type-check + bundle)
npm run build
```

## Update to latest published version

```bash
npm install @363045841yyt/klinechart@latest @363045841yyt/klinechart-core@latest
```

> **Note**: Use `npm install`, not `pnpm`. The root monorepo uses pnpm workspace, which would link local packages instead of fetching from registry.
