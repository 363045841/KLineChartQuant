# 品种 Chip 拉取错误 Title 设计

## 目标

主品种 K 线拉取因 Effect 显式失败时，Vue 品种 chip 悬停须通过原生 `title` 显示失败原因。用户无需打开控制台即可理解警告图标含义。

## 范围

- 仅主品种 K 线拉取。
- 传播 Effect 显式失败：网络错误、HTTP/fetcher 的 `FETCH_FAILED`、超时、缺少 source，以及重试后仍 reject 的拉取 Promise。
- 成功但返回空数组 `[]` 仍为非致命 warning，不写入 chip 错误原因。
- 仅使用浏览器原生 `title`；不做自定义 tooltip 组件。
- 本次不做：TimeShareBuffer、对比品种 chip、搜索结果错误、自定义气泡 UI。

## 问题

现状：

1. `DataBuffer` 捕获拉取失败后只清理 inflight 状态。
2. Vue 的 `symbolStatus` 在 loading 结束且无数据时变为 `'error'`。
3. `SymbolSelector` 在 `error === true` 时显示警告图标。
4. chip 的 `title` 始终是品种展示名，从不显示失败原因。

因此警告图标没有面向用户的解释。

## 设计

### Core：由 buffer 持有 lastError

`DataBuffer` 内部维护可写错误信号，对外暴露只读：

```ts
readonly lastError: ReadonlySignal<string | null>
```

规则：

- Effect 在重试/超时后仍显式失败时，将 `lastError` 设为可读的错误 message。
- 优先使用 `Error.message`；否则使用 `String(error)`。
- 任意一次拉取成功 merge（含空 `[]`）时，将 `lastError` 清为 `null`。
- 在 `setSymbol`、`setInlineData`、`dispose` 时将 `lastError` 清为 `null`。
- 过期请求的失败不得覆盖当前请求的错误，也不得清除更新请求的成功状态。

`KLineBuffer` / `DataBufferLike` 同步暴露同一只读信号，避免消费者向下转型。

### Core：Chart 对外表面

`ChartDataManager` 与 `Chart` 暴露：

```ts
readonly dataError: ReadonlySignal<string | null>
```

读取当前主 K 线 buffer 的 `lastError`。无活动 K 线 buffer 时为 `null`。

不走全局 EventBus。错误状态留在 data buffer 生命周期内。

### Vue：chip title

`KLineChart` 订阅 `ctrl.dataError`（或等价 controller 暴露），维护本地 `symbolErrorMessage: string | null`。

传递链路：

1. `KLineChart` → `TopToolbar` 的 `symbolErrorMessage`
2. `TopToolbar` → `SymbolSelector` 的 `errorMessage`

`SymbolSelector` chip title：

- 若 `error && errorMessage`：使用 `errorMessage`
- 否则：保持现有 `displayText`

警告图标仍由现有布尔 `error` 控制。本改动不新增第二套视觉状态机，只为悬停提供原因文案。

`symbolStatus === 'error'` 仍可由 loading 结束且无数据推断，用于图标可见性。title 原因在存在 Effect 显式失败时必须来自 `lastError` / `dataError`，不得写死通用文案。

若因空数据显示图标但 `lastError` 为 null（成功空拉取），title 可仍为品种展示名。空数据不是 Effect 显式失败。

## 文案质量

UI 层不编造营销文案。直接透出 Effect/fetcher 边界已有的失败 message，例如：

- `[gotdx] stock/kline-by-date failed: 500 Internal Server Error`
- `[DataBuffer] source is required for symbol "..."`
- Effect timeout 产生的超时文案

规范化后 message 为空时，回退为 `加载失败`。

## 测试

- DataBuffer 单元测试：
  - 失败拉取将 `lastError` 设为错误 message
  - 成功拉取清空 `lastError`
  - `setSymbol` / `setInlineData` 清空 `lastError`
  - 成功空 `[]` 不设置 `lastError`
  - 过期 reject 不覆盖更新成功请求
- Vue 接线测试或组件级断言：
  - 提供 error message 时 chip `title` 等于该文案
  - 非错误时 chip `title` 仍为展示名

## 非目标

- 自定义样式 tooltip
- 本地化/重写每条 fetcher message
- 对比或分时错误 chip
- 将空数据策略改回硬失败
