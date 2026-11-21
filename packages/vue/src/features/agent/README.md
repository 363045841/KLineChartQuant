# Agent feature module

浏览器端 Agent 工作台。此目录负责把 Core 图表能力与 Agent Runtime 组合为 Vue UI；不承载 Core 领域规则或 Runtime 通用执行逻辑。

## Structure

```text
agent/
├── agent-contracts.ts              # Vue Agent UI 边界契约（转发 Runtime 视图类型）
├── agent-error-view.ts             # unknown 错误到 AgentErrorView 的统一投影
├── AgentWorkbenchShell.vue         # Agent 面板预设（通用侧边壳见 features/side-panel）
├── browser-agent/                  # 浏览器宿主能力
│   ├── chart-context/              # 图表上下文投影与订阅
│   ├── host/                       # 文档级客户端、SharedWorker 入口与图表工具端口
│   └── provider-settings/          # Provider 设置面板状态
├── workspace/                      # Vue 工作台状态、composable、偏好
├── agent-copy/                     # 多语言文案
├── render-agent-markdown/          # Markdown、citation 渲染与正文排版样式
├── components/                     # 展示组件
└── __tests__/                      # 跨模块测试与测试替身
```

## Module convention

语义模块采用类似 Java 的分层布局：

```text
<module>/
├── types.ts       # 对外契约、数据类型、依赖接口
├── impl/          # 实现
└── __tests__/     # 仅测试该模块时放置
```

`types.ts` 不依赖同模块的 `impl/`；调用方优先依赖契约。实现只能从 `impl/` 导入。

## Runtime ownership

Agent 运行时（会话、Provider、模型调用、提问登记）只存在于 SharedWorker 的宿主里，一个 origin 一份；页面只保留一个客户端。

```text
components / workspace
        ↓
browser-agent/host (chart agent client + chart tool port)
        ↓
agent-runtime/browser (host client over MessagePort)
        ↓
SharedWorker: agent-runtime/host (sessions, provider, tools routing)
        ↓
core controllers + agent-runtime
```

页面侧只有三类能力：图表上下文、图表工具执行、提问展示。宿主需要它们时按 `clientId` 回路由，页面不直接触达会话或凭据。图表标签之间通过 `agentContextActive` 决定谁写入上下文，同一时刻只有活动标签生效。

## Module entrypoints

`agent-copy/` 与 `render-agent-markdown/` 各自只有一个 `index.ts` 出口；调用方从模块入口导入，不再保留与目录同名的根 facade。

## Placement guide

- UI 状态、Pinia、composable：`workspace/`
- 图表上下文快照或订阅：`browser-agent/chart-context/`
- 页面与宿主的连接、图表工具端口：`browser-agent/host/`
- 纯展示文案和格式化：`agent-copy/` 或 `render-agent-markdown/`
- 纯组件：`components/`；不要让组件直接操作持久化或 Runtime 实现。
