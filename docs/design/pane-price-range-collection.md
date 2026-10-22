# Pane 价格范围收集的读写边界

`ChartRenderer.collectPanePriceRanges` 在可见范围更新后执行，将输入读取、范围决策、帧结果发布和业务状态提交分开。

- `preparePanePriceRangeInputs` 读取模式、主图指标和轴状态，比较投影每次收集只生成一次，所有 pane 使用同一份轴状态快照。
- `resolveFramePanePriceRanges` 复用 `panePriceRange` 的范围策略，只返回各 pane 的最终范围与待初始化的锁定范围，不修改 frame 或内核。
- `applyPanePriceRangeFrame` 发布帧数据，使轴范围、百分比基准和比较折线消费同一份结果。
- `initializePendingHandRanges` 是唯一业务状态写入边界，循环结束后通过一次 Action 提交非空初始化集合。

缓存帧仍执行范围收集和比较投影计算，但不读取主图指标范围，也不初始化锁定范围。运行时 Y 轴投影继续由绘制阶段处理，仅在非缓存帧应用。

输入准备与范围决策依赖 manager 和指标 reader，属于只读操作，并非完全脱离外部环境的纯函数。纯范围策略仍集中在 `panePriceRange`，避免重复实现业务规则。

## 可见区间极值索引

价格轴的自适应范围需要**当前可见窗口**的极值，不能退化成全序列极值：滚动时窗口滑动，轴必须跟着窗口重算。`queryPlotBounds`（`engine/plots/impl/plotBoundsIndex.ts`）把每根 Plot 的值列按 128 根一块预聚合，块表只存下界、上界与是否有值。

- 查询时首尾两个不完整的块逐根扫描，中间整块直接合并；万根可见窗口下每个 plot 从 O(可见根数) 次比较降到约 80 个整块 + 最多 256 个边界点。
- 索引按 Plot 对象缓存。每次重新收集都会生成新的 Plot 对象，滚动期间对象不变，因此纯滚动不重建索引；数据长度变化时重建。
- 聚合规则与逐根扫描完全一致：普通值列跳过非有限值；OHLC 只要存在点就参与且 `low`/`high` 非有限时原样传播 NaN；histogram / columns 的 `baseline` 仍在 `plotValueBounds` 里并入。
- `updateVisibleRangeForFrame` 在可见区间未变化时早退，索引只在跨 bar 的滚动帧上查询。索引不进入指标契约，指标仍然只输出逐 bar 的值列。
