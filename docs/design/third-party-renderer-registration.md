# 第三方渲染层注册决策

关联：[issue #282](https://github.com/363045841/KLineChartQuant/issues/282)。
运行时契约和接入示例见 [Core 渲染架构](../rendering-pipeline.md#31-第三方-layer-与指标注册)。

## 问题

`@Indicator` 的名称受内置状态契约限制，Controller 没有实例级 Layer 操作。
此外，注册直接使用 Layer.id，查询和移除却隐式添加 `plugin:` 前缀；
Scene 移除没有释放 Layer；外部私有数据变化可能被帧内容缓存跳过。

## 决策

- 注册名称开放为第三方字符串，内置名称保留提示；IndicatorStateName 继续由内置状态契约派生。
- Controller 与插件使用同一个 ChartRendererAccess，所有操作最终落到现有 Scene。
- 查询和移除只接受完整 Layer.id。内部指标管理器显式把指标渲染名称转换为 ID，
  不保留名称/ID 双通道或自动识别逻辑。
- `requestRender()` 使内容版本缓存失效，调度复用 FrameTransaction 和 RAF。
- Scene 是已挂载 Layer 的释放所有者，移除和销毁均调用 dispose；同 ID 首个实例胜出。
- 用户指标随实例移除释放；系统 Layer 跨视图保留，由状态投影可见性。
- 插件使用现有 PluginHost 服务获取渲染能力，生命周期操作顺序执行；
  销毁停止接收新操作，等待已接受的操作，并在 Scene 释放前完成卸载。
- Controller.dispose 返回可等待的完成任务，让宿主能确认异步插件卸载结束。

## 边界

插件负责在 uninstall 中移除自有 Layer 和取消订阅；宿主负责直调 overlay 的业务生命周期，
图表销毁兜底释放剩余 Layer。未成功挂载的重复 Layer 仍归调用方所有。
不新增绘制机制，不兼容退役 RendererPlugin，不在 core 中加载外部模块。
