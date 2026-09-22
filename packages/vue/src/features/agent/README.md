# Agent feature module

浏览器端 Agent 工作台。此目录负责把 Core 图表能力与 Agent Runtime 组合为 Vue UI；不承载 Core 领域规则或 Runtime 通用执行逻辑。

## Structure

```text
agent/
├── agent-contracts.ts              # Vue Agent UI 边界契约
├── AgentWorkbenchShell.vue          # 工作台壳层
├── browser-agent/                   # 浏览器宿主能力
│   ├── bridge/                      # AgentBridgeClient 编排门面
│   ├── chart-context/               # 图表上下文投影与订阅
│   ├── provider/                    # Provider profile、凭据、模型池
│   ├── provider-settings/           # Provider 设置面板状态
│   ├── session/                     # 会话、运行与问答状态
│   └── tools/                       # Core 图表工具到 Runtime 工具的适配
├── workspace/                       # Vue 工作台 reducer、composable、偏好
├── agent-copy/                      # 多语言文案
├── render-agent-markdown/           # Markdown 与 citation 渲染
├── components/                      # 展示组件
├── testing/                         # Fake bridge 与测试辅助
└── __tests__/                       # 跨模块与门面测试
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

## Dependency direction

```text
components / workspace
        ↓
browser-agent/bridge (composition facade)
        ↓
browser-agent/*
        ↓
core controllers + agent-runtime
```

`browser-agent/bridge/impl/browser-agent-bridge.ts` 只做浏览器依赖装配、跨模块协调和 `AgentBridgeClient` 委托，其宿主依赖契约定义在 `browser-agent/bridge/types.ts`。Provider、会话、图表上下文或工具适配的新逻辑应进入对应的 `browser-agent/<module>/impl/`，不要继续扩充 bridge。

## Compatibility facades

以下根文件是过渡/兼容入口，内部实现已经迁入语义模块。新的代码应从目标模块导入；只有需要保持既有公共路径时才保留或新增 facade。

- `agent-copy.ts` → `agent-copy/`
- `render-agent-markdown.ts` → `render-agent-markdown/`

## Placement guide

- UI 状态、Pinia、composable：`workspace/`
- 浏览器 localStorage、Provider 凭据、模型配置：`browser-agent/provider/`
- 图表上下文快照或订阅：`browser-agent/chart-context/`
- Runtime 工具注册、描述和错误投影：`browser-agent/tools/`
- 纯展示文案和格式化：`agent-copy/` 或 `render-agent-markdown/`
- 纯组件：`components/`；不要让组件直接操作持久化或 Runtime 实现。
