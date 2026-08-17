## 📋 Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| semanticConfig | `SemanticChartConfig` | — | Semantic configuration (optional). When provided, drives chart data, indicators, markers and chart options |
| theme | `'light' \| 'dark'` | — | Chart theme. Use `v-model:theme` for two-way binding |
| isFullscreen | `boolean` | — | Controlled fullscreen state. Leave unbound for internal (non-controlled) mode |
| timezone | `string` | `'Asia/Shanghai'` | Time zone for date/time display |
| yPaddingPx | `number` | 20 | Y-axis padding in pixels |
| minKWidth | `number` | 1 | Minimum K-line width (logical pixels) |
| maxKWidth | `number` | 50 | Maximum K-line width (logical pixels) |
| rightAxisWidth | `number` | 0 | Right price axis width |
| leftAxisWidth | `number` | 0 | Left price axis width (0 = hidden) |
| bottomAxisHeight | `number` | 24 | Bottom time axis height |
| priceLabelWidth | `number` | 60 | Price label extra width for showing change percentage |
| zoomLevels | `number` | 20 | Total number of zoom levels |
| initialZoomLevel | `number` | 3 | Initial zoom level (1 ~ zoomLevels) |
| customData | `CustomDataSource` | — | Inline data bundle: `{ symbol?, period?, data, comparisons? }`. Bypasses the fetcher pipeline entirely. See example above |
| teleportContainer | `string \| HTMLElement` | — | Teleport target for dropdowns/modals (CSS selector or element). Defaults to internal `.chart-wrapper` |
| mcp | `McpConfig` | — | MCP/AI runtime bridge config: `{ wsUrl?, autoReconnect?, onToolCall? }`. See [@363045841yyt/klinechart-ai-runtime]({{root}}packages/ai-runtime/README.md) |
