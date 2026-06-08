# 项目架构（ResizeObserver 重构版 / 2026-05）

本文档描述当前仓库中 K 线渲染链路的**实际实现**，重点覆盖“基于 ResizeObserver 的尺寸/DPR 统一重构”。

## 1. 目标与核心原则

当前架构围绕三个目标设计：

1. **清晰绘制**：Canvas 物理像素尺寸始终与当前 DPR 对齐，避免模糊和亚像素漂移。
2. **单一真源**：尺寸与 DPR 统一由 `Chart` 内部维护，避免组件层和核心层各算一套。
3. **渲染/交互一致**：绘制使用的 viewport 与交互命中使用的边界来自同一数据源。

---

## 2. 分层与职责

### Vue 层（`src/components/KLineChart.vue`）

职责：
- 挂载容器 DOM 与 canvas 引用
- 创建 `Chart` 实例
- 转发 pointer / wheel / scroll 事件到 `InteractionController`
- 维护 tooltip 等响应式 UI 状态
- 接收 `chart.setOnViewportChange` 回调，同步 `viewportDpr` 到 Vue

Vue 层**不再**自行做 ResizeObserver 尺寸监听，不再维护独立防抖 resize 管线。

### Core 层（`src/core/*`）

- `chart.ts`：总控（viewport、布局、调度、绘制）
- `controller/interaction.ts`：交互命中与十字线
- `paneRenderer.ts`：pane 对应 canvas 的物理尺寸设置
- `viewport/viewport.ts`：可视数据范围计算
### Plugin 子系统（`src/plugin/*`）

职责拆分：
- `PluginHost`：聚合事件总线、hook、配置与共享状态，提供统一宿主 API
- `HookSystem`：按优先级执行 hook，默认容错；关键生命周期可开启严格模式向上抛错
- `ConfigManager`：维护插件运行配置与默认配置，插件卸载时同步清理
- `RendererPluginManager`：按 pane + global 维度缓存渲染器，负责渲染调度与 resize/dataUpdate 通知

关键约束：
- `render(paneId)` 只返回业务渲染器（排除 `isSystem`）
- `renderPlugin(name)` 用于系统渲染器按时机单独绘制
- `notifyResize` 会通知当前 pane 的已启用渲染器（包含 system renderer）

---

## 3. Canvas 结构与坐标体系

每个 pane 由两张 canvas 组成：
- `plotCanvas`：K 线/指标主体绘制
- `yAxisCanvas`：价格轴与相关标签

全局一张：
- `xAxisCanvas`：底部时间轴

坐标体系：
- 逻辑尺寸（CSS px）用于布局和交互
- 物理尺寸（device px）用于 `canvas.width/height`
- 绘制前统一 `ctx.scale(dpr, dpr)`，渲染代码仍按逻辑坐标书写

---

## 4. 新的 ResizeObserver 统一链路

核心在 `src/core/chart.ts`：

### 4.1 观察器初始化
- `Chart` 构造时调用 `initResizeObserver()`
- 监听目标：`container`
- 优先尝试 `device-pixel-content-box`，不支持时回退默认 `observe`

### 4.2 观测数据更新
在 observer 回调中：
1. 读取 CSS 尺寸（`entry.contentRect`）→ `observedSize`
2. 读取 `devicePixelContentBoxSize/contentBoxSize` 计算 `preciseDpr`
3. 对比前后 width/height/dpr
4. 任一变化则立即执行 `chart.resize()`

### 4.3 DPR 决策
`getEffectiveDpr()` 逻辑：
- 优先 `preciseDpr`
- 回退 `window.devicePixelRatio`
- 做 1/64 精度吸附
- 最小值钳制到 1

> 注意：这里不再优先复用旧 `viewport.dpr`，避免 DPR 变化后被旧值“锁住”导致模糊。

### 4.4 viewport 产出与分发
`computeViewport()`：
- 尺寸来源优先 `observedSize`，回退 `container.clientWidth/clientHeight`
- 计算 `viewWidth/viewHeight/plotWidth/plotHeight/scrollLeft/dpr`
- 应用 `MAX_CANVAS_PIXELS` 上限，超限时降低 dpr
- 同步设置 `canvasLayer` 与 `xAxisCanvas` 物理尺寸
- 更新 `this.viewport`
- 触发 `onViewportChange?.(vp)`（供 Vue 层同步 DPR）

---

## 5. 渲染主链路

入口与流程：
- 触发：数据更新、交互、resize、配置变更
- `scheduleDraw()`：RAF 合并
- `draw()`：
  1. `computeViewport()`
  2. `getVisibleRange(...)`
  3. `calcKLinePositions(...)`
  4. `interaction.setKLinePositions(...)`
  5. 遍历 pane：清空 + 插件渲染
  6. 单独渲染时间轴插件

关键点：
- `zoomAt/calcKLinePositions/getContentWidth` 已统一使用 `getEffectiveDpr()`
- 避免不同模块各自读取 `window.devicePixelRatio` 导致漂移
- pane 绘制走 `rendererPluginManager.render(paneId, context)`（自动排除 system 渲染器）
- 时间轴等系统层走 `rendererPluginManager.renderPlugin(name, context)` 单独调度

---

## 6. Pane 布局与插件 resize 生命周期

`layoutPanes()` 负责：
- 计算各 pane 高度
- `pane.setLayout(...)` 与主副图 padding
- `renderer.resize(vp.plotWidth, h, vp.dpr)` 设置 plot/yAxis canvas 物理尺寸
- 调用 `rendererPluginManager.notifyResize(pane.id, wrapPaneInfo(pane))`

当前语义：
- `notifyResize` 通知的是“当前 pane + global”的已启用渲染器
- 与 `render()` 不同，resize 通知不会排除 `isSystem` 渲染器（便于 system renderer 更新内部缓存）

