# OpenAI-compatible Provider

此模块把支持 OpenAI Completions API 的第三方模型服务接入 Agent Runtime。它负责模型目录读取、连接验证、凭据与设置存储边界、HTTP 容错，以及将已验证配置转换为 Pi 的流式运行计划。

## 入口

`createOpenAiCompatibleRuntimeSupport(options)` 返回 `RuntimeSupport`：

- `provider.listModels` 请求 `${baseUrl}/models` 并返回可供 UI 展示的模型。
- `provider.test` 验证目标模型存在后，保存 API Key 和已验证设置。
- `provider.getStatus` 返回配置、兼容性、短凭据指纹与最近错误。
- `provider.deleteCredential` 仅删除 API Key。
- `createPlan` 使用已验证设置创建 Pi OpenAI Completions 流式运行计划。

浏览器宿主若只需模型目录，可以使用 `fetchOpenAiCompatibleModels`。该函数不依赖运行时存储，也不会经由宿主进程转发请求。

## 宿主职责

创建运行时时必须注入以下存储实现：

- `ProviderCredentialStore`：保存 API Key；生产实现应使用宿主提供的安全存储。
- `ProviderSettingsStore`：保存不含密钥的 `OpenAiCompatibleProviderSettings`。

模块提供的 `InMemoryProviderCredentialStore` 与 `InMemoryProviderSettingsStore` 仅适用于测试或不需要持久化的场景。读取和写入均接收可选 `AbortSignal`，实现必须在 I/O 前检查取消状态。

## HTTP 行为

`requestProviderJson` 统一处理模型目录等 JSON 请求：

- 默认单次请求超时为 30 秒。
- 默认最多重试 2 次，仅重试 `429` 与 `5xx` 响应。
- `Retry-After` 同时支持秒数和 HTTP 日期，等待时间受 `maxRetryDelayMs` 限制。
- URL 会移除用户名、密码、查询参数和片段后才交给 `diagnostics`。
- 非 JSON 响应会被归类为 `PROVIDER_MALFORMED_RESPONSE`，诊断仅记录字节数和内容形态，不记录响应正文。

流式请求由 Pi 发起，运行时通过包装后的 `fetch` 采集状态码和网络失败信息，再映射为稳定的 `AgentRuntimeError`。

## 配置约束

`baseUrl` 必须是 HTTP 或 HTTPS 地址，不能包含用户名、密码、查询参数或片段。运行计划只会使用已经通过 `test` 保存且 `compatibility` 为 `compatible` 的设置。

不要将 API Key、未经脱敏的请求 URL、Authorization 头或原始 Provider 响应写入日志、诊断回调或持久化设置。
