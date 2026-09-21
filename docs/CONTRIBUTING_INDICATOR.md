# 贡献新指标：作者模板

本文档定义在**实例结果链路**（`packages/core/src/engine/indicators/instances/`）下新增一个指标需要改动的文件与测试要求。

适用范围：per-bar scalar / multi-line / point-array 类指标。结构类（HH/HL/BOS/FVG/OB 等）走 marker/overlay 路径，不适用本文。

## 架构前提

- 指标定义由 `@Indicator` 装饰器在模块加载时登记进 `indicatorDefinitionRegistry`；`loadBuiltinIndicators()` 负责 import 内置定义。
- 计算结果按 `instanceId` 保存在结果池。`calculationKey = definitionId + 计算参数 + 计算上下文`，只用于跨实例去重，不含 pane 与样式。
- renderer / scale renderer 在创建时绑定自己的 `instanceId`，绘制时从 `context.indicatorStateReader.get(instanceId)` 读取该实例的渲染投影。**没有**按指标类型索引的结果包，**没有** stateKey，也不写 PluginHost StateStore。
- 展示配置（`presentation.defaultOptions`）不进入计算，由投影阶段合入 renderer 读取的 `params`。

设计决策见 `docs/design/indicator-instance-render-binding.md` 与 `docs/design/indicator-instance-calculation-migration.md`。

## 文件改动清单（按依赖顺序）

以新指标 `XXX` 为例（内部 `name: 'xxx'`，对外 `displayName: 'XXX'`）。

| # | 文件 | 改动 |
|---|---|---|
| 1 | `packages/core/src/engine/indicators/state/xxxState.ts`（**新**） | 定义 `XXXRenderState extends BaseIndicatorState`、`EMPTY_XXX_STATE`，以及需要的 `DEFAULT_*` 常量 |
| 2 | `packages/core/src/engine/indicators/calculators/xxx.ts`（**新**）+ `calculators/index.ts`（**改**） | 纯计算函数 `calcXXXData(...)`，并从 `calculators/index.ts` 导出 |
| 3 | `packages/core/src/engine/indicators/indicatorContracts.ts`（**改**） | 副图登记进 `VisibleIndicatorStateContracts`，主图登记进 `MainIndicatorStateContracts`（`xxx: XXXRenderState`） |
| 4 | `packages/core/src/engine/renderers/Indicator/xxx.ts`（**新**） | renderer plugin（读 `instanceId` 投影）+ 同文件 `@Indicator({...})` + `static rendererFactory` |
| 5 | `packages/core/src/engine/indicators/registerBuiltins.ts`（**改**） | 把 `../renderers/Indicator/xxx.js` 加进 `loadBuiltinIndicators()` 的 import 列表 |
| 6 | `packages/core/src/features/semantic/types.ts`（**改**，可选） | 需要语义配置映射时加字段 |

第 3 步是编译期约束：`@Indicator` 的 `name` 类型为 `IndicatorName`，必须是契约表登记的键，漏登记无法通过类型检查。

`state/xxxState.ts` 只保留渲染状态类型与 `EMPTY_*` 常量，不定义 state key。

## renderer 读取契约

```ts
const state = context.indicatorStateReader?.get<XXXRenderState>(instanceId)
```

`instanceId` 由挂载路径通过 `IndicatorRendererOptions.instanceId` 注入（必填），renderer 不推导 state key，也不向 PluginHost 查询业务状态。

## `@Indicator` 配置

以 ATR 为样板（`packages/core/src/engine/renderers/Indicator/atr.ts`）：

```ts
@Indicator({
  name: 'xxx',
  displayName: 'XXX',
  category: 'oscillator',
  indicatorType: 'volatility',
  defaultPaneId: 'sub_XXX',
  scaleRendererFactory: createXxxScaleRendererPlugin,
  visibleState: { compose: createNonNegativeSparseVisibleStateComposer('xxx', EMPTY_XXX_STATE) },
  getTitleInfo: getXXXTitleInfo,
  presentation: { defaultOptions: { showXXX: true } },
  runtime: {
    defaultParams: { period: 14 },
    computeKey: 'calcXXXData',
    compute: (data, c) => calcXXXData(data, c.period),
  },
})
export class XXXIndicatorDefinition {
  static rendererFactory = createXXXRendererPlugin
}
```

