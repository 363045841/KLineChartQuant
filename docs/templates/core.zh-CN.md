# @363045841yyt/klinechart-core

面向浏览器的框架无关 K 线图表运行时，以自研 Signal 响应式状态内核为中心，提供多后端渲染能力。

## 概述

`@363045841yyt/klinechart-core` 是 KLineChartQuant 各框架绑定的运行时基础。它负责图表业务状态、视口与面板计算、输入处理、数据协调和渲染；它会创建及管理图表 DOM 与 Canvas，但应用层 UI 由 Vue、React、Angular 或自定义适配器负责。

面向应用的公开边界是 `ChartController`：

- 通过 `ReadonlySignal` 读取图表状态。
- 通过 Controller 方法修改图表状态。
- 自定义宿主需要时转发浏览器输入事件。
- 宿主卸载时销毁 Controller。

## 安装

```bash
npm install @363045841yyt/klinechart-core
# 或
pnpm add @363045841yyt/klinechart-core
# 或
yarn add @363045841yyt/klinechart-core
```

## 快速开始

挂载前请通过 CSS 为容器设置非零尺寸。

```typescript
import { createChartController, type KLineData } from '@363045841yyt/klinechart-core/controllers'

const container = document.querySelector<HTMLElement>('#chart')
if (!container) throw new Error('Chart container not found')

const data: KLineData[] = [
  {
    timestamp: 1704067200000,
    open: 100,
    high: 105,
    low: 98,
    close: 103,
    volume: 10_000,
  },
]

const chart = createChartController({
  container,
  data,
  initialZoomLevel: 3,
  theme: 'light',
})

// Signal 可调用；subscribe() 返回取消订阅函数。
const unsubscribe = chart.viewport.subscribe(() => {
  const viewport = chart.viewport()
  console.log(viewport.visibleFrom, viewport.visibleTo)
})

chart.addIndicator('MA', 'main')
chart.zoomIn()

// 宿主移除时调用两者。
unsubscribe()
chart.dispose()
```

当前 `createChartController` 同步创建图表。工厂类型同时允许异步实现，因此接收可配置 factory 的框架适配器应支持 `ChartController | Promise<ChartController>`。

## 状态内核

引擎以 `ChartStateKernel` 为图表业务状态的单一事实来源。它组合 options、zoom、data、viewport、pane layout、settings、system theme、chart mode、drawing、interaction、comparison、indicator、marker 和 renderer runtime 等独立子状态。

```text
Controller 方法 / DOM 输入
            |
            v
StateKernel action 写入源状态
            |
            v
computed ReadonlySignal 推导快照
            |
            +-------------------+
            v                   v
框架适配器              ChartRenderer / Scene
```

这条边界是架构约束：

- Controller 的公开状态均为 `ReadonlySignal<T>`：用 `signal()` 读取、`signal.peek()` 非追踪读取、`signal.subscribe()` 监听变化。
- 只有 kernel action 持有可写 signal。公开 Controller 状态无法调用 `.set()`。
- viewport、visible range、effective theme、pane layout、interaction snapshot 等派生值自动计算。
- 关联写入通过 batch 原子提交，消费者不会观察到中间业务状态。
- DOM 监听和绘制属于状态推导层之外的副作用。

响应式原语可从包根入口或 `@363045841yyt/klinechart-core/reactivity` 引入：

```typescript
import {
  batch,
  computed,
  createSignal,
  effect,
  type ReadonlySignal,
} from '@363045841yyt/klinechart-core/reactivity'

const count = createSignal(0)
const doubled: ReadonlySignal<number> = computed(() => count() * 2)

const stop = effect(() => {
  console.log(doubled())
})

batch(() => count.set(1))
stop()
```

自定义框架适配器或独立扩展可直接使用这些原语。应用层控制图表时，应调用 `ChartController` 方法，而不是进入引擎内部状态。

## Controller API

