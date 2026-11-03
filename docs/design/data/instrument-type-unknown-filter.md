# instrumentType unknown 不参与取数筛选

## 背景

搜索并选择品种后，图表取数链路会带着该品种的 `instrumentType` 进入 `SourceRouter`：

```
ChartDataManager.loadBars (instrumentType: spec.instrument?.instrumentType)
  -> MarketDataCache.queryBars
  -> SourceRouter.getCandidates -> MarketDataProviderRegistry.getEnabledByCapability
  -> supportsCapability
```

当品种的 `instrumentType` 为 `unknown`（数据源尚未归一化，例如 GoTDX 的恒指 `HSI`）时，
`supportsCapability` 会用 `unknown` 去匹配源声明的 `SourceCapabilities.instrumentTypes`
（GoTDX 声明为 `stock/index/fund/future/option/forex`）。`unknown` 不在其中，源被判为不支持，
候选源被整源筛掉，`SourceRouter` 在**发起请求之前**就抛出 `SourceRoutingError`
（`no enabled Provider supports the requested capability`），用户看到的是流转层错误而非 K 线请求。

这违反领域模型既有约定（`types.ts`）：

> `unknown` 只表示数据源尚未归一化，不允许作为筛选条件参与匹配。

`KNOWN_INSTRUMENT_TYPES` 已按此约定排除了 `unknown`，但取数链路此前没有遵守。

## 决策

在领域模型层提供唯一的判定入口 `isFilterableInstrumentType`：

```ts
export function isFilterableInstrumentType(value: InstrumentType | undefined): value is KnownInstrumentType {
  return value !== undefined && value !== 'unknown'
}
```

语义：`undefined` 与 `unknown` 同义，都表示“无该筛选条件”。所有把 `instrumentType`
当作筛选条件的调用点必须复用该判定，`unknown` 一律按“无条件”处理，不得内联字符串判断。

## 影响面

修改点（全部复用 `isFilterableInstrumentType`）：

| 位置 | 原行为 | 现行为 |
|------|--------|--------|
| `data/provider/impl/registry.ts` `supportsCapability` | `unknown` 参与源级 `instrumentTypes` 匹配 | `unknown` 视为无条件，不排除源 |
| `data/provider/impl/router.ts` `resolveInstrument` | 目录搜索透传 `instrumentTypes:[unknown]` | `unknown` 时不传 `instrumentTypes` |
| `data/provider/protocol/impl/provider.ts` `catalog.search` | 目录结果按 `[unknown]` 过滤 | 过滤前剔除 `unknown`，集合为空即返回全部 |

`instrumentType` 已由工具 schema（`KNOWN_INSTRUMENT_TYPES`）限制为已知类别的入口（如
`comparison_create`、Agent 行情查询工具）不受影响，无需改动。

## 边界

- 该修复只解决“筛选条件误杀”，不改变数据正确性：数据源仍应把恒指等品种归一化为 `index`；
  归一化后即便 `instrumentType` 为已知类别，行为也保持一致。
- `resolveInstrument` 中 `attached` 命中判定仍要求 `attached.instrumentType === identity.instrumentType`，
  未改动：`unknown` 对 `unknown` 命中属于同一来源同一品种，符合预期。

## 测试

- `data/__tests__/marketDataProviderRegistry.test.ts`：`instrumentType:'unknown'` 不排除任何已启用源。
- `data/provider/__tests__/router.test.ts`：源声明不含 `unknown` 时，`unknown` 品种仍能取到数据。
- `data/provider/protocol/__tests__/provider.test.ts`：目录搜索携带 `instrumentTypes:['unknown']` 时按无条件处理。
