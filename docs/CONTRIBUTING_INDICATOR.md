# 贡献新指标：作者模板

本文档定义在当前 stateless + SoA + Worker 指标管线下，**新增一个指标必须修改的 7 个文件 + 1 套测试基础设施**。以 ATR（PR #0 落地的样板指标）为参考。

> 适用范围：per-bar scalar / multi-line / point-array 类指标。**结构类（HH/HL/BOS/FVG/OB 等）走另一条 marker/overlay 路径，见后续 PR 的子系统文档。**

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
| 6 | `src/core/indicators/scheduler.ts`（**改**） | 加类型 import；`VisibleSubIndicatorMask` 加 `xxx`；back-compat re-export 加 `XXXSchedulerConfig`；`getDefaultConfig` 加；`applyResults` 内 `if (changed.has('xxx'))` 块；`updateVisibleStatesOnly` 加；`buildActiveSubIndicatorMask` 加；`buildActiveConfig.subKeys` 加 `'xxx'`；加 public 方法 `updateXXXConfig` | 中 |
| 7 | `src/core/renderers/Indicator/xxx.ts`（**新**） | RendererPlugin，参考 `atr.ts`：WebGL 优先 + Canvas2D 回退，从 `pluginHost.getSharedState<XXXRenderState>(STATE_KEY)` 读，带 cache-key 防 redraw | 中 |
| 8 | `src/semantic/types.ts`（**改**） | 在 `SubIndicatorParams`（副图）或 `MainIndicatorConfig`（主图叠加）加 `XXX?: {...}` | 低 |

**worker 入口 `indicator.worker.ts` 不需要改**——它只 dispatch 到 `IndicatorRuntime.computeSeries()`，新指标自动随 runtime 升级。

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
NEW   src/core/renderers/Indicator/atr.ts                                180 行
NEW   docs/CONTRIBUTING_INDICATOR.md                                  （本文档）
EDIT  src/core/indicators/calculators.ts                          + ~85 行
EDIT  src/core/indicators/workerProtocol.ts                       + 12 行
EDIT  src/core/indicators/indicatorRuntime.ts                     + 30 行
EDIT  src/core/indicators/stateComposer.ts                        + 40 行
EDIT  src/core/indicators/scheduler.ts                            + 35 行
EDIT  src/semantic/types.ts                                       + 1 行
EDIT  src/core/indicators/__tests__/scheduler.test.ts             （断言更新 + 1 测试修复）
```

PR 0 完成后，新指标的预估改动量从 ~900 行（含模板/基础设施）降到 ~300-500 行 per indicator（视复杂度）。