从专用子路径引入 Controller 契约：

```typescript
import {
  createChartController,
  type ChartController,
  type ChartMountOptions,
  type KLineData,
  type SymbolSpec,
} from '@363045841yyt/klinechart-core/controllers'
```

### 挂载选项

`ChartMountOptions` 接收宿主 `container`，以及可选的初始数据或 symbols。它还支持初始缩放、light 或 dark 主题偏好、图表 settings、市场交易时段、布局尺寸和框架宿主预先创建的 DOM layer。

数据已就绪时使用 `data`。通过已注册行情 Provider 拉取数据时使用 `symbols`。数据完全由应用持有时，使用 `applyCustomData()` 原子写入完整数据包并绕过拉取链路。

### 只读状态

`ChartController` 暴露以下 `ReadonlySignal`：

| 分组 | Signals |
| --- | --- |
| 视口与数据 | `viewport`, `data`, `dataLoading`, `dataError`, `symbols`, `symbolCatalog` |
| 外观与运行时 | `theme`, `settings`, `rendererRuntime` |
| 图表模型 | `chartMode`, `lastBarPeriod`, `paneRatios`, `paneLayout` |
| 指标与绘图 | `indicators`, `subPanes`, `drawingTool`, `drawings`, `selectedDrawingId`, `legendTemplateContext` |
| 交互与对比 | `interactionState`, `comparisonColors`, `comparisonLoading` |

`theme` 是生效后的 `light` 或 `dark` 主题。它由用户偏好 `settings.theme` 推导；偏好为 `auto` 时，使用 `setSystemTheme()` 注入的系统主题。

### 数据与模式

```typescript
chart.setData(nextBars)
chart.appendData(laterBars)
chart.updateData(revisedBars)

chart.setSymbols([
  { symbol: '000001', market: 'CN', period: 'daily', source: 'baostock' },
])

chart.addComparisonSymbol({ symbol: '000002', market: 'CN', period: 'daily' })
chart.removeComparisonSymbol('000002')
chart.switchToTimeShareForDate(20240102)
```

拉取型数据请通过 market-data API 注册 Provider 和品种。`setCurrentSymbol()` 与 `setCurrentPeriod()` 只更新当前选择，不触发拉取；`resetToFetcher()` 可将 custom data 图表切回 Provider 拉取链路。

### 视口、主题与输入

```typescript
chart.zoomToLevel(5)
chart.zoomIn()
chart.zoomOut()
chart.scrollToRight()

chart.setTheme('dark')
chart.setSystemTheme('dark')

host.addEventListener('wheel', (event) => chart.handleWheelEvent(event))
host.addEventListener('scroll', () => chart.handleScrollEvent())
host.addEventListener('pointermove', (event) => chart.handlePointerEvent(event))
```

Core 创建默认 DOM scaffold 时会在挂载期间安装交互绑定。由框架宿主管理事件时，可通过 Controller 转发 pointer、wheel、scroll 和 pinch 事件。

### 指标、面板与绘图

```typescript
const id = chart.addIndicator('MACD', 'sub', { fast: 12, slow: 26, signal: 9 })
if (id) chart.updateIndicatorParams(id, { fast: 10, slow: 20, signal: 7 })

chart.createSubPane('rsi-pane', 'RSI', { period1: 6, period2: 12, period3: 24 })
chart.resizeSubPane('rsi-pane', 24)

chart.setDrawingTool('trend-line')
chart.clearDrawings()
```

使用 `catalog` 构建指标选择器。Controller 还提供 marker 更新、受控 pane layout、绘图选择、工具会话注册，以及窄范围布局和数据查询能力。完整稳定 facade 以导出的 `ChartController` 类型为准。

## 渲染架构

渲染与框架响应式解耦，并与交互、指标调度读取同一份 Kernel 推导出的 viewport 和 visible range。