---

## 7. 交互链路（与 viewport 对齐）

`src/core/controller/interaction.ts` 中：
- 鼠标坐标仍来自 `getBoundingClientRect()`（用于屏幕坐标转容器坐标）
- 命中边界优先使用 `chart.getViewport()` 的 `plotWidth/plotHeight`
- dpr 使用 `chart.getCurrentDpr()`

这样交互命中和绘制边界基于同一 viewport，降低跨缩放场景偏移。

---

## 8. Vue 侧与 Core 侧的同步点

`KLineChart.vue` 当前关键同步：
- `chart.setOnZoomChange(...)`：缩放时同步 `kWidth/kGap/scrollLeft`
- `chart.setOnViewportChange(...)`：同步 `viewportDpr`
- `totalWidth` 计算使用 `viewportDpr` + `getPhysicalKLineConfig(...)`

这保证 scroll-content 宽度与实际渲染像素策略一致。

---

## 9. 当前已知限制

1. `npm run type-check` 当前仍有历史类型问题（`import.meta.env` 相关），与本次链路重构无直接关系。
2. 若浏览器不支持 `devicePixelContentBoxSize`，会回退 `window.devicePixelRatio`。
3. 在超大视口下会触发 `MAX_CANVAS_PIXELS` 限制，DPR 可能被主动降低以控制内存。

---

## 10. 验证清单（建议）

1. 浏览器缩放（80/100/125/150）下线条清晰度
2. 跨屏拖拽（1x/1.5x/2x）后是否立即恢复清晰
3. 容器 resize 时是否无闪烁、无错位
4. 缩放后十字线、tooltip、marker 命中是否仍对齐
5. 主图/副图 pane 高度变化时插件是否正确响应

---

## 11. Indicator Metadata Composition

`packages/core/src/engine/indicators/` 实现了元数据驱动的指标状态组合架构。

### 核心原则

- `@Indicator` 装饰器是**行为入口**：
  - `mainPane.composeRenderState` — 主图指标渲染状态组合
  - `mainPane.computePriceRange` — 主图指标价格范围计算
  - `visibleState.compose` — 副图指标可见范围状态组合
  - `applyResult` — 计算结果写入 StateStore
- `stateComposer.ts` 负责**编排**，不拥有每个指标的行为
- renderer（`packages/core/src/engine/renderers/Indicator/*.ts`）只消费 StateStore，不拥有状态组合逻辑

### visibleState.compose 契约

```ts
type IndicatorVisibleStateComposer = (context: {
  bundle: IndicatorSeriesBundle  // Worker 返回的 series 数据
  visibleRange: { start: number; end: number }
  timestamp: number
  active: boolean                 // 该指标是否在当前视图启用
}) => unknown                     // 返回完整的 render state 对象
```

返回的对象包含：`timestamp`、`series`、`params`、`valueMin`、`valueMax`、`visibleMin`、`visibleMax`，以及每个指标特有的额外字段（如 MACD 的 `latestValues`）。

### 组合器工厂分类

| 工厂 | 策略 | 适用指标 |
|------|------|----------|
| `createSparseVisibleStateComposer` | 简单极值 + 5% padding | wma, dema, tema, hma, kama, roc, chaikinVol, obv, pvt, vwap |
| `createFixedRangeSparseVisibleStateComposer` | 固定 valueMin/valueMax | rsi, fastk, mfi, wmsr, cmf |
| `createFixedRangePointVisibleStateComposer` | 固定范围 + 结构化点 | stoch |
| `createFixedRangeRecordVisibleStateComposer` | 固定范围 + Record series | rsi (multi-period) |
| `createPaddedSparseVisibleStateComposer` | 对称 abs padding (10%) | mom |
| `createPaddedPointVisibleStateComposer` | 点数组 + range padding | kst |
| `createNonNegativeSparseVisibleStateComposer` | valueMin=0, upper padding | atr, hv, parkinson, vma |
| `createMACDVisibleStateComposer` | abs padding + latestValues | macd |
| `createDualSparseVisibleStateComposer` | 合并 series + signalSeries | trix |
| `createValuePointVisibleStateComposer` | maFamilyBounds (5%) | sar, supertrend, ichimoku |
| `createBandVisibleStateComposer` | min(lower)+max(upper) + 5% | keltner, donchian |
| `createExactRangePointVisibleStateComposer` | valueMin/Max = 实际极值 | pivot, fib |
| `createFixedUnitVisibleStateComposer` | 固定 [0, 1] | structure, zones |
| `createVolumeProfileVisibleStateComposer` | bin 范围 + val/vah | volumeProfile |
| `createCCIVisibleStateComposer` | clamp to [-150, 150] | cci |

35 个副图指标全部通过 `visibleState.compose` 注册，`stateComposer.ts` 中无硬编码状态逻辑。

### 新增副图指标

新增副图指标必须在 `@Indicator(...)` 中提供 `visibleState: { compose: ... }`，并将 ID 加入 `METADATA_VISIBLE_STATE_INDICATOR_IDS`。

---

## 12. 关键文件索引

- `src/core/chart.ts`：observer + viewport + render pipeline
- `src/core/controller/interaction.ts`：命中与 crosshair 逻辑
- `src/core/paneRenderer.ts`：canvas 物理尺寸设置
- `src/components/KLineChart.vue`：Vue 与 Core 对接入口
- `src/plugin/rendererPluginManager.ts`：插件渲染与 resize 通知
- `src/plugin/HookSystem.ts`：hook 调度与错误策略
- `src/plugin/PluginHost.ts`：插件宿主 API 与生命周期桥接
- `src/plugin/ConfigManager.ts`：插件配置与默认值存储/清理
