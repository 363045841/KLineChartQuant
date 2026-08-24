# 贡献新指标：作者模板

本文档定义在当前 stateless + SoA + Worker 指标管线下，**新增一个指标必须修改的文件 + 1 套测试基础设施**。以 ATR（PR #0 落地的样板指标）为参考。

> **架构更新（`@Indicator` 装饰器注册）**：原先的「7 文件清单」第 6 步——手动编辑 `scheduler.ts` 把指标接进调度器——**已被 `@Indicator(...)` 类装饰器取代**。指标现在通过装饰器在模块加载时声明元数据（`IndicatorMetadata`），由 `Chart` 构造时遍历 `getRegisteredIndicatorDefinitions()` 自动 `registerIndicator(...)` 进 `IndicatorScheduler`。`scheduler.ts` 已重构为**完全泛型**：`applyResults` / `updateVisibleStatesOnly` / `buildActiveSubIndicatorMask` / `buildActiveConfig` 全部遍历 `registry.getAll()` 并通过 `meta.applyResult` / `meta.paneIdField` / `meta.category` 驱动，**新增指标时不再需要改 `scheduler.ts`**。详见下表第 6 步。

> 适用范围：per-bar scalar / multi-line / point-array 类指标。**结构类（HH/HL/BOS/FVG/OB 等）走另一条 marker/overlay 路径，见后续 PR 的子系统文档。**

---

## 指标命名约定（MA 家族）

均线家族 `name` 一律用标准英文缩写、全小写；`displayName` 用全大写。已占用名称：

| name | 全称 | 说明 |
|------|------|------|
| `ma` | Simple Moving Average | 已有 |
| `expma` | EXPMA | 已有；国内双线平滑（快/慢两条 EMA），**不是**标准单线 EMA |
| `wma` | Weighted Moving Average | 已有 |
| `dema` | Double Exponential Moving Average | 已有 |
| `tema` | Triple Exponential Moving Average | 已有；**恒为 Triple EMA，保持国际标准不改** |
| `hma` | Hull Moving Average | 已有 |
| `kama` | Kaufman Adaptive Moving Average | 已有 |
| `vma` | Volume Moving Average（量的 MA） | 已有；区别于 `vwap` |
| `trix` | Triple Exponential Average | 已有 |

待新增指标使用以下保留名，避免歧义：

- 三角均线（Triangular）→ **`trima`**（Pine 标准名，与 `tema` 无歧义；不用 `tma`）
- Wilder 平滑（Smoothed MA）→ `smma` / `rma`
- 成交量加权均线 → `vwma`（区别于已有 `vma` 与 `vwap`）
- 零滞后 EMA → `zlema`
- Arnaud Legoux → `alma`
- 线性回归均线 → `lsma`
- 平行线差（通达信 DMA）→ `dma`
- 顾比均线（Guppy）→ `gmma`

新增前先确认 `indicatorCatalog.ts` 的 `uiMeta` 与 `@Indicator` 注册名是否已占用。

---

## 文件改动清单（按依赖顺序）

下表以新指标 `XXX` 为例（小写 `xxx`、大写 `XXX`，对应实例：`ATR` / `atr`）。

| # | 文件 | 改动 | 难度 |
|---|---|---|---|
| 1 | `src/core/indicators/xxxState.ts`（**新**） | 定义 `XXXRenderState extends BaseIndicatorState`、`createXXXStateKey(paneId)`、`EMPTY_XXX_STATE`、`DEFAULT_XXX_PERIOD` | 低 |
| 2 | `src/core/indicators/calculators.ts`（**改**） | 加 `calcXXXData(data: KLineData[], params): SeriesShape` 纯函数，附 `calcXXXDataSoA(layout, params)` 包装 | 低-中 |
| 3 | `src/core/indicators/workerProtocol.ts`（**改**） | 加 `XXXSchedulerConfig`；在 `IndicatorConfigSnapshot` 加 `xxx` 字段 + `xxxPaneId`；在 `IndicatorSeriesBundle` 加 `xxx: { series, params }` | 低 |
| 4 | `src/core/indicators/indicatorRuntime.ts`（**改**） | 加 `cachedXxxSeries` + `dirtyXxxConfig`；`getDefaultConfig` 加默认；`setConfig` 加 shallow-equal 分支；`forceDirty` 加；`computeSeries` 加 ATR-block；两处 bundle 返回加 `xxx` | 中 |
| 5 | `src/core/indicators/stateComposer.ts`（**改**） | 加 `XXXRenderState` import 和 `EMPTY_XXX_STATE`；在 `VisibleSubIndicatorStates`/`VisibleSubIndicatorMask` 加 `xxx`；加 `calcXXXExtremes(...)`；`composeVisibleSubIndicatorStates` 内组装 state | 中 |
| 6 | `src/core/renderers/Indicator/xxx.ts`（**新**） | RendererPlugin，参考 `atr.ts`：WebGL 优先 + Canvas2D 回退，从 `pluginHost.getSharedState<XXXRenderState>(STATE_KEY)` 读，带 cache-key 防 redraw。**同文件内**用 `@Indicator({...})` 装饰一个 `class XXXIndicatorDefinition`（`static rendererFactory = createXXXRendererPlugin`）声明元数据 → 取代旧的 `scheduler.ts` 手动注册（见下方「`@Indicator` 装饰器注册」） | 中 |
| 7 | `src/semantic/types.ts`（**改**） | 在 `SubIndicatorParams`（副图）或 `MainIndicatorConfig`（主图叠加）加 `XXX?: {...}` | 低 |

