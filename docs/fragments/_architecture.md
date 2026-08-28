## 📐 System Architecture

KLineChartQuant is a pnpm monorepo. The framework-agnostic core engine exposes a unified
`ChartController` (readonly signals + commands); Vue / React / Angular bindings only handle
mounting, event forwarding, and reactivity bridging. AI Agents drive the chart directly
through MCP over a WebSocket bridge.

```mermaid
flowchart TB
    subgraph app["UI Layer / Framework Bindings"]
        UI["UI Layer"]
        VuePkg["@363045841yyt/klinechart<br/>Vue 3 components · useChart"]
        ReactPkg["@363045841yyt/klinechart-react<br/>KLineChartWC (wraps Vue-built Web Component)"]
        AngularPkg["@363045841yyt/klinechart-angular"]
        Agent["AI Agent / MCP Client"]
        AiRt["@363045841yyt/klinechart-ai-runtime"]
    end

    subgraph core["Core Engine @363045841yyt/klinechart-core"]
        Ctl["ChartController<br/>signals + commands"]
        Chart["Chart facade"]
        Kernel["StateKernel<br/>Reactive SSOT"]
        Data["Data Layer<br/>SeriesRepository · Buffers"]
        Pipe["Rendering Pipeline<br/>FrameTransaction · Scene/Layer"]
        GPU["WebGPU / WebGL2 / Canvas2D"]
        Plugin["Plugin Subsystem<br/>PluginHost · RendererPlugin"]
        Biz["Indicators · Markers · Drawing<br/>Timeshare · Compare · Components"]
    end

    subgraph conn["Market Data Backends"]
        Go["GoTDX-Connecter<br/>gotdx :8080"]
        Bn["GoTDX-Connecter<br/>Binance depth :8081"]
        Bs["Baostock-Tradingview-Connecter<br/>BaoStock / TradingView :8000"]
    end

    UI --> VuePkg
    UI --> ReactPkg
    UI --> AngularPkg
    VuePkg -->|"Web Component"| ReactPkg
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
    Go -->|market data| Data
    Bn -->|market data| Data
    Bs -->|market data| Data
    Kernel --> Data
    Kernel --> Pipe
```

- **Core engine** — headless chart engine + `ChartController`; depends on no UI framework.
- **StateKernel** — single source of truth: readonly signals for reads, actions for writes,
  `computed()` for derivation, `effect()` for DOM side effects.
- **Rendering** — submit primitives once, render via WebGPU / WebGL2 / Canvas2D with
  automatic fallback (WebGPU → WebGL → Canvas2D).
- **Data layer** — unified `SeriesRepository` + incremental buffers + fetch scheduler;
  multi-source aggregation (gotdx / BaoStock / TradingView / mock) and Binance depth.
- **Plugin subsystem** — PluginHost / HookSystem / EventBus / RendererPluginManager;
  indicators, markers and drawing tools plug in as Scene Layers.
- **React via Web Component** — `@363045841yyt/klinechart-react`'s `KLineChartWC` renders the
  `<kline-chart>` Custom Element bundled from the Vue package (`@363045841yyt/klinechart/web-component`).
- **MCP / Agent** — `@363045841yyt/klinechart-ai-runtime` bridges AI tool calls to the
  controller over WebSocket.

See [docs/architecture.md]({{root}}docs/architecture.md) for the full architecture document.
