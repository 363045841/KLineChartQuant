# 绘图锚点：拆分交易日解析失败的错误码

`ANCHOR_NOT_FOUND` 曾把「日期范围外」「当天无 bar」「数据没有 date 字段」三种互斥原因压成同一个错误码，Agent 收到后无法判断该改什么。本次把交易日锚点的解析结果改成可判别联合，并按原因抛不同错误码。

## 问题

`findAnchorAtTradingDate` 过去返回 `{ timestamp } | null`，`null` 同时代表：

| 原因 | 语义 | 可自纠的修正 |
| --- | --- | --- |
| 日期早于已加载最早 / 晚于最晚 | 范围外 | 改到 `[earliest, latest]` 内 |
| 日期在范围内但没有 bar | 非交易日 / 停牌 | 改成一个有 bar 的日期 |
| 数据源未提供每根 bar 的 `date` | 能力缺失 | 与日期无关，重试无效 |

三者都返回同一句话 `No chart data exists for drawing anchor trading date …`，配合 Agent 层统一改写，最终变成无法定位的反馈。

## 契约变更

```ts
export type AnchorTradingDateResolution =
  | { readonly kind: 'resolved'; readonly timestamp: number }
  | { readonly kind: 'out-of-range'; readonly earliest: string; readonly latest: string }
  | { readonly kind: 'not-trading' }
  | { readonly kind: 'date-unavailable' }
```

- `DrawingDocumentDependencies.findAnchorAtTradingDate` 返回该联合，不再返回 `null`。
- 原因判别在适配器完成（它持有 `chart.getData()`），错误码映射留在 `DrawingDocument`（领域语义的唯一归属）。
- `earliest` / `latest` 用 `string`：`KLineData.date` 从协议层起就是可选 `string`，不做不安全断言。

## 错误码（append-only）

| 错误码 | 触发条件 | details |
| --- | --- | --- |
| `DRAWING_ANCHOR_DATE_OUT_OF_RANGE` | 日期在已加载范围之外 | `tradingDate, earliest, latest` |
| `DRAWING_ANCHOR_DATE_NOT_TRADING` | 日期在范围内但当天无 bar | `tradingDate` |
| `DRAWING_ANCHOR_DATE_UNAVAILABLE` | 数据无 per-bar `date` | `tradingDate` |

`DRAWING_ANCHOR_NOT_FOUND` 保留给时间戳锚点路径（`getLogicalIndexAtTimestamp` 未命中已加载 bar），语义收窄为「时间戳不可达」。

## Agent 层映射

`drawingCreateFailure` 按新错误码返回各自的 `code` / `expected` / `recovery`，其中范围外与范围值直接带出 `earliest`、`latest`——修正所需信息随失败一起返回，不再要求模型去猜已加载范围。

## 边界

- 不注入全量交易日：范围边界只有两个值，token 恒定。
- 不改变「日期在范围内但无 bar」的判定为吸附：吸附会改变用户意图，属于独立的产品决策。
- 日内周期下「日期命中多根 bar」目前静默取首根，是行为问题而非错误码问题，本次不将其改为报错，另行决策。
