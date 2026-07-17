# KLineChartQuant — Agent Guide

## Quick Search

- **MUST USE CodeGraph MCP FIRST**: You can use `codegraph_codegraph_callees, codegraph_codegraph_callers, codegraph_codegraph_explore, codegraph_codegraph_files, codegraph_codegraph_impact, codegraph_codegraph_node, codegraph_codegraph_search, codegraph_codegraph_status` to expolore project, Call analysis.It is a replacement for grep and similar commands.
When you launch a sub-agent, use codegraph MCP when prompted to explore the code in the sub-agent prompt

## Committing

- **Must use commit-message-generator skill**: When committing, always load the skill at `.opencode/skills/commit/SKILL.md` via `skill("commit-message-generator")` to generate conventional commit messages.
- **PR descriptions should cover the entire branch**: When creating a PR, describe the full scope of changes across all commits in the branch, not just the latest commit.

## Monorepo

pnpm workspace at `packages/*`. Published packages:

| Package | Dir | Published as |
|---------|------|-------------|
| Core engine | `packages/core/` | `@363045841yyt/klinechart-core` |
| Vue bindings | `packages/vue/` | `@363045841yyt/klinechart` |
| React bindings | `packages/react/` | `@363045841yyt/klinechart-react` |
| Angular bindings | `packages/angular/` | `@363045841yyt/klinechart-angular` |
| UI schema | `packages/ui-schema/` | `@363045841yyt/klinechart-ui-schema` |

**Build order matters**: `pnpm build:packages` (core → vue). Each framework package depends on core via `workspace:*`.

Node: `^20.19.0 \|\| >=22.12.0`. pnpm 9.x.

## README Generation

All READMEs are generated from `docs/fragments/` (reusable Markdown snippets) + `docs/templates/` (per-package templates) via `scripts/generate-readmes.mjs`. Edit fragments only, then run `pnpm docs:generate` to sync all package READMEs.

## Commands

| Command | What |
|---------|------|
| `pnpm dev` | Vite dev server (host `0.0.0.0`; proxies `/api/stock` → `:8000`, `/api/public` → `:8080`) |
| `pnpm dev:lan` | Same, `--host 0.0.0.0` explicit |
| `pnpm build` | `vue-tsc --build` + `vite build` (uses `run-p`) |
| `pnpm build:packages` | `pnpm --filter @363045841yyt/klinechart-core build && pnpm --filter @363045841yyt/klinechart build` |
| `pnpm build:demo` | `vite build --config vite.demo.config.ts` |
| `pnpm type-check` | `vue-tsc --build` (not `tsc`) |
| `pnpm test:unit` | `vitest` (root tests only — excludes `packages/`) |
| `pnpm test:packages` | `pnpm -r test` (fans out per-package `vitest run`) |
| `pnpm size:packages` | `pnpm -r --workspace-concurrency=4 size` (warn-only in CI) |
| `pnpm lint:publish` | `pnpm -r --workspace-concurrency=4 lint:publish` (warn-only) |
| `pnpm lint:types` | `pnpm -r --workspace-concurrency=4 lint:types` (warn-only) |
| `pnpm docs:generate` | Generate all READMEs from fragments + templates |
| `pnpm docs:check`    | Verify READMEs are up-to-date (exit 1 if stale) |
| `pnpm format` | `prettier --write --experimental-cli src/` |

### Data backend (dev prerequisite)

```bash
pnpm stockbao
# starts FastAPI at http://localhost:8000
# requires `stockbao/` alongside this repo; uses `uv run python ./server.py`
```

## Testing

- **Root tests** (`pnpm test:unit`): legacy suite in `packages/core/src/__tests__/` (jsdom). These are **REQUIRED** in CI.
- **Package tests** (`pnpm test:packages`): each package's own vitest run. **REQUIRED** in CI.
- Per-package vitest configs use `jsdom` for React/Vue, `node` for core/Angular.
- Packages are **excluded** from root vitest config — always use `pnpm -r test` for cross-package testing.
- **Integration tests** (`*.integration.test.ts`) are excluded from all vitest runs.
- **TZ=Asia/Shanghai**: date-format tests assume CST (UTC+8). CI pins this; local runs on non-CST machines may fail around year boundaries.

## Code Conventions

- **Formatter**: Prettier (`semi: false`, `singleQuote: true`, `printWidth: 100`). VSCode auto-formats on save.
- **Decorator transform**: Babel (`@babel/plugin-proposal-decorators` with `version: '2023-11'`). Not native TC39 decorators.
- **Vue bindings signal bridge**: `shallowRef` (not `ref`) — core signal values are immutable; deep proxying breaks `Object.is` referential equality.
- **Controller factory injection**: Vue package uses `__setControllerFactory(createChartController)` at import time. Tests override via `__setControllerFactory(null/mock)` in setup.
- **Generated files**: `components.d.ts` (by `unplugin-vue-components` + `unplugin-icons`) — regenerated on dev server start.
- **`vue-tsc` for type-checking**: not `tsc`. Runs against `tsconfig.app.json`.
- **Vue SFC composable extraction**: always extract logic into composables (`useXxx`); avoid coupling logic inside `<script setup>` blocks.

## Architecture

