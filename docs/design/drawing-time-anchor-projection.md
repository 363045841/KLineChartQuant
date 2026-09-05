# 绘图时间锚点投影

## 决策

已确认绘图的锚点只持久化 `id`、`time` 和 `price`。`time` 是图元绑定数据序列的时间戳；`price` 是 Pane 价格坐标。`index` 不得写入 `DrawingAnchor`、导入导出快照、`drawingState` 或轴标签。

## 帧内投影

每帧由活动 `DataBuffer` 的 `getLogicalIndexAtTimestamp()` 将时间戳解析为当前逻辑索引。该索引仅存在于 `ResolvedDrawingAnchor`，用于从本帧的 `kLineCenters` 取得 X 坐标。

历史数据 prepend 后，时间戳会自然解析到新的逻辑索引。时间戳不存在或重复时解析失败，图元不复用旧位置。已解析但位于可见区间外的锚点按当前帧几何投影到屏幕外，使 Canvas 裁剪线段；端点图元与轴装饰仅为可见锚点注册，绝不以视口边缘作为替代位置。

## 轴装饰

X 轴标签注册 `timestamp` 和当前帧派生的世界 X 坐标；Y 轴标签注册 `price` 和当前帧派生的 Y 坐标。轴标签不保存或消费 `dataIndex`。
