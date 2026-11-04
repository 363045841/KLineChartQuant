## 🤖 Agent-Native Architecture

KLineChartQuant exposes chart capabilities as `@Tool` primitives on the chart core. The Agent calls the same entry points as the UI: one state source, one execution path, no bridge layer and no side-channel state.

- **Same primitives** — UI actions and Agent tools share `ChartController`; tools are a subset of actions.
- **Single source of truth** — `StateKernel` owns chart state; external consumers read readonly signals.
- **No MCP bridge** — tools register directly on the core, so one call reaches the kernel without a DSL or a duplicated state copy.