**`scheduler.ts` 不再需要改**——旧清单第 6 步（手动接进调度器）已由 `@Indicator` 装饰器接管，`IndicatorScheduler` 现已是泛型实现，遍历注册表自动处理 `applyResults` / 可见极值 / active mask / active config。
**worker 入口 `indicator.worker.ts` 不需要改**——它只 dispatch 到 `IndicatorRuntime.computeSeries()`，新指标自动随 runtime 升级。

> **注意**：步骤 2/3/4/5（`calculators.ts`、`workerProtocol.ts`、`indicatorRuntime.ts`、`stateComposer.ts`）**仍需手动修改**——`@Indicator` 装饰器只负责「注册与渲染分发」，**不负责计算管线与 worker 协议**。指标的纯函数计算、SoA 包装、worker 协议字段、runtime 缓存/脏标记、state 组装这一整条数据链路依旧由作者按上表手工接入。

---

## `@Indicator` 装饰器注册（取代旧 scheduler.ts 手动注册）

在渲染器文件（`src/core/renderers/Indicator/xxx.ts`）末尾，用 `@Indicator({...})` 装饰一个 definition 类，并在该类上挂 `static rendererFactory`。模块加载时装饰器把元数据写入 `indicatorDefinitionRegistry`，`Chart` 构造时调 `getRegisteredIndicatorDefinitions()` 自动注册进 `IndicatorScheduler`。

```ts
import { Indicator } from '@/core/indicators/indicatorDefinitionRegistry'
import { resolveStateKey } from '@/core/indicators/indicatorMetadata'

// 副图振荡器（如 ATR）：
@Indicator({
    name: 'atr',                 // 指标唯一标识（小写），scheduler/渲染器用它查 metadata
    displayName: 'ATR',          // 显示名（日志/调试用）
    category: 'oscillator',      // 'main' | 'sub' | 'oscillator' | 'volume'
    stateKey: createATRStateKey, // string（主图常量）或 (paneId) => string（副图函数）
    defaultPaneId: 'sub_ATR',    // 默认 pane
    paneIdField: 'atrPaneId',    // 可选：configSnapshot 中存放当前 paneId 的字段名（副图需要）
    applyResult: (host, state, paneId) => {  // 可选：把计算结果写入 StateStore
        host.setSharedState(createATRStateKey(paneId), state as any, 'indicator_scheduler')
    },
})
class ATRIndicatorDefinition {
    static rendererFactory = createATRRendererPlugin  // 必填：渲染器工厂（() => RendererPluginWithHost）
}
```

主图叠加类指标（如 MA）`stateKey` 用常量、省略 `paneIdField`、`defaultPaneId: 'main'`；可切换到主图的副图指标（如 SAR）额外加 `allowMainPane: true`。

**`@Indicator` 装饰器可用 option 字段（即 `IndicatorDefinitionConfig`）——请勿臆造其它字段：**

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 指标唯一标识（小写，如 `'atr'` / `'ma'`） |
| `displayName` | 是 | 显示名（如 `'ATR'`） |
| `category` | 是 | `'main' \| 'sub' \| 'oscillator' \| 'volume'` |
| `stateKey` | 是 | `string` 或 `(paneId: string) => string`，由 `resolveStateKey()` 解析 |
| `defaultPaneId` | 是 | 默认 pane（主图 `'main'`，副图如 `'sub_ATR'`） |
| `paneIdField` | 否 | `IndicatorConfigSnapshot` 中当前 paneId 的字段名（如 `'atrPaneId'`） |
| `allowMainPane` | 否 | 副图指标是否允许切到主图（如 SAR） |
| `applyResult` | 否 | `(host, state, paneId) => void`，把 state 写入 StateStore |

外加挂在被装饰类上的 `static rendererFactory: () => RendererPluginWithHost`（**必填**，装饰器初始化时校验，缺失会抛错）。

> 渲染器内部不再硬编码 state key：通过 `host.getService<IndicatorScheduler>('indicatorScheduler').getIndicatorMetadata('atr')` 拿到 metadata，再 `resolveStateKey(meta.stateKey, paneId)` 解析——参考 `atr.ts` / `ma.ts` 的 `getXXXStateKey(...)`。

**旧 vs 新——自动化对照：**