可用字段（即 `IndicatorDefinitionConfig`），请勿臆造其它字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 内部 name，必须是 `indicatorContracts.ts` 登记的键 |
| `displayName` | 是 | 对外规范 ID，`resolveIndicatorDefinitionId()` 返回它 |
| `category` | 是 | `'main' \| 'sub' \| 'oscillator' \| 'volume'` |
| `indicatorType` | 是 | `IndicatorTypeRegistry` 的键，决定指标选择器分组 |
| `defaultPaneId` | 是 | 默认 pane（主图 `'main'`，副图如 `'sub_XXX'`） |
| `runtime` | 有 calculator 的指标必填 | `{ defaultParams, compute, computeKey, outputAlignment?, configKey?, paneIdKey? }`；`defaultParams` 的键就是计算参数集合 |
| `visibleState` | 副图指标需要 | `{ compose }`，复用 `visibleStateComposers.ts` 的 composer 工厂 |
| `mainPane` | 主图指标需要 | `{ rendererName, toActiveConfig?, computePriceRange?, composeRenderState? }` |
| `presentation` | 建议 | `{ defaultOptions, selectSeriesKeys? }`；展示配置不进入 `calculationKey` |
| `getTitleInfo` | 否 | pane 标题 / 主图图例内容 |
| `scale` / `scaleRendererFactory` | 否 | 副图坐标轴 |
| `getRendererName` / `getScaleRendererName` / `getPaneTitleRendererName` | 否 | 覆盖默认 plugin 命名规则 |
| `dataViews` | 否 | 参与渲染的数据视图，未声明时仅 K 线 |
| `aliases` / `indicatorTypeLabel` / `paneIdField` / `allowMainPane` | 否 | 兼容别名与能力声明 |

外加挂在被装饰类上的 `static rendererFactory: RendererFactory`（**必填**，缺失会在模块加载时抛 `KLineChartError`）。

**参数分层**：影响 calculator 输出的参数放 `runtime.defaultParams`；`show*` 一类显隐开关放 `presentation.defaultOptions`。两者混放会导致切换显隐时触发重新计算。多周期指标可用 `presentation.selectSeriesKeys(params, options)` 过滤可见序列（参考 `ma.ts` / `rsi.ts`）。

## 测试

复用 `packages/core/src/engine/indicators/__tests__/` 的基础设施：

| 路径 | 用途 |
|---|---|
| `__fixtures__/synthetic.ts` | 合成 OHLC 场景（`empty`、`singleBar`、`pureUptrend`、`spikeAtBar19` 等） |
| `__fixtures__/golden/*.json` + `golden/index.ts` | 离线金标值与 `assertSeriesClose(actual, expected, tolerance)` |
| `_propertyAssertions.ts` | 跨指标可复用的数学不变量断言 |
| `helpers/instanceTestKit.ts` | 实例快照、计算计划、可控执行器与输出构造 |
| `helpers/metadataTestKit.ts` | 最小 `IndicatorMetadata` |

每个新指标必须覆盖：

1. **Edge cases**：empty / single bar / shorter-than-period / period ≤ 0 / period = 1
2. **Golden values**：≥ 3 个合成 fixture 与离线金标对照
3. **数学不变量**：取值范围（RSI ∈ [0,100]、ATR ≥ 0 等）、单调性、对称性
4. **Warm-up 边界**：indices `[0, period-1)` 为 undefined，自 `period-1` 起有定义
5. **Incremental ≡ batch**：`calc(slice(0, n)) ≡ calc(full).slice(0, n)`

renderer 侧用 `renderers/__tests__/` 的 `renderTestKit` 构造 `RenderContext` 与按 `instanceId` 命中的 reader；投影侧在 `indicators/__tests__/stateComposer.test.ts` 验证展示配置合入与 `selectSeriesKeys` 过滤。

## Golden values 生成

金标是 commit 进仓库的 JSON，CI 不跑生成脚本。当前已提交 `atr` / `dema` / `hma` / `kama` / `tema` / `wma` 的 golden，由手算 + 公式推导生成；引入离线生成脚本后应替换。

## 提交节奏建议

- 单个指标 = 单个 PR；互不依赖的简单指标（如 WMA + DEMA + TEMA + HMA 同属 MA 家族）可合并
- 强依赖的指标拆成 PR 链（如 ATR → Keltner → SuperTrend，前者合并后才开后者）
