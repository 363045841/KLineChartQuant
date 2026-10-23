# Script 绘图指标统一输出

VP、Structure、Zones 由内置 Script 源码声明输入和绘图，不保留 Core 专用计算器、状态或渲染器。脚本目录经现有生成器发现，不手工维护第二份指标清单或参数默认值。

Core 不再保留专用计算 Worker、computeKey 映射与降级分支；计算经定义端口委派到 Script 服务。旧指标的主题色配置与 POC 颜色覆盖入口删除，脚本颜色由输入声明管理。通用 Alert 快照仍可由外部显式提供成交量分布数据，Chart 不再写入无来源的 VP 占位字段。

Box 直接创建公共 rectangle DrawingObject，Label 创建公共单锚点文字对象；二者通过现有 drawings 输出、时间线投影、指标归属和绘图渲染链路。坐标校验和数量限额在公共 drawing API 层声明，两个执行后端加载同一实现。

Box 使用 Pine 的创建参数顺序，支持索引和时间坐标、边框、填充及文字；Label 第一版公开价格坐标及 style_none，不将未支持的 Pine 样式静默降级。数值文字尺寸使用逻辑像素。对象不进入用户手绘文档、选中和撤销历史。

VP 使用固定回看区间，按 K 线高低区间重叠比例分配成交量，以最高量分箱为 POC，向相邻较大量分箱扩展价值区。柱宽使用 bar 数；末根由 barstate.islast 判断，不引入视口像素坐标。

Structure 使用 ta.pivothigh/pivotlow 确认摆动点，首次穿越未突破摆点产生 BOS，反向首次突破产生 CHoCH。Zones 使用三根 K 线缺口识别 FVG，以及突破前最近反向蜡烛识别 Order Block；区域在形成后监测，完全填补或穿越远端边界后停止延伸。
