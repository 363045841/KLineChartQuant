# Center-First Frame Geometry

## 背景

图表此前先计算 `kLinePositions` 左边界，再由左边界推导中心点。分时模式的折线、量柱和十字线需要同一条时间轴基准，左边界优先会让不同渲染器再次执行 `position + width / 2`，在 DPR 取整、奇偶宽度和午休时间槽缺口下产生不同结果。

## 决策

`ChartRenderer` 以 `kLineCenters` 为一帧 X 几何的唯一基准，所有中心点均先在物理像素空间确定：

- K 线中心由交易序号、`unitPx` 和奇数 `kWidthPx` 计算。
- 分时中心由交易时段 slot 的固定整数物理像素网格计算。
- K 线实体、量柱矩形与兼容的 `kLinePositions` 都由中心点向左推导。
- 十字线的命中、吸附，以及折线、指标、标记和月份分界线直接使用 `kLineCenters`。

实体与量柱宽度保持奇数物理像素，因此左边界可使用 `centerPx - (widthPx - 1) / 2` 推导，避免半物理像素坐标和模糊边缘。分时模式使用 `floor(axisWidthPx / sessionSlots)` 作为固定 `unitPx`，多余像素均分到左右边距；量柱与主图 VOL 共用 `unitPx - gapPx` 的奇数宽度规则，因此相邻量柱间隙恒定。同中心的端点重复数据仅绘制最后一根量柱。物理宽度不足以容纳每槽一个像素时回退比例布局。

分时模式不会自动创建成交量或其他指标副图。用户已启用且声明支持分时的指标持续使用原实例、pane 和布局配置；量柱在用户启用 VOL 时与 K 线模式共用同一 renderer。

副图实例将 `instanceId`、`paneId`、canonical `indicatorId` 和 `ordinal` 分开保存。`instanceId` 供添加、更新和删除 API 使用；`paneId` 只供布局、渲染器和 StateStore 绑定使用；`indicatorId` 只表达指标能力；`ordinal` 只供显示或排序。新增副图分别生成 UUID 实例和 pane 身份，禁止再通过拼接指标名称和编号推断任何业务语义。

## 兼容性

`RenderContext.kLinePositions` 继续保留，供绘图等旧接口读取，但它是派生数据，不再作为中心点的来源。K 线实体渲染直接消费 `kLineCenters`。

## 验证

- `timeShareMath.test.ts` 验证分时 slot 中心与奇数物理像素量柱宽度。
- `interaction.dpr.test.ts` 验证十字线按封存中心点选择并吸附。
- `gridLines.mode.test.ts` 验证月份分界线使用帧级中心点。