| 旧的手动步骤（scheduler.ts 第 6 步） | 现状 |
|---|---|
| `registerIndicator(...)` 注册 | **自动**：`Chart` 遍历 `getRegisteredIndicatorDefinitions()` |
| `applyResults` 内 `if (changed.has('xxx'))` 块 | **自动**：泛型 `applyResults` 遍历 `registry.getAll()` 调 `meta.applyResult` |
| `updateVisibleStatesOnly` 加分支 | **自动**：泛型遍历注册表 |
| `buildActiveSubIndicatorMask` 加 `xxx` | **自动**：靠 `meta.paneIdField` / `meta.allowMainPane` |
| `buildActiveConfig.subKeys` 加 `'xxx'` | **自动**：遍历有 `paneIdField` 的 meta，关闭非活跃 `show*` |
| public 方法 `updateXXXConfig` | 不再需要（如需运行时改配置，走通用配置入口） |
| 计算 / worker 协议 / runtime / state 组装（步骤 2-5） | **仍需手动**（装饰器不覆盖数据管线） |

---

## 测试基础设施（一次性，PR #0 落地，后续 PR 直接复用）

| 路径 | 用途 |
|---|---|
| `src/core/indicators/__tests__/__fixtures__/synthetic.ts` | 合成 OHLC 场景：`empty`、`singleBar`、`shortSequence`、`constantPrice`、`pureUptrend`、`pureDowntrend`、`sideways`、`spikeAtBar19`、`gapUp` |
| `src/core/indicators/__tests__/__fixtures__/golden/*.json` | 离线生成的金标值（pandas-ta / TA-Lib），运行时 `import jsonValues from '...'`，**不引入 Python 运行时依赖** |
| `src/core/indicators/__tests__/__fixtures__/golden/index.ts` | JSON 加载工具 + `assertSeriesClose(actual, expected, tolerance)` |
| `src/core/indicators/__tests__/_propertyAssertions.ts` | 跨指标可复用的数学不变量断言（`assertNonNegative`、`assertBounded`、`assertWarmupThenDefined`、`assertFiniteOrUndefined`） |

---

## 每个新指标必须覆盖的 5 类测试

1. **Edge cases**：empty / single bar / shorter-than-period / period ≤ 0 / period = 1
2. **Golden values**：≥ 3 个合成 fixture 跟离线金标对照
3. **数学不变量**（typical examples）：
   - 取值范围（RSI ∈ [0,100]、ATR ≥ 0、Williams %R ∈ [-100,0]）
   - 单调性（OBV 随 sign(Δclose)）
   - 对称性（对称数据产生对称结果）
4. **Warm-up 边界**：indices `[0, period-1)` 是 undefined，自 `period-1` 起有定义
5. **Incremental ≡ batch**：`calc(slice(0, n)) ≡ calc(full).slice(0, n)`——live 数据和历史回看一致

---

## Golden values 生成

未来 PR 引入 `scripts/gen-golden.py`：
- 读 `__fixtures__/synthetic.ts` 的合成数据（导出为可被 Python 读取的 JSON）
- 调用 `pandas-ta` 或 `TA-Lib` 计算
- 写出 `__fixtures__/golden/{indicator}.json`
- CI 不跑该脚本——金标是 commit 进仓库的二进制（JSON）

PR #0 的 ATR golden 由手算 + 公式推导生成，并标注：当 `scripts/gen-golden.py` 落地后应该替换。

---

## 提交节奏建议

- 单个指标 = 单个 PR
- 一个 PR 内多个互不依赖的简单指标（如 WMA + DEMA + TEMA + HMA 同属 MA 家族）可合并
- 强依赖的指标拆成 PR 链（如 ATR → Keltner → SuperTrend，前者合并后才开后者）

---

## PR 0 (ATR) 作为蓝本

完整改动清单参见 PR #0 的 diff。摘要：

```
NEW   src/core/indicators/atrState.ts                                    25 行
NEW   src/core/indicators/__tests__/atr.test.ts                         150 行
NEW   src/core/indicators/__tests__/__fixtures__/synthetic.ts            55 行
NEW   src/core/indicators/__tests__/__fixtures__/golden/atr.json          ~40 行
NEW   src/core/indicators/__tests__/__fixtures__/golden/index.ts          45 行
NEW   src/core/indicators/__tests__/_propertyAssertions.ts                75 行
NEW   src/core/renderers/Indicator/atr.ts                                180 行  （含末尾 @Indicator 装饰器声明）
NEW   docs/CONTRIBUTING_INDICATOR.md                                  （本文档）
EDIT  src/core/indicators/calculators.ts                          + ~85 行
EDIT  src/core/indicators/workerProtocol.ts                       + 12 行
EDIT  src/core/indicators/indicatorRuntime.ts                     + 30 行
EDIT  src/core/indicators/stateComposer.ts                        + 40 行
EDIT  src/semantic/types.ts                                       + 1 行
EDIT  src/core/indicators/__tests__/scheduler.test.ts             （断言更新 + 1 测试修复）
# 注：原 `EDIT src/core/indicators/scheduler.ts +35 行` 已被 atr.ts 末尾的 @Indicator 装饰器取代，scheduler 现为泛型实现
```

PR 0 完成后，新指标的预估改动量从 ~900 行（含模板/基础设施）降到 ~300-500 行 per indicator（视复杂度）。
