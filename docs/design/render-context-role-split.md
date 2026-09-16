# RenderContext 按角色拆成可组合子契约

`RenderContext` 由 7 个职责子契约组合而成；帧数据的类型从 `unknown[]` 收敛为 `ChartSeriesDatum`。

## 问题

原 `RenderContext` 是近 40 字段的单对象，把序列数据、几何、坐标轴、多个 Canvas2D 上下文、指标读取器、主题设置混在一起，且 `data` 是 `unknown[]`——渲染层的数据访问完全失去类型保护，是整条渲染链路的类型空洞。约 200 个调用方与测试替身都只能声明整个上下文。

## 子契约划分

| 子契约 | 职责 |
| --- | --- |
| `RenderDataContext` | 序列数据、数据视图、时间解析、对比数据、月/日键值 |
| `RenderGeometryContext` | Pane、视口、K 线位置与宽度、缩放级别 |
| `RenderAxisContext` | 本帧待绘制的轴标签与范围带、Y 轴刻度 |
| `RenderOverlayContext` | 十字线索引、标记器、绘图帧投影 |
| `RenderIndicatorContext` | 指标帧快照、Scene Renderer |
| `RenderSurfaceContext` | 主图 / 轴 / 覆盖层 Canvas2D 上下文 |
| `RenderThemeContext` | 主题、亚洲惯例、颜色预设、用户设置 |

`RenderContext` 组合以上全部，仍是 `draw(context: RenderContext)` 与帧构造处的静态类型，运行时零变化。渲染器只需其中部分能力时，参数应声明对应子契约。

## 数据定型

- `foundation/types/price.ts` 新增 `ChartSeriesDatum = KLineData | TimeShareData`。
- `RenderDataContext.data: ReadonlyArray<ChartSeriesDatum>`，替换 `unknown[]`。
- `chartRenderer.ts` 删除私有 `MarketSeriesData` 别名，帧上下文与构建函数统一用 `ChartSeriesDatum`。
- 渲染器原有的 `context.data as KLineData[]` / `as TimeShareData[]` 现在是「从有类型联合向下收窄」，不再是「从 unknown 断言」。`ichimoku` 中纯取长度的 `as unknown[]` 直接改为 `context.data.length`。

## 边界

- 纯类型重构：帧构建、Scene 绘制、时间轴绘制逻辑不变。
- 子契约经 `foundation/plugin` 类型出口导出，供后续需要窄依赖的消费方与测试替身使用；现有调用方无需改动。
