## ✨ Core Features

- **Agent First / MCP Native** - Supports AI Agent direct control of charts via the [Model Context Protocol](https://modelcontextprotocol.io). Built-in WebSocket-bridged MCP server enables any MCP client (Inspector, Claude Desktop, Cursor, etc.) to zoom, pan, add/remove indicators, and change theme in real time
- **Crisp Rendering** - Full-chain ResizeObserver driven, physical pixel alignment, K-lines, wicks, and lines are sharp and clear on all DPR screens
- **Plugin Architecture** - Renderer plugin-based design, supporting dynamic registration, configuration, and lifecycle management
- **Custom Markers** - Supports semantic configuration of custom markers and custom information
- **High Performance** - Smoothly handles tens of thousands of data points, no lag during zoom or pan; supports **190-200fps on 200Hz displays** with single-frame generation time as low as **2ms**
- **WebGL Rendering** - K-lines, volume bars, and MACD bars rendered via WebGL for GPU-accelerated performance, reaching **190fps on 200Hz displays** with per-frame GPU time under **1ms**
- **Optimized Interaction** - Stable zoom anchor, precise crosshair cursor, smooth drag
- **Mobile-Optimized Interaction** - Long-press crosshair for data exploration, tap to dismiss, slide to browse data without triggering chart scroll, gesture-based scroll mode
- **Multi-Symbol Comparison** - Supports unlimited number of instruments for trend comparison
- **Multi-Source Aggregation** - Supports aggregation and unification of multiple data sources
- **Batch Data Export** - Select a date range and export multiple stocks' K-line data into a single CSV file, with progress indication
- **Custom Tooltip** - Fully customizable tooltip via named slots (`#kline-tooltip`, `#marker-tooltip`), with engine-provided hover data, position, and styling
