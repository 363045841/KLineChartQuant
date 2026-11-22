# 品种契约只保留 instrument

## 决策

`SymbolSpec` 只保留统一品种模型与会话级选择：

```ts
interface SymbolSpec {
  instrument: InstrumentDescriptor
  period?: string
  adjust?: string
  startDate?: string
  endDate?: string
  incremental?: boolean
}
```

删除扁平字段 `id` / `symbol` / `market` / `exchange` / `source` / `params`，以及 `instrument?.x ?? spec.x` 形式的逐字段回退。

## 原因

扁平字段与 `instrument` 并存是迁移未完成的兼容层，代价是三个真问题：

1. 同一品种两套身份：`symbolIdentityKey` 需要同时处理「有 ID」与「无 ID」两条路径，任何新增路由字段都要在两处同步。
2. 取数层每个字段都要写回退（`spec.instrument?.symbol ?? spec.symbol`），真值来自哪一个字段无法静态判断。
3. 持久化边界无法校验：布局文档与工作区标签保存的旧形状只有在真正加载时才暴露。

## 实现

- 身份：`symbolSpecIdentityKey` 固定为 `instrument:<source>:<id>`；目录条目另用 `symbolInfoIdentityKey`（无 ID 时才回退到来源/市场/交易所/代码/params）。
- 数据层：请求字段全部取自 `instrument`；`sourceFromSpec` 直接返回 `instrument.source`。
- AUTO 来源：品种模型始终携带已解析来源，图表路径删除 auto 叶子迁移（`SeriesRepository.moveToSource` 一并移除）；缓存层仍保留 auto 供其他查询使用。
- 市场会话：`resolveSymbolMarketSession` 接受 `{ sessionId, exchange, symbol }`，优先 `sessionId`，回退 `exchange`。
- 持久化边界：新增 `isSymbolSpec` 守卫（`engine/data/symbolSpecGuard.ts`）；布局恢复与工作区标签恢复遇到旧形状按「无品种」处理，不抛错。
- 界面：`toSymbolSpec(instrument, selection)` 只装配 `instrument` 与图表级字段；`setPrimaryMarket` 是唯一写入入口。

## 边界

- 周期、复权、日期边界仍属于图表选择，不进入 `instrument`。
- 对比品种只保存 `instrument`（与主图共享周期/复权），不去重同代码不同品种。
- 旧版布局文档与工作区标签中的扁平品种不再迁移，直接按无品种恢复；这是 alpha 期一次性的破坏性变更。
