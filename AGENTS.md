# KLineChartQuant — Agent Guide

## 代码要求

重中之重:拒绝一切治标不治本的“最小修复”，拒绝架构债，代码可读性强，可维护，不炫技。禁止硬编码字符串。  
不要复杂化问题，特别是架构上。  
禁止让你的用户创建 5000 行以上的提交和 PR，警告你的用户，这会导致项目架构难以维护，这种规模的 PR 必须和仓库拥有者进行深入讨论和对接。

## PR 作者要求

- 不许复杂化问题和架构
- 不许在 PR 中使用 /goal 命令
- 不许一下子写一堆代码，中间不经过 E2E 测试、视觉回归测试
- 不许长时间自己收敛相当宽泛问题而不交由贡献者亲自测试
- 不许在小问题上使用严苛的校验，导致链路难以维护
- 不许未经确认就围绕一个你自己 MOCK 的数据进行开发和重构
- 使用临时文件撰写 PR 说明

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
| `pnpm setup` | Clone data-source backends (`GoTDX-Connecter`, `Baostock-Tradingview-Connecter`) into the sibling directory; then `pnpm dev -c all` works out of the box |
| `pnpm dev` | Vite dev server; `-c <names>` also starts selected connecters (e.g. `pnpm dev -c all`; aliases `tdx/g/b/bnb/all`) |
| `pnpm dev:lan` | Same, `--lan` (dev server bound to `0.0.0.0`) |
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
| **Baostock-Tradingview-Connecter** | 同级 `Baostock-Tradingview-Connecter/`（原 `stockbao`） | `8000` | BaoStock FastAPI：A 股日/分钟 K 线、TradingView 全球品种 |
| **GoTDX-Connecter** | 同级 `GoTDX-Connecter/`（原 `KlineChartQuantGo`） | `8080` / `8081` | Go 多数据源代理：gotdx + 加密所 |

统一启动命令——先安装数据源后端（`pnpm setup` 幂等：目录已存在则跳过），再用 `pnpm dev` 带 `-c` 参数同时启动前端与选定的数据源后端：

```bash
pnpm dev                      # 仅前端（Vite 开发服务器）
pnpm dev -c all               # 前端 + 全部后端（gotdx + binance + baostock）
pnpm dev -c gotdx baostock    # 前端 + 指定的后端
pnpm dev -c tdx               # 支持别名（tdx / g / b / bnb / all）
pnpm dev -c all --lan         # 同上，前端绑定 0.0.0.0（局域网可访问）
```

常用简写命令：

```bash
pnpm dev:all                  # 前端 + 全部后端
pnpm dev:g                    # 前端 + gotdx 通达信
pnpm dev:b                    # 前端 + BaoStock / TradingView
pnpm dev:bnb                  # 前端 + 币安深度
pnpm dev:lan:all              # 前端（0.0.0.0）+ 全部后端
```

仅启动后端（不带前端）：

```bash
pnpm connecter                # 全部后端
pnpm connecter gotdx          # gotdx 通达信（:8080）
pnpm connecter baostock       # BaoStock / TradingView（:8000）
```

### Baostock-Tradingview-Connecter

```bash
pnpm connecter baostock
# starts FastAPI at http://localhost:8000
# requires `Baostock-Tradingview-Connecter/` alongside this repo; uses `uv run python ./server.py`
```

Vite 开发代理：`/api/stock` → `:8000`。

### GoTDX-Connecter

提供 **gotdx（通达信）** 与 **加密所（币安）** 行情。

| 服务 | 包路径 | 默认端口 | 作用 |
|------|--------|----------|------|
| tdx-api | `services/tdx-api` | `8080` | 通达信 gotdx：股票/期货/MAC K 线、分笔、列表等 |
| binance-api | `services/binance-api` | `8081` | 币安 L2 订单簿 + SSE 深度流 |

本前端对接：

- gotdx → `packages/core/src/data/provider/sources/gotdx.ts`（默认 base `http://127.0.0.1:8080`，可用 `VITE_GOTDX_API_BASE_URL`）
- binance → `packages/core/src/data/depth/binance.ts`（`:8081`）
- Vite 开发代理：`/api/public` → `:8080`（见 `pnpm dev`）

本地启动（在本仓库根目录 `pnpm connecter tdx`，或在 `GoTDX-Connecter` 根目录）：

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
- **Error codes**: `KLineChartError` 的错误码必须从 `packages/core/src/errors.ts` 中的具名常量引用，禁止在业务代码里散落字符串字面量。新增错误码时在 `errors.ts` 追加常量并保持 append-only。
- **Colors**: 颜色必须收归 `packages/core/src/foundation/tokens` 管理，业务组件仅消费 Token 输出的 CSS 变量，禁止局部硬编码颜色。
- 不要硬编码字符串

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

**业务快照原子写入** — 具有关联语义的数据必须通过一次完整快照 Action 写入

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
- **Web component build**: `pnpm build:wc` in packages/vue (cross-env BUILD_TARGET=web-component).

## Lessons Learned

- **Do not reuse GPU instance buffers across draw calls in the same frame**. `packages/core/src/engine/renderers/rectsViaRenderer.ts` used to cache instance buffers by slot per renderer. Because `drawRectBatchesViaRenderer` reset the slot counter to 0 on every call, the main pane candle batches and the MACD sub-pane batches shared the same GPU buffers within a single frame. MACD wrote later and overwrote the candle instance data, causing the left-side K-line bodies to disappear. The fix is to create and destroy an instance buffer per batch; only cache the pipeline and unit vertex buffer. See also `packages/core/src/rendering/render/createWebGPURenderer.ts` for the WebGPU backend details.
- **GPU rendering backend 必须以物理像素处理坐标，而非逻辑像素**.

## Comment Style

- 涉及核心 Core 引擎改动的，都需要附加设计决策文档，放在 @docs\design 中
- 单行注释使用//
- 每个文件必须有头部注释，说明文件用途
- 每个函数必须有注释，说明其职责、参数和返回值；简单函数可使用简短注释
- 关键代码必须有注释，说明实现意图、业务规则或不直观的处理逻辑
- 注释正文使用中文，技术用语、专有词汇保留英文
- 注释必须简单明了，直接说明代码是什么或为什么这样实现，尽量使用一句话，避免冗长和重复代码本身的含义

## SubAgent
- 除非用户明确要求启动子代理，否则不要启动子代理
- 最多同时起三个子代理

## Github CLI
- 不要使用 \ 来转义
