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

- 修改或理解代码前，优先使用 CodeGraph MCP 的 `codegraph_codegraph_explore` 分析调用链和影响范围；未索引内容再使用 grep/read。
- 启动子代理探索代码时，也要求其优先使用 CodeGraph MCP。

## Committing

- **Must use commit-message-generator skill**: When committing, always load the skill at `.opencode/skills/commit/SKILL.md` via `skill("commit-message-generator")` to generate conventional commit messages.
- **PR descriptions should cover the entire branch**: When creating a PR, describe the full scope of changes across all commits in the branch, not just the latest commit.
- You can **only** commit when I explicitly ask you to do it.

## Monorepo

pnpm workspace at `packages/*`。发布包：

| 目录 | 发布包 |
|------|--------|
| `packages/core` | `@363045841yyt/klinechart-core` |
| `packages/vue` | `@363045841yyt/klinechart` |
| `packages/react` | `@363045841yyt/klinechart-react` |
| `packages/angular` | `@363045841yyt/klinechart-angular` |
| `packages/ui-schema` | `@363045841yyt/klinechart-ui-schema` |

框架包通过 `workspace:*` 依赖 core；发布构建使用 `pnpm build:packages`（core → vue）。

Node `^20.19.0 || >=22.12.0`，pnpm 11.x。

## README Generation

All READMEs are generated from `docs/fragments/` (reusable Markdown snippets) + `docs/templates/` (per-package templates) via `scripts/generate-readmes.mjs`. Edit fragments only, then run `pnpm docs:generate` to sync all package READMEs.

## Commands

| Command | What |
|---------|------|
| `pnpm build:packages` | 发布包构建（core → vue） |
| `pnpm type-check` | 使用 `vue-tsc --build`，不要使用 `tsc` |
| `pnpm test:unit` | root 测试 |
| `pnpm test:packages` | 所有 workspace 包测试 |
| `pnpm docs:generate` / `pnpm docs:check` | 生成 / 校验 README |

## 数据源

本地行情后端位于本仓库同级目录：`GoTDX-Connecter`（gotdx、Binance）和 `Baostock-Tradingview-Connecter`（BaoStock、TradingView）。涉及后端时先阅读对应仓库的 `AGENTS.md`；使用 `pnpm setup` 安装，`pnpm dev -c <name>` 或 `pnpm connecter <name>` 启动。

## Testing

- Root 测试使用 `pnpm test:unit`；packages 被其排除，跨包测试使用 `pnpm test:packages`。
- `*.integration.test.ts` 不会被默认测试收集。
- 日期测试依赖 `TZ=Asia/Shanghai`；本地跨年失败时先设置该环境变量。

## Code Conventions

- **Formatter**: Prettier (`semi: false`, `singleQuote: true`, `printWidth: 100`). VSCode auto-formats on save.
- **Decorator transform**: Babel (`@babel/plugin-proposal-decorators` with `version: '2023-11'`). Not native TC39 decorators.
- **Vue bindings signal bridge**: `shallowRef` (not `ref`) — core signal values are immutable; deep proxying breaks `Object.is` referential equality.
- **Controller factory injection**: Vue package uses `__setControllerFactory(createChartController)` at import time. Tests override via `__setControllerFactory(null/mock)` in setup.
- **Generated files**: `components.d.ts` (by `unplugin-vue-components` + `unplugin-icons`) — regenerated on dev server start.
- **`vue-tsc` for type-checking**: not `tsc`. Runs against `tsconfig.app.json`.
- **Vue SFC composable extraction**: always extract logic into composables (`useXxx`); avoid coupling logic inside `<script setup>` blocks.
- **Error codes**: `KLineChartError` 的错误码必须从 `packages/core/src/errors.ts` 中的具名常量引用，禁止在业务代码里散落字符串字面量。新增错误码时在 `errors.ts` 追加常量并保持 append-only
- **Colors**: 颜色必须收归 `packages/core/src/foundation/tokens` 管理,业务组件仅消费 Token 输出的 CSS 变量,禁止局部硬编码颜色。
- 不要硬编码字符串
- 禁止编写和保留复杂化、无意义的回退逻辑,回退是风险放大点
- 禁止在编程过程中刻意先留兼容逻辑,然后再修改的行为
- 不许在测试中引入脆弱的 MOCK

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
- **Core Native Agent Tools** Agent 和用户等权,用户UI调用的入口就是Agent工具的入口,Agent就是用户,用户就是Agent.

### StateKernel Reactive Kernel Design Principles

**Single Source of Truth** — All state mutations go through Actions writing to WritableSignal only. No scattered writes, no shadow caches, no manual sync paths.

**Automatic Derivation** — Derived state lives in computed() pure functions. The reactive system tracks dependencies and re-evaluates automatically. No manual syncXxx() / updateYyy() methods.

**Read/Write Separation** — External consumers receive ReadonlySignal<T> (no .set()). Internal mutation uses WritableSignal<T> accessible only within Actions. TypeScript enforces the boundary at compile time.

**Effect Isolation** — DOM/WebGL side effects run in effect() only, decoupled from state computation. Pure derivation functions stay testable without a DOM.

**Batched Atomic Updates** — Multi-field writes are batched via batch() into a single notification cycle. No intermediate state leaks — consumers always observe a consistent snapshot.

**业务快照原子写入** — 具有关联语义的数据必须通过一次完整快照 Action 写入

Best practice: @packages/core/src/engine/state/viewportState.ts @packages/core/src/engine/state/stateKernel.ts 

<!-- effect-solutions:start -->

## Effect Best Practices

编写 Effect 代码前必须查阅 `effect-solutions` 的相关指南，不得猜测模式。

<!-- effect-solutions:end -->

## Known Quirks

- **Local times in tests**: dateFormat tests assume CST (Asia/Shanghai). Run `$env:TZ='Asia/Shanghai'` on Windows if they fail locally.
- **Rendering docs SSOT**: `docs/rendering-pipeline.md` only. Do not revive deleted architecture/plugin rendering docs.
- **Viewport too large** may trigger `MAX_CANVAS_PIXELS` (`clampDpr` in viewportState), causing DPR to be actively downgraded.
- **Web component build**: `pnpm build:wc` in packages/vue (cross-env BUILD_TARGET=web-component).

## Agent
- @Tool 注册的工具,不应该让Agent直接传入时间戳

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
