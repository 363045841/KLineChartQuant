# Script OHLC Plot 与美国线

## 对外接口

`plot.Candle(open, high, low, close, name, options?)` 与
`plot.Bar(open, high, low, close, name, options?)` 在 `onBar` 内逐根输出，返回 `void`。
OHLC 使用独立数据点，不借用单值 PlotPoint，也不能作为 `fill` 边界。

两者支持 `label`、`visible`、整数 `offset`、正整数 `showLast`、逐 bar 的 `color`。
蜡烛额外支持逐 bar 的 `wickColor` 和 `borderColor`；美国线只接受整体颜色。
整列元数据在一次运行内固定，颜色可以变化。宽度跟随 K 线间距，不接受 `size`。

## 与 Pine 的关系

遵循 Pine 的四价格输入顺序、任一价格缺失则整根留空、四个输入最大值作为 high、
最小值作为 low、独立实体/影线/边框颜色，以及 `void` 返回值。
本项目以 `null` 或 `NaN` 表示缺值；无穷值也使整根留空，其他错误类型直接拒绝。
涨跌颜色由脚本条件表达式提供，不自动使用主图的市场涨跌规则。

API 命名、必填 name 与 options 对象沿用本项目现有接口；不引入 Pine 的 editable/display 枚举。
默认实体颜色沿用现有 Plot 默认色，未指定的影线和边框色跟随实体；这是本项目的默认配色规则。
颜色显式传 null 隐藏该部分；实体为 null 且边框有色时得到透明内部的空心蜡烛。

`showLast` 相对整个输出列末尾计算，不随可视窗口改变；先按源下标裁剪，再应用 offset。
渲染、图例和价格范围共享同一个裁剪起点。有效 OHLC 的 high/low 用于自动缩放，图例显示 O/H/L/C。

## 共享渲染

`ohlcGeometry` 模块只接收屏幕价格坐标、中心、宽度、DPR 和形态，输出逻辑像素矩形。
所有几何先在整数物理像素空间构建。实体与边框使用不重叠矩形，避免透明色重复叠加。
实体和影线宽度沿用既有奇偶对齐及缩放档位，十字星保留一个物理像素。
美国线绘制 high/low 竖线、左开盘短横线和右收盘短横线；极窄时退化为竖线。

主图保留市场涨跌判断、主题配色、缓冲池和投影缓存；Script Plot 保留逐 bar 配色和偏移。
两者调用相同几何函数，最终都经 `drawWorldRectBatches` 走现有 GPU / Canvas2D 绘制链路。
主图设置新增 `ohlc-bar`，沿用既有 PrimaryRendererType；切换形态参与缓存版本判断。

## 验证

两种脚本后端验证四价格归一化、缺值、颜色独立性、默认值、非法参数、类型冲突和 fill 拒绝。
几何测试验证左右方向、不同 DPR 下的像素对齐和矩形不重叠。
主图测试验证形态切换使缓存失效及 GPU/Canvas 几何一致；Plot 测试验证裁剪、位移、值域和四价格图例。
