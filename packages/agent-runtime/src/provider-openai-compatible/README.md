# OpenAI-compatible Provider

此模块把支持 OpenAI Completions API 的第三方模型服务接入 Agent Runtime。它负责模型目录读取、HTTP 容错，以及把宿主投影出的已选模型设置转换为 Pi 的流式运行计划。

## 入口

`createOpenAiCompatibleRuntimeSupport(options)` 返回：

- `catalog.listModels` 请求 `${baseUrl}/models` 并返回可供 UI 展示的模型；目录不缓存，每次调用都现取。
- `createPlan` 使用宿主投影出的 `OpenAiCompatibleProviderSettings` 创建 Pi 流式运行计划。

连接、凭据与模型池都由宿主设置文档负责；这里只读取 `credentials.read` 与 `settings.read`，不写任何配置。

## 宿主职责

创建运行时时必须注入以下只读实现：

- `ProviderCredentialStore`：读取当前 API Key；写入与清除由连接命令落在设置文档上。
- `ProviderSettingsStore`：读取宿主投影出的 `OpenAiCompatibleProviderSettings`。

模块提供的 `InMemoryProviderCredentialStore` 与 `InMemoryProviderSettingsStore` 仅适用于测试或不需要持久化的场景。读取接收可选 `AbortSignal`，实现必须在 I/O 前检查取消状态。

## HTTP 行为

`requestProviderJson` 统一处理模型目录等 JSON 请求：

- 默认单次请求超时为 30 秒。
- 默认最多重试 2 次，仅重试 `429` 与 `5xx` 响应。
- `Retry-After` 同时支持秒数和 HTTP 日期，等待时间受 `maxRetryDelayMs` 限制。
- URL 会移除用户名、密码、查询参数和片段后才交给 `diagnostics`。
- 非 JSON 响应会被归类为 `PROVIDER_MALFORMED_RESPONSE`，诊断仅记录字节数和内容形态，不记录响应正文。

流式请求由 Pi 发起，运行时通过包装后的 `fetch` 采集状态码和网络失败信息，再映射为稳定的 `AgentRuntimeError`。

## 配置约束

`baseUrl` 必须是 HTTP 或 HTTPS 地址，不能包含用户名、密码、查询参数或片段。运行计划只使用宿主文档投影出的已选模型设置；选中模型不在模型池中时投影为空，运行会以 `PROVIDER_NOT_CONFIGURED` 拒绝。

不要将 API Key、未经脱敏的请求 URL、Authorization 头或原始 Provider 响应写入日志、诊断回调或持久化设置。
