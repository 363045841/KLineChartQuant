# 对比品种工具契约

## 背景

`comparisons_write` 直接照搬领域 `SymbolSpec`，带来四个后果：

1. 歧义候选返回 `id` / `sourceId`，而 create 只接受 `source`；`ask_user` 又教模型回传 `id`，重试必然被 schema 拒绝。
2. `period` / `adjust` 暴露给模型，但 context 不包含当前图表的周期与复权；Agent 不传时落到 `none`，与 UI 用当前复权的结果不一致。
3. 扁平 schema 对全部 action 开放全部字段，`remove` 带多余字段被静默忽略；`remove` 未命中仍返回成功摘要。
4. `comparisons_list` 直接回吐 `SymbolSpec`（含 `instrument.capabilities`、`params`、`id`），却漏掉用户可见的 `visible`。

## 决策

**工具只消费最小投影，路由字段与品种查询同构，周期/复权不进入工具参数。**

### 字段契约

`instruments_query` 的输出列就是消费端的最小寻址字段：

| 字段 | 含义 |
| --- | --- |
| `symbol` | 标准代码 |
| `source` | 数据源；省略时跨全部已启用源解析 |
| `exchange` | 交易所过滤，大小写不敏感 |
| `instrumentType` | 品种类别过滤；`unknown` 按无条件处理 |

`comparisons_write create` 原样接受这组字段，候选也只用这组字段加展示名 `name`。

### 输出投影

`comparisons_list` 与 `create` 返回同一形状：

```json
{
  "identity": "instrument:tdx:600519",
  "symbol": "600519",
  "name": "贵州茅台",
  "exchange": "SSE",
  "source": "tdx",
  "instrumentType": "stock",
  "color": "#f59e0b",
  "visible": true
}
```

领域 `SymbolSpec` 保留在命令层，图例仍可直接使用；投影只发生在 Agent 适配层。

### 周期与复权

对比线恒随主图的周期与复权：取数时由 `comparisonSpecForPrimary` 注入，`comparisons_write` 不接受这两个参数。宿主 `add` 仍可传完整 `SymbolSpec`，但周期/复权不参与数据选择。

### 动作与错误

- `create`：解析 → 去重 → 写入；歧义时返回 `{ status: "ambiguous", candidates }`，不写状态。
- `update`：只改 `visible`，与图例开关共用 `ComparisonCommands.setVisible`。
- `remove`：只用 `identity`。
- 失败一律走 `KLineChartError`：
  - `COMPARISON_DUPLICATE`：`details` 带既有 `identity`。
  - `COMPARISON_NOT_FOUND`：提示先 `comparisons_list`。
  - `INSTRUMENT_NOT_FOUND`：区分“过滤器排除”“其他源存在”“彻底没有”。
  - `FETCH_FAILED`：有源查询失败且无候选，保留重试路径。
- 不暴露 `clear`：UI 没有对应入口，Agent 不应拥有用户没有的能力。

### 解析同源

`instruments_query` 与 `comparisons_write` 共用 `lookupInstrumentsBySymbol` / `searchInstruments`。`SourceRouter` 仍按单个 Provider 搜索，但精确匹配规则复用 `pickExactInstrument`，不再自己比对代码；目录查询统一返回 `{ instruments, searchedSources, failedSources }`。

## 后果

- 工具层不再依赖 `ComparisonCommandsApi` 的宿主写原语，改用窄 port。
- `comparisons_write` 删除 `clear`、`market`、`period`、`adjust`；`ComparisonSnapshot` 增加 `visible`。
- 目录查询返回结构变化，`instruments_query` 同样能区分“没查成”和“不存在”。
- 破坏性变更，提交使用 `refactor(agent)!`。