- **Entrypoints**: `packages/core/src/index.ts` (re-exports reactivity, controllers, tokens), `packages/vue/src/index.ts` (SFC components + createChart + composables), `packages/vue/src/components/KLineChart.vue` (legacy SFC).
- **Core engine** lives at `packages/core/src/engine/` — chart, viewport, panes, renderers, interaction, markers, drawing.
- **Plugin subsystem** at `packages/core/src/plugin/` — PluginHost, HookSystem, EventBus, ConfigManager, StateStore, RendererPluginManager.
- **Semantic config** at `packages/core/src/semantic/` — JSON → chart config mapping.
- **Root `src/` no longer exists**. Code was migrated to packages. The root `vite.config.ts` still builds a library entry from the (now-removed) `src/index.ts`; for publishing, use `pnpm build:packages`.
- **DPR/ResizeObserver** is the single source of truth for canvas sizing (`devicePixelContentBoxSize` with `window.devicePixelRatio` fallback).
- **Rendering pipeline**: computeViewport → getVisibleRange → calcKLinePositions → iterate panes → build RenderContext → rendererPluginManager.render(paneId) → renderPlugin('timeAxis').
- **Three renderer categories**: business (pane-local, e.g. candle/ma/boll), global (paneId=GLOBAL, e.g. gridLines/crosshair), system (isSystem=true, e.g. timeAxis).
- **StateKernel** is the single source of truth for chart business state (sub-state modules include options, zoom, data, dataManager, comparison, indicator, subPane, marker, viewport, pane, settings, mode, drawing, interaction, systemTheme). Preference theme is `settings.theme` (`light|dark|auto`); **effective** theme is `computed` from preference + `systemTheme` (exposed as flat `signals.theme`). Each sub-state module exposes `readonly` (ReadonlySignal bag) + semantic `actions`. WritableSignal bag (`signals`) is never part of the public return — all mutations flow through actions. Derived state lives in computed(); DOM side-effects in effect(). See `docs/state-kernel-migration-plan.md`.**

### StateKernel Reactive Kernel Design Principles

**Single Source of Truth** — All state mutations go through Actions writing to WritableSignal only. No scattered writes, no shadow caches, no manual sync paths.

**Automatic Derivation** — Derived state lives in computed() pure functions. The reactive system tracks dependencies and re-evaluates automatically. No manual syncXxx() / updateYyy() methods.

**Read/Write Separation** — External consumers receive ReadonlySignal<T> (no .set()). Internal mutation uses WritableSignal<T> accessible only within Actions. TypeScript enforces the boundary at compile time.

**Effect Isolation** — DOM/WebGL side effects run in effect() only, decoupled from state computation. Pure derivation functions stay testable without a DOM.

**Batched Atomic Updates** — Multi-field writes are batched via batch() into a single notification cycle. No intermediate state leaks — consumers always observe a consistent snapshot.

Best practice: @packages/core/src/engine/state/viewportState.ts @packages/core/src/engine/state/stateKernel.ts 

## CI

- `library-ci.yml` runs on every push/PR to main. Two jobs: `test` (REQUIRED) and `build` (WARN-ONLY).
- `deploy.yml` builds Vue preview (`packages/vue/preview/`) and deploys to GitHub Pages on push to main.
- `release.yml` publishes to npm on `v*` tag push (core → vue, with `workspace:^` → `^` sed substitution).
- Warn-only gates (`size:packages`, `lint:publish`, `lint:types`, `pnpm -r build`) must be promoted to required before first npm publish (see `docs/CI_GATES.md`).

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

<!-- effect-solutions:end -->

## Known Quirks

- **Local times in tests**: dateFormat tests assume CST (Asia/Shanghai). Run `$env:TZ='Asia/Shanghai'` on Windows if they fail locally.
- **`docs/PLUGIN_SYSTEM.md` is stale**. Prefer `docs/architecture.md` and `docs/system-architecture-overview.md` for current docs.
- **Viewport too large** may trigger `MAX_CANVAS_PIXELS`, causing DPR to be actively downgraded.
- **Semantic renderer names** (e.g. `ma`, `boll`) are stringly-typed conventions — renaming requires sync in `semantic/controller.ts`.
- **Web component build**: `pnpm build:wc` in packages/vue (cross-env BUILD_TARGET=web-component).

## Lessons Learned

- **Do not reuse GPU instance buffers across draw calls in the same frame**. `packages/core/src/engine/renderers/rectsViaRenderer.ts` used to cache instance buffers by slot per renderer. Because `drawRectBatchesViaRenderer` reset the slot counter to 0 on every call, the main pane candle batches and the MACD sub-pane batches shared the same GPU buffers within a single frame. MACD wrote later and overwrote the candle instance data, causing the left-side K-line bodies to disappear. The fix is to create and destroy an instance buffer per batch; only cache the pipeline and unit vertex buffer. See also `packages/core/src/rendering/render/createWebGPURenderer.ts` for the WebGPU backend details.
- **GPU rendering backend 必须以物理像素处理坐标，而非逻辑像素**.

## Comment Style

- Language: body in Chinese; technical terms keep English (Signal, batch, computed, Action, etc.)
- No Markdown symbols: no backticks, bold, or arrows. Use natural language for code references.
- Prefer JSDoc tags: `@remarks` (detailed explanation), `@param`, `@returns`, `@typeParam`, `@example`.
- Inline comments: `/** brief */` or `// brief`, no tags needed.
- **Say what it is, not what to do with it**
- **Never invent Chinese jargon**
- **表述直接，不说倒装话**：说"合并后写入 X"，不说"写入 X 前先在此合并"。注释要一眼看完，不要兜圈子
- **One sentence if possible**

## ATTENTION
- You can only commit when I explicitly ask you to do it.
