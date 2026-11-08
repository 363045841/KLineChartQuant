# PVP/SVP 自动价格范围

PVP/SVP 使用公共 drawing 的时间锚点输出分布。此前价格范围只裁剪逻辑索引锚点，时间锚点始终参与汇总，导致屏幕外历史分布的高低价撑大主图价格轴。

绘制与价格范围统一调用 drawing 帧投影的 resolveVisibleDrawing：用当前帧真实行情、末根收盘边界及交易日历解析锚点，再通过 DrawingDefinitionRegistry.extent 与 intersectsDrawingRange 判断横向交集。两者共享坐标解析缓存、图形定义及裁剪余量，不另建时间窗口算法。

Plot 层只计算 Plot 范围，删除 drawing 范围算法及可选时间轴参数。帧范围收集阶段从正式指标 drawing 集合获取当前 Pane 的可见图元价格，并与模式及 Plot 范围合并后交给唯一的自动/锁定轴决策。主图和纯 drawing 副图均走此入口，用户绘图不参与指标自动范围。不存在缺失时间轴时全部计入的兼容分支。
