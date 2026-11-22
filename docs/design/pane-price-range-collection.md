# Pane 价格范围收集的读写边界

`ChartRenderer.collectPanePriceRanges` 在可见范围更新后执行，将输入读取、范围决策、帧结果发布和业务状态提交分开。

- `preparePanePriceRangeInputs` 读取模式、比较投影与轴状态；足迹每帧只算一次，指标输出极值按轴惰性读取，同帧同轴只调用一次。
- `resolveFramePanePriceRanges` 逐轴求主投影、收集来源并交给 `panePriceRange` 决策，只返回各轴最终范围与待初始化的手动范围，不修改 frame 或内核。
- `applyPanePriceRangeFrame` 发布帧数据，使轴范围、百分比基准和比较折线消费同一份结果。
- `initializePendingManualRanges` 是唯一业务状态写入边界，循环结束后通过一次 Action 提交非空初始化集合。

缓存帧仍执行范围收集和比较投影计算，但不读取指标输出，也不初始化手动范围。运行时 Y 轴投影继续由绘制阶段处理，仅在非缓存帧应用。

输入准备与范围决策依赖 manager 和指标 reader，属于只读操作，并非完全脱离外部环境的纯函数。纯范围策略仍集中在 `panePriceRange`，避免重复实现业务规则。

## 三档自动口径

`rangeMode` 决定哪些来源参与轴范围，`manual` 是「自动」没勾的状态：

| 模式 | 界面文案 | 参与轴范围的来源 |
|------|----------|------------------|
| `all` | 全部数据 | 主投影 + 指标极值 + 足迹 + 可见绘图 |
| `bars` | 仅缩放价格图表 | 只取主投影（价格轴是可见 K 线） |
| `ratio` | 固定 K 线占比 | 只取主投影，按 70% 占比向上下留白 |
| `manual` | 手动 | 不拟合，停在切换时保存的范围 |

`bars` / `ratio` 只对「当前模式按可见 K 线定轴」的主价格轴开放（`ChartModeHandler.fitsPriceBars`）；
其余轴只有 `all` / `manual`，可用集合随轴配置下发，宿主不自行判断。超出范围的内容照旧绘制，
落在 Pane 边缘以外的部分被画布裁掉——这是取舍本身：K 线比例稳定，指标峰值允许出界。

`manual` 的初始化按 `all` 求一次：品种切换清空范围后，首个有效帧按全并口径回填，
之后只接受平移与缩放写入。

## 可见区间极值索引

价格轴的自适应范围需要**当前可见窗口**的极值，不能退化成全序列极值：滚动时窗口滑动，轴必须跟着窗口重算。`queryPlotBounds`（`engine/plots/impl/plotBoundsIndex.ts`）把每根 Plot 的值列按 128 根一块预聚合，块表只存下界、上界与是否有值。

- 查询时首尾两个不完整的块逐根扫描，中间整块直接合并；万根可见窗口下每个 plot 从 O(可见根数) 次比较降到约 80 个整块 + 最多 256 个边界点。
- 索引按 Plot 对象缓存。每次重新收集都会生成新的 Plot 对象，滚动期间对象不变，因此纯滚动不重建索引；数据长度变化时重建。
- 聚合规则与逐根扫描完全一致：普通值列跳过非有限值；OHLC 只要存在点就参与且 `low`/`high` 非有限时原样传播 NaN；histogram / columns 的 `baseline` 仍在 `plotValueBounds` 里并入。
- `updateVisibleRangeForFrame` 在可见区间未变化时早退，索引只在跨 bar 的滚动帧上查询。索引不进入指标契约，指标仍然只输出逐 bar 的值列。
