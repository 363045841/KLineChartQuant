# KLineChartQuant — Agent Guide

## Quick Search

- **MUST USE CodeGraph MCP FIRST**: You can use `codegraph_codegraph_callees, codegraph_codegraph_callers, codegraph_codegraph_explore, codegraph_codegraph_files, codegraph_codegraph_impact, codegraph_codegraph_node, codegraph_codegraph_search, codegraph_codegraph_status` to expolore project, Call analysis.It is a replacement for grep and similar commands.
When you launch a sub-agent, use codegraph MCP when prompted to explore the code in the sub-agent prompt

## Committing

- **Must use commit-message-generator skill**: When committing, always load the skill at `.opencode/skills/commit/SKILL.md` via `skill("commit-message-generator")` to generate conventional commit messages.
- **PR descriptions should cover the entire branch**: When creating a PR, describe the full scope of changes across all commits in the branch, not just the latest commit.
- You can **only** commit when I explicitly ask you to do it.

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

Node: `^20.19.0 \|\| >=22.12.0`. pnpm 11.x.

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

## 数据源

本地开发所需的行情后端，均与本仓库**同级目录**，不在 monorepo 内。

| 仓库 | 路径 | 默认端口 | 作用 |
|------|------|----------|------|
| **stockbao** | 同级 `stockbao/` | `8000` | BaoStock FastAPI：A 股日/分钟 K 线等 |
| **KlineChartQuantGo** | `D:\Code\KlineChartQuantGo` | `8080` / `8081` | Go 多数据源代理：gotdx + 加密所 |

### stockbao

```bash
pnpm stockbao
# starts FastAPI at http://localhost:8000
# requires `stockbao/` alongside this repo; uses `uv run python ./server.py`
```

Vite 开发代理：`/api/stock` → `:8000`。

### KlineChartQuantGo

提供 **gotdx（通达信）** 与 **加密所（币安）** 行情。

| 服务 | 包路径 | 默认端口 | 作用 |
|------|--------|----------|------|
| tdx-api | `services/tdx-api` | `8080` | 通达信 gotdx：股票/期货/MAC K 线、分笔、列表等 |
| binance-api | `services/binance-api` | `8081` | 币安 L2 订单簿 + SSE 深度流 |

本前端对接：

- gotdx → `packages/core/src/data/gotdx.ts`（默认 base `http://127.0.0.1:8080`，可用 `VITE_GOTDX_API_BASE_URL`）
- binance → `packages/core/src/data/binance.ts`（`:8081`）
- Vite 开发代理：`/api/public` → `:8080`（见 `pnpm dev`）

本地启动（在 `KlineChartQuantGo` 根目录）：

```bash
go run . tdx       # 或 go run ./services/tdx-api
go run . binance   # 或 go run ./services/binance-api
```

Agent 细节见该仓库 `AGENTS.md`。

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
- **Plugin subsystem** at `packages/core/src/foundation/plugin/` — PluginHost, HookSystem, EventBus, ConfigManager, StateStore, RendererPluginManager (register/config only; paint goes through Scene).
- **Rendering** at `packages/core/src/rendering/` — Scene/Layer, RendererHost, WebGPU/WebGL/Canvas2D backends.
- **Semantic config** at `packages/core/src/features/semantic/` — JSON → chart config mapping.
- **Root `src/` no longer exists**. Code was migrated to packages. The root `vite.config.ts` still builds a library entry from the (now-removed) `src/index.ts`; for publishing, use `pnpm build:packages`.
- **DPR/ResizeObserver** is the single source of truth for canvas sizing (`devicePixelContentBoxSize` with `window.devicePixelRatio` fallback); state in `viewportState`, DOM adapter in `ChartViewportManager`.
- **Rendering pipeline** (SSOT: `docs/rendering-pipeline.md`): `Chart.scheduleDraw` → `ChartRenderer` + `FrameTransaction` → `prepareFrameData` (viewport → getVisibleRange → calcKLinePositions) → `sealFrameGeometry` → per-pane `scene.paintPane` → `sceneRenderer.endFrame` → `timeAxisLayer.paint`.
- **Layer roles**: background / primary / indicator / component / drawing / overlay; UpdateLevel Main|Overlay|All for dual-canvas incremental paint.
- **StateKernel** is the single source of truth for chart business state (sub-state modules include options, zoom, data, dataManager, comparison, indicator, subPane, marker, viewport, pane, settings, mode, drawing, interaction, systemTheme). Preference theme is `settings.theme` (`light|dark|auto`); **effective** theme is `computed` from preference + `systemTheme` (exposed as flat `signals.theme`). Each sub-state module exposes `readonly` (ReadonlySignal bag) + semantic `actions`. WritableSignal bag (`signals`) is never part of the public return — all mutations flow through actions. Derived state lives in computed(); DOM side-effects in effect(). See `docs/state-kernel-migration-plan.md`.

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
- **Rendering docs SSOT**: `docs/rendering-pipeline.md` only. Do not revive deleted architecture/plugin rendering docs.
- **Viewport too large** may trigger `MAX_CANVAS_PIXELS` (`clampDpr` in viewportState), causing DPR to be actively downgraded.
- **Semantic renderer names** (e.g. `ma`, `boll`) are stringly-typed conventions — renaming requires sync in semantic controller.
- **Web component build**: `pnpm build:wc` in packages/vue (cross-env BUILD_TARGET=web-component).

## Lessons Learned

- **Do not reuse GPU instance buffers across draw calls in the same frame**. `packages/core/src/engine/renderers/rectsViaRenderer.ts` used to cache instance buffers by slot per renderer. Because `drawRectBatchesViaRenderer` reset the slot counter to 0 on every call, the main pane candle batches and the MACD sub-pane batches shared the same GPU buffers within a single frame. MACD wrote later and overwrote the candle instance data, causing the left-side K-line bodies to disappear. The fix is to create and destroy an instance buffer per batch; only cache the pipeline and unit vertex buffer. See also `packages/core/src/rendering/render/createWebGPURenderer.ts` for the WebGPU backend details.
- **GPU rendering backend 必须以物理像素处理坐标，而非逻辑像素**.

## Comment Style

- 每个文件必须有头部注释，说明文件用途。
- 每个函数必须有注释，说明其职责、参数和返回值；简单函数可使用简短注释。
- 关键代码必须有注释，说明实现意图、业务规则或不直观的处理逻辑。
- 每个测试用例必须有中文注释，说明验证的行为和场景。
- 注释正文使用中文，技术术语保留英文。
- 注释必须简单明了，直接说明代码是什么或为什么这样实现，尽量使用一句话，避免冗长和重复代码本身的含义。

## SubAgent
- 最多同时起三个子代理
