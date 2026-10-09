# 0009. React 适配器直接挂载 Core

- Status: Proposed
- Date: 2026-10-09
- Deciders: 363045841（owner）, tseka
- Source: v1.1 ADR-006

## Context

`@363045841yyt/klinechart-react` 目前只导出 `KLineChartWC`，它渲染由 Vue 打包的 `<kline-chart>` 自定义元素。v0.10.4 曾**主动移除**直连 Core 的工厂、hooks 和 `KLineChart` 组件，理由是 SSR 安全（`docs/release/v0.10.4.md`）。因此 v1.1 ADR-006 是对既有决定的反转，需要回答两点：

1. SSR：Core 模块在加载期会访问浏览器全局（实测在 Node 中加载 `config` 时模块求值期即访问 `localStorage`；在 jsdom 等有 DOM 的环境中还会创建 canvas 并调用 `getContext`），静态导入会进入服务端求值路径。
2. 功能对等：Web Component 带完整产品 UI（工具栏、指标、画线、设置、Agent 面板），直连适配器只有图表本身。

同时，`docs/architecture/adapter-architecture.md` §5.2 仍描述着已不存在的 `useChart` / `KLineChart`，文档与代码不一致。`packages/angular` 已经直接调用 `createChartController`，React 是三个适配器中唯一绕道 Vue 的。

## Decision

React 包同时提供两个层级，`KLineChartWC` 保持不变：

| 导出 | 用途 | Vue 运行时 |
|---|---|---|
| `KLineChartWC` | 需要完整 KCQ 产品 UI 的 React 宿主 | 需要 |
| `KLineChart`、`useKLineChart`、`useCoreSignal` | 自建外围 UI 的宿主、Expo DOM component（ADR 0010）、未来的 React 产品 UI | 不需要 |

实现约束：

- Core 只在客户端 effect 中通过动态 `import()` 加载，SSR 只输出容器节点。服务端渲染有专门测试（`@vitest-environment node`）。
- 控制器创建是异步的：卸载或 StrictMode 双挂载时，迟到的控制器在 resolve 后立即 `dispose()`。
- 挂载参数只在首次挂载时读取；之后 `data`、`theme`、`settings` 通过控制器方法增量同步，主题优先级与 Angular 适配器一致（显式 `theme` > `settings.theme`，`auto` 只注入系统主题）。
- `useCoreSignal` 基于 `useSyncExternalStore`，与 Core signal 的引用相等语义一致，不做额外拷贝。
- 控制器创建失败时抛给最近的 Error Boundary。

## Consequences

- v1.1 验收标准「React 直接使用 Core，无 Vue 运行时依赖」在**打包层面**达成：只用 `KLineChart` 的宿主不会打入 Vue（`sideEffects: false`，WC 为动态导入）。**安装层面**仍会装上 Vue 包，因为它是 `dependencies`；改为可选 peer 属于破坏性变更，留到下一个 minor。
- 输入接线由 ADR 0008 P1b 的 `bindChartInput` 提供，与 Vue 组件共用；宿主可通过 `input` 选项注入拦截钩子，或传 `false` 自行转发事件。
- `adapter-architecture.md` §5.2 更新为实际 API。
- 如果 owner 仍倾向 v0.10.4 的单一 WC 路线，可以只合入 ADR、不合入代码；代码是纯增量，回滚即删除新文件和导出。
