## 📐 系统架构

KLineChartQuant 是一个 pnpm monorepo。核心引擎不依赖任何 UI 框架，通过统一的
`ChartController`（只读信号 + 命令方法）对外暴露能力；Vue / React / Angular 绑定层只负责
挂载、事件转发与响应式桥接。AI Agent 通过 MCP（Model Context Protocol）经 WebSocket 桥接
直接驱动图表。

```mermaid
flowchart TB
    subgraph app["UI 层 / 框架绑定"]
        UI["UI 层"]
        VuePkg["@363045841yyt/klinechart<br/>Vue 3 组件 + useChart"]
        ReactPkg["@363045841yyt/klinechart-react<br/>KLineChartWC（Vue Web Component 封装）"]
        AngularPkg["@363045841yyt/klinechart-angular"]
        Agent["AI Agent / MCP 客户端"]
        AiRt["@363045841yyt/klinechart-ai-runtime"]
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
        Go["GoTDX-Connecter<br/>gotdx :8080"]
        Bn["GoTDX-Connecter<br/>币安深度 :8081"]
        Bs["Baostock-Tradingview-Connecter<br/>BaoStock / TradingView :8000"]
    end

    UI --> VuePkg
    UI --> ReactPkg
    UI --> AngularPkg
    VuePkg -->|"Web Component 接入"| ReactPkg
    Agent --> AiRt
    VuePkg --> Ctl
    ReactPkg --> Ctl
    AngularPkg --> Ctl
    AiRt -->|WebSocket / MCP| Ctl
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
    Kernel --> Data
    Kernel --> Pipe
```

- **核心引擎** — 无头图表引擎 + `ChartController`，不依赖任何 UI 框架。
- **StateKernel** — 状态单一事实源：只读信号读、action 写、`computed()` 派生、
  `effect()` 副作用。
- **渲染** — 图元一次提交，WebGPU / WebGL2 / Canvas2D 三后端渲染，自动降级
  （WebGPU → WebGL → Canvas2D）。
- **数据层** — 统一 `SeriesRepository` + 增量缓冲 + 拉取调度；多数据源聚合
  （gotdx / BaoStock / TradingView / mock）与币安深度。
- **插件子系统** — PluginHost / HookSystem / EventBus / RendererPluginManager；
  指标、标记、画图以 Scene Layer 形式接入。
- **React 经 Web Component 接入** — `@363045841yyt/klinechart-react` 的 `KLineChartWC` 渲染由
  Vue 包打包的 `<kline-chart>` 自定义元素（`@363045841yyt/klinechart/web-component`）。
- **MCP / Agent** — `@363045841yyt/klinechart-ai-runtime` 将 AI 工具调用经
  WebSocket 桥接到控制器。

完整架构文档见 [docs/architecture.md]({{root}}docs/architecture.md)。
