# Pane 价格范围收集的读写边界

`ChartRenderer.collectPanePriceRanges` 在可见范围更新后执行，将输入读取、范围决策、帧结果发布和业务状态提交分开。

- `preparePanePriceRangeInputs` 读取模式、主图指标和轴状态，比较投影每次收集只生成一次，所有 pane 使用同一份轴状态快照。
- `resolveFramePanePriceRanges` 复用 `panePriceRange` 的范围策略，只返回各 pane 的最终范围与待初始化的锁定范围，不修改 frame 或内核。
- `applyPanePriceRangeFrame` 发布帧数据，使轴范围、百分比基准和比较折线消费同一份结果。
- `initializePendingHandRanges` 是唯一业务状态写入边界，循环结束后通过一次 Action 提交非空初始化集合。

缓存帧仍执行范围收集和比较投影计算，但不读取主图指标范围，也不初始化锁定范围。运行时 Y 轴投影继续由绘制阶段处理，仅在非缓存帧应用。

输入准备与范围决策依赖 manager 和指标 reader，属于只读操作，并非完全脱离外部环境的纯函数。纯范围策略仍集中在 `panePriceRange`，避免重复实现业务规则。
