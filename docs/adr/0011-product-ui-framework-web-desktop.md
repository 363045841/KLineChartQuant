# 0011. Web 与 Desktop 产品 UI 使用同一框架

- Status: Accepted（方案 C）
- Date: 2026-10-09
- Deciders: tseka
- Source: v1.1 ADR-003、ADR-011

## Context

v1.1 ADR-003 写的是「Desktop 原位迁移至 Electron + React」。核实后：

- Desktop 的渲染进程是 61 行 `App.vue`，所有产品 UI 来自 `packages/vue`（61 个 SFC、约 2.8 万行，其中 Agent 工作台 8,599 行）。「Desktop 迁移 React」实际等于**用 React 重写整个产品 UI**，而不是改造一个 Electron 壳。
- Web 产品（sailor `apps/kcq`）使用同一套 Vue UI。只迁 Desktop 会让同一产品在 Web 和 Desktop 上各有一份 UI。
- 进行中的工作与 React 方向冲突：
  - fork ADR 0004（Proposed）在 `packages/vue` 上推进 token 与样式迁移；
  - sailor ADR 2026-10-09「framework-agnostic design foundation」（Proposed）决定 KCQ 使用 Ark UI / Zag 的 Vue 适配器，并在共享原语覆盖后**移除 React**（线上约 108 KB br）。
- 移动端无论如何都是独立 UI：shadcn/Radix 与 React Native 组件不能互通。React 带给 Desktop 与 Mobile 的共享只发生在逻辑层（hooks、Zustand store、TanStack Query），不在组件层。

## Options

| | A. 只迁 Desktop 到 React（v1.1 字面） | B. Web + Desktop 一起迁 React | C. Web + Desktop 保持 Vue |
|---|---|---|---|
| UI 实现数 | 3（Vue Web、React Desktop、RN Mobile） | 2 | 2 |
| 重写量 | 约 2.8 万行，且 Web 版继续维护 | 约 2.8 万行，可按面板渐进（React 外壳 + `KLineChartWC` 岛） | 0 |
| 与 Mobile 共享 | 逻辑层 | 逻辑层（hooks、store、query） | 逻辑层，前提是写成框架无关 TS |
| 与 sailor | 冲突 | 需要推翻 sailor ADR；可复用 `@nebutra/ui`（React） | 一致；走 Ark UI Vue 适配器 |
| 与 ADR 0004 | 冲突 | 迁移期间 0004 的工作部分作废 | 一致 |
| 迁移期包体 | — | Vue + React 并存 | 不变 |
| 生态 / 招聘 | React | React | Vue |

## Decision

- **否决 A**：同一产品出现两份桌面级 UI，Agent 工作台等核心功能重复实现。
- **采用 C**：Web 与 Desktop 保持 Vue，Mobile 用 Expo + React Native，跨端共享 Core 与框架无关的逻辑层。预设重新评估条件，满足任一条即重开 B：
  1. P3 移动端 spike 显示大量移动端逻辑只能以 React hooks 形式共享，框架无关 TS 无法覆盖；
  2. 团队后续以 React / RN 为主要技术栈；
  3. sailor 撤回「KCQ 去 React」的决定。
- 先做与 B / C 选择无关的工作：ADR 0008 P1b 输入绑定；把 UI 之外的状态（自选、工作区、行情源、偏好）整理为框架无关的 TS store；Desktop 改为通过包 `exports` 导入。这些工作在 B 下降低迁移成本，在 C 下降低 Mobile 的重复实现。
- 若日后重开 B，按以下顺序执行：React 外壳 + `KLineChartWC` 承载现有 UI → 按面板替换（设置、指标、工作区、Agent 工作台）→ 最后替换图表外壳并移除 WC；每一步 Web 与 Desktop 同步发布。

### v1.1 技术选型表对应关系

| 层 | v1.1（React） | 方案 C 下的对应 |
|---|---|---|
| UI 组件 | shadcn/ui + Radix | Ark UI（Vue）+ 共享 tokens CSS |
| 样式 | Tailwind | tokens CSS 变量（ADR 0004） |
| UI 状态 | Zustand | Pinia（现有）；跨端逻辑写成框架无关 TS |
| 异步状态 | TanStack Query | `@tanstack/vue-query`，或框架无关 query 函数 |
| 路由 | React Router | 宿主路由（KCQ 包内无客户端路由；Web 由 sailor 承载） |
| 动画 | Motion | CSS / Motion One |
| 长列表 | TanStack Virtual | `@tanstack/vue-virtual` |

Electron 安全基线不受影响：`contextIsolation` 开启、`nodeIntegration` 关闭、preload + 类型化 IPC。

## Consequences

- 选 C：Desktop 不做 UI 迁移，P2 变为「Desktop 改用包 exports + 清理相对源码导入」；Mobile 独立推进。
- 选 B：需要单独的迁移任务与里程碑，并同步修订 sailor ADR 与 fork ADR 0004。
