# 区间选框共用已提交帧几何

区间时间边界继续由 StateKernel.interaction.rangeSelection 唯一持有。旧实现由 Vue 订阅 viewport 后筛选可见索引变化，再读取实时宽度、间隙、DPR 和缓冲偏移独立拼接坐标。连续缩放时，原生滚动逐帧提交，选框却可能仍使用旧尺寸，造成来回跳动。

ChartRenderer 通过 FrameTransaction.select 发布只读 frameGeometry，直接引用当前绘制使用的 viewSnapshot、viewport 和 data。它在绘制与原生滚动提交完成后通知；跳过绘制时保留原引用，清屏时发布 null。没有第二份可写的几何状态或独立动画。

选框只在有选区时订阅 frameGeometry，根据该帧数据解析时间边界，使用 viewSnapshot.worldAtIndex 的统一中心投影和实体物理宽度生成边界。Vue 只转换为 CSS，删除 viewportEpoch、可见索引刷新过滤和独立网格计算。数据 prepend 时也按该帧数据重新定位，避免新索引与旧几何混用。

验证覆盖可见索引不变的连续缩放、不同 DPR 下的实体边界对齐、反向选择、数据 prepend 与空选区；帧事务原有测试验证绘制完成后发布和失败不发布的时序。
