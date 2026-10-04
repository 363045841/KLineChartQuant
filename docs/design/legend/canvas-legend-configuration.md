# Canvas 图例配置

## 背景

主图图例随 hover 变化。使用 `#legend` slot 时，图例文本由 Vue VDOM 在每个交互帧更新，会占用帧预算。

## 决策

`KLineChart` 提供 `legend` 配置对象，并默认由 Core 的 Canvas renderer 绘制图例。配置只覆盖稳定的展示语义：`visible` 控制显示，`visibleIndicatorIds` 控制主图指标白名单。

`#legend` slot 保留给需要完全自定义 DOM 的调用方。启用 slot 时，Canvas 图例关闭；调用方接受高频 Vue 更新成本。

## 使用方式

```vue
<KLineChart :legend="{ visible: true, visibleIndicatorIds: ['MA', 'BOLL'] }" />
```

## 配置通道

`legend` 写入 chart options，由 `optionsState` 统一持有；主图图例 Layer 每帧读取配置快照，不重建 Layer，也不维护独立配置缓存。

`visibleIndicatorIds` 与当前数据视图投影出的主图指标集合取交集：指标同时属于视图且命中白名单才显示，空数组表示不显示任何指标。`visible` 只控制 Canvas 绘制，图例上下文仍会发布给外部模板。

## 影响

默认 hover 路径只更新 Canvas，不再因为图例文本触发 Vue `flushJobs`。图例的绘制坐标、主题色和数据仍由 Core 统一管理。
