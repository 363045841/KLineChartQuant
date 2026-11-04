## ✨ Core Features

- **Agent Native** - Chart capabilities are `@Tool`-decorated domain primitives; the Agent calls the same primitives as the UI, with one shared state and one execution path
- **Script Indicators** - Write indicators in plain TypeScript. Sandboxed QuickJS execution with time and memory budgets, a built-in editor with completions and hover signatures, and plots that flow through the normal rendering chain
- **Crisp Rendering** - Full-chain ResizeObserver driven, physical pixel alignment, K-lines, wicks, and lines stay sharp on all DPR screens
- **Plugin Architecture** - Renderer plugin-based design with dynamic registration, configuration, and lifecycle management
- **High Performance** - Handles tens of thousands of data points without lag during zoom or pan; benchmark numbers are in the Performance section
- **Multi-Backend Rendering** - Submit drawing primitives once and render via **WebGPU**, **WebGL**, or **Canvas2D**, with automatic fallback. WebGPU uses a hybrid DOM canvas (no `compositeTo` copy), single-command-buffer-per-frame submission, 4x MSAA, and per-instance geometry caching via ResourceTable
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Mobile-Optimized Interaction** - Long-press crosshair for data exploration, tap to dismiss, slide to browse data without triggering chart scroll, gesture-based scroll mode
- **Multi-Symbol Comparison** - Compare multiple instruments on one chart
- **Multi-Source Aggregation** - Aggregate and unify multiple data sources
- **Batch Data Export** - Select a date range and export multiple stocks' K-line data into a single CSV file, with progress indication
- **Custom Tooltip** - Fully customizable tooltip via the `#kline-tooltip` slot, with engine-provided hover data, position, and styling
