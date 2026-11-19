# Agent 网络搜索：Exa 托管 MCP 单通道

## 结论

网络搜索只有一个传输实现：一次 stateless 的 `POST https://mcp.exa.ai/mcp`，走 MCP 的 `tools/call`。
用户保存的 Exa Key 只作为可选 `x-api-key` 请求头发送，**不再区分免费通道与自有通道**。

## 依据

Exa 的鉴权只有两种可用组合：

| 手里有什么 | 可用入口 | 说明 |
| --- | --- | --- |
| API key | `api.exa.ai` 全部接口，或 `mcp.exa.ai/mcp` 带 `x-api-key` | 额度归 Key 所属团队 |
| 什么都没有 | 只有 `mcp.exa.ai/mcp` 的 search / fetch | 免费限流，无 `agent_run` |

无凭据请求 `POST https://api.exa.ai/search` 返回 `402 X402_PAYMENT_REQUIRED`：
REST 侧没有免费档，keyless 只开在托管 MCP 上。

托管 MCP 支持无状态调用：省略 `initialize` 与 `Mcp-Session-Id`，直接 `tools/call` 也能返回结果。
浏览器直连可行：预检返回 `204` 且 `access-control-allow-origin: *`，允许 `POST` 与 `Content-Type`、`Accept`、`x-api-key`；
响应是 `text/event-stream`。

## 传输与解析

- 请求体是 JSON-RPC `tools/call`，工具名 `web_search_exa`，参数只有 `query` 与 `numResults`。
- `Accept` 必须同时包含 `application/json` 与 `text/event-stream`，只给 JSON 会被 `406` 拒绝。
- 响应是 SSE，解析按行取 `data:`。
- 结果在 `result.content[0].text`，以 `Title: / URL: / Published: / Author: / Highlights:` 的文本块呈现，
  块之间用 `\n---\n\n` 分隔。`Published: N/A` 表示未知日期，不写入 `publishedAt`。
- 缺乏标题或地址的块没有引用价值，直接丢弃。

## 错误分类

上游有两种失败形态，必须都处理，否则会静默成功：

1. **JSON-RPC `error`**：额度用尽时出现，限流只写在 message 文本里，`code` 不参与判断。
2. **`result.isError: true`**：Key 无效、权限受限等，HTTP 仍是 `200`，状态码写在正文开头 `(401)` 这类片段里。

映射到运行时既有错误码，`recommendedAction` 直接写明模型该对用户说什么：

| 上游事实 | 错误码 | retryable | 模型动作 |
| --- | --- | --- | --- |
| 401 Key 无效 | `PROVIDER_AUTHENTICATION` | false | 让用户替换或清除 Key |
| 403 网络受限 | `PROVIDER_PERMISSION` | false | 说明免费通道需要 IPv4 直连，配 Key 可绕过 |
| 429 额度用尽 | `PROVIDER_RATE_LIMITED` | false | 免费额度：让用户配 Key；自有额度：告知额度耗尽，不要重试 |
| 5xx / 网络中断 | `PROVIDER_UNAVAILABLE` | true | 可以重试 |
| 其他 4xx | `PROVIDER_UNAVAILABLE` | false | 换个查询再试 |
| 响应不可读 | `PROVIDER_MALFORMED_RESPONSE` | false | 如实报失败，禁止编造结果 |

未知异常不在工具层吞掉，直接上抛；已知错误统一走 `toolFailureResult`，
与图表工具共用同一个 `{"success":false,"error":…,"stateChanged":false}` 信封。

## 已知限制

- 官方要求 keyless 走 **IPv4 直连**，IPv6 或代理链路会 `403`；浏览器不能指定协议族，只能失败后引导配置 Key。
- 免费额度很低（第三方实测约 2 req/s、50 req/day），并发搜索会直接 `429`。
- 文本块格式由 Exa 决定：出现结果块标记却解析不出结果时按格式错误返回，只有上游明确没有结果时才是合法的空列表。
