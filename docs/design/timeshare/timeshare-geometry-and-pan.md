# 分时几何与横向平移

## 内容宽度

内容宽度统一由交易日数、session 槽位数和 DPR 推导：`max(viewWidth, dayCount * sessionSlots / dpr)`。单日分时使用一个交易日，五日分时使用实际交易日数。

该规则保证每个交易槽至少占一个物理像素：宽屏完整展示，窄屏通过原有 viewport 滚动链路浏览。此前单日分时总是按视口宽度布局，并且被模式能力禁止平移；五日分时的拖动边界又依赖 DOM `scrollWidth`。

可见范围、分时 X 坐标布局和拖拽上限分别使用内容宽度、视口宽度和 kernel 的 `maxScrollLeft`。这样 DOM 尺寸同步延后时也不会影响拖拽，并且画面会只计算当前可见的数据范围。

## 五日分时共享几何

五日分时数据以 `TimeShareRange.days` 保存交易日边界，但兼容数据链路会将点列扁平化。若 renderer、网格、时间轴和十字线分别从扁平点列推断日边界，各自的取整和缺失点处理会产生坐标偏差，也会错误连接相邻交易日。

帧准备阶段是横向几何的唯一生产者。`computeFiveDayTimeShareGeometry` 按以下规则生成并封存几何：

- 每个点使用 `dayIndex * sessionSlots + intradaySlot` 定位。
- `intradaySlot` 由当前品种的 `MarketSessionConfig` 解析，缺失时仅在对应交易日内按点序回退。
- 点中心、量柱矩形、交易日起止位置、首尾边界、日间分隔线和日期标签锚点共享同一物理像素网格。
- `RenderContext` 同时携带原子 `timeShareRange` 和帧级 `fiveDayTimeShareGeometry`，renderer 不从扁平点列反推交易日。
- 十字线继续读取封存的 `kLineCenters`，不维护第二套命中坐标。

## 缩放与时间轴

分时缩放调整每个交易槽的物理宽度。缩放后内容宽度、绘制布局和可见范围自动从该状态推导；缩放中心保持对应的世界坐标，行为与 K 线缩放一致。

分时时间轴标签直接读取本帧 `kLineCenters`。标签仅在当前帧存在对应交易槽的数据柱时绘制，因此时间坐标与实际柱中心共用唯一几何来源。

## Renderer 边界

`fiveDayTimeShare` 是独立主序列 renderer，只在 `fiveDayTimeShare` dataView 激活。它复用单日分时的折线、面积和昨收线绘制原语，但按 `TimeShareRange.days` 独立创建 path，禁止跨日连接。

五日窗口的昨收虚线、面积和主图百分比轴固定使用第一交易日的 `preClose` 作为统一基准，并以全部五日价格和均价计算对称范围，避免滚动时纵轴跳变或交易日切换时出现不同基准线。后续交易日的 `preClose` 不参与五日视图基准计算。

网格线读取共享几何的 `verticalGridLineXs`，其中包含首日左边界、日间分隔线和末日右边界；时间轴读取 `labelX` 和 `tradingDate`。单日 `timeshare` 保持原有 session 时间标签和几何行为。

## 状态投影

`ChartStateKernel.setDataView('fiveDayTimeShare')` 原子投影以下 mode 实例：

- 主图 `mode:five-day-timeshare` / `fiveDayTimeShare`
- 成交量 `mode:timeshare-volume` / `volume`

五日视图允许横向平移，禁止缩放、纵向平移和轴缩放。单日分时继续禁止横向平移。

## 异常数据

- 空交易日保留日区间和日期标签，但不产生点中心或折线。
- 第一交易日缺失有效 `preClose` 时跳过整个窗口的基准虚线和面积，价格线与均价线仍可绘制。
- 非连续交易日仅按响应中的交易日顺序布局，不补自然日。
- 无法映射 session 的点按日内点序回退，不得越过该日槽位。
