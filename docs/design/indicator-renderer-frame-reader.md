# 指标 Renderer 帧读取边界

## 目标

指标 renderer 在绘制期间只读取当前帧绑定的指标结果快照，不通过 `PluginHost` 查询业务状态。
同一帧的所有 pane 共享同一个 `renderStates` 引用，避免一次绘制过程中切换到不同结果版本。

## 实现

`IndicatorScheduler.createRenderStateReader()` 在帧开始时捕获最近一次已提交结果，返回只读的
`IndicatorRenderStateReader`。`ChartRenderer` 每次绘制建立一个读取器，并把它放入
`RenderContext.indicatorStateReader`。

renderer 通过以下接口读取状态：

```ts
context.indicatorStateReader?.get<State>(stateKey)
```

该接口只负责渲染投影读取，不暴露 Kernel action、完整业务状态或 Scheduler 执行状态。

## 迁移结果

指标 renderer 的绘制、标题和配置读取均已脱离 Kernel resolver。Chart 不再安装指标 resolver；
PluginHost `StateStore` 仅保留给非指标插件和独立 Scheduler 的兼容投影。

## 可见行情派生状态

VOL 没有 calculator runtime，其坐标范围直接由当前可见行情的成交量派生。该范围仍由 Scheduler
写入同一份 `renderStates`，并按 `indicatorState.instances` 中每个 VOL 实例的真实 `paneId`
发布。柱体 renderer 不在绘制期间写入 `PluginHost StateStore`，坐标轴和柱体因此共享同一帧的
范围事实。

## 刻度格式与范围一致性

副图右轴在无自定义格式化时按显示范围自适应小数位，并把四舍五入后归零的负值规范为正零，
避免小量级振荡指标（如 MACD）刻度全部显示为 `-0.00`。指标柱体 renderer 复用已提交状态中的
`valueMin/valueMax`，不再自行叠加 padding，保证柱体与刻度处于同一坐标系。
