# 0010. Mobile：Expo 应用 + WebView 内运行图表

- Status: Proposed
- Date: 2026-10-09
- Deciders: 363045841（owner）, tseka
- Source: v1.1 ADR-004、ADR-007

## Context

Core 需要 `HTMLElement` 容器和 Canvas / WebGL / WebGPU 上下文（`ChartMountOptions.container: HTMLElement`），React Native 没有 DOM。备选方案：

| 方案 | 优点 | 代价 |
|---|---|---|
| A. Capacitor 等壳直接打包现有 Web UI | 最快；2.8 万行 Vue UI 直接复用 | 导航与手势非原生；移动端 UI 只是 Web 的缩放版 |
| B. Expo + WebView 内运行 Core（v1.1） | 原生导航、列表、存储；图表沿用 Core 与渲染后端 | 两套 UI；需设计桥接协议；WebView 冷启动与内存 |
| C. RN 原生渲染（如 Skia）重写图表 | 无 WebView | 重写渲染器，违反「不重写渲染引擎」 |

Expo 已提供 DOM components（`'use dom'`）：同一个 React DOM 组件在原生端运行于 WebView，在 Web 端照常渲染，官方用例明确包括 canvas / WebGL 和图表库（<https://docs.expo.dev/guides/dom-components/>）。Expo SDK 52 起自动为 monorepo 配置 Metro，SDK 54 起支持 pnpm 隔离安装（<https://docs.expo.dev/guides/monorepos/>）。

## Decision

1. 接受 B：`packages/mobile` 为 Expo 应用（Expo Router），图表运行在 WebView 内。
2. **修订 v1.1 ADR-007**：不先建 `packages/chart-mobile` 和自定义桥接协议。先用 Expo DOM component 包裹 ADR 0009 的 `KLineChart`，由 Expo 负责打包和 props 序列化。只有 spike 证明以下任一需要时，才新增 `packages/chart-mobile`：
   - 需要预热或常驻 WebView 以压缩冷启动；
   - 需要固定离线图表包版本；
   - DOM component 的序列化 props / 异步回调无法满足交互延迟。
3. 跨桥数据规则（沿用 v1.1 §5）：只传指令、状态快照和低频事件。行情在 WebView 内经 `MarketDataProvider` 拉取，逐 tick 数据和手势事件不跨桥。
4. Agent 运行在 WebView 内，直接调用 Core `@Tool` 原语；原生侧提供安全存储的凭据接口，与 Electron `credential-ipc` 同构。
5. 触控交互使用 ADR 0008 P1b 的 `bindChartInput`：它为绘图区设置 `touch-action: none`，单指平移与双指缩放由 Core 的 `PinchTracker` 处理。长按十字线等移动端手势在 P5 补充。

### Spike 退出标准（P3）

- 中端 Android 真机，5,000 根 K 线平移 / 缩放达到 60 FPS（v1.1 初始验收目标）。
- 记录冷启动到首帧时间、常驻内存、指令往返延迟，作为 P7 基线。
- 验证 WebGPU 在 iOS WKWebView / Android WebView 上的实际可用性；不可用时由 `rendererCapability` 降级到 WebGL2 / Canvas2D。

## Consequences

- 移动端 UI（Expo Router + React Native 组件）与桌面 UI 是两套实现；图表行为、配置模型、Agent 原语共享 Core。
- 少一个包、少一套自定义协议进入维护面；若 spike 失败，回退到 v1.1 原方案。
- 若 owner 更看重上线速度而非原生体验，方案 A 可作为过渡，但不作为长期架构。
