### 4. (Optional) Add AI Agent Control

`KlineWorkbench` ships the Agent panel. The chart core exposes its domain capabilities as `@Tool`
primitives, and the Agent calls the same primitives as the UI: one shared state, one execution path,
no MCP bridge, no side-channel state. Advanced Agent APIs live in the same package at
`@363045841yyt/klinechart/agent`.
