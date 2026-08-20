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
