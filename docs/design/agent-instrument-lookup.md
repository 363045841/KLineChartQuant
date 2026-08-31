# Agent 精确品种查询设计

## 决策

在 Core 的 `data/provider` 增加 `lookupInstrumentsBySymbol()`，用于按标准代码返回精确匹配的 `InstrumentDescriptor[]`。该 API 不替换现有 `searchInstruments()`。

## 边界

- `searchInstruments()` 服务前端联想搜索，保留关键词、多候选和调用方指定的 `limit`。
- `lookupInstrumentsBySymbol()` 统一处理空白与大小写，再过滤为精确代码匹配；保留同代码、不同 `sourceId` 或 `exchange` 的结果。
- `@Tool` 直接标注在 `ChartAgentController.lookupInstrumentsBySymbol()`；Agent Runtime 只适配 Core 注册的方法，不承担候选筛选或 symbol 比较规则。

## 候选获取

当前 Provider Catalog 仅提供有上限的 `search()`。精确查询以代码作为关键词，使用由 Core 持有的候选上限，再进行精确过滤。若后续 Catalog 增加原生精确查询能力，`lookupInstrumentsBySymbol()` 是唯一替换候选获取实现的位置，UI 与 Agent 调用方无需调整。
