## 📐 System Architecture

KLineChartQuant is a pnpm monorepo that publishes one product package, `@363045841yyt/klinechart`.
The framework-agnostic core engine exposes a unified `ChartController` (readonly signals +
commands); the Vue layer handles mounting, event forwarding, and reactivity bridging. The AI Agent
drives the chart through the same `@Tool` primitives as the UI, sharing one state source instead of
a bridge. Everything below the Vue layer ships inside the product tarball.

```mermaid
flowchart TB
    subgraph app["Product @363045841yyt/klinechart"]
        UI["UI Layer"]
        VuePkg["Vue 3 components<br/>KlineWorkbench · useChart"]
        Agent["AI Agent"]
        AgentRt["Agent runtime"]
    end

    subgraph core["Core Engine"]
        Ctl["ChartController<br/>signals + commands"]
        Chart["Chart facade"]
        Kernel["StateKernel<br/>Reactive SSOT"]
        Data["Data Layer<br/>SeriesRepository · Buffers"]
        Pipe["Rendering Pipeline<br/>FrameTransaction · Scene/Layer"]
        GPU["WebGPU / WebGL2 / Canvas2D"]
        Plugin["Plugin Subsystem<br/>PluginHost · RendererPlugin"]
        Biz["Indicators · Drawing<br/>Timeshare · Compare · Components"]
    end

    subgraph conn["Market Data Backends"]
        Go["GoTDX-Connector<br/>gotdx :8080"]
        Bn["Binance-Connector<br/>Binance spot K-line / trades :8091"]
        Bs["Baostock-Tradingview-Connector<br/>BaoStock / TradingView :8000"]
        Mt["KCQ-MT5-connector<br/>MT5 (Exness) :8090"]
    end

    UI --> VuePkg
    Agent --> AgentRt
    VuePkg --> Ctl
    AgentRt -->|"@Tool primitives (same path as UI)"| Ctl
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
    Mt -->|"market data + SSE"| Data
    Kernel --> Data
    Kernel --> Pipe
```

- **Core engine** — headless chart engine + `ChartController`; depends on no UI framework.
- **StateKernel** — single source of truth: readonly signals for reads, actions for writes,
  `computed()` for derivation, `effect()` for DOM side effects.
- **Rendering** — submit primitives once, render via WebGPU / WebGL2 / Canvas2D with
  automatic fallback (WebGPU → WebGL → Canvas2D).
- **Data layer** — unified `SeriesRepository` + incremental buffers + fetch scheduler;
  multi-source aggregation (gotdx / BaoStock / TradingView / MT5 / mock) and Binance Spot K-lines and trades.
- **Plugin subsystem** — PluginHost / HookSystem / EventBus / RendererPluginManager;
  indicators and drawing tools plug in as Scene Layers.
- **Agent Native** — the bundled Agent runtime orchestrates the Agent, which invokes the core's
  `@Tool`-registered primitives—the same entry points the UI uses.

See [docs/architecture/architecture.md]({{root}}docs/architecture/architecture.md) for the full architecture document.
