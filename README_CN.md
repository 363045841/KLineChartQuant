高性能金融图表基础设施，单帧生成时间仅需 2 ms，200 hz 环境下稳定滚动 190-200 fps，原生 AI-Native 图表架构，全链路 ResizeObserver 驱动清晰渲染，QuickJS 指标运行环境，支持自研 KCQ 金融分析 API 运行脚本实现指标渲染。


<div align="center">

[English](README.md) | 简体中文

# 📈 KLineChartQuant

**渲染清晰 · 高性能 · 交互优化 · 移动端友好**

[![npm version](https://img.shields.io/npm/v/@363045841yyt/klinechart.svg?style=flat&color=blue)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![npm downloads](https://img.shields.io/npm/dm/@363045841yyt/klinechart.svg?style=flat&color=green)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![license](https://img.shields.io/npm/l/@363045841yyt/klinechart.svg?style=flat&color=orange)](https://github.com/363045841/klinechart/blob/main/LICENSE) [![demo](https://img.shields.io/badge/Demo-在线体验-purple?style=flat)](https://363045841.github.io/KLineChartQuant/)

[![qq](https://img.shields.io/badge/QQ-672011965-blue?style=flat)](https://qm.qq.com/q/672011965) [![tg](https://img.shields.io/badge/Telegram-加入群组-26A5E4?style=flat&logo=telegram)](https://t.me/+1o-6B-wVRTU2MjQ9)

</div>

---


轻量级金融 K 线图表库，专注量化交易场景。**Agent 是一等公民** — 支持 AI Agent 直接控制图表操作，提供 TradingView 级别的交互体验。

![](https://files.seeusercontent.com/2026/10/12/4wyG/2026-10-12-15_32_30-000001.png)


## 🤖 Agent 原生架构

KLineChartQuant 将 Agent 视为图表的一等公民，与用户等权。它不是附着的对话层，而是与 UI 共用同一套原语操作图表，操作端点由图表核心主动对外暴露。

- **Agent 即用户，用户即 Agent**：Agent 不是图表的外来访客，而是与屏幕前的人同权的操作者。用户在 UI 上能做的一切，Agent 都能通过相同入口完成，反之亦然。等权是架构前提，不是可开关的功能。

- **Agent 服务图表，而非输出文字流**：内嵌 Agent 的意义在于操作用户眼前的图表，而不是用大段文字淹没用户。它的输出落在用户所见界面上——指标、绘图、视口变化——对话只是手段，图表与真实交互始终是主体。

- **AI-Native 原生架构，而非寄生层**：工具以切面方式织入图表 API 原语，而非包成独立一层，因此一份逻辑、状态天然一致、调用零开销。Zed 是原生范本：Agent 构建在编辑器自身地基（GPUI）之上；VS Code 是寄生反例：Copilot 与 Claude Code 经扩展层接入，Claude 扩展本质是外部 CLI 的 GUI 包装。前者让 Agent 原生，后者让 Agent 寄生。

- **Agent 反向推动架构稳定与高效**：引入 Agent 不增加架构负担，反而倒逼架构更好。因为每种能力都必须由统一 API 与统一原语暴露，状态必须内收为 SSOT 并保持绝对一致，状态散落、副本转态、多处写入、并行链路与竞态都无法存续。Agent 与用户走同一条链路，这份约束最终沉淀为更稳定、可测试的图表核心。

- **不盲目使用 MCP**：项目经历三个阶段——早期 JSON 配置式、随后 MCP、最终走向 AI-Native 原生架构。MCP 需要中间层或 DSL，浪费 token、丢失信息，且桥接层自身维护状态副本、侵入前端逻辑。现方案取消桥接：工具直接注册在图表核心上，一次调用即进内核。

- **响应式内核是 Agent 的地基**：StateKernel 是唯一真源——只有 action 能写，computed 自动链式推导，外部只拿 readonly signal，并配合 batch 原子快照与深拷贝冻结。内核零依赖、极致轻量、渲染时机可控，这让 Agent 能以近零开销共享用户的准确状态，也让工具成为 Action 的子集，而非另一套并行系统。


## ✨ 核心特性

- **Agent 原生** - 图表核心以 `@Tool` 装饰的领域原语对外暴露能力，Agent 与 UI 调用同一套原语。工具是 Action 的子集：共享同一状态、同一条执行链路，无桥接层
- **脚本指标** - 用 TypeScript 直接编写指标。QuickJS 沙箱执行并带时间与内存预算，内置带补全与悬浮签名的编辑器，Plot 走既有渲染链路
- **渲染清晰** - 全链路 ResizeObserver 驱动，物理像素对齐，各 DPR 屏幕下 K 线、影线、线条均锐利清晰
- **插件架构** - 渲染器插件化设计，支持动态注册、配置和生命周期管理
- **高性能** - 流畅处理万级数据点，无卡顿缩放平移；**200Hz 屏幕下支持 190-200fps**，单帧生成时间低至 **2ms**
- **多后端渲染** - 统一绘制原语一次提交，支持 **WebGPU**、**WebGL**、**Canvas2D** 三种后端。WebGPU 提供混合 DOM Canvas（无 `compositeTo` 拷贝）、单命令缓冲每帧提交、原生 4x MSAA、基于 ResourceTable 的实例几何缓存。自动降级链路：WebGPU → WebGL → Canvas2D。**200Hz 屏幕下可达 190fps**，每帧 GPU 耗时 **<1ms**
- **交互优化** - 缩放锚点稳定、十字光标精准、拖拽流畅
- **移动端交互优化** - 长按十字线浏览数据不触发滚动，拖拽移动十字线，轻点取消，再次触摸手势滚动
- **商品比较** - 支持无限数量商品走势比较
- **多数据源** - 支持多数据源聚合并可自由扩展
- **批量数据导出** - 选择时间范围后，批量输入多个股票代码，一键导出合并 CSV 文件，支持进度提示
- **自定义 Tooltip** - 通过 `#kline-tooltip` 命名插槽完全自定义 tooltip，引擎提供悬停数据、位置和样式


## 📐 系统架构

KLineChartQuant 是一个 pnpm monorepo。核心引擎不依赖任何 UI 框架，通过统一的
`ChartController`（只读信号 + 命令方法）对外暴露能力；Vue / React / Angular 绑定层只负责
挂载、事件转发与响应式桥接。AI Agent 通过与 UI 相同的 `@Tool` 原语直接驱动图表，
共享同一状态源，而非桥接层。

```mermaid
flowchart TB
    subgraph app["UI 层 / 框架绑定"]
        UI["UI 层"]
        VuePkg["@363045841yyt/klinechart<br/>Vue 3 组件 + useChart"]
        ReactPkg["@363045841yyt/klinechart-react<br/>KLineChart（直连 Core）· KLineChartWC（Vue Web Component）"]
        AngularPkg["@363045841yyt/klinechart-angular"]
        Agent["AI Agent"]
        AgentRt["@363045841yyt/klinechart-agent-runtime"]
    end

    subgraph core["核心引擎 @363045841yyt/klinechart-core"]
        Ctl["ChartController<br/>只读信号 + 命令方法"]
        Chart["Chart 门面"]
        Kernel["StateKernel<br/>Reactive SSOT"]
        Data["数据层<br/>SeriesRepository · Buffer · 调度"]
        Pipe["渲染管线<br/>FrameTransaction · Scene/Layer"]
        GPU["WebGPU / WebGL2 / Canvas2D"]
        Plugin["插件子系统<br/>PluginHost · RendererPlugin"]
        Biz["指标 · 标记 · 画图<br/>分时 · 比较 · 组件"]
    end

    subgraph conn["行情后端（仓库外平级目录）"]
        Go["GoTDX-Connector<br/>gotdx :8080"]
        Bn["Binance-Connector<br/>Binance 现货 K 线 / 逐笔成交 :8091"]
        Bs["Baostock-Tradingview-Connector<br/>BaoStock / TradingView :8000"]
        Mt["KCQ-MT5-connector<br/>MT5（Exness）:8090"]
        Th["KCQ-THS-connector<br/>同花顺日线 :8092"]
    end

    UI --> VuePkg
    UI --> ReactPkg
    UI --> AngularPkg
    VuePkg -->|"Web Component 接入"| ReactPkg
    Agent --> AgentRt
    VuePkg --> Ctl
    ReactPkg --> Ctl
    AngularPkg --> Ctl
    AgentRt -->|"@Tool 原语（与 UI 同路径）"| Ctl
    Ctl --> Chart
    Chart --> Kernel
    Chart --> Data
    Chart --> Pipe
    Chart --> Plugin
    Plugin --> Biz
    Biz --> Pipe
    Pipe --> GPU
    Go -->|行情数据| Data
    Bn -->|行情数据| Data
    Bs -->|行情数据| Data
    Mt -->|"行情数据 + SSE"| Data
    Th -->|"行情数据（日线）"| Data
    Kernel --> Data
    Kernel --> Pipe
```

- **核心引擎** — 无头图表引擎 + `ChartController`，不依赖任何 UI 框架。
- **StateKernel** — 状态单一事实源：只读信号读、action 写、`computed()` 派生、
  `effect()` 副作用。
- **渲染** — 图元一次提交，WebGPU / WebGL2 / Canvas2D 三后端渲染，自动降级
  （WebGPU → WebGL → Canvas2D）。
- **数据层** — 统一 `SeriesRepository` + 增量缓冲 + 拉取调度；多数据源聚合
  （gotdx / BaoStock / TradingView / MT5 / 同花顺 THS / mock）与 Binance 现货 K 线 / 逐笔成交。
- **插件子系统** — PluginHost / HookSystem / EventBus / RendererPluginManager；
  指标、标记、画图以 Scene Layer 形式接入。
- **React 绑定** — `@363045841yyt/klinechart-react` 的 `KLineChart` 直接挂载 Core（仅客户端加载，
  不含 Vue 运行时）；`KLineChartWC` 渲染由 Vue 包打包、带完整 UI 的 `<kline-chart>` 自定义元素
  （`@363045841yyt/klinechart/web-component`）。
- **Agent 原生** — `@363045841yyt/klinechart-agent-runtime` 编排 Agent，直接调用核心
  `@Tool` 注册的原语——与 UI 使用同一入口。

完整架构文档见 [docs/architecture/architecture.md](docs/architecture/architecture.md)。


## 📜 脚本指标

指标不必提前编译，可以直接用 TypeScript 编写。一份脚本就是一个文件，通过 `defineIndicator` 声明单个指标；引擎只编译一次，随后逐 bar 执行并收集 Plot 点。脚本与数据源、渲染后端无关——宿主提供 K 线，图表适配层负责绘制结果。

```js
defineIndicator({
  name: '成交量潮汐',
  position: Position.Sub,
  onBar() {
    const RED = '#F08080'
    const RED_LIGHT = 'rgba(240, 128, 128, 0.5)'
    const RED_LIGHTER = 'rgba(240, 128, 128, 0.15)'
    const GREEN = '#008000'
    const GREEN_LIGHT = 'rgba(0, 128, 0, 0.5)'
    const GREEN_LIGHTER = 'rgba(0, 128, 0, 0.1)'
    const GRAY_LIGHTER = 'rgba(128, 128, 128, 0.15)'

    const barUp = ta.rising(close, 1)
    const barDn = ta.falling(close, 1)
    const volumeChange = ta.change(volume)

    const volumeColor = barUp
      ? RED_LIGHTER
      : barDn ? GREEN_LIGHTER : GRAY_LIGHTER

    plot.Columns(volume, 'Volume columns', {
      color: volumeColor,
    })

    const volumeChangeColor = barUp
      ? (volumeChange > 0 ? RED : RED_LIGHT)
      : barDn
        ? (volumeChange > 0 ? GREEN : GREEN_LIGHT)
        : Color.Gray

    plot.Histogram(volumeChange, 'Volume change columns', {
      color: volumeChangeColor,
      size: 12,
    })

    plot.Line(0, 'Zero line', {
      color: Color.Gray,
    })
  },
})
```

脚本运行前，宿主会注入所需的全部全局变量：

| 全局 | 含义 |
| --- | --- |
| `open` `high` `low` `close` `volume` `time` | 行情序列；`close` 取当前 K 线，`close[1]` 取前一根 |
| `input.int` `input.float` `input.bool` `input.string` | 在 `onBar` 顶层声明参数，变量本身就是用户设置的值 |
| `plot.Line` `plot.LineBR` `plot.StepLine` `plot.StepLineBR` `plot.Columns` `plot.Histogram` `plot.Point` `plot.Shape` `plot.Char` `plot.Arrow` | 输出绘图点，方法名决定图形；每个方法返回可被 `fill` 引用的句柄 |
| `plot.Candle` `plot.Bar` | 接收 OHLC 四个价格，输出蜡烛或美国线；蜡烛支持独立实体、影线、边框色，返回 `void` |
| `fill(from, to, color, title, options?)` | 填充两个 Plot 之间的区域；`from` / `to` 是 `plot.*` 返回的句柄 |
| `ta` | 内置技术分析函数库 |
| `Position` | `Position.Main` 主图或 `Position.Sub` 副图 |
| `Color` | Material 400 常用色，也可直接写任意 CSS 颜色字符串 |
| `defineIndicator` / `defineLibrary` / `importLibrary` | 声明指标、声明库、使用库 |

`plot.Line` 跨过 `null` 或 `NaN` 空值连接前后有效点，对应 Pine 的 `plot.style_line`；`plot.LineBR` 在空值处断开，对应 `plot.style_linebr`。两者支持相同的颜色、尺寸、虚线和偏移选项，都返回可供 `fill` 引用的句柄。已有脚本若依赖空值断线，应改用 `plot.LineBR`。

`plot.StepLine` 绘制阶梯线，在相邻有效点的水平中点垂直跳变，并跨空值连接；`plot.StepLineBR` 在空值处断开。两者分别对应 Pine 的 `plot.style_stepline` 和 `plot.style_steplinebr`，复用折线选项，返回可供 `fill` 引用的句柄。

趋势计算由 `ta` 提供：`ta.atr(length)` 返回 Wilder ATR；`ta.supertrend(multiplier, atrPeriod)` 返回 `[趋势线, 方向]` 两个序列，方向 `-1` 为上涨、`1` 为下跌，预热期间两者均为 `NaN`。Supertrend 保留旧 core 指标的上涨初始方向，内置 `SuperTrend` 脚本通过两条 `plot.LineBR` 绘制计算结果。

`ta.macd(source, fastLength, slowLength, signalLength)` 返回 `[DIF, DEA, DIF-DEA]` 三个序列，沿用旧 MACD 的首值 EMA 初始化，通用 `ta.ema` 的完整窗口初始化保持不变。内置 `MACD` 默认参数为 12/26/9，柱体翻倍，并按正负、增减绘制四色；从首个有效输入逐根输出，迁移脚本支持 K 线视图。

参数就是普通的 `const` 声明，变量名即参数身份——不需要 `inputs`，也没有 `params` 对象：

```js
onBar() {
  const period = input.int(20, { title: '周期', min: 1 })
  const type = input.string('SMA', { options: ['SMA', 'EMA'] })
  plot.Line(type === 'SMA' ? ta.sma(close, period) : ta.ema(close, period), 'ma')
}
```

内置 `ta` 库提供 `sma`、`ema`、`wma`、`vwma`、`rsi`、`highest`、`lowest`、`crossover`、`crossunder`、`rising`、`falling` 与 `change`。用户库使用同一套 `defineLibrary` 调用，进入同一个全局命名空间。

- **沙箱执行** — 脚本在内嵌 QuickJS 运行时中执行，每次运行都有时间和内存预算，跑飞的脚本会失败退出而不是拖垮宿主
- **不接触未来数据** — 历史不足时序列返回 `NaN`，脚本永远无法读取未来
- **真实编辑器** — 图表内置基于 CodeMirror 的脚本编辑器，补全、悬浮签名与参数提示均来自编译器所用的同一份声明
- **同一渲染链路** — Plot 走引擎既有的绘图、坐标轴与图例通道，脚本指标与内置指标行为一致

通过脚本服务注册脚本，注册后即作为普通条目出现在指标选择器中：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService()
await scripts.create(source)
```

完整声明参考见[脚本文档](packages/script/docs/indicator.md)，另有[函数库](packages/script/docs/library.md)与 [Plot API](packages/script/docs/indicator.md#plot)。


## ⚡ 性能

本项目可将渲染原语直接提交到 Canvas2D、WebGL2 或 WebGPU。以下数据来自 [`bench/`](bench/README.md) 的可复现基准（`node bench/run.mjs`），采样日期为 2026-10-03，GPU 后端已启用线条解析 AA。配置：1180 × 640 视口、DPR 2、4× MSAA，每个场景预热 120 帧、采集 600 帧。硬件：NVIDIA GeForce RTX 4060 Laptop GPU，驱动 616.92，无头 Chrome 154.0.8037.93，强制使用独显。观测帧率受校准后的 200 Hz 刷新率上限约束。

**测量范围**：固定几何在预热阶段构建一次，随后从缓存重放。「帧准备 P50」测量缓存查找与几何读取；`0.000 ms` 是保留三位小数后的结果，不代表没有计算，也不代表重新计算指标的成本。「CPU 提交」测量同步后端处理和 API 提交，不代表 GPU 已完成；GPU 时间由独立计时查询测量，Canvas2D 无页面级 GPU 计时接口。本基准不覆盖滚动、缩放或行情更新时的持续几何重建，与此前逐帧重建几何的 README 数据不能直接比较。

### WebGPU 命令提交

7 个命令缓冲通过一次 `queue.submit` 集中提交与 7 次拆分提交对比；预热 50 个样本、采集 400 个样本，每个样本重复 100 次：

| 提交方式 | P50 (ms) |
| --- | --- |
| 一次 `queue.submit`（合并） | 0.003 |
| 七次 `queue.submit`（拆分） | 0.025 |
| 加速比 | **8.33×** |

### MA5 / MA20 / MA60（简单指标）

| 可见 K 线 | 后端 | 帧准备 P50 (ms) | CPU 提交 P50 (ms) | GPU P50 (ms) | 帧率 | 1% Low | 帧间隔 P99 (ms) | 严重卡顿率 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.000 | 0.700 | N/A | 98.3 | 52.4 | 19.10 | 48.33% |
| 1,000 | WebGL2 | 0.000 | 0.500 | 0.127 | 199.3 | 163.9 | 6.10 | 0.00% |
| 1,000 | WebGPU | 0.000 | 0.300 | 0.036 | 200.0 | 192.3 | 5.20 | 0.00% |
| 5,000 | Canvas2D | 0.000 | 1.100 | N/A | 104.7 | 66.2 | 15.10 | 28.33% |
| 5,000 | WebGL2 | 0.000 | 1.800 | 0.212 | 199.3 | 192.3 | 5.20 | 0.00% |
| 5,000 | WebGPU | 0.000 | 0.500 | 0.050 | 200.0 | 192.3 | 5.20 | 0.00% |
| 10,000 | Canvas2D | 0.000 | 5.600 | N/A | 38.8 | 22.2 | 45.00 | 99.00% |
| 10,000 | WebGL2 | 0.000 | 2.800 | 0.712 | 199.0 | 192.3 | 5.20 | 0.17% |
| 10,000 | WebGPU | 0.000 | 1.200 | 0.022 | 199.0 | 181.7 | 5.50 | 0.17% |

### Ichimoku（复杂渲染工况）

| 可见 K 线 | 后端 | 帧准备 P50 (ms) | CPU 提交 P50 (ms) | GPU P50 (ms) | 帧率 | 1% Low | 帧间隔 P99 (ms) | 严重卡顿率 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.000 | 0.800 | N/A | 68.5 | 33.9 | 29.50 | 60.00% |
| 1,000 | WebGL2 | 0.000 | 1.000 | 0.116 | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGPU | 0.000 | 0.900 | 0.053 | 199.3 | 169.4 | 5.90 | 0.17% |
| 5,000 | Canvas2D | 0.000 | 5.150 | N/A | 25.8 | 15.5 | 64.60 | 100.00% |
| 5,000 | WebGL2 | 0.000 | 2.500 | 0.302 | 195.1 | 100.0 | 10.00 | 0.83% |
| 5,000 | WebGPU | 0.000 | 1.400 | 0.129 | 198.0 | 146.7 | 6.82 | 0.33% |
| 10,000 | Canvas2D | 0.000 | 7.000 | N/A | 28.6 | 15.4 | 64.90 | 100.00% |
| 10,000 | WebGL2 | 0.000 | 3.700 | 0.534 | 184.9 | 97.0 | 10.31 | 3.00% |
| 10,000 | WebGPU | 0.000 | 1.800 | 0.134 | 198.0 | 160.4 | 6.24 | 0.50% |

1% Low 为帧间隔 P99 的倒数；严重卡顿率为帧间隔超过两倍校准刷新间隔（此处 10 ms）的比例。表格取自一次完整复测，未挑选各场景的最佳值。浏览器调度和系统负载会导致轮次波动；这些数据不能证明解析 AA 提升 GPU 性能，也不能保证所有场景没有性能回退。来源：`bench/results/render-bench-analytic-aa-confirmation.json` 与 `.csv`（本地生成产物）。


## 📡 数据源

KLineChart 需要行情数据后端支持。支持的数据源如下：

| 数据源 | 说明 | 文档 |
|---|---|---|
| `gotdx` | 通达信（GOTDX）行情：A 股 / 期货 / MAC，由 `GoTDX-Connector` 提供 | [GoTDX-Connector](docs/data-sources/klinechartquantgo.zh-CN.md) |
| `binance` | Binance 现货 K 线与真实逐笔成交（足迹图 / 订单流），由 `Binance-Connector` 提供 | [Binance-Connector](https://github.com/363045841/Binance-Connector) |
| `baostock` | BaoStock A 股日 / 周 / 月及分钟 K 线，由 `Baostock-Tradingview-Connector` 提供 | [BaoStock](docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView 全球品种，由 `Baostock-Tradingview-Connector` 提供 | [BaoStock](docs/data-sources/baostock.zh-CN.md) |
| `mt5` | MT5（Exness）本地终端：外汇 / 金属 / 加密 CFD，由 `KCQ-MT5-connector` 提供 | [MT5](docs/data-sources/mt5.zh-CN.md) |
| `ths` | 同花顺（A 股 / 指数 / ETF / 期货 / 期权）**日线**，由 `KCQ-THS-connector` 提供 | [同花顺 THS](docs/data-sources/ths.zh-CN.md) |
| `mock` | 调试用：本地生成 MOCK-100 / MOCK-10000 K 线，无需后端，探测恒为在线 | — |

后端仓库与本仓库同级（不在 monorepo 内）。

### 一条命令启动开发环境

先安装数据源后端：

```bash
pnpm setup:backends
```

再 `pnpm dev` 带 `-c` 参数即可同时启动前端与选定的数据源后端：

```bash
pnpm dev                      # 仅前端（Vite 开发服务器）
pnpm dev -c all               # 前端 + 全部后端（gotdx + binance + baostock，不含 mt5 / ths）
pnpm dev -c gotdx baostock    # 前端 + 指定的后端
pnpm dev -c mt5               # 前端 + MT5 本地终端（Windows + 已登录 MT5 (Exness) 终端）
pnpm dev -c ths               # 前端 + 同花顺日线（需 THS_API_KEY 或 config.json 的 ths.api_key）
pnpm dev -c tdx               # 支持别名（tdx / g / b / bnb / m / t / all）
pnpm dev -c all --lan         # 同上，前端绑定 0.0.0.0（局域网可访问）
```

常用简写命令：

```bash
pnpm dev:all                  # 前端 + 全部后端
pnpm dev:g                    # 前端 + gotdx 通达信
pnpm dev:b                    # 前端 + BaoStock / TradingView
pnpm dev:bnb                  # 前端 + Binance 现货行情
pnpm dev:mt5                  # 前端 + MT5 本地终端
pnpm dev:ths                  # 前端 + 同花顺日线
pnpm dev:lan:all              # 前端（0.0.0.0）+ 全部后端
```

并行进程的日志集中在同一终端，并用彩色来源前缀区分：`[vite]`、`[gotdx]`、`[binance]`、`[baostock]`、`[mt5]`、`[ths]`。

Windows PowerShell 下如果要求 Ctrl+C 后先输出完关闭日志、最后才显示新提示符，请直接运行 `node scripts/dev.mjs -c gotdx`（其他 `-c` 参数同上）。`pnpm dev` 会额外启动一个 pnpm 进程，它自己也会收到 Ctrl+C，无法由子脚本控制它何时输出 `[ELIFECYCLE]`。

仅启动后端（不带前端）：

```bash
pnpm connector                # 全部后端（不含 mt5 / ths）
pnpm connector gotdx          # gotdx 通达信（:8080）
pnpm connector binance        # Binance 现货 K 线 / 逐笔成交（:8091）
pnpm connector baostock       # BaoStock / TradingView（:8000）
pnpm connector mt5            # MT5 本地终端（:8090，Windows + 已登录 MT5 (Exness) 终端）
pnpm connector ths            # 同花顺日线（:8092，需 THS_API_KEY 或 config.json 的 ths.api_key）
```

仅启动后端且需要相同的退出顺序时，运行 `node scripts/start-connector.mjs gotdx`。

执行 `pnpm setup:backends` 后无需任何额外配置。开发服务器代理 `/api/stock` → `:8000`（Baostock-Tradingview-Connector）、`/api/public` → `:8080`（GoTDX-Connector）。


## 🚀 快速开始

### 3. 安装并使用

```bash
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

**使用组件：**

```vue
<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart v-model:theme="currentTheme" :custom-data="customData" :settings="chartSettings" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import type { ChartSettings } from '@363045841yyt/klinechart-core'
  import { type CustomDataSource, KlineChart } from '@363045841yyt/klinechart'
  import demoData from './demo-data.json'

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>(demoData as CustomDataSource)

  const chartSettings: ChartSettings = {
    showGridLines: true,
    isAsiaMarket: true,
    mainLeftAxisDisplaySetting: 'none',
    theme: 'dark',
    colorPresetSettings: {
      dark: {
        candleUpBody: '#e85d04',
        candleDownBody: '#1b4332',
        crosshairLine: '#faa307',
        gridMajor: '#3e2723',
      },
    },
  }
</script>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 80vh;
  }

  .app-container[data-theme='dark'] {
    background: #000;
    color: #e5e7eb;
  }
</style>
```

**Import CSS in main.ts：**

```typescript
import '@363045841yyt/klinechart/style.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

**插槽用法 — 自定义 Tooltip：**

```html
<KlineChart>
  <template #kline-tooltip="{ hoverData, upColor, downColor }">
    <div class="custom-tooltip">
      <div class="custom-tooltip__title">
        <span>{{ hoverData.stockCode }}</span>
        <span>{{ formatTimestamp(hoverData.timestamp, { timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div
        class="custom-tooltip__price"
        :style="{ color: hoverData.close >= hoverData.open ? upColor : downColor }"
      >
        {{ hoverData.close.toFixed(2) }}
      </div>
      <div class="custom-tooltip__detail">
        O: {{ hoverData.open.toFixed(2) }}<br />
        H: {{ hoverData.high.toFixed(2) }}<br />
        L: {{ hoverData.low.toFixed(2) }}<br />
        C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>
```

**插槽用法 — 自定义主图左上角图例：**

提供 `#legend` 时完全替换 Canvas 默认图例；作用域为完整 `LegendTemplateContext`（OHLC、分时、主图指标、对比品种、布局与颜色）。

```vue
<template #legend="{ index, currentBar, timeshare, indicators, comparisons, colors }">
  <div class="my-legend">
    <!-- PR #98 为 KLineData[] 添加的自定义字段会展开通过 currentBar 暴露 -->
    <div v-if="currentBar" class="my-legend__row">
      <span :style="{ color: currentBar.color }">
        开盘 {{ currentBar.open.toFixed(2) }} 最高 {{ currentBar.high.toFixed(2) }} 最低
        {{ currentBar.low.toFixed(2) }} 收盘 {{ currentBar.close.toFixed(2) }}
      </span>
      <span v-if="currentBar.volumeText"> Vol {{ currentBar.volumeText }}</span>
    </div>

    <div v-if="timeshare" class="my-legend__row">
      <span :style="{ color: timeshare.changeColor }">
        现价 {{ timeshare.price.toFixed(2) }} 涨幅 {{ timeshare.changePercent.toFixed(2) }}%
      </span>
    </div>

    <!-- 使用主图指标图例数据 -->
    <div v-for="indicator in indicators" :key="indicator.name" class="my-legend__row">
      <span>{{ indicator.name }}:</span>
      <template v-for="value in indicator.values" :key="value.label">
        <span :style="{ color: value.color }">
          {{ value.label }} {{ value.value.toFixed(3) }}
        </span>
      </template>
    </div>
    <!-- 使用比较商品数据 -->
    <div
      v-for="comparison in comparisons"
      :key="comparison.symbol"
      class="my-legend__row"
      :style="{ color: comparison.percentColor }"
    >
      {{ comparison.symbol }}
      {{ comparison.percent > 0 ? '+' : '' }}{{ comparison.percent.toFixed(2) }}%
    </div>
  </div>
</template>
```


### 4.（可选）启用 AI Agent 控制

图表核心以 `@Tool` 原语对外暴露领域能力，UI 与 Agent 通过同一条路径调用：

```ts
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
```

`getRegisteredChartTools()` 返回每个工具的参数 schema、safety 等级与统一执行器。将它们交给 `@363045841yyt/klinechart-agent-runtime`，即可在应用内（浏览器或 Electron）基于 Provider profile 编排 Agent——无 MCP 桥接，无旁路状态副本。详见 [agent-runtime](packages/agent-runtime/README.md)。


## 📖 更多文档

- [渲染链路](docs/rendering/rendering-pipeline.md) - 当前绘制路径：FrameTransaction、Scene/Layer、Renderer 后端
- [脚本指标](packages/script/docs/indicator.md) - 用 TypeScript 声明指标：输入参数、Plot API、函数库


## 📋 组件 Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| theme | `'light' \| 'dark'` | — | 图表主题。可用 `v-model:theme` 双向绑定 |
| isFullscreen | `boolean` | — | 全屏状态（受控）。不传则使用组件内部非受控模式 |
| timezone | `string` | `'Asia/Shanghai'` | 时区 |
| yPaddingPx | `number` | 20 | Y轴上下留白像素 |
| minKWidth | `number` | 1 | K线最小宽度（逻辑像素） |
| maxKWidth | `number` | 200 | K线最大宽度（逻辑像素） |
| rightAxisWidth | `number` | 0 | 右侧价格轴宽度 |
| leftAxisWidth | `number` | 0 | 左侧价格轴宽度（0=隐藏） |
| bottomAxisHeight | `number` | 24 | 底部时间轴高度 |
| priceLabelWidth | `number` | 60 | 价格标签额外宽度（用于显示涨跌幅） |
| zoomLevels | `number` | 80 | 缩放级别总数 |
| initialZoomLevel | `number` | 3 | 初始缩放级别（1 ~ zoomLevels） |
| customData | `CustomDataSource` | — | 内联数据包：`{ symbol?, period?, data, comparisons? }`。完全绕过数据请求器，直接使用传入的数据渲染 |
| teleportContainer | `string \| HTMLElement` | — | 下拉/弹窗的 Teleport 目标容器（CSS 选择器或元素）。默认渲染到内部 `.chart-wrapper` |


## 🗺️ Roadmap

- [x] v0.10：图表 AI 原生支持
- [x] K 线缩放锚点稳定，缩放手感提升
- [x] 右轴脱离滚动容器，彻底解决裁剪问题
- [x] 空白区域支持绘制
- [x] 限制垂直平移范围，防止视口脱离数据
- [x] 绘图系统
- [x] 右轴缩放
- [x] 最新价线与右轴标签样式优化
- [x] 面图元工具及渲染
- [x] 更多高级绘图工具
- [x] 支持分钟、多日、月、年 K 线显示
- [ ] 支持将绘制的图形转换为量化代码


## 📦 包列表

| 包名 | 说明 | npm |
|------|------|-----|
| `@363045841yyt/klinechart-core` | 无头图表引擎 + 控制器 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-core) |
| `@363045841yyt/klinechart` | Vue 3 绑定 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart) |
| `@363045841yyt/klinechart-react` | React 绑定 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-react) |
| `@363045841yyt/klinechart-angular` | Angular 绑定 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-angular) |
| `@363045841yyt/klinechart-agent-runtime` | 框架无关的 Agent 运行时（Pi 编排 + 宿主契约） | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-agent-runtime) |
| `@363045841yyt/klinechart-script` | 脚本指标引擎（QuickJS 运行时 + 语言服务） | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-script) |
| `@363045841yyt/klinechart-script-chart` | 将脚本指标注册为图表指标 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-script-chart) |
| `@363045841yyt/klinechart-plot-contracts` | 引擎与脚本运行时共用的 Plot 声明契约 | [npm](https://www.npmjs.com/package/@363045841yyt/klinechart-plot-contracts) |


## 🚀 What's New

- **v0.11** 引入 AI Agent 运行时（agent-runtime 与 AI runtime，支持 OpenAI 协议与浏览器内对话，Web/Electron 共享 Agent 工作区）及 @tool 注册基础设施与绘图 Agent 工具。绘图工具支持子图与分时绘制、workspace 隔离、多选批量编辑、空白区域锚点、单行内联文本编辑、框选成组拖拽与标签位置配置；同时新增五日分时、分时指标原生支持与持久化视图工作区，并完成 WebGL 可见画布直绘等性能优化。
- **v0.10** 以统一 MarketDataProvider 重构数据层，新增多日分时、图表与 Agent 共享的统一指标查询管线、Fibonacci/矩形/箭头标注工具，并将对比模式升格为独立图表模式。Vue/React/Angular 绑定对齐统一 Provider 契约，同时修复多项渲染与状态一致性问题。
- **v0.9.0** 自研 Core 层响应式模型迁移，时序问题消除
- **v0.9.0** 单路径 Scene 渲染器 + WebGPU 后端（混合 DOM Canvas，无 compositeTo）、FrameTransaction 响应式、设备丢失恢复、自动降级 WebGPU → WebGL → Canvas2D
- **v0.8** 支持商品比较，支持多数据源聚合
- **v0.7** 渲染器注册链路AOP重构，支持装饰器语法，拆分monorepo，支持vue、react（实验性），core单独发包，令牌化颜色系统
- **v0.6.10** 统一 WebGL 渲染上下文共享，重构副图生命周期管理 — 通过 SubPaneManager 集中管理副图实例，paneId 作为一等标识
- **v0.6.6** 综合渲染优化：价格转坐标批量化、刻度位置与几何数据缓存、月份键值计算优化；**200Hz 屏幕下稳定 190-200fps**，单帧生成时间降至 **2ms**
- **v0.6.3** K 线、成交量柱、MACD 柱支持 WebGL 渲染，大幅提升整体性能
- **v0.6.1** 双层 Canvas 架构：Main + Overlay 分层渲染，引入 UpdateLevel 选择性更新，**200Hz 显示器下稳定 180fps 低抖动**
- **v0.6.0** 重构指标计算管线：MA/BOLL/EXPMA/ENE/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK 统一采用 Calculator → Scheduler → StateStore → Renderer 无状态架构，提升性能与可维护性
- **v0.5.6** 对数价格轴支持，网格线在像素层面均匀分布
- **v0.5.2** 新增高级绘图工具：平行通道、回归趋势、平滑顶底、不相交通道
- **v0.5.0** 完整绘图工具系统，支持直线、矩形、文字绘制与样式编辑
- **v0.4** 现代化 UI，左侧工具栏、右轴优化、TradingView 式缩放手感


## 📄 License

[Apache-2.0](LICENSE)

