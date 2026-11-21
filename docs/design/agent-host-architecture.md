# Agent 宿主架构：一个 origin 一个运行时

## 问题

Agent 运行时（Pi 会话、Provider 配置与凭据、模型调用、提问登记）原先跟着每个工作台实例走：

- 同一页面的每个图表标签各建一份运行时，各自去抢同一把 Web Lock；
- 第二个标签拿不到锁就整块面板不可用，点重试也无效，因为持锁实例在同一页面内不会释放；
- 面板关闭不卸载实例，锁因此永远不会回收。

锁本身没有错，错的是粒度：需求是「每个页面一个运行时」，实现成了「每个图表标签一个运行时」。

## 结论

运行时的所有者不是页面，而是 **origin**。结构上只有一个宿主：

```text
页面（可多个窗口、每个窗口多个图表标签）
  AgentClient（每个 document 一个）
        ↕ MessagePort（请求 / 应答 / 事件 / 撤销）
SharedWorker（每个 origin 一个）
  AgentHost
    ├── AgentApplicationService（运行编排）
    ├── 会话服务（IndexedDB + pi-durable）
    ├── 设置文档（Provider 配置、模型池、工具启用、凭据）
    └── ToolRouter（按 clientId 回路由）
```

三条不变量：

1. **一个 origin 一个宿主。** 由 SharedWorker 的实例语义保证，不再使用 Web Lock；没有 SharedWorker 的环境直接报错，不提供页面内降级。
2. **一个 document 一个客户端。** 由文档级单例保证；多个图表标签共用同一份连接。
3. **业务模型全部复用 Pi 与既有契约。** 协议只新增信封（方法名、请求 id、协议版本），不重新描述会话、运行或工具。

## 职责划分

| 能力 | 位置 | 理由 |
| --- | --- | --- |
| 会话、运行、事件 | 宿主 | 单写者资源，跨页面共享 |
| Provider 配置、模型池、凭据、工具启用 | 宿主（IndexedDB） | 只能有一个事实来源；worker 内没有 localStorage |
| 图表上下文、图表工具执行 | 页面 | 依赖 Core 的 `ChartAgentController` |
| 提问卡片渲染与作答 | 页面 | 属于界面；宿主只等待一次应答 |

运行请求携带发起页的 `clientId` 与图表工具描述（名称、说明、参数 Schema、副作用）。宿主组装计划时只使用这份描述；模型调用图表工具时经 `tools.execute` 回到发起页执行，参数与结果原样过线。

## Provider 设置：文档是唯一事实

- **一个写者。** 设置文档只通过 `AgentSettingsStore.update(draft => …)` 提交一次完整变更；调用方拿到的是隔离副本，读到的永远是投影（快照或运行时设置），拿不到可变文档。
- **一个读口径。** 页面只消费 `ProviderSnapshot`（配置、连接、模型池、选中模型、凭据存在性、思考强度），不再分别拉 status / profiles / modelPool / catalog。
- **命令只传标识。** 写命令接收 `profileId` 与 `modelId`；模型元数据由宿主用自己校验过的记录固化，页面不传视图对象。
- **目录不落盘、不缓存。** 打开设置、切换配置与显式刷新都会重新读取 `/models`；它是唯一触网的 Provider 命令，保存连接与启停模型都是纯本地写。
- **模型池不因连接变化清空。** 换地址只递增 `connectionRevision`；目录里不再提供的模型保留在原位并标注已下线。
- **运行时设置是投影。** `OpenAiCompatibleProviderSettings` 由「连接 + 选中模型 + 思考强度」现算；选中模型不在池中即视为未配置，不需要散落的清理逻辑。

## 关键行为

- **上下文随运行冻结。** 页面在 `startRun` 等调用前快照当前图表上下文；运行期间图表变化不影响已提交的计划。
- **会话订阅归观察租约。** 面板打开会话得到一份租约，切换会话或面板卸载时释放；同一会话的最后一个租约释放后宿主才关闭订阅。会话被删除时租约随删除一并丢弃。
- **提问只有一次结算。** 宿主持有等待中的 `questions.ask` 请求；页面作答或取消时回应同一请求。运行中止时宿主发送 `question.dismiss`，页面撤销卡片并把该提问结算为取消。
- **发起页消失即失败。** 页面在 `pagehide` 主动 `detach`；宿主让该页所有未完成调用以 `TARGET_LOST` 失败，运行随之以明确错误结束，不静默挂起。
- **工具状态只存禁用集合。** `disabledTools` 为空表示全部开启；新增工具默认开启，用户关闭后加入集合。v1 的 `enabledTools` 白名单无法反推全集，升级时按全开重建。
- **设置迁移只有一次。** 旧 LocalStorage 文档由页面读取后交给宿主导入；宿主发现已有文档就拒绝（`DUPLICATE_REQUEST`），页面随后删除旧键，之后不再读取旧存储。

## 包边界

| 入口 | 内容 | 使用者 |
| --- | --- | --- |
| `@…/klinechart-agent-runtime/browser` | 宿主客户端、协议、错误 | 页面 |
| `@…/klinechart-agent-runtime/browser-host` | 宿主、设置存储、会话存储 | SharedWorker |

页面入口不导出任何宿主实现，构建产物验证过页面 chunk 中不含 `kq-agent-durable-v2` 与会话存储代码。

## 失败语义

- 传输层不可恢复 → 客户端让所有待办以 `ABORTED` 失败，工作区进入不可用态并可重试。
- 协议版本不匹配 → 请求以 `INVALID_PROTOCOL` 拒绝，不猜测兼容。
- 跨线程载荷不可克隆 → 客户端在发出前以 `INVALID_PAYLOAD` 失败，不把传输错误归因给 Provider。
- 页面声明的工具在执行时已不可用（图表解绑）→ `TARGET_LOST` / `TOOL_NOT_ALLOWED`。
- 设置文档形状非法 → `INVALID_PAYLOAD`，不尝试修复或重置。