```text
Chart
  -> StateKernel + ChartViewportManager
  -> ChartRenderer + FrameTransaction
  -> Scene / Layer
  -> RendererHost
  -> WebGPU、WebGL 或 Canvas2D fallback
```

- `ChartViewportManager` 负责 `ResizeObserver` 和 scroll DOM 事件；Kernel 推导 effective DPR、viewport、visible range 和 K 线间距。
- `FrameTransaction` 合并高频绘制请求，并在任何 Layer paint 前封存帧几何。
- `Scene` 按 pane、role、visibility 和 z-index 调度 Layer。Main 与 Overlay 更新分离，十字线移动不会重画静态内容。
- `RendererHost` 负责后端生命周期、resize、切换和降级。GPU batch 未输出时，Layer 必须完成 Canvas2D fallback。
- 图表逻辑对外使用逻辑像素；Canvas buffer 与 GPU viewport 使用 Kernel 的有效 DPR 和物理像素。

运行时契约、扩展规则、后端行为和诊断方式见[渲染管线文档](../../docs/rendering-pipeline.md)。

## 其他公开 API

| 导入路径 | 用途 |
| --- | --- |
| `@363045841yyt/klinechart-core` | Reactivity、Controller 导出、错误与恢复提示、输入契约、Scene 与渲染契约、图表功能、组件数据模型、`VERSION` |
| `@363045841yyt/klinechart-core/controllers` | 推荐的应用层 ChartController、数据/Provider facade、指标目录、绘图控制器 |
| `@363045841yyt/klinechart-core/reactivity` | Signal 原语和 FrameTransaction 契约 |
| `@363045841yyt/klinechart-core/market-data` | 行情 Provider、registry、source 契约和 query 类型 |
| `@363045841yyt/klinechart-core/semantic` | 校验后的语义图表配置类型与纯函数 `toKLineChartProps()` |
| `@363045841yyt/klinechart-core/plugin` | 扩展用 PluginHost、事件和 plugin 契约 |
| `@363045841yyt/klinechart-core/config` | 图表 settings 定义和默认值 |
| `@363045841yyt/klinechart-core/version` | 包 `VERSION` |

`engine/*` 子路径供高级集成使用，暴露更低层的契约。应用代码优先使用 controller、market-data、semantic、plugin 和 reactivity 入口。

## 语义配置

语义模块将已校验的声明式配置转换为可交给图表宿主的 props。它不会创建图表，也不会修改 Controller。

```typescript
import {
  toKLineChartProps,
  type SemanticChartConfig,
} from '@363045841yyt/klinechart-core/semantic'

const config: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    market: 'CN',
    symbol: '000001',
    startDate: '2024-01-01',
    endDate: '2024-06-01',
    period: 'daily',
    adjust: 'qfq',
  },
  indicators: {
    main: [{ type: 'MA', enabled: true, params: { periods: [5, 10, 20] } }],
    sub: [{ type: 'MACD', enabled: true }],
  },
}

const { symbols, indicators, customMarkers } = toKLineChartProps(config)
```

将返回值交给框架绑定的 props，或按宿主情况调用对应的 Controller API。外部输入应先通过 `SemanticConfigValidator` 校验。

## 浏览器要求

Core 需要具备 DOM、`ResizeObserver`、Canvas 2D 与现代 ECMAScript 支持的浏览器环境。它会选择可用渲染后端，并在 GPU 能力不可用时安全降级：

```text
WebGPU preference: WebGPU -> WebGL -> Canvas2D
WebGL preference:  WebGL -> Canvas2D
Canvas preference: Canvas2D
```

默认同步 Host 尝试 WebGL，失败时使用 Canvas2D。WebGPU 通过 renderer settings 选择，并可在 device lost 后运行时降级。

## 相关包

- `@363045841yyt/klinechart` - Vue 3 bindings
- `@363045841yyt/klinechart-react` - React bindings
- `@363045841yyt/klinechart-angular` - Angular bindings

{{include:_license.md}}
