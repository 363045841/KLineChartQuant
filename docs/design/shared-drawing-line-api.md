# 公共绘图对象与 line API

首批实现 Pine 风格 line API。共享对象和 API 放在 Apache-2.0 的 plot-contracts，core 与 script 直接消费同一种 DrawingObject，不建立脚本专用渲染模型。

## 对象与 API

DrawingObject、锚点、样式和标签只有一个定义。createDrawingObjectApi 统一实现单个及批量创建、修改、复制、删除和权威替换；createDrawingLineApi 只负责 Pine 参数与这些公共对象操作之间的映射。手绘 DrawingDocument 的全部正式图元 CRUD 已迁入该公共对象服务，不保留另一套模型操作实现。

对象仓库只有读取和完整快照替换能力。Kernel 的旧单对象增删改 Action 已删除，图形与选择经 commitDocument 原子提交。line 的新建与超限回收也合为一次快照写入。用户文档负责锁定、选择与撤销策略，公共对象服务不感知交互；VM 使用同一份源码的生成物，不复制逻辑。

line.new 支持两点与四坐标重载，chart.point 是值对象。所有输入中的锚点、样式、标签、参数都复制后提交，冻结仓库快照不会反向冻结调用方输入。

时间坐标使用毫秒；bar_index 保留为本次运行数据的 logicalIndex。用户手绘时间锚点在历史数据 prepend 后仍按时间定位；脚本重算重新建立索引对象。

line 对象显式保存 xloc，坐标解析按坐标语义分派，不按指标或用户归属分派；ownerId 仅决定生命周期归属和交互权限。

帧时间轴解析器是 RenderDataContext 的必需契约；未知未来日期通过 null 明确表达，而不是让时间轴能力本身可选。未来坐标由交易日历提供槽位；历史槽位间允许插值，不能按最近两根的时间差猜测休市时段。

## 生命周期和交互

指标对象保存在计算结果中，帧投影按指标实例绑定 ownerId、pane 和 workspace。它们与用户对象共同进入 DrawingStore、图形定义、投影与 primitive renderer。指标卸载后不再提供对象，不需要第二份状态。

指标隐藏在 ChartIndicatorManager 的渲染输出边界按 instanceId 统一处理：快照和状态读取器只提供未隐藏实例的完整输出。Plot、drawing 和价格范围共用该可见输出，不按 line 或未来绘图 API 维护白名单。隐藏保留内部计算结果，恢复显示复用原结果；可见快照按实例状态与计算投影引用缓存，隐藏变化也会使 drawing 帧版本失效并清除旧画面。

ownerId 存在即禁用选择、锚点、拖拽、框选和标签编辑。用户文档、持久化与撤销只管理用户对象，指标重算不写入用户历史。locked 保留用户绘图的移动锁定语义。

## 颜色与默认值归属

颜色由创建入口决定一次：脚本 `line.new` 使用 `Color.Blue`，手绘工具在 `drawingToolStyle()` 给出完整样式，Plot 在 `PlotCollector` 补齐默认色。`DrawingStyle.stroke` 是必需字段，`DrawingObjectInput`、`CreateDrawingInput` 与 `DrawingPrimitive` 都必须携带完整样式；公共对象服务、文档模型、帧投影和 renderer 直接读取，不存在第二套默认色或绘制期回退。`fill` / `textColor` 保留为显式覆盖，缺省跟随 `stroke`，这是模型语义而不是默认值。

## 执行与限额

line.all 按创建顺序提供只读引用快照。默认保留 50 条，通过 max_lines_count 配置到 500；超限回收最旧对象。重复删除无操作，已删除对象数值读取返回 NaN。get_price 只接受 bar_index，按无限直线计算，与 extend 无关；垂直线返回 NaN。

bar_index 坐标必须落在当前已执行的 K 线范围内，向右最多允许 500 个未来槽位，越界在 API 边界报错。这条校验拦住把毫秒时间戳误传给默认 xloc 的写法；需要跨历史定位时仍应使用 bar_time。

线延伸和箭头由公共绘制层处理。相同端点不绘制；na 坐标保留 ID，投影时跳过。

现有执行器每次重算使用独立 VM，历史与实时更新都从输入行情确定性重放，不跨运行保存 VM 对象。本批不引入另一套增量执行或 rollback 状态。
