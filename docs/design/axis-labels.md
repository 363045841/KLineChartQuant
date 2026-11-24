# 轴标签系统

## 背景

轴标签原本由生产者各自往帧级收集器里注册：`yAxis`、`timeAxis`、`lastPrice`、选中图元的绘图投影，
再加一处 `chartRenderer` 把上一帧的绘图标签重新注册回来。五处调用点各自决定画布、轴身份、
坐标空间、字号、颜色与数值格式，最终产生四类漂移：

- **坐标语义**：刻度用 pane 局部坐标，价签却加 `pane.top`，而右侧轴画布本身就是 pane 局部尺寸。
- **数值格式**：刻度走轴语义（百分比 / 精度 / 自定义格式），绘图价签是 `price.toFixed(2)`。
- **尺寸来源**：标签高度、文本宽度、轴宽留白各有一套规则。
- **生命周期**：标签是否出现取决于「这帧谁跑了」，因此需要一套额外的保留回填机制。

同时指标输出与参考线完全没有轴标签通道，图元标签只在选中时出现且不可配置。

## 目标

1. 生产者只表达**轴值域里的值**，不表达像素；投影、格式化、避让、物理像素对齐由模块统一完成。
2. 每帧一次全量快照，标签与更新级别、图层可见性无关。
3. 一个模块拥有标签，其他模块只交数据；新增来源只改来源清单。

## 契约

`engine/axisLabels/types.ts`：

```ts
type AxisLabel = ValueAxisLabel | TimeAxisLabel

interface ValueAxisLabel {
  kind: 'value'
  axisId: string
  role: 'tick' | 'tag' | 'marker'
  value: number          // 轴值域：价格或百分比，量纲由所属轴决定
  format?: Format        // 逐输出格式覆盖（成交量缩写等）
  background?: string    // 缺省绘制为纯文字
  note?: string          // 第二行，当前仅最新价倒计时
}

interface TimeAxisLabel {
  kind: 'time'
  role: 'tick' | 'tag' | 'marker'
  index: number          // 连续逻辑槽位
  text: string           // 时间文本按周期与市场时段格式化
  background?: string
  bold?: boolean         // 年界主刻度
}
```

`role` 是唯一的绘制行为开关：

- `tick`：不参与避让，可被带底色的标签覆盖；
- `tag`：按锚点排序参与重叠避让；
- `marker`：钉在真实锚点（最新价、十字线），不参与避让，绘制在覆盖画布。

标签不携带画布、相位、左右列信息：相位由 `role` 决定，左右列属于列几何。

## 收集

`collectAxisLabels(scopes)` 依次执行来源清单，把值标签按 `axisId` 分桶，时间标签固定归入
`TIME_AXIS`；值标签的目标轴必须存在于所属 Pane，否则抛错，不把无效标签转投其他轴。

| 来源 | 产出 |
|---|---|
| `ticksSource` | 每条可见轴按自身显示范围生成刻度 |
| `indicatorOutputsSource` | 每个可见价格定位输出的最后一个有效值 + 参考线 |
| `crosshairSource` | 活动 Pane 每条可见轴的指针价签 |
| `lastPriceSource` | K 线视图主价格轴的最新价与收盘倒计时 |
| `drawingSelectionSource` | 本帧绘图投影里选中图元的轴标签 |
| `timeAxisSource` | 时间轴刻度与十字线时间签，整帧执行一次 |

轴归属来自对象绑定（`PaneAxisSpec.objectIds`），来源不接收轴参数。

## 绘制

`paintAxisLabels(ctx, labels, column)`：布局（锚点投影 → 超界隐藏 → 自由标签避让 → 钉住标签夹紧）
后统一提交绘制原语。

- 值轴列铺满列宽，时间轴标签按文本宽度出块并夹在可视区内。
- 文字色由列调色板决定：无底色用刻度色，有底色用标签文字色。
- 尺寸、文本宽度估算、数值格式化各只有一份实现，轴宽估算与绘制共用。

轴宽由 `measureAxisLabels` 按相位分别估算，`resolveAxisWidth` 保持「只增不减」的布局规则。
标签没有跨帧保留：每帧收集的标签就是绘制输入，轴画布由 `paintAxisSurfaces` 每帧统一清空并重画，
`clearPaneSurfaces` 不再触碰轴画布——轴标签不存在两套生命周期。

绘图标签在构造收集输入时把正式投影与会话投影合并（`resolveDrawingLabels`），
拖动中的图元只存在于会话投影，轴标签因此跟随锚点，而不是停在拖动前的位置。

## 已删除的旧路径

- `renderers/impl/labels/*`、`registerAxisLabel`、`AxisLabelRegistrar`、`AxisLabelSurface`。
- `lastPrice` 的价签注册图层（价签由来源产出，图层只画点虚线）。
- 绘图标签的 WeakMap 保留与 `registerRetainedDrawingLabels` 回填。
- 帧级标签保留（`retainAxisLabels` 与两个 retained map）与轴宽估算的相位更新开关。
- `clearPaneSurfaces` 对轴画布的清理（轴表面只有一个清空与绘制入口）。
- `axisValueFormat` 的独立格式化函数（并入列投影）。
- `RenderContext.axisLabels`（公开契约，第三方自定义 renderer 不再能直接往轴推标签）。

## 相关模型修正

轴标签暴露了绘图模型的颜色漂移，同一轮一并收敛：

- `PlotPoint.color` 必填，缺省色由采集端物化（脚本 `toPlotPoint`、原生 `buildSeriesPlots`）；
  输出模型删除 `Plot.color`、`Plot.textColor`、`ArrowPlot.colorUp/colorDown`，消费端不再拼接。
- 标记文字色逐点携带（`PlotPoint.textColor`），图元端严格校验，不回落整列色。
- 显示位移不再由消费端各自相减：`plotPointAt` / `plotIndexEnd` 统一换算，填充取色由 `buildFillBands` 的位移参数负责；
  跨周期投影与填充取色共用同一组 helper。
- OHLC 的 `showLast` 在采集时物化为数据窗口，运行期模型不再携带该字段。
- 图例删除 `indicatorFormat` 闭包参数，统一读 `plot.format`。
- 帧内每轴刻度只计算一次，网格与轴标签共用同一份结果。
- 轴区间带改走绘制原语通道，与标签共用同一套合成语义。

## 决策

- **窗格外价位隐藏**，不做边缘吸附。
- **标签形状保持整列宽**，只新增避让，不改为小块。
- **文字色取单一 token**，不按底色派生对比色：CSS 颜色缺少可靠的无 DOM 解析路径，
  且当前调色板下现有标签文字色对比足够。
- **左轴只画刻度**：左轴是主轴的原始价镜像，仅在主轴为百分比语义时出现。
- **绘图标签仍只在选中时出现**：触发条件留在投影阶段，绘制端不区分来源。
