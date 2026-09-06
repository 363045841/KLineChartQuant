# Center-First Frame Geometry

## 背景

图表此前先计算 `kLinePositions` 左边界，再由左边界推导中心点。分时模式的折线、量柱和十字线需要同一条时间轴基准，左边界优先会让不同渲染器再次执行 `position + width / 2`，在 DPR 取整、奇偶宽度和午休时间槽缺口下产生不同结果。

## 决策

`ChartRenderer` 以 `kLineCenters` 为一帧 X 几何的唯一基准，所有中心点均先在物理像素空间确定：

- K 线中心由交易序号、`unitPx` 和奇数 `kWidthPx` 计算。
- 分时中心由交易时段 slot 的固定整数物理像素网格计算。
- K 线实体、量柱矩形与兼容的 `kLinePositions` 都由中心点向左推导。
- 十字线的命中、吸附，以及折线、指标、标记和月份分界线直接使用 `kLineCenters`。

世界坐标投影到屏幕 X 坐标时统一执行 `round((worldX - scrollLeft) * dpr) / dpr`。滚动偏移必须先扣除，再进行物理像素对齐；Canvas2D、交互投影与 GPU shader 遵循同一顺序，禁止先对齐世界坐标再平移，否则分数滚动量和非整数 DPR 下会产生相位差。

浏览器 `scroll` 事件必须先通过 viewport action 将 DOM `scrollLeft` 写入 StateKernel，再申请完整帧。指标异步计算状态不能阻止滚动帧；渲染器继续消费最近一次已提交的指标结果，待 Worker 返回后再由指标失效回调合并后续帧。

WebGL 后端不得在顶点着色器中依赖大世界坐标与 `scrollLeft` 的减法精度。矩形实例在 CPU 双精度空间按统一投影规则转换为视口局部坐标后上传，shader 仅处理小坐标；顶点 shader 同时声明 `highp float`，确保仍使用世界坐标的折线在移动 GPU 上保持足够精度。

实体与量柱宽度保持奇数物理像素，因此左边界可使用 `centerPx - (widthPx - 1) / 2` 推导，避免半物理像素坐标和模糊边缘。分时模式使用 `floor(axisWidthPx / sessionSlots)` 作为固定 `unitPx`，多余像素均分到左右边距；量柱与主图 VOL 共用 `unitPx - gapPx` 的奇数宽度规则，因此相邻量柱间隙恒定。同中心的端点重复数据仅绘制最后一根量柱。物理宽度不足以容纳每槽一个像素时回退比例布局。

分时模式不会自动创建成交量或其他指标副图。用户已启用且声明支持分时的指标持续使用原实例、pane 和布局配置；量柱在用户启用 VOL 时与 K 线模式共用同一 renderer。

副图实例将 `instanceId`、`paneId`、canonical `indicatorId` 和 `ordinal` 分开保存。`instanceId` 供添加、更新和删除 API 使用；`paneId` 只供布局、渲染器和 StateStore 绑定使用；`indicatorId` 只表达指标能力；`ordinal` 只供显示或排序。新增副图分别生成 UUID 实例和 pane 身份，禁止再通过拼接指标名称和编号推断任何业务语义。

## 兼容性

`RenderContext.kLinePositions` 继续保留，供绘图等旧接口读取，但它是派生数据，不再作为中心点的来源。K 线实体渲染直接消费 `kLineCenters`。

## 验证

- `timeShareMath.test.ts` 验证分时 slot 中心与奇数物理像素量柱宽度。
- `interaction.dpr.test.ts` 验证十字线按封存中心点选择并吸附。
- `gridLines.mode.test.ts` 验证月份分界线使用帧级中心点。
- `logicalIndexToScreenX.test.ts` 验证分数滚动量和非整数 DPR 下的屏幕物理像素投影。
- `webglRenderer.test.ts` 验证大世界坐标在上传 WebGL 前转换为视口局部物理像素坐标。
