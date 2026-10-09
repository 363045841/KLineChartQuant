# 0008. 跨端演进在现有 Monorepo 内增量进行

- Status: Proposed
- Date: 2026-10-09
- Deciders: 363045841（owner）, tseka
- Source: 《KCQ 前端架构方案 v1.1》（2026-10-08），本 ADR 覆盖其 ADR-001/002/005/008/009/010/012

## Context

v1.1 的目标是 Desktop（Electron）+ Mobile（Expo/React Native）+ 共享 KCQ Core。对照 `main`（11ff88e7）核实后的现状：

| 事实 | 证据 |
|---|---|
| 已是 pnpm workspace，纳入 `packages/*`、`examples/*` | `pnpm-workspace.yaml` |
| Core 约 7.8 万行 TS，已有 WebGPU / WebGL2 / Canvas2D 三后端和能力分级探测 | `packages/core/src/rendering/render/backend/*`、`foundation/utils/rendererCapability.ts` |
| 「StateKernel」是 signal 体系的约定（只读 signal + action 写入），不是单独的类 | `packages/core/src/foundation/reactivity/signal.ts` |
| Agent 通过 Core 上 `@Tool` 注册的原语操作图表 | `packages/core/src/features/agent/*` |
| Desktop 渲染进程只有 61 行 `App.vue`，通过相对路径 `../../vue/src/index` 直接引用 Vue 包源码 | `packages/desktop-electron/src/App.vue` |
| 产品 UI 全部在 `packages/vue`：61 个 SFC、约 2.8 万行，`KLineChart.vue` 约 79 KB，Agent 工作台 8,599 行 | `packages/vue/src` |
| 指针、滚轮、捏合、画线的 DOM 输入接线在 `KLineChart.vue`，Core 只暴露 `handlePointerEvent` 等处理函数 | `KLineChart.vue` 约 1380–1460 行 |
| 线上 Web 产品（kcq.nebutra.com）由 nebutra-sailor `apps/kcq` 承载，使用同一套 Vue 图表 UI | sailor `apps/kcq/README.md` |

v1.1 没有覆盖 Web 这一宿主。Web、Desktop、Mobile 是三个宿主，不是两个。

## Decision

1. 接受 v1.1 ADR-001/002：继续使用 `packages/*` workspace，不迁移到 `apps/`。新增应用（如 `packages/mobile`）也放在 `packages/` 下。
2. 接受 v1.1 ADR-005/009：保留 TypeScript Core，不重写渲染引擎，不引入 Rust。渲染层冻结范围沿用既有约定。
3. 接受 v1.1 ADR-008：暂不从 Core 拆出 indicators / drawings / state 等包。
4. 接受 v1.1 ADR-010：Agent 与用户共享 Core 原语；移动端 Agent 运行在 WebView 内（`agent-runtime` 已有 `browser.ts` 入口），原生侧只负责凭据存储，与 Electron 的 `credential-ipc` 对称。
5. 接受 v1.1 ADR-012，并补充一条可执行规则：宿主应用只能通过包的 `exports` 导入，不得相对路径引用其他包的 `src`。Desktop 现有的 `../../vue/src` 引用列为待清偿债务。
6. **新增**：跨宿主共享的关键路径是「框架无关的输入绑定」。把 `KLineChart.vue` 中的 DOM 输入接线抽成 Core 内的独立模块（新目录，不触碰渲染与控制器内部），Vue 先接入并以现有测试证明等价，然后 React、Angular、Mobile WebView 复用。没有这一步，任何非 Vue 宿主只能拿到「能渲染、不能交互」的图表。

### 修订后的推进顺序

| 阶段 | 工作 | 验收 |
|---|---|---|
| P0 | 固定基线 | `library-ci` 全绿（已有） |
| P1 | React 直连 Core 适配器（ADR 0009，本 PR） | 挂载、释放、增量同步、SSR 测试通过 |
| P1b | 抽取框架无关输入绑定，Vue 先接入 | Vue 交互测试零回归；React/Angular 获得交互 |
| P2 | Web + Desktop 保持 Vue（ADR 0011 方案 C）；Desktop 改用包 `exports`，清理相对源码导入 | Desktop 不再引用 `../../vue/src` |
| P3 | 移动端 spike：Expo DOM component + React 适配器 + 输入绑定（ADR 0010） | 中端 Android 平移/缩放 60 FPS，记录冷启动、内存、桥往返延迟 |
| P4 | `packages/mobile` 应用骨架（Expo Router）；仅在 spike 证明需要时新增 `packages/chart-mobile` | iOS / Android 真机运行 |
| P5 | 触控交互：长按十字线、双指缩放、画线、横屏 | 交互用例通过 |
| P6 | 跨宿主一致性：同一份配置与持久化快照在各宿主渲染结果一致 | golden 测试 |
| P7 | 性能与发布 | FPS、内存、启动时间、桥延迟达标 |

v1.1 原 P1「重构 React」与 P2「Desktop React 迁移」之间缺了 P1b。P2 的工作量取决于 ADR 0011，而不是 Desktop 壳本身（壳只有约 450 行）。

## Consequences

- 不产生仓库级重构；已发布的包名与入口不变。
- P1b 是 Desktop、Web、Mobile 三条线共同的前置条件，应优先于任何 UI 迁移排期。
- 每个新增目录在创建前按 v1.1 ADR-012 复核本地文件树与导入关系。
