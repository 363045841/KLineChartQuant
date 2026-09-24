# 轴标签单帧收集模块化

## 背景

轴标签（X 轴时间标签、Y 轴价格标签、十字线签、刻度文字）此前分散在多个轴渲染器里
就地 `fillText`/`fillRect`：`chartRenderer.renderPanes` 维护裸数组，
`yAxis`/`leftYAxis`/`timeAxis`/`Indicator/scale/indicator_scale` 各自持有
`draw*Label`/`drawTimeAxis`/`drawScaleTicks` 绘制函数，格式与布局与绘制耦合。
收集语义（X 共享、Y 按 Pane 隔离、静态/overlay 画布）只存在于注释与调用点约定里。

## 决策

- 新增 `engine/axisLabels/` 模块，采用 `types.ts + impl/` 分层（对齐仓库既有语义化模块布局）。
  ready-to-draw 标签数据契约 `AxisLabel`/`AxisLabelSurface`/`AxisLabelCollector`/`AxisLabelsFrame`
  声明在 foundation（`foundation/plugin/types.ts`），以保持 **foundation 不反向依赖 engine**；
  模块 `types.ts` 按公开面重导出并补充绘制度量契约 `AxisLabelMetrics`。
- **按表面聚合是 SSOT**：`createAxisLabelsFrame()` 每帧新建，`forSurface(surface, paneId?)`
  惰性持有收集器：
  - X 表面（`xTicks`/`xCrosshair`/`xLabels`）跨 Pane 共享，忽略 paneId；
  - Y 表面（`yRightStatic`/`yRightOverlay`/`yLeftStatic`/`yLeftOverlay`）按 paneId 隔离。
- **ready-to-draw 标签**：`AxisTickLabel`（纯文本刻度）与 `AxisTagLabel`（色块 + 文本，
  含 `variant: 'label' | 'crosshair'` 基线微调、`origin` 复现各轴 clamp 原点）。
  生产者只提供“文字 + 锚点 + 样式”，不接触 canvas；文本按所在轴显示语义预先格式化。
- **最新价业务类型**：`AxisTagLabel.type = 'lastPrice'`，仅在限定周期的最新 K 线尚未结束时
  携带 `countdown`。`impl/lastPriceCountdown.ts` 按 K 线开盘时间戳和周期固定时长计算剩余时间，
  `paintAxisLabels` 在同一色块内以两行显示价格与倒计时；其他标签沿用单行布局。
- **统一写入入口**：`registerAxisLabel(context, surface, label, paneId?)`。
  刻度、十字线价签、最新价、绘图锚点全部经此写入本帧表面，不再直接操作数组。
- **统一读取/绘制入口**：`paintAxisLabels(ctx, labels, surface, metrics)` 集中布局与物理像素对齐
  （轴宽/轴高、标签色块尺寸、clamp、`roundToPhysicalPixel`/`alignToPhysicalPixelCenter`）。
  轴渲染器只负责清屏、提供画布度量与调用绘制，不再内联标签排版。
- **绘图投影不再有第二套出口**：`projectDrawingsForFrame` 不再接收可选 `axisLabelRegistrars`，
  也不在返回值里携带标签数组；它经统一入口把绘图锚点标签注册到 `xLabels`/`yRightOverlay`。
  `DrawingFrameProjection` 只保留 `primitives` 与 X/Y 范围带。
- **公开入口收口**：`engine/axisLabels/index.ts` 作为模块唯一 barrel，只做重导出；
  `chartRenderer`、`lastPrice`、`frameProjection`、各轴渲染器从该入口依赖。

## 画布与刷新级别时序（保持不变）

| 表面 | Canvas | 刷新级别 | 生产者 | 消费/绘制方 |
|------|--------|----------|--------|-------------|
| `xTicks` | 底部时间轴 | 每帧全量 | `timeAxis`（普通/分时/五日分时） | `timeAxis` |
| `xCrosshair` | 底部时间轴 | 每帧全量 | `timeAxis` | `timeAxis` |
| `xLabels` | 底部时间轴 | 每帧全量 | 绘图帧投影 | `timeAxis` |
| `yRightStatic` | 右轴静态 | Main | `yAxis`（主图）/ `indicator_scale`（副图） | 同生产者 |
| `yRightOverlay` | 右轴 overlay | Overlay | 绘图帧投影、`lastPrice`、`yAxis` 十字线 | `yAxis` overlay |
| `yLeftStatic` | 左轴静态 | Main | `leftYAxis` | `leftYAxis` |
| `yLeftOverlay` | 左轴 overlay | Overlay | `leftYAxis` 十字线 | `leftYAxis` overlay |

- 时间轴绘制顺序：`xTicks` → 范围带 → `xCrosshair` → `xLabels`。
- 右轴 overlay 绘制顺序：范围带 → `yRightOverlay`（装饰标签先注册、十字线后注册）。
- 副图 `indicator_scale` 在同一 `yRightStatic` 收集器内先注册刻度、后注册十字线。
- 十字线时间签沿用主题 `label.bg/label.text`（与既有 `drawCrosshairTimeLabel` 行为一致）。

## 边界

- 不改变 Pane 隔离 Y / 共享 X 的既有行为；外观（尺寸、clamp、像素对齐、百分比/指标格式化、
  分时/五日分时表现）与刷新级别不变。
- 不引入跨帧状态：聚合对象每帧重建，帧结束随对象释放。
- 最新价倒计时通过 ChartRenderer 的秒边界计时器请求 Overlay 重绘；无可绘制帧、收线、
  周期不支持以及销毁时停止。支持 1/5/15/30/60 分钟、4 小时与日线；日线按时间戳
  加 24 小时计算，不推断交易所收盘时间、休市或节假日。
- 不涉及绘图内部文字标签（`DrawingLabel` 等），仅覆盖轴标签。
- 范围带（`yAxisRanges`/`xAxisRanges`）语义与绘制归属不变，仍由投影返回、在轴渲染器中
  先于对应标签绘制。
- `yPaddingPx` 在轴插件选项中保留以兼容既有选项形状；其本就不参与标签文本（价签已提供
  ready-to-draw 文本），不引入回退分支。

## 影响与验证

- 轴标签的生产与绘制全部集中到 `axisLabels` 模块：旧的 `kLineDraw/axis.ts` 标签绘制函数、
  `drawScaleTicks`、`YAxisLabel`/`XAxisLabel`/`AxisLabelRegistrar` 已删除。
- 单测：
  - `axisLabels/__tests__/axisLabelCollector.test.ts`：表面隔离、X 共享、注册入口、paneId 覆盖；
  - `axisLabels/__tests__/paintAxisLabels.test.ts`：X/Y 刻度对齐、Y 价签 `label`/`crosshair`
    基线、X 时间签竖直布局；
  - `lastPrice.registrar.test.ts`：最新价经统一入口注册到 `yRightOverlay`；
  - `yAxis.renderer.test.ts`：左右轴刻度、overlay 装饰标签与十字线价签注册/绘制；
  - `frameProjection.test.ts`：图元锚点标签经统一入口写入 `xLabels`/`yRightOverlay`；
  - `timeAxis.marketSession.test.ts` / `indicatorScale.format.test.ts`：分时时段与指标自适应小数位。
- `lastPriceCountdown.test.ts`：限定周期、开收线边界、无效时间戳与时间格式。
- 验证：`pnpm type-check`；`@363045841yyt/klinechart-core` 全量单测通过。
