<!-- 此文件由 pnpm docs:script:generate 从 Script 编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API

本文与代码提示框使用同一份类型契约和注释。修改源码注释后运行 `pnpm docs:script:generate`，使用 `pnpm docs:script:check` 校验同步状态。

## 目录

- [Color](#api-0)
- [Color.Red](#api-1)
- [Color.DeepOrange](#api-2)
- [Color.Orange](#api-3)
- [Color.Amber](#api-4)
- [Color.Yellow](#api-5)
- [Color.Lime](#api-6)
- [Color.LightGreen](#api-7)
- [Color.Green](#api-8)
- [Color.Teal](#api-9)
- [Color.Cyan](#api-10)
- [Color.LightBlue](#api-11)
- [Color.Blue](#api-12)
- [Color.Indigo](#api-13)
- [Color.Purple](#api-14)
- [Color.Pink](#api-15)
- [Color.Brown](#api-16)
- [Color.BlueGray](#api-17)
- [Color.Gray](#api-18)
- [Color.White](#api-19)
- [Color.Black](#api-20)
- [LineStyle](#api-21)
- [LineStyle.style_solid](#api-22)
- [LineStyle.style_dashed](#api-23)
- [LineStyle.style_dotted](#api-24)
- [LineStyle.style_arrow_left](#api-25)
- [LineStyle.style_arrow_right](#api-26)
- [LineStyle.style_arrow_both](#api-27)
- [extend](#api-28)
- [extend.none](#api-29)
- [extend.left](#api-30)
- [extend.right](#api-31)
- [extend.both](#api-32)
- [xloc](#api-33)
- [xloc.bar_index](#api-34)
- [xloc.bar_time](#api-35)
- [DataSource](#api-36)
- [DataSource.Binance](#api-37)
- [DataSource.Gotdx](#api-38)
- [DataSource.BaoStock](#api-39)
- [DataSource.TradingView](#api-40)
- [DataSource.MT5](#api-41)
- [DataSource.THS](#api-42)
- [DataSource.Mock](#api-43)
- [Timeframe](#api-44)
- [Timeframe.Minute1](#api-45)
- [Timeframe.Minute5](#api-46)
- [Timeframe.Minute15](#api-47)
- [Timeframe.Minute30](#api-48)
- [Timeframe.Hour1](#api-49)
- [Timeframe.Hour4](#api-50)
- [Timeframe.Day](#api-51)
- [Timeframe.Week](#api-52)
- [Timeframe.Month1](#api-53)
- [Timeframe.Month3](#api-54)
- [Timeframe.Month12](#api-55)
- [PlotKind](#api-56)
- [PlotKind.Line](#api-57)
- [PlotKind.LineBR](#api-58)
- [PlotKind.StepLine](#api-59)
- [PlotKind.StepLineBR](#api-60)
- [PlotKind.Histogram](#api-61)
- [PlotKind.Columns](#api-62)
- [PlotKind.Points](#api-63)
- [PlotKind.Shape](#api-64)
- [PlotKind.Char](#api-65)
- [PlotKind.Arrow](#api-66)
- [PlotKind.Candle](#api-67)
- [PlotKind.Bar](#api-68)
- [Format](#api-69)
- [Format.Price](#api-70)
- [Format.Volume](#api-71)
- [Format.Percent](#api-72)
- [Format.Mintick](#api-73)
- [ShapeStyle](#api-74)
- [ShapeStyle.XCross](#api-75)
- [ShapeStyle.Cross](#api-76)
- [ShapeStyle.Circle](#api-77)
- [ShapeStyle.Square](#api-78)
- [ShapeStyle.Diamond](#api-79)
- [ShapeStyle.TriangleUp](#api-80)
- [ShapeStyle.TriangleDown](#api-81)
- [ShapeStyle.ArrowUp](#api-82)
- [ShapeStyle.ArrowDown](#api-83)
- [ShapeStyle.LabelUp](#api-84)
- [ShapeStyle.LabelDown](#api-85)
- [ShapeStyle.Flag](#api-86)
- [ShapeLocation](#api-87)
- [ShapeLocation.AboveBar](#api-88)
- [ShapeLocation.BelowBar](#api-89)
- [ShapeLocation.Top](#api-90)
- [ShapeLocation.Bottom](#api-91)
- [ShapeLocation.Absolute](#api-92)
- [ShapeSize](#api-93)
- [ShapeSize.Auto](#api-94)
- [ShapeSize.Tiny](#api-95)
- [ShapeSize.Small](#api-96)
- [ShapeSize.Normal](#api-97)
- [ShapeSize.Large](#api-98)
- [ShapeSize.Huge](#api-99)
- [console](#api-100)
- [console.log](#api-101)
- [console.info](#api-102)
- [console.warn](#api-103)
- [console.error](#api-104)
- [console.debug](#api-105)
- [open](#api-106)
- [high](#api-107)
- [low](#api-108)
- [close](#api-109)
- [volume](#api-110)
- [time](#api-111)
- [bar_index](#api-112)
- [bar_index.toString](#api-113)
- [bar_index.toFixed](#api-114)
- [bar_index.toExponential](#api-115)
- [bar_index.toPrecision](#api-116)
- [bar_index.valueOf](#api-117)
- [bar_index.toLocaleString](#api-118)
- [line](#api-119)
- [line.style_solid](#api-120)
- [line.style_dashed](#api-121)
- [line.style_dotted](#api-122)
- [line.style_arrow_left](#api-123)
- [line.style_arrow_right](#api-124)
- [line.style_arrow_both](#api-125)
- [line.new](#api-126)
- [line.all](#api-127)
- [line.set_xy1](#api-128)
- [line.set_xy2](#api-129)
- [line.set_x1](#api-130)
- [line.set_y1](#api-131)
- [line.set_x2](#api-132)
- [line.set_y2](#api-133)
- [line.set_color](#api-134)
- [line.set_style](#api-135)
- [line.set_width](#api-136)
- [line.set_extend](#api-137)
- [line.get_x1](#api-138)
- [line.get_y1](#api-139)
- [line.get_x2](#api-140)
- [line.get_y2](#api-141)
- [line.get_color](#api-142)
- [line.get_style](#api-143)
- [line.get_width](#api-144)
- [line.get_extend](#api-145)
- [line.get_price](#api-146)
- [line.copy](#api-147)
- [line.delete](#api-148)
- [chart](#api-149)
- [chart.point](#api-150)
- [chart.point.new](#api-151)
- [chart.point.now](#api-152)
- [chart.point.from_index](#api-153)
- [chart.point.from_time](#api-154)
- [chart.point.copy](#api-155)
- [ta](#api-156)
- [ta.rising](#api-157)
- [ta.falling](#api-158)
- [ta.change](#api-159)
- [ta.sma](#api-160)
- [ta.sum](#api-161)
- [ta.highest](#api-162)
- [ta.lowest](#api-163)
- [ta.highestbars](#api-164)
- [ta.lowestbars](#api-165)
- [ta.rma](#api-166)
- [ta.swma](#api-167)
- [ta.alma](#api-168)
- [ta.stddev](#api-169)
- [ta.ema](#api-170)
- [ta.dema](#api-171)
- [ta.tema](#api-172)
- [ta.t3](#api-173)
- [ta.trima](#api-174)
- [ta.macd](#api-175)
- [ta.wma](#api-176)
- [ta.hma](#api-177)
- [ta.linreg](#api-178)
- [ta.cci](#api-179)
- [ta.vwma](#api-180)
- [ta.rsi](#api-181)
- [ta.stoch](#api-182)
- [ta.atr](#api-183)
- [ta.supertrend](#api-184)
- [ta.mom](#api-185)
- [ta.roc](#api-186)
- [ta.cmo](#api-187)
- [ta.crossover](#api-188)
- [ta.crossunder](#api-189)
- [Position](#api-190)
- [Position.Main](#api-191)
- [Position.Sub](#api-192)
- [input](#api-193)
- [input.int](#api-194)
- [input.float](#api-195)
- [input.bool](#api-196)
- [input.string](#api-197)
- [input.timeframe](#api-198)
- [defineIndicator](#api-199)
- [derive](#api-200)
- [plot](#api-201)
- [plot.Line](#api-202)
- [plot.LineBR](#api-203)
- [plot.StepLine](#api-204)
- [plot.StepLineBR](#api-205)
- [plot.Histogram](#api-206)
- [plot.Columns](#api-207)
- [plot.Point](#api-208)
- [plot.Shape](#api-209)
- [plot.Char](#api-210)
- [plot.Arrow](#api-211)
- [plot.Candle](#api-212)
- [plot.Bar](#api-213)
- [fill](#api-214)
- [defineLibrary](#api-215)
- [importLibrary](#api-216)
- [request](#api-217)
- [request.security](#api-218)
- [syminfo](#api-219)
- [syminfo.tickerid](#api-220)

## 全局 API

<a id="api-0"></a>

### Color

```ts
Color: typeof Color
```

**@summary** 常用色

常用色：色相顺序取自 Material Design 400 色阶，中性色单独取值。

脚本里用 `Color.Red` 即可，取值与同名字面量完全一致。

<a id="api-1"></a>

### Color.Red

```ts
Color.Red = "#ef5350"
```

**@summary** 红

<a id="api-2"></a>

### Color.DeepOrange

```ts
Color.DeepOrange = "#ff7043"
```

**@summary** 深橙

<a id="api-3"></a>

### Color.Orange

```ts
Color.Orange = "#ffa726"
```

**@summary** 橙

<a id="api-4"></a>

### Color.Amber

```ts
Color.Amber = "#ffca28"
```

**@summary** 琥珀

<a id="api-5"></a>

### Color.Yellow

```ts
Color.Yellow = "#ffee58"
```

**@summary** 黄

<a id="api-6"></a>

### Color.Lime

```ts
Color.Lime = "#d4e157"
```

**@summary** 青柠

<a id="api-7"></a>

### Color.LightGreen

```ts
Color.LightGreen = "#9ccc65"
```

**@summary** 浅绿

<a id="api-8"></a>

### Color.Green

```ts
Color.Green = "#66bb6a"
```

**@summary** 绿

<a id="api-9"></a>

### Color.Teal

```ts
Color.Teal = "#26a69a"
```

**@summary** 蓝绿

<a id="api-10"></a>

### Color.Cyan

```ts
Color.Cyan = "#26c6da"
```

**@summary** 青

<a id="api-11"></a>

### Color.LightBlue

```ts
Color.LightBlue = "#29b6f6"
```

**@summary** 浅蓝

<a id="api-12"></a>

### Color.Blue

```ts
Color.Blue = "#42a5f5"
```

**@summary** 蓝

<a id="api-13"></a>

### Color.Indigo

```ts
Color.Indigo = "#5c6bc0"
```

**@summary** 靛蓝

<a id="api-14"></a>

### Color.Purple

```ts
Color.Purple = "#ab47bc"
```

**@summary** 紫

<a id="api-15"></a>

### Color.Pink

```ts
Color.Pink = "#ec407a"
```

**@summary** 粉

<a id="api-16"></a>

### Color.Brown

```ts
Color.Brown = "#8d6e63"
```

**@summary** 棕

<a id="api-17"></a>

### Color.BlueGray

```ts
Color.BlueGray = "#78909c"
```

**@summary** 蓝灰

<a id="api-18"></a>

### Color.Gray

```ts
Color.Gray = "#808080"
```

**@summary** 灰

<a id="api-19"></a>

### Color.White

```ts
Color.White = "#ffffff"
```

**@summary** 白

<a id="api-20"></a>

### Color.Black

```ts
Color.Black = "#000000"
```

**@summary** 黑

<a id="api-21"></a>

### LineStyle

```ts
LineStyle: typeof LineStyle
```

手绘与脚本共用的对象、坐标、样式和 Pine 风格 line API 契约。

<a id="api-22"></a>

### LineStyle.style_solid

```ts
LineStyle.style_solid = "solid"
```

**@summary** 实线

<a id="api-23"></a>

### LineStyle.style_dashed

```ts
LineStyle.style_dashed = "dashed"
```

**@summary** 虚线

<a id="api-24"></a>

### LineStyle.style_dotted

```ts
LineStyle.style_dotted = "dotted"
```

**@summary** 点线

<a id="api-25"></a>

### LineStyle.style_arrow_left

```ts
LineStyle.style_arrow_left = "arrow_left"
```

**@summary** 左箭头

<a id="api-26"></a>

### LineStyle.style_arrow_right

```ts
LineStyle.style_arrow_right = "arrow_right"
```

**@summary** 右箭头

<a id="api-27"></a>

### LineStyle.style_arrow_both

```ts
LineStyle.style_arrow_both = "arrow_both"
```

**@summary** 双箭头

<a id="api-28"></a>

### extend

```ts
extend: typeof extend
```

延伸沿两锚点的参数方向，与屏幕左右方向无关。

<a id="api-29"></a>

### extend.none

```ts
extend.none = "none"
```

**@summary** 不延伸

<a id="api-30"></a>

### extend.left

```ts
extend.left = "left"
```

**@summary** 延伸至起点之外

<a id="api-31"></a>

### extend.right

```ts
extend.right = "right"
```

**@summary** 延伸至终点之外

<a id="api-32"></a>

### extend.both

```ts
extend.both = "both"
```

**@summary** 两端延伸

<a id="api-33"></a>

### xloc

```ts
xloc: typeof xloc
```

决定 X 是第几根 K 线还是毫秒时间戳。

bar_index 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
允许范围是 0 到当前 bar_index，再向右最多 500 根；越界直接报错。
要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。

<a id="api-34"></a>

### xloc.bar_index

```ts
xloc.bar_index = "bar_index"
```

**@summary** 第几根 K 线

<a id="api-35"></a>

### xloc.bar_time

```ts
xloc.bar_time = "bar_time"
```

**@summary** 毫秒时间戳

<a id="api-36"></a>

### DataSource

```ts
DataSource: typeof DataSource
```

**@summary** 数据源

内置数据源身份；指定后严格路由，不做跨来源回退。

<a id="api-37"></a>

### DataSource.Binance

```ts
DataSource.Binance = "binance"
```

**@summary** 币安

<a id="api-38"></a>

### DataSource.Gotdx

```ts
DataSource.Gotdx = "gotdx"
```

**@summary** 通达信

<a id="api-39"></a>

### DataSource.BaoStock

```ts
DataSource.BaoStock = "baostock"
```

**@summary** 证券宝

<a id="api-40"></a>

### DataSource.TradingView

```ts
DataSource.TradingView = "tradingview"
```

**@summary** TradingView

<a id="api-41"></a>

### DataSource.MT5

```ts
DataSource.MT5 = "mt5"
```

**@summary** MetaTrader 5

<a id="api-42"></a>

### DataSource.THS

```ts
DataSource.THS = "ths"
```

**@summary** 同花顺

<a id="api-43"></a>

### DataSource.Mock

```ts
DataSource.Mock = "mock"
```

**@summary** 模拟数据

<a id="api-44"></a>

### Timeframe

```ts
Timeframe: typeof Timeframe
```

**@summary** 目标周期

脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。

取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。

<a id="api-45"></a>

### Timeframe.Minute1

```ts
Timeframe.Minute1 = "1"
```

**@summary** 1 分钟

<a id="api-46"></a>

### Timeframe.Minute5

```ts
Timeframe.Minute5 = "5"
```

**@summary** 5 分钟

<a id="api-47"></a>

### Timeframe.Minute15

```ts
Timeframe.Minute15 = "15"
```

**@summary** 15 分钟

<a id="api-48"></a>

### Timeframe.Minute30

```ts
Timeframe.Minute30 = "30"
```

**@summary** 30 分钟

<a id="api-49"></a>

### Timeframe.Hour1

```ts
Timeframe.Hour1 = "60"
```

**@summary** 1 小时

<a id="api-50"></a>

### Timeframe.Hour4

```ts
Timeframe.Hour4 = "240"
```

**@summary** 4 小时

<a id="api-51"></a>

### Timeframe.Day

```ts
Timeframe.Day = "D"
```

**@summary** 日线

<a id="api-52"></a>

### Timeframe.Week

```ts
Timeframe.Week = "W"
```

**@summary** 周线

<a id="api-53"></a>

### Timeframe.Month1

```ts
Timeframe.Month1 = "M"
```

**@summary** 月线

<a id="api-54"></a>

### Timeframe.Month3

```ts
Timeframe.Month3 = "3M"
```

**@summary** 季线

<a id="api-55"></a>

### Timeframe.Month12

```ts
Timeframe.Month12 = "12M"
```

**@summary** 年线

<a id="api-56"></a>

### PlotKind

```ts
PlotKind: typeof PlotKind
```

**@summary** 绘图类型

脚本 `plot.*` 的图形种类；取值与 Plot 声明的 `kind` 完全一致。

<a id="api-57"></a>

### PlotKind.Line

```ts
PlotKind.Line = "line"
```

**@summary** 折线

<a id="api-58"></a>

### PlotKind.LineBR

```ts
PlotKind.LineBR = "linebr"
```

**@summary** 断线折线

<a id="api-59"></a>

### PlotKind.StepLine

```ts
PlotKind.StepLine = "stepline"
```

**@summary** 阶梯线

<a id="api-60"></a>

### PlotKind.StepLineBR

```ts
PlotKind.StepLineBR = "steplinebr"
```

**@summary** 断线阶梯线

<a id="api-61"></a>

### PlotKind.Histogram

```ts
PlotKind.Histogram = "histogram"
```

**@summary** 柱状图

<a id="api-62"></a>

### PlotKind.Columns

```ts
PlotKind.Columns = "columns"
```

**@summary** 柱形图

<a id="api-63"></a>

### PlotKind.Points

```ts
PlotKind.Points = "points"
```

**@summary** 散点

<a id="api-64"></a>

### PlotKind.Shape

```ts
PlotKind.Shape = "shape"
```

**@summary** 形状标记

<a id="api-65"></a>

### PlotKind.Char

```ts
PlotKind.Char = "char"
```

**@summary** 字符标记

<a id="api-66"></a>

### PlotKind.Arrow

```ts
PlotKind.Arrow = "arrow"
```

**@summary** 箭头

<a id="api-67"></a>

### PlotKind.Candle

```ts
PlotKind.Candle = "candle"
```

**@summary** 蜡烛图

<a id="api-68"></a>

### PlotKind.Bar

```ts
PlotKind.Bar = "bar"
```

**@summary** 美国线

<a id="api-69"></a>

### Format

```ts
Format: typeof Format
```

**@summary** 数值格式

数值格式化档位；脚本里用 `Format.Volume` 即可，不填时按 `Format.Price` 处理。

| 成员 | 示例 |
| --- | --- |
| `Format.Price` | `1234.567` |
| `Format.Volume` | `1.25K`、`12.30M`、`3.40B` |
| `Format.Percent` | `3.45%`、`-12.30%` |
| `Format.Mintick` | `1234.5678901` |

<a id="api-70"></a>

### Format.Price

```ts
Format.Price = "price"
```

**@summary** 价格

<a id="api-71"></a>

### Format.Volume

```ts
Format.Volume = "volume"
```

**@summary** 成交量

<a id="api-72"></a>

### Format.Percent

```ts
Format.Percent = "percent"
```

**@summary** 百分比

<a id="api-73"></a>

### Format.Mintick

```ts
Format.Mintick = "mintick"
```

**@summary** 最小变动单位

<a id="api-74"></a>

### ShapeStyle

```ts
ShapeStyle: typeof ShapeStyle
```

**@summary** 标记形状

固定形状标记可选的外形；缺省使用 XCross。

<a id="api-75"></a>

### ShapeStyle.XCross

```ts
ShapeStyle.XCross = "xcross"
```

**@summary** X 叉

<a id="api-76"></a>

### ShapeStyle.Cross

```ts
ShapeStyle.Cross = "cross"
```

**@summary** 十字

<a id="api-77"></a>

### ShapeStyle.Circle

```ts
ShapeStyle.Circle = "circle"
```

**@summary** 圆

<a id="api-78"></a>

### ShapeStyle.Square

```ts
ShapeStyle.Square = "square"
```

**@summary** 方形

<a id="api-79"></a>

### ShapeStyle.Diamond

```ts
ShapeStyle.Diamond = "diamond"
```

**@summary** 菱形

<a id="api-80"></a>

### ShapeStyle.TriangleUp

```ts
ShapeStyle.TriangleUp = "triangleup"
```

**@summary** 上三角

<a id="api-81"></a>

### ShapeStyle.TriangleDown

```ts
ShapeStyle.TriangleDown = "triangledown"
```

**@summary** 下三角

<a id="api-82"></a>

### ShapeStyle.ArrowUp

```ts
ShapeStyle.ArrowUp = "arrowup"
```

**@summary** 上箭头

<a id="api-83"></a>

### ShapeStyle.ArrowDown

```ts
ShapeStyle.ArrowDown = "arrowdown"
```

**@summary** 下箭头

<a id="api-84"></a>

### ShapeStyle.LabelUp

```ts
ShapeStyle.LabelUp = "labelup"
```

**@summary** 上标签

<a id="api-85"></a>

### ShapeStyle.LabelDown

```ts
ShapeStyle.LabelDown = "labeldown"
```

**@summary** 下标签

<a id="api-86"></a>

### ShapeStyle.Flag

```ts
ShapeStyle.Flag = "flag"
```

**@summary** 旗形

<a id="api-87"></a>

### ShapeLocation

```ts
ShapeLocation: typeof ShapeLocation
```

**@summary** 标记位置

标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。

<a id="api-88"></a>

### ShapeLocation.AboveBar

```ts
ShapeLocation.AboveBar = "abovebar"
```

**@summary** 上方

<a id="api-89"></a>

### ShapeLocation.BelowBar

```ts
ShapeLocation.BelowBar = "belowbar"
```

**@summary** 下方

<a id="api-90"></a>

### ShapeLocation.Top

```ts
ShapeLocation.Top = "top"
```

**@summary** 顶部

<a id="api-91"></a>

### ShapeLocation.Bottom

```ts
ShapeLocation.Bottom = "bottom"
```

**@summary** 底部

<a id="api-92"></a>

### ShapeLocation.Absolute

```ts
ShapeLocation.Absolute = "absolute"
```

**@summary** 按价格定位

<a id="api-93"></a>

### ShapeSize

```ts
ShapeSize: typeof ShapeSize
```

**@summary** 尺寸档位

图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。

| 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
| --- | --- | --- | --- | --- | --- |
| ShapeSize.Auto | 1 | 3 | 12 | 50 | 1 |
| ShapeSize.Tiny | 1 | 6 | 6 | 20 | 1 |
| ShapeSize.Small | 1 | 10 | 10 | 30 | 1 |
| ShapeSize.Normal | 2 | 14 | 14 | 40 | 2 |
| ShapeSize.Large | 3 | 20 | 20 | 60 | 3 |
| ShapeSize.Huge | 4 | 28 | 28 | 90 | 4 |

px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
Columns 不接受 size，柱宽随 K 线间距自动调整。

<a id="api-94"></a>

### ShapeSize.Auto

```ts
ShapeSize.Auto = "auto"
```

**@summary** 自动

<a id="api-95"></a>

### ShapeSize.Tiny

```ts
ShapeSize.Tiny = "tiny"
```

**@summary** 极小

<a id="api-96"></a>

### ShapeSize.Small

```ts
ShapeSize.Small = "small"
```

**@summary** 小

<a id="api-97"></a>

### ShapeSize.Normal

```ts
ShapeSize.Normal = "normal"
```

**@summary** 常规

<a id="api-98"></a>

### ShapeSize.Large

```ts
ShapeSize.Large = "large"
```

**@summary** 大

<a id="api-99"></a>

### ShapeSize.Huge

```ts
ShapeSize.Huge = "huge"
```

**@summary** 特大

<a id="api-100"></a>

### console

```ts
console: { log(...values: unknown[]): void; info(...values: unknown[]): void; warn(...values: unknown[]): void; error(...values: unknown[]): void; debug(...values: unknown[]): void; }
```

输出到编辑器底部的“输出”面板；支持多个参数和对象。

<a id="api-101"></a>

### console.log

```ts
console.log(...values: unknown[]): void
```

<a id="api-102"></a>

### console.info

```ts
console.info(...values: unknown[]): void
```

<a id="api-103"></a>

### console.warn

```ts
console.warn(...values: unknown[]): void
```

<a id="api-104"></a>

### console.error

```ts
console.error(...values: unknown[]): void
```

<a id="api-105"></a>

### console.debug

```ts
console.debug(...values: unknown[]): void
```

<a id="api-106"></a>

### open

```ts
open: ScriptSeries
```

<a id="api-107"></a>

### high

```ts
high: ScriptSeries
```

<a id="api-108"></a>

### low

```ts
low: ScriptSeries
```

<a id="api-109"></a>

### close

```ts
close: ScriptSeries
```

<a id="api-110"></a>

### volume

```ts
volume: ScriptSeries
```

<a id="api-111"></a>

### time

```ts
time: ScriptSeries
```

<a id="api-112"></a>

### bar_index

```ts
bar_index: number
```

当前 K 线索引，从 0 开始。

<a id="api-113"></a>

### bar_index.toString

```ts
bar_index.toString(radix?: number): string
```

Returns a string representation of an object.

**@param** radix Specifies a radix for converting numeric values to strings. This value is only used for numbers.

<a id="api-114"></a>

### bar_index.toFixed

```ts
bar_index.toFixed(fractionDigits?: number): string
```

Returns a string representing a number in fixed-point notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-115"></a>

### bar_index.toExponential

```ts
bar_index.toExponential(fractionDigits?: number): string
```

Returns a string containing a number represented in exponential notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-116"></a>

### bar_index.toPrecision

```ts
bar_index.toPrecision(precision?: number): string
```

Returns a string containing a number represented either in exponential or fixed-point notation with a specified number of digits.

**@param** precision Number of significant digits. Must be in the range 1 - 21, inclusive.

<a id="api-117"></a>

### bar_index.valueOf

```ts
bar_index.valueOf(): number
```

Returns the primitive value of the specified object.

<a id="api-118"></a>

### bar_index.toLocaleString

```ts
bar_index.toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string
bar_index.toLocaleString(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string
```

Converts a number to a string by using the current or specified locale.

**@param** locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

**@param** locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

<a id="api-119"></a>

### line

```ts
line: DrawingLineApi
```

创建、修改、读取和删除线段，跨 bar 保留。

只能在 onBar 内新建与修改；引用只在本次运行内有效，重算后旧引用失效。

```ts
const id = line.new(bar_index, low[0], bar_index + 5, high[0])
line.set_color(id, Color.Red)
```

<a id="api-120"></a>

### line.style_solid

```ts
line.style_solid: LineStyle
```

**@summary** 实线

<a id="api-121"></a>

### line.style_dashed

```ts
line.style_dashed: LineStyle
```

**@summary** 虚线

<a id="api-122"></a>

### line.style_dotted

```ts
line.style_dotted: LineStyle
```

**@summary** 点线

<a id="api-123"></a>

### line.style_arrow_left

```ts
line.style_arrow_left: LineStyle
```

**@summary** 左箭头

<a id="api-124"></a>

### line.style_arrow_right

```ts
line.style_arrow_right: LineStyle
```

**@summary** 右箭头

<a id="api-125"></a>

### line.style_arrow_both

```ts
line.style_arrow_both: LineStyle
```

**@summary** 双箭头

<a id="api-126"></a>

### line.new

```ts
line.new(first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
line.new(x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef
```

绘制线段；两个重载分别接受 chart.point 端点与起止点的 X / Y。

**@summary** 绘制线段

<a id="api-127"></a>

### line.all

```ts
line.all: readonly LineRef[]
```

本次运行绘制的全部线段引用，按创建顺序；与创建返回的引用相等，可直接比较。

**@summary** 全部线段

<a id="api-128"></a>

### line.set_xy1

```ts
line.set_xy1(id: LineRef, x: number, y: number): void
```

同时设置起点 X 和 Y；X 的取值方式沿用创建时的 xloc。

**@summary** 设置起点

<a id="api-129"></a>

### line.set_xy2

```ts
line.set_xy2(id: LineRef, x: number, y: number): void
```

同时设置终点 X 和 Y；X 的取值方式沿用创建时的 xloc。

**@summary** 设置终点

<a id="api-130"></a>

### line.set_x1

```ts
line.set_x1(id: LineRef, x: number): void
```

设置起点 X；取值方式沿用创建时的 xloc。

**@summary** 设置起点 X

<a id="api-131"></a>

### line.set_y1

```ts
line.set_y1(id: LineRef, y: number): void
```

设置起点价格。

**@summary** 设置起点价格

<a id="api-132"></a>

### line.set_x2

```ts
line.set_x2(id: LineRef, x: number): void
```

设置终点 X；取值方式沿用创建时的 xloc。

**@summary** 设置终点 X

<a id="api-133"></a>

### line.set_y2

```ts
line.set_y2(id: LineRef, y: number): void
```

设置终点价格。

**@summary** 设置终点价格

<a id="api-134"></a>

### line.set_color

```ts
line.set_color(id: LineRef, color: string): void
```

设置线段颜色，支持 CSS 颜色值。

**@summary** 设置颜色

<a id="api-135"></a>

### line.set_style

```ts
line.set_style(id: LineRef, style: LineStyle): void
```

设置线型，包括实线、虚线和箭头。

**@summary** 设置线型

<a id="api-136"></a>

### line.set_width

```ts
line.set_width(id: LineRef, width: number): void
```

设置线宽，正整数逻辑像素。

**@summary** 设置线宽

<a id="api-137"></a>

### line.set_extend

```ts
line.set_extend(id: LineRef, extend: LineExtend): void
```

设置延伸方向；left 延伸至起点之外，right 延伸至终点之外。

**@summary** 设置延伸

<a id="api-138"></a>

### line.get_x1

```ts
line.get_x1(id: LineRef): number
```

读取起点 X；线段已删除返回 NaN。

**@summary** 起点 X

<a id="api-139"></a>

### line.get_y1

```ts
line.get_y1(id: LineRef): number
```

读取起点价格；线段已删除返回 NaN。

**@summary** 起点价格

<a id="api-140"></a>

### line.get_x2

```ts
line.get_x2(id: LineRef): number
```

读取终点 X；线段已删除返回 NaN。

**@summary** 终点 X

<a id="api-141"></a>

### line.get_y2

```ts
line.get_y2(id: LineRef): number
```

读取终点价格；线段已删除返回 NaN。

**@summary** 终点价格

<a id="api-142"></a>

### line.get_color

```ts
line.get_color(id: LineRef): string | null
```

读取颜色；线段已删除返回 null。

**@summary** 颜色

<a id="api-143"></a>

### line.get_style

```ts
line.get_style(id: LineRef): LineStyle | null
```

读取线型；线段已删除返回 null。

**@summary** 线型

<a id="api-144"></a>

### line.get_width

```ts
line.get_width(id: LineRef): number
```

读取线宽；线段已删除返回 NaN。

**@summary** 线宽

<a id="api-145"></a>

### line.get_extend

```ts
line.get_extend(id: LineRef): LineExtend | null
```

读取延伸方向；线段已删除返回 null。

**@summary** 延伸方向

<a id="api-146"></a>

### line.get_price

```ts
line.get_price(id: LineRef, x: number): number
```

按线段所在直线求 x 处的价格，与 extend 无关；只支持 xloc.bar_index，垂直线或已删除返回 NaN。

**@summary** 求价格

<a id="api-147"></a>

### line.copy

```ts
line.copy(id: LineRef): LineRef | null
```

复制为新线段并返回其引用，副本独立于原线段。

**@summary** 复制线段

<a id="api-148"></a>

### line.delete

```ts
line.delete(id: LineRef | null): void
```

删除线段；传入 null 或已删除对象无操作。

**@summary** 删除线段

<a id="api-149"></a>

### chart

```ts
chart: { readonly point: { "new"(time: number, index: number, price: number): ChartPoint; now(price: number): ChartPoint; from_index(index: number, price: number): ChartPoint; from_time(time: number, price: number): ChartPoint; copy(point: ChartPoint): ChartPoint; }; }
```

chart.point 坐标工厂；line.new 会复制坐标，不保留 point 对象引用。

<a id="api-150"></a>

### chart.point

```ts
chart.point: { "new"(time: number, index: number, price: number): ChartPoint; now(price: number): ChartPoint; from_index(index: number, price: number): ChartPoint; from_time(time: number, price: number): ChartPoint; copy(point: ChartPoint): ChartPoint; }
```

<a id="api-151"></a>

### chart.point.new

```ts
chart.point.new(time: number, index: number, price: number): ChartPoint
```

用时间戳、bar 索引和价格构造 point；xloc 决定 line.new 读取哪个字段。

<a id="api-152"></a>

### chart.point.now

```ts
chart.point.now(price: number): ChartPoint
```

当前 K 线的 point，索引取 bar_index。

<a id="api-153"></a>

### chart.point.from_index

```ts
chart.point.from_index(index: number, price: number): ChartPoint
```

只带 bar 索引的 point，用于 xloc.bar_index。

<a id="api-154"></a>

### chart.point.from_time

```ts
chart.point.from_time(time: number, price: number): ChartPoint
```

只带毫秒时间戳的 point，用于 xloc.bar_time。

<a id="api-155"></a>

### chart.point.copy

```ts
chart.point.copy(point: ChartPoint): ChartPoint
```

复制 point，得到独立值对象。

<a id="api-156"></a>

### ta

```ts
ta: TechnicalAnalysisLibrary
```

内建技术分析库
序列结果用 [0] 取当前值、[1] 取上一根值，例如 ta.sma(close, 20)[0]。

<a id="api-157"></a>

### ta.rising

```ts
ta.rising(source: Series, length: number): boolean
```

当前值严格高于前 length 根中的所有有效值，不要求逐根上涨。

**@summary** 上涨判断

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，不包含当前根。

**@returns** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

<a id="api-158"></a>

### ta.falling

```ts
ta.falling(source: Series, length: number): boolean
```

当前值严格低于前 length 根中的所有有效值，不要求逐根下跌。

**@summary** 下跌判断

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，不包含当前根。

**@returns** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

<a id="api-159"></a>

### ta.change

```ts
ta.change(source: Series, length?: number): Series
```

当前值减去 length 根之前的值。

**@summary** 数值变化

**@param** source 数据序列，如 volume。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 差值序列；历史不足或任一端为 NaN 时为 NaN。

<a id="api-160"></a>

### ta.sma

```ts
ta.sma(source: Series, length: number): Series
```

简单移动平均（SMA）。

**@summary** 简单移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值，完整窗口之前为 NaN。

<a id="api-161"></a>

### ta.sum

```ts
ta.sum(source: Series, length: number): Series
```

窗口求和（SUM）。

**@summary** 窗口求和

**@param** source 数据序列，如 volume。

**@param** length 窗口长度，正整数。

**@returns** 求和序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

<a id="api-162"></a>

### ta.highest

```ts
ta.highest(source: Series, length: number): Series
```

最近 length 根 K 线的最高值，包含当前 K 线。

**@summary** 窗口最高值

**@param** source 数据序列，如 high。

**@param** length 窗口长度，正整数。

**@returns** 最高值序列；[0] 取当前窗口的结果。

<a id="api-163"></a>

### ta.lowest

```ts
ta.lowest(source: Series, length: number): Series
```

最近 length 根 K 线的最低值，包含当前 K 线。

**@summary** 窗口最低值

**@param** source 数据序列，如 low。

**@param** length 窗口长度，正整数。

**@returns** 最低值序列；[0] 取当前窗口的结果。

<a id="api-164"></a>

### ta.highestbars

```ts
ta.highestbars(source: Series, length: number): Series
```

最近 length 根 K 线最高值相对当前 K 线的偏移，负值或 0。

**@summary** 最高值偏移

**@param** source 数据序列，如 high。

**@param** length 窗口长度，正整数。

**@returns** 偏移序列；并列最高取更早一根，完整窗口之前为 NaN。

<a id="api-165"></a>

### ta.lowestbars

```ts
ta.lowestbars(source: Series, length: number): Series
```

最近 length 根 K 线最低值相对当前 K 线的偏移，负值或 0。

**@summary** 最低值偏移

**@param** source 数据序列，如 low。

**@param** length 窗口长度，正整数。

**@returns** 偏移序列；并列最低取更早一根，完整窗口之前为 NaN。

<a id="api-166"></a>

### ta.rma

```ts
ta.rma(source: Series, length: number): Series
```

Wilder 平滑均线（RMA），alpha = 1 / length，以首个完整窗口 SMA 初始化。

**@summary** Wilder 平滑均线

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；完整窗口之前为 NaN。

<a id="api-167"></a>

### ta.swma

```ts
ta.swma(source: Series): Series
```

对称加权均线，固定 4 根窗口，权重由旧到新为 1/6、2/6、2/6、1/6。

**@summary** 对称加权均线

**@param** source 数据序列，如 close。

**@returns** 均线序列；前 3 根为 NaN。

<a id="api-168"></a>

### ta.alma

```ts
ta.alma(source: Series, length: number, offset?: number, sigma?: number, floor?: boolean): Series
```

Arnaud Legoux 均线（ALMA），高斯权重中心位于 offset × (length − 1)。

**@summary** Arnaud Legoux 均线

**@param** source 数据序列，如 close。

**@param** length 窗口长度，正整数。

**@param** offset 高斯中心在窗口中的相对位置，0–1，缺省 0.85。

**@param** sigma 高斯宽度，有限正数，缺省 6。

**@param** floor 为 true 时对中心取下整，缺省 false。

**@returns** 均线序列；完整窗口之前为 NaN。

<a id="api-169"></a>

### ta.stddev

```ts
ta.stddev(source: Series, length: number): Series
```

总体标准差（STDDEV），窗口内数值相对窗口均值的偏差，除以 length。

**@summary** 总体标准差

**@param** source 数据序列，如 close。

**@param** length 窗口长度，正整数。

**@returns** 标准差序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

<a id="api-170"></a>

### ta.ema

```ts
ta.ema(source: Series, length: number): Series
```

指数移动平均（EMA），以首个完整窗口的 SMA 为初值。

**@summary** 指数移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值。

<a id="api-171"></a>

### ta.dema

```ts
ta.dema(source: Series, length: number): Series
```

双重指数均线：2×EMA(source)−EMA(EMA(source))。

**@summary** 双重指数均线

**@param** source 数据序列。

**@param** length 正整数周期，各层 EMA 以完整窗口均值初始化。

**@returns** DEMA 序列，前 2×(length−1) 根为 NaN。

<a id="api-172"></a>

### ta.tema

```ts
ta.tema(source: Series, length: number): Series
```

三重指数均线：3×EMA1−3×EMA2+EMA3。

**@summary** 三重指数均线

**@param** source 数据序列。

**@param** length 正整数周期，各层 EMA 以完整窗口均值初始化。

**@returns** TEMA 序列，前 3×(length−1) 根为 NaN。

<a id="api-173"></a>

### ta.t3

```ts
ta.t3(source: Series, length: number, volumeFactor?: number): Series
```

Tillson T3，以六层 EMA 及成交量因子系数组合平滑价格。

**@summary** Tillson T3 均线

**@param** source 数据序列。

**@param** length 正整数周期。

**@param** volumeFactor 平滑因子，有限数值 0–1，缺省 0.7，不读取成交量。

**@returns** T3 序列，前 6×(length−1) 根为 NaN；周期 1 时等于输入。

<a id="api-174"></a>

### ta.trima

```ts
ta.trima(source: Series, length: number): Series
```

三角均线：SMA(SMA(source, ceil(length/2)), floor(length/2)+1)。

**@summary** 三角移动平均

**@param** source 数据序列。

**@param** length 正整数周期。

**@returns** TRIMA 序列，前 length−1 根为 NaN。

<a id="api-175"></a>

### ta.macd

```ts
ta.macd(source: Series, fastLength: number, slowLength: number, signalLength: number): readonly [Series, Series, Series]
```

MACD，快慢 EMA 与信号 EMA 均以首个有效值初始化，从该位置逐根输出。

**@summary** 指数平滑异同平均线

**@param** source 价格序列，如 close。

**@param** fastLength 快周期，正整数。

**@param** slowLength 慢周期，正整数。

**@param** signalLength 信号周期，正整数。

**@returns** [DIF, DEA, DIF-DEA] 三个序列；柱体不翻倍，NaN 处留空，后续有效值重新初始化。

<a id="api-176"></a>

### ta.wma

```ts
ta.wma(source: Series, length: number): Series
```

加权移动平均（WMA），越新的值权重越大。

**@summary** 加权移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值。

<a id="api-177"></a>

### ta.hma

```ts
ta.hma(source: Series, length: number): Series
```

Hull 移动平均，组合 WMA(2×WMA(source, floor(length/2))−WMA(source, length), round(sqrt(length)))。

**@summary** Hull 移动平均

**@param** source 数据序列。

**@param** length 正整数周期，派生窗口最小为 1。

**@returns** 均线序列，完整组合窗口之前为 NaN。

<a id="api-178"></a>

### ta.linreg

```ts
ta.linreg(source: Series, length: number, offset?: number): Series
```

线性回归曲线：对窗口做最小二乘拟合，返回相对当前根向前 offset 根的拟合值。

**@summary** 线性回归

**@param** source 数据序列，如 close。

**@param** length 窗口长度，正整数。

**@param** offset 向前偏移的根数，整数，缺省 0（当前根）。

**@returns** 回归值序列；完整窗口之前为 NaN。

<a id="api-179"></a>

### ta.cci

```ts
ta.cci(source: Series, length: number): Series
```

顺势指标：(source−SMA)/(0.015×平均绝对偏差)。

**@summary** 顺势指标

**@param** source 数据序列，通常为 (high+low+close)/3。

**@param** length 正整数周期。

**@returns** CCI 序列；窗口不足为 NaN，平均绝对偏差为零时为 0。

<a id="api-180"></a>

### ta.vwma

```ts
ta.vwma(source: Series, volume: Series, length: number): Series
```

成交量加权移动平均（VWMA），按 Σ(价格×成交量)/Σ(成交量) 计算。

**@summary** 成交量加权移动平均

**@param** source 价格序列，如 close。

**@param** volume 成交量序列。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值。

<a id="api-181"></a>

### ta.rsi

```ts
ta.rsi(source: Series, length: number): Series
```

相对强弱指数（RSI），使用 Wilder 平滑；窗口内无下跌（含平盘）为 100。

**@summary** 相对强弱指数

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** RSI 序列，范围 0–100；[0] 取当前值，完整窗口之前为 NaN。

<a id="api-182"></a>

### ta.stoch

```ts
ta.stoch(source: Series, high: Series, low: Series, length: number): Series
```

随机指标：100 × (source − 窗口最低) / (窗口最高 − 窗口最低)。

**@summary** 随机指标

**@param** source 数据序列，如 close。

**@param** high 最高价序列，如 high。

**@param** low 最低价序列，如 low。

**@param** length 窗口长度，正整数。

**@returns** 随机指标序列，范围 0–100；完整窗口之前为 NaN，零幅窗口输出 50。

<a id="api-183"></a>

### ta.atr

```ts
ta.atr(length: number): Series
```

平均真实波幅（ATR），首个完整窗口取真实波幅均值，之后使用 Wilder 平滑。

**@summary** 平均真实波幅

**@param** length 周期，正整数。

**@returns** ATR 序列；第一根真实波幅为 high-low，完整窗口之前为 NaN。

<a id="api-184"></a>

### ta.supertrend

```ts
ta.supertrend(multiplier: number, atrPeriod: number): readonly [Series, Series]
```

Supertrend，保留原生指标的上涨初始方向与 ATR 通道递推规则。

**@summary** 超级趋势

**@param** multiplier ATR 倍数，有限正数。

**@param** atrPeriod ATR 周期，正整数。

**@returns** [趋势线序列, 方向序列]；-1 为上涨、1 为下跌，预热期间两者均为 NaN。

<a id="api-185"></a>

### ta.mom

```ts
ta.mom(source: Series, length?: number): Series
```

动量（MOM），当前值减去 length 根之前的值。

**@summary** 动量

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 差值序列，按数值轴绘制；历史不足时为 NaN。

<a id="api-186"></a>

### ta.roc

```ts
ta.roc(source: Series, length?: number): Series
```

当前值相对 length 根之前的百分比变化（ROC）。

**@summary** 变化率

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 百分比变化序列；历史不足或基准为 0 时为 NaN。

<a id="api-187"></a>

### ta.cmo

```ts
ta.cmo(source: Series, length: number): Series
```

Chande 动量振荡器：100 × (涨幅和 − 跌幅和) / (涨幅和 + 跌幅和)，窗口含 length 个差分。

**@summary** 钱德动量振荡器

**@param** source 数据序列，如 close。

**@param** length 差分窗口，正整数。

**@returns** CMO 序列，范围 -100–100；完整窗口之前为 NaN，平盘（分母为零）为 0。

<a id="api-188"></a>

### ta.crossover

```ts
ta.crossover(left: Series, right: Series): boolean
```

判断当前 K 线是否发生上穿：left 当前大于 right，上一根小于或等于 right。

**@summary** 上穿

**@param** left 穿越方序列。

**@param** right 被穿越方序列。

**@returns** 发生上穿时为 true。

<a id="api-189"></a>

### ta.crossunder

```ts
ta.crossunder(left: Series, right: Series): boolean
```

判断当前 K 线是否发生下穿：left 当前小于 right，上一根大于或等于 right。

**@summary** 下穿

**@param** left 穿越方序列。

**@param** right 被穿越方序列。

**@returns** 发生下穿时为 true。

<a id="api-190"></a>

### Position

```ts
Position: typeof PositionEnum
```

**@summary** 渲染位置

指标渲染位置，由宿主注入 VM。

| 取值 | 含义 |
| --- | --- |
| `Position.Main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.Sub` | 独立副图 |

<a id="api-191"></a>

### Position.Main

```ts
Position.Main = "main"
```

叠加到主图。

**@summary** 主图

<a id="api-192"></a>

### Position.Sub

```ts
Position.Sub = "sub"
```

独立副图。

**@summary** 副图

<a id="api-193"></a>

### input

```ts
input: ScriptInput
```

输入参数：int / float 支持范围和步长，bool 显示开关，string 支持下拉选项。

<a id="api-194"></a>

### input.int

```ts
input.int(value: number, options?: NumberInputOptions): number
```

整数输入；min、max 和 step 必须为整数。

**@summary** 整数

<a id="api-195"></a>

### input.float

```ts
input.float(value: number, options?: NumberInputOptions): number
```

浮点数输入，支持数值范围与步长。

**@summary** 浮点数

<a id="api-196"></a>

### input.bool

```ts
input.bool(value: boolean, options?: InputOptions): boolean
```

布尔输入，在参数面板中显示开关。

**@summary** 开关

<a id="api-197"></a>

### input.string

```ts
input.string(value: string, options?: StringInputOptions): string
```

字符串输入；提供 options 时显示下拉选项。

**@summary** 字符串

<a id="api-198"></a>

### input.timeframe

```ts
input.timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe
```

目标周期输入；缺省列出全部受支持周期，返回值可直接传给 request.security。

**@summary** 目标周期

<a id="api-199"></a>

### defineIndicator

```ts
defineIndicator(definition: ScriptIndicatorDeclaration): void
```

定义一个指标。
顶层代码只执行一次，顶层变量跨 bar 保留（等价 Pine 的 var）；逐根计算写在 onBar 内。

<a id="api-200"></a>

### derive

```ts
derive(key: string, compute: (self: Series, offset: number) => number): Series
```

惰性派生序列；读取时按绝对 bar 缓存，不主动填充历史。
key 必须稳定且区分输入与参数；同 key 复用首次注册的回调。
回调用 offset 读取输入历史，用 self[offset + 1] 读取自身上一根；历史越界返回 NaN。
不要捕获当前 bar 的数值快照，应捕获 Series 并按 offset 取值。

<a id="api-201"></a>

### plot

```ts
plot: ScriptPlot
```

当前 K 线的绘图方法；仅在 onBar 中调用，name 必填，null 主动留空。

| 方法 | 图形 | value 含义 |
| --- | --- | --- |
| `plot.Line` | 普通折线 | 跨空值连接前后有效点 |
| `plot.LineBR` | 断线折线 | 空值处断开 |
| `plot.StepLine` | 阶梯线 | 在相邻有效点的水平中点跳变，跨空值连接 |
| `plot.StepLineBR` | 断线阶梯线 | 空值处断开 |
| `plot.Histogram` | 柱状图 | 柱状图数值 |
| `plot.Point` | 散点 | 散点数值 |
| `plot.Shape` | 形状标记 | 数值或布尔条件；false 留空，absolute 定位时数值为价格 |
| `plot.Char` | 字符标记 | 数值或布尔条件；false 留空，absolute 定位时数值为价格 |
| `plot.Arrow` | 箭头 | 正负决定方向，绝对值决定长度 |

<a id="api-202"></a>

### plot.Line

```ts
plot.Line(value: number | null, name: string, options?: PlotStyleOptions<"line">): PlotRef
```

输出普通折线点，跨空值连接前后有效点，对应 Pine plot.style_line。

**@summary** 折线

<a id="api-203"></a>

### plot.LineBR

```ts
plot.LineBR(value: number | null, name: string, options?: PlotStyleOptions<"linebr">): PlotRef
```

输出断线折线点，空值处断开，对应 Pine plot.style_linebr。

**@summary** 断线折线

<a id="api-204"></a>

### plot.StepLine

```ts
plot.StepLine(value: number | null, name: string, options?: PlotStyleOptions<"stepline">): PlotRef
```

输出阶梯线点，在相邻有效点的水平中点跳变，跨空值连接，对应 Pine plot.style_stepline。

**@summary** 阶梯线

<a id="api-205"></a>

### plot.StepLineBR

```ts
plot.StepLineBR(value: number | null, name: string, options?: PlotStyleOptions<"steplinebr">): PlotRef
```

输出断线阶梯线点，空值处断开，对应 Pine plot.style_steplinebr。

**@summary** 断线阶梯线

<a id="api-206"></a>

### plot.Histogram

```ts
plot.Histogram(value: number | null, name: string, options?: PlotStyleOptions<"histogram">): PlotRef
```

固定像素柱宽；size 接受正数像素或 ShapeSize 枚举，默认 1px。

**@summary** 柱状图(定宽)

<a id="api-207"></a>

### plot.Columns

```ts
plot.Columns(value: number | null, name: string, options?: PlotStyleOptions<"columns">): PlotRef
```

输出自动柱宽的柱状图，随 K 线间距缩放，不支持 size。

**@summary** 柱形图(跟随缩放)

<a id="api-208"></a>

### plot.Point

```ts
plot.Point(value: number | null, name: string, options?: PlotStyleOptions<"points">): PlotRef
```

输出散点。

**@summary** 散点

<a id="api-209"></a>

### plot.Shape

```ts
plot.Shape(value: number | boolean | null, name: string, options?: PlotStyleOptions<"shape">): PlotRef
```

输出形状标记；false 留空，absolute 定位时数值为价格。

**@summary** 形状标记

<a id="api-210"></a>

### plot.Char

```ts
plot.Char(value: number | boolean | null, name: string, options?: PlotStyleOptions<"char">): PlotRef
```

输出字符标记；false 留空，absolute 定位时数值为价格。

**@summary** 字符标记

<a id="api-211"></a>

### plot.Arrow

```ts
plot.Arrow(value: number | null, name: string, options?: PlotStyleOptions<"arrow">): PlotRef
```

输出数值箭头，正负决定方向，绝对值决定长度。

**@summary** 箭头

<a id="api-212"></a>

### plot.Candle

```ts
plot.Candle(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: CandlePlotOptions): void
```

输出蜡烛；任一价格缺失时留空，实体、影线和边框可独立着色。

**@summary** 蜡烛图

<a id="api-213"></a>

### plot.Bar

```ts
plot.Bar(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: BarPlotOptions): void
```

输出美国线；左侧短横线为开盘，右侧短横线为收盘。

**@summary** 美国线(OHLC)

<a id="api-214"></a>

### fill

```ts
fill(from: PlotRef, to: PlotRef, color: string | null, title?: string, options?: ScriptFillOptions): void
```

声明两个 Plot 之间的填充区域；两个句柄由 plot.* 返回，仅在 onBar 中调用。
每根 bar 保存调用处求出的颜色；null 表示该 bar 不填充。

| 参数 | 含义 |
| --- | --- |
| `from` / `to` | 填充的两个边界 Plot |
| `color` | 当前 bar 的 CSS 颜色，透明度由颜色携带 |
| `title` | 填充标识；不填则按 from/to 生成 |

<a id="api-215"></a>

### defineLibrary

```ts
defineLibrary<T extends object>(name: string, members: T): Readonly<T>
```

注册一个库，其成员同时绑定到同名全局对象。

<a id="api-216"></a>

### importLibrary

```ts
importLibrary<K extends keyof LibraryModules>(name: K): LibraryModules[K]
```

读取已注册的库，内置名称由统一库类型目录提供。

<a id="api-217"></a>

### request

```ts
request: ScriptRequest
```

获取指定品种周期的数据；`syminfo.tickerid` 是当前图表品种。

<a id="api-218"></a>

### request.security

```ts
request.security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: SecurityOptions): RequestResult<T>
```

在指定品种、周期的上下文中计算 expression，再将计算结果对齐到当前图表品种的 K 线时间槽位上。

| 参数 | 类型 | 含义 |
| --- | --- | --- |
| `symbol` | `string` | 目标品种 |
| `timeframe` | `Timeframe` | 目标周期 |
| `expression` | `() => T` | 在目标品种、周期的上下文中执行的计算回调，可访问目标的 OHLC 数据；结果由 security 对齐到当前图表的时间槽位 |
| `options` | `SecurityOptions` | 来源、预热根数、缺口策略 |

| 返回值 |
| --- |
| `expression` 的计算结果，对齐到当前图表品种的 K 线时间槽位；缺口按 `options.gaps` 策略处理 |

**用法：**

```ts
const [o, h, l, c] = request.security(syminfo.tickerid, Timeframe.Hour1, () => [open, high, low, close] as const)
```

<a id="api-219"></a>

### syminfo

```ts
syminfo: { readonly tickerid: string; }
```

当前图表品种信息；`tickerid` 可直接传给 `request.security`。

<a id="api-220"></a>

### syminfo.tickerid

```ts
syminfo.tickerid: string
```

## 相关类型

- [Series](#type-0)
- [Series.0](#type-1)
- [Series.1](#type-2)
- [Series.at](#type-3)
- [LineRef](#type-4)
- [LineRef.id](#type-5)
- [ScriptParameters](#type-6)
- [DrawingLineApi](#type-7)
- [LineStyle](#type-8)
- [LineFactory](#type-9)
- [LineExtend](#type-10)
- [ChartPoint](#type-11)
- [ChartPoint.index](#type-12)
- [ChartPoint.time](#type-13)
- [ChartPoint.price](#type-14)
- [TechnicalAnalysisLibrary](#type-15)
- [Position](#type-16)
- [ScriptInput](#type-17)
- [NumberInputOptions](#type-18)
- [NumberInputOptions.min](#type-19)
- [NumberInputOptions.max](#type-20)
- [NumberInputOptions.step](#type-21)
- [NumberInputOptions.title](#type-22)
- [InputOptions](#type-23)
- [StringInputOptions](#type-24)
- [StringInputOptions.options](#type-25)
- [Timeframe](#type-26)
- [TimeframeInputOptions](#type-27)
- [TimeframeInputOptions.options](#type-28)
- [ScriptIndicatorDeclaration](#type-29)
- [ScriptIndicatorDeclaration.onBar](#type-30)
- [ScriptIndicatorDeclaration.name](#type-31)
- [ScriptIndicatorDeclaration.format](#type-32)
- [ScriptIndicatorDeclaration.title](#type-33)
- [ScriptIndicatorDeclaration.info](#type-34)
- [ScriptIndicatorDeclaration.position](#type-35)
- [ScriptIndicatorDeclaration.max_lines_count](#type-36)
- [ScriptPlot](#type-37)
- [PlotStyleOptions](#type-38)
- [PlotStyleOptions.label](#type-39)
- [PlotStyleOptions.color](#type-40)
- [PlotStyleOptions.format](#type-41)
- [PlotStyleOptions.offset](#type-42)
- [PlotStyleOptions.visible](#type-43)
- [PlotRef](#type-44)
- [PlotRef.name](#type-45)
- [CandlePlotOptions](#type-46)
- [CandlePlotOptions.wickColor](#type-47)
- [CandlePlotOptions.borderColor](#type-48)
- [CandlePlotOptions.label](#type-49)
- [CandlePlotOptions.visible](#type-50)
- [CandlePlotOptions.offset](#type-51)
- [CandlePlotOptions.showLast](#type-52)
- [CandlePlotOptions.color](#type-53)
- [CandlePlotOptions.format](#type-54)
- [BarPlotOptions](#type-55)
- [ScriptFillOptions](#type-56)
- [ScriptFillOptions.visible](#type-57)
- [LibraryModules](#type-58)
- [LibraryModules.ta](#type-59)
- [LibraryModules](#type-60)
- [ScriptRequest](#type-61)
- [RequestValue](#type-62)
- [SecurityOptions](#type-63)
- [SecurityOptions.source](#type-64)
- [SecurityOptions.calcBarsCount](#type-65)
- [SecurityOptions.gaps](#type-66)
- [RequestResult](#type-67)
- [LineXLoc](#type-68)
- [QuickJSScriptDefinition](#type-69)
- [QuickJSScriptDefinition.name](#type-70)
- [QuickJSScriptDefinition.title](#type-71)
- [QuickJSScriptDefinition.info](#type-72)
- [QuickJSScriptDefinition.position](#type-73)
- [QuickJSScriptDefinition.format](#type-74)
- [QuickJSScriptDefinition.max_lines_count](#type-75)
- [QuickJSScriptDefinition.inputs](#type-76)
- [PlotDeclaration](#type-77)
- [PlotDeclaration.kind](#type-78)
- [PlotDeclaration.name](#type-79)
- [PlotDeclaration.label](#type-80)
- [PlotDeclaration.color](#type-81)
- [PlotDeclaration.format](#type-82)
- [PlotDeclaration.offset](#type-83)
- [PlotDeclaration.visible](#type-84)
- [OhlcPlotOptions](#type-85)
- [DataSource](#type-86)
- [Format](#type-87)
- [InputSchema](#type-88)
- [ScriptParamValue](#type-89)
- [ScalarPlotDeclaration](#type-90)
- [ScalarPlotDeclaration.kind](#type-91)
- [ScalarPlotDeclaration.name](#type-92)
- [ScalarPlotDeclaration.label](#type-93)
- [ScalarPlotDeclaration.color](#type-94)
- [ScalarPlotDeclaration.format](#type-95)
- [ScalarPlotDeclaration.textColor](#type-96)
- [ScalarPlotDeclaration.offset](#type-97)
- [ScalarPlotDeclaration.visible](#type-98)
- [ScalarPlotDeclaration.size](#type-99)
- [OhlcPlotDeclaration](#type-100)
- [OhlcPlotDeclaration.name](#type-101)
- [OhlcPlotDeclaration.kind](#type-102)
- [InputDef](#type-103)
- [InputDef.default](#type-104)
- [InputDef.options](#type-105)
- [InputDef.min](#type-106)
- [InputDef.max](#type-107)
- [InputDef.step](#type-108)
- [LinePlotDeclaration](#type-109)
- [LinePlotDeclaration.kind](#type-110)
- [LinePlotDeclaration.dash](#type-111)
- [LinePlotDeclaration.name](#type-112)
- [LinePlotDeclaration.label](#type-113)
- [LinePlotDeclaration.color](#type-114)
- [LinePlotDeclaration.format](#type-115)
- [LinePlotDeclaration.textColor](#type-116)
- [LinePlotDeclaration.offset](#type-117)
- [LinePlotDeclaration.visible](#type-118)
- [LinePlotDeclaration.size](#type-119)
- [LineBRPlotDeclaration](#type-120)
- [LineBRPlotDeclaration.kind](#type-121)
- [LineBRPlotDeclaration.dash](#type-122)
- [LineBRPlotDeclaration.name](#type-123)
- [LineBRPlotDeclaration.label](#type-124)
- [LineBRPlotDeclaration.color](#type-125)
- [LineBRPlotDeclaration.format](#type-126)
- [LineBRPlotDeclaration.textColor](#type-127)
- [LineBRPlotDeclaration.offset](#type-128)
- [LineBRPlotDeclaration.visible](#type-129)
- [LineBRPlotDeclaration.size](#type-130)
- [StepLinePlotDeclaration](#type-131)
- [StepLinePlotDeclaration.kind](#type-132)
- [StepLineBRPlotDeclaration](#type-133)
- [StepLineBRPlotDeclaration.kind](#type-134)
- [HistogramPlotDeclaration](#type-135)
- [HistogramPlotDeclaration.kind](#type-136)
- [HistogramPlotDeclaration.baseline](#type-137)
- [HistogramPlotDeclaration.size](#type-138)
- [HistogramPlotDeclaration.name](#type-139)
- [HistogramPlotDeclaration.label](#type-140)
- [HistogramPlotDeclaration.color](#type-141)
- [HistogramPlotDeclaration.format](#type-142)
- [HistogramPlotDeclaration.textColor](#type-143)
- [HistogramPlotDeclaration.offset](#type-144)
- [HistogramPlotDeclaration.visible](#type-145)
- [ColumnsPlotDeclaration](#type-146)
- [ColumnsPlotDeclaration.kind](#type-147)
- [ColumnsPlotDeclaration.baseline](#type-148)
- [ColumnsPlotDeclaration.size](#type-149)
- [PointsPlotDeclaration](#type-150)
- [PointsPlotDeclaration.kind](#type-151)
- [ShapePlotDeclaration](#type-152)
- [ShapePlotDeclaration.kind](#type-153)
- [ShapePlotDeclaration.style](#type-154)
- [ShapePlotDeclaration.location](#type-155)
- [ShapePlotDeclaration.text](#type-156)
- [CharPlotDeclaration](#type-157)
- [CharPlotDeclaration.kind](#type-158)
- [CharPlotDeclaration.char](#type-159)
- [ArrowPlotDeclaration](#type-160)
- [ArrowPlotDeclaration.kind](#type-161)
- [ArrowPlotDeclaration.colorUp](#type-162)
- [ArrowPlotDeclaration.colorDown](#type-163)
- [CandlePlotDeclaration](#type-164)
- [CandlePlotDeclaration.name](#type-165)
- [CandlePlotDeclaration.kind](#type-166)
- [BarPlotDeclaration](#type-167)
- [BarPlotDeclaration.name](#type-168)
- [BarPlotDeclaration.kind](#type-169)
- [PlotDeclarationBase](#type-170)
- [ShapeSize](#type-171)
- [ShapeOptions](#type-172)
- [ShapeOptions.textColor](#type-173)
- [CharOptions](#type-174)
- [ArrowOptions](#type-175)
- [PlotStyleBase](#type-176)
- [MarkerOptions](#type-177)
- [ShapeStyle](#type-178)
- [ShapeLocation](#type-179)

<a id="type-0"></a>

### Series

```ts
export interface Series {
    readonly 0: number;
    readonly 1: number;
    at(offset: number): number;
    readonly [offset: number]: number;
}
```

行情与金融计算共用的只读序列契约。

<a id="type-1"></a>

### Series.0

```ts
Series.0: number
```

<a id="type-2"></a>

### Series.1

```ts
Series.1: number
```

<a id="type-3"></a>

### Series.at

```ts
Series.at(offset: number): number
```

动态偏移访问，严格 TypeScript 模式下也始终返回 number。

<a id="type-4"></a>

### LineRef

```ts
export interface LineRef {
    readonly id: string;
}
```

不暴露可修改对象本身的引用，只在所属运行内有效。

<a id="type-5"></a>

### LineRef.id

```ts
LineRef.id: string
```

对象标识；同一对象在 line.all 与创建结果中是同一个引用。

<a id="type-6"></a>

### ScriptParameters

```ts
interface ScriptParameters {
}
```

编辑器从当前 inputs 推导并合并具体参数。

<a id="type-7"></a>

### DrawingLineApi

```ts
export interface DrawingLineApi {
    readonly style_solid: LineStyle;
    readonly style_dashed: LineStyle;
    readonly style_dotted: LineStyle;
    readonly style_arrow_left: LineStyle;
    readonly style_arrow_right: LineStyle;
    readonly style_arrow_both: LineStyle;
    readonly new: LineFactory;
    readonly all: readonly LineRef[];
    set_xy1(id: LineRef, x: number, y: number): void;
    set_xy2(id: LineRef, x: number, y: number): void;
    set_x1(id: LineRef, x: number): void;
    set_y1(id: LineRef, y: number): void;
    set_x2(id: LineRef, x: number): void;
    set_y2(id: LineRef, y: number): void;
    set_color(id: LineRef, color: string): void;
    set_style(id: LineRef, style: LineStyle): void;
    set_width(id: LineRef, width: number): void;
    set_extend(id: LineRef, extend: LineExtend): void;
    get_x1(id: LineRef): number;
    get_y1(id: LineRef): number;
    get_x2(id: LineRef): number;
    get_y2(id: LineRef): number;
    get_color(id: LineRef): string | null;
    get_style(id: LineRef): LineStyle | null;
    get_width(id: LineRef): number;
    get_extend(id: LineRef): LineExtend | null;
    get_price(id: LineRef, x: number): number;
    copy(id: LineRef): LineRef | null;
    delete(id: LineRef | null): void;
}
```

脚本和原生调用方共用的完整 line API。

线段跨 bar 保留，新建和修改只能在 onBar 内调用；引用只在本次运行内有效，
重算后旧引用失效，需要继续操作时从 line.all 或新的结果重新获取。
线段删除或回收后，set_* 不生效，get_* 返回 NaN 或 null。

| 用法 | 含义 |
| --- | --- |
| `line.new(...)` | 绘制线段，超出 max_lines_count 时回收最旧 |
| `line.set_*` | 修改端点、颜色、线型、线宽或延伸 |
| `line.get_*` | 读取对应属性；已删除返回 NaN 或 null |
| `line.get_price(id, x)` | 按线段所在直线求价格，只支持 bar_index |
| `line.copy` / `line.delete` | 复制为新线段 / 删除线段 |

<a id="type-8"></a>

### LineStyle

```ts
export type LineStyle = (typeof LineStyle)[keyof typeof LineStyle];
```

手绘与脚本共用的对象、坐标、样式和 Pine 风格 line API 契约。

<a id="type-9"></a>

### LineFactory

```ts
export interface LineFactory {
    (first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef;
    (x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: string, style?: LineStyle, width?: number): LineRef;
}
```

line.new 的重载：用 chart.point 端点或直接给出起止点的 X / Y 绘制线段。

<a id="type-10"></a>

### LineExtend

```ts
export type LineExtend = (typeof extend)[keyof typeof extend];
```

<a id="type-11"></a>

### ChartPoint

```ts
export interface ChartPoint {
    readonly index?: number;
    readonly time?: number;
    readonly price: number;
}
```

chart.point 值对象；绘制线段时复制坐标。

<a id="type-12"></a>

### ChartPoint.index

```ts
ChartPoint.index?: number | undefined
```

bar 索引；xloc.bar_index 时 line 读取该字段。

<a id="type-13"></a>

### ChartPoint.time

```ts
ChartPoint.time?: number | undefined
```

K 线时间戳（毫秒）；xloc.bar_time 时 line 读取该字段。

<a id="type-14"></a>

### ChartPoint.price

```ts
ChartPoint.price: number
```

价格。

<a id="type-15"></a>

### TechnicalAnalysisLibrary

```ts
export type TechnicalAnalysisLibrary = {
    rising(source: Series, length: number): boolean;
    falling(source: Series, length: number): boolean;
    change(source: Series, length?: number): Series;
    sma(source: Series, length: number): Series;
    sum(source: Series, length: number): Series;
    highest(source: Series, length: number): Series;
    lowest(source: Series, length: number): Series;
    highestbars(source: Series, length: number): Series;
    lowestbars(source: Series, length: number): Series;
    rma(source: Series, length: number): Series;
    swma(source: Series): Series;
    alma(source: Series, length: number, offset?: number, sigma?: number, floor?: boolean): Series;
    stddev(source: Series, length: number): Series;
    ema(source: Series, length: number): Series;
    dema(source: Series, length: number): Series;
    tema(source: Series, length: number): Series;
    t3(source: Series, length: number, volumeFactor?: number): Series;
    trima(source: Series, length: number): Series;
    macd(source: Series, fastLength: number, slowLength: number, signalLength: number): readonly [
        Series,
        Series,
        Series
    ];
    wma(source: Series, length: number): Series;
    hma(source: Series, length: number): Series;
    linreg(source: Series, length: number, offset?: number): Series;
    cci(source: Series, length: number): Series;
    vwma(source: Series, volume: Series, length: number): Series;
    rsi(source: Series, length: number): Series;
    stoch(source: Series, high: Series, low: Series, length: number): Series;
    atr(length: number): Series;
    supertrend(multiplier: number, atrPeriod: number): readonly [
        Series,
        Series
    ];
    mom(source: Series, length?: number): Series;
    roc(source: Series, length?: number): Series;
    cmo(source: Series, length: number): Series;
    crossover(left: Series, right: Series): boolean;
    crossunder(left: Series, right: Series): boolean;
};
```

技术分析库公开接口。

<a id="type-16"></a>

### Position

```ts
export enum Position {
    Main = 'main',
    Sub = 'sub'
}
```

**@summary** 渲染位置

指标渲染位置；脚本声明、编辑器与宿主共用同一组取值。

<a id="type-17"></a>

### ScriptInput

```ts
export interface ScriptInput {
    int(value: number, options?: NumberInputOptions): number;
    float(value: number, options?: NumberInputOptions): number;
    bool(value: boolean, options?: InputOptions): boolean;
    string(value: string, options?: StringInputOptions): string;
    timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe;
}
```

按输入类型声明默认值与对应选项，params 根据返回声明推导值类型。

<a id="type-18"></a>

### NumberInputOptions

```ts
export interface NumberInputOptions extends InputOptions {
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}
```

数值输入的范围与步长。

<a id="type-19"></a>

### NumberInputOptions.min

```ts
NumberInputOptions.min?: number | undefined
```

<a id="type-20"></a>

### NumberInputOptions.max

```ts
NumberInputOptions.max?: number | undefined
```

<a id="type-21"></a>

### NumberInputOptions.step

```ts
NumberInputOptions.step?: number | undefined
```

<a id="type-22"></a>

### NumberInputOptions.title

```ts
NumberInputOptions.title?: string | undefined
```

参数面板中的显示名；不填则显示参数名。

<a id="type-23"></a>

### InputOptions

```ts
export interface InputOptions {
    readonly title?: string;
}
```

输入参数的公共展示选项。

<a id="type-24"></a>

### StringInputOptions

```ts
export interface StringInputOptions extends InputOptions {
    readonly options?: readonly string[];
}
```

字符串输入可通过 options 渲染下拉选择。

<a id="type-25"></a>

### StringInputOptions.options

```ts
StringInputOptions.options?: readonly string[] | undefined
```

<a id="type-26"></a>

### Timeframe

```ts
export type Timeframe = (typeof Timeframe)[keyof typeof Timeframe];
```

**@summary** 目标周期

脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。

取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。

<a id="type-27"></a>

### TimeframeInputOptions

```ts
export interface TimeframeInputOptions extends InputOptions {
    readonly options?: readonly Timeframe[];
}
```

周期输入的 options 只允许 Timeframe 中登记的周期。

<a id="type-28"></a>

### TimeframeInputOptions.options

```ts
TimeframeInputOptions.options?: readonly Timeframe[] | undefined
```

<a id="type-29"></a>

### ScriptIndicatorDeclaration

```ts
export interface ScriptIndicatorDeclaration extends Omit<QuickJSScriptDefinition, 'inputs'> {
    onBar(): void;
}
```

完整脚本的声明与逐 bar 执行回调。

<a id="type-30"></a>

### ScriptIndicatorDeclaration.onBar

```ts
ScriptIndicatorDeclaration.onBar(): void
```

逐根 K 线调用一次

<a id="type-31"></a>

### ScriptIndicatorDeclaration.name

```ts
ScriptIndicatorDeclaration.name: string
```

稳定身份与选择器短名；注册身份由宿主维护。

<a id="type-32"></a>

### ScriptIndicatorDeclaration.format

```ts
ScriptIndicatorDeclaration.format?: Format | undefined
```

指标级数值格式；驱动副图轴与图例显示，缺省按价格。

<a id="type-33"></a>

### ScriptIndicatorDeclaration.title

```ts
ScriptIndicatorDeclaration.title?: string | undefined
```

指标选择器/图例显示的长名称；缺省用 name。

<a id="type-34"></a>

### ScriptIndicatorDeclaration.info

```ts
ScriptIndicatorDeclaration.info?: string | undefined
```

指标选择器里的说明文本；缺省不展示说明。

<a id="type-35"></a>

### ScriptIndicatorDeclaration.position

```ts
ScriptIndicatorDeclaration.position: Position
```

指标渲染位置。

| 取值 | 含义 |
| --- | --- |
| `Position.Main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.Sub` | 独立副图 |

<a id="type-36"></a>

### ScriptIndicatorDeclaration.max_lines_count

```ts
ScriptIndicatorDeclaration.max_lines_count?: number | undefined
```

可保留的 line 对象数；默认 50，范围 1..500。

<a id="type-37"></a>

### ScriptPlot

```ts
export interface ScriptPlot {
    Line(value: number | null, name: string, options?: PlotStyleOptions<'line'>): PlotRef;
    LineBR(value: number | null, name: string, options?: PlotStyleOptions<'linebr'>): PlotRef;
    StepLine(value: number | null, name: string, options?: PlotStyleOptions<'stepline'>): PlotRef;
    StepLineBR(value: number | null, name: string, options?: PlotStyleOptions<'steplinebr'>): PlotRef;
    Histogram(value: number | null, name: string, options?: PlotStyleOptions<'histogram'>): PlotRef;
    Columns(value: number | null, name: string, options?: PlotStyleOptions<'columns'>): PlotRef;
    Point(value: number | null, name: string, options?: PlotStyleOptions<'points'>): PlotRef;
    Shape(value: number | boolean | null, name: string, options?: PlotStyleOptions<'shape'>): PlotRef;
    Char(value: number | boolean | null, name: string, options?: PlotStyleOptions<'char'>): PlotRef;
    Arrow(value: number | null, name: string, options?: PlotStyleOptions<'arrow'>): PlotRef;
    Candle(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: CandlePlotOptions): void;
    Bar(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: BarPlotOptions): void;
}
```

当前 K 线绘图入口；name 必填，null 留空；单值方法返回 PlotRef，OHLC 方法返回 void。

<a id="type-38"></a>

### PlotStyleOptions

```ts
export type PlotStyleOptions<K extends PlotDeclaration['kind']> = Omit<Extract<PlotDeclaration, {
    kind: K;
}>, 'kind' | 'name'>;
```

从共享声明提取对应图形的样式选项，类型由方法名确定。

<a id="type-39"></a>

### PlotStyleOptions.label

```ts
PlotStyleOptions.label?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["label"] | undefined
```

图例名称；不填则取 name。

<a id="type-40"></a>

### PlotStyleOptions.color

```ts
PlotStyleOptions.color?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["color"] | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-41"></a>

### PlotStyleOptions.format

```ts
PlotStyleOptions.format?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["format"] | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-42"></a>

### PlotStyleOptions.offset

```ts
PlotStyleOptions.offset?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["offset"] | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-43"></a>

### PlotStyleOptions.visible

```ts
PlotStyleOptions.visible?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["visible"] | undefined
```

是否显示图形；不填则显示。

<a id="type-44"></a>

### PlotRef

```ts
export interface PlotRef {
    readonly name: string;
}
```

plot.* 返回的绘图句柄；fill 借它引用两个 Plot。

<a id="type-45"></a>

### PlotRef.name

```ts
PlotRef.name: string
```

句柄所属 Plot 的 name。

<a id="type-46"></a>

### CandlePlotOptions

```ts
export interface CandlePlotOptions extends OhlcPlotOptions {
    readonly wickColor?: string | null;
    readonly borderColor?: string | null;
}
```

蜡烛实体、影线和边框可独立着色。

<a id="type-47"></a>

### CandlePlotOptions.wickColor

```ts
CandlePlotOptions.wickColor?: string | null | undefined
```

<a id="type-48"></a>

### CandlePlotOptions.borderColor

```ts
CandlePlotOptions.borderColor?: string | null | undefined
```

<a id="type-49"></a>

### CandlePlotOptions.label

```ts
CandlePlotOptions.label?: string | undefined
```

<a id="type-50"></a>

### CandlePlotOptions.visible

```ts
CandlePlotOptions.visible?: boolean | undefined
```

<a id="type-51"></a>

### CandlePlotOptions.offset

```ts
CandlePlotOptions.offset?: number | undefined
```

<a id="type-52"></a>

### CandlePlotOptions.showLast

```ts
CandlePlotOptions.showLast?: number | undefined
```

<a id="type-53"></a>

### CandlePlotOptions.color

```ts
CandlePlotOptions.color?: string | null | undefined
```

<a id="type-54"></a>

### CandlePlotOptions.format

```ts
CandlePlotOptions.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-55"></a>

### BarPlotOptions

```ts
export interface BarPlotOptions extends OhlcPlotOptions {
}
```

美国线的竖线和左右短横线共用颜色。

<a id="type-56"></a>

### ScriptFillOptions

```ts
export interface ScriptFillOptions {
    readonly visible?: boolean;
}
```

fill 第 5 个参数的可选样式；title 缺省时按 from/to 生成填充标识。

<a id="type-57"></a>

### ScriptFillOptions.visible

```ts
ScriptFillOptions.visible?: boolean | undefined
```

是否绘制填充；不填则绘制。

<a id="type-58"></a>

### LibraryModules

```ts
export interface LibraryModules {
}
```

库的类型目录，由宿主按库名补充，不负责运行时加载。
内置库的类型目录。

<a id="type-59"></a>

### LibraryModules.ta

```ts
LibraryModules.ta: TechnicalAnalysisLibrary
```

<a id="type-60"></a>

### LibraryModules

```ts
interface LibraryModules {
    ta: TechnicalAnalysisLibrary;
}
```

库的类型目录，由宿主按库名补充，不负责运行时加载。
内置库的类型目录。

<a id="type-61"></a>

### ScriptRequest

```ts
export interface ScriptRequest {
    security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: SecurityOptions): RequestResult<T>;
}
```

跨品种、跨周期取数入口，等价于 Pine 的 request.security。

<a id="type-62"></a>

### RequestValue

```ts
export type RequestValue = number | string | boolean | null | readonly RequestValue[];
```

<a id="type-63"></a>

### SecurityOptions

```ts
export interface SecurityOptions {
    readonly source?: DataSource;
    readonly calcBarsCount?: number;
    readonly gaps?: 'off' | 'on';
}
```

<a id="type-64"></a>

### SecurityOptions.source

```ts
SecurityOptions.source?: DataSource | undefined
```

目标来源的 sourceId；仅当请求品种与图表品种不同时必须显式指定。

<a id="type-65"></a>

### SecurityOptions.calcBarsCount

```ts
SecurityOptions.calcBarsCount?: number | undefined
```

图表历史起点之前额外加载的目标周期预热根数，缺省 300。

<a id="type-66"></a>

### SecurityOptions.gaps

```ts
SecurityOptions.gaps?: "off" | "on" | undefined
```

缺口策略：`off` 延续最近可用结果，`on` 只在新目标结果出现时输出，其余点留空。

<a id="type-67"></a>

### RequestResult

```ts
export type RequestResult<T> = T extends Series ? number : T extends readonly unknown[] ? {
    readonly [K in keyof T]: RequestResult<T[K]>;
} : T;
```

<a id="type-68"></a>

### LineXLoc

```ts
export type LineXLoc = (typeof xloc)[keyof typeof xloc];
```

<a id="type-69"></a>

### QuickJSScriptDefinition

```ts
export interface QuickJSScriptDefinition {
    readonly name: string;
    readonly title?: string;
    readonly info?: string;
    readonly position: Position;
    readonly format?: Format;
    readonly max_lines_count?: number;
    readonly inputs: InputSchema<Record<string, ScriptParamValue>>;
}
```

从完整脚本文件声明中读取的元数据，函数仍留在 VM 内执行。

<a id="type-70"></a>

### QuickJSScriptDefinition.name

```ts
QuickJSScriptDefinition.name: string
```

稳定身份与选择器短名；注册身份由宿主维护。

<a id="type-71"></a>

### QuickJSScriptDefinition.title

```ts
QuickJSScriptDefinition.title?: string | undefined
```

指标选择器/图例显示的长名称；缺省用 name。

<a id="type-72"></a>

### QuickJSScriptDefinition.info

```ts
QuickJSScriptDefinition.info?: string | undefined
```

指标选择器里的说明文本；缺省不展示说明。

<a id="type-73"></a>

### QuickJSScriptDefinition.position

```ts
QuickJSScriptDefinition.position: Position
```

指标渲染位置。

| 取值 | 含义 |
| --- | --- |
| `Position.Main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.Sub` | 独立副图 |

<a id="type-74"></a>

### QuickJSScriptDefinition.format

```ts
QuickJSScriptDefinition.format?: Format | undefined
```

指标级数值格式；驱动副图轴与图例显示，缺省按价格。

<a id="type-75"></a>

### QuickJSScriptDefinition.max_lines_count

```ts
QuickJSScriptDefinition.max_lines_count?: number | undefined
```

可保留的 line 对象数；默认 50，范围 1..500。

<a id="type-76"></a>

### QuickJSScriptDefinition.inputs

```ts
QuickJSScriptDefinition.inputs: InputSchema<Record<string, ScriptParamValue>>
```

<a id="type-77"></a>

### PlotDeclaration

```ts
export type PlotDeclaration = ScalarPlotDeclaration | OhlcPlotDeclaration;
```

<a id="type-78"></a>

### PlotDeclaration.kind

```ts
PlotDeclaration.kind: "line" | "linebr" | "stepline" | "steplinebr" | "histogram" | "columns" | "points" | "shape" | "char" | "arrow" | "candle" | "bar"
```

绘图类型：折线。
绘图类型：柱状图。
绘图类型：散点。
绘图类型：固定形状标记。
绘图类型：字符标记。
绘图类型：数值箭头，正负决定方向，绝对值决定长度。

<a id="type-79"></a>

### PlotDeclaration.name

```ts
PlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-80"></a>

### PlotDeclaration.label

```ts
PlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-81"></a>

### PlotDeclaration.color

```ts
PlotDeclaration.color?: string | null | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-82"></a>

### PlotDeclaration.format

```ts
PlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-83"></a>

### PlotDeclaration.offset

```ts
PlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-84"></a>

### PlotDeclaration.visible

```ts
PlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-85"></a>

### OhlcPlotOptions

```ts
export interface OhlcPlotOptions {
    readonly label?: string;
    readonly visible?: boolean;
    readonly offset?: number;
    readonly showLast?: number;
    readonly color?: string | null;
    readonly format?: Format;
}
```

四价格图形的调用样式；颜色允许逐 bar 变化，null 隐藏对应部分。

<a id="type-86"></a>

### DataSource

```ts
export type DataSource = (typeof DataSource)[keyof typeof DataSource];
```

**@summary** 数据源

内置数据源身份；指定后严格路由，不做跨来源回退。

<a id="type-87"></a>

### Format

```ts
export type Format = (typeof Format)[keyof typeof Format];
```

**@summary** 数值格式

数值格式化档位；脚本里用 `Format.Volume` 即可，不填时按 `Format.Price` 处理。

| 成员 | 示例 |
| --- | --- |
| `Format.Price` | `1234.567` |
| `Format.Volume` | `1.25K`、`12.30M`、`3.40B` |
| `Format.Percent` | `3.45%`、`-12.30%` |
| `Format.Mintick` | `1234.5678901` |

<a id="type-88"></a>

### InputSchema

```ts
export type InputSchema<P> = {
    [K in keyof P]: InputDef<P[K]>;
};
```

输入声明表：键即参数名，P 为解析后的参数值类型。

<a id="type-89"></a>

### ScriptParamValue

```ts
export type ScriptParamValue = number | string | boolean;
```

可以在脚本中作为 `params` 读取的输入值。

<a id="type-90"></a>

### ScalarPlotDeclaration

```ts
export type ScalarPlotDeclaration = LinePlotDeclaration | LineBRPlotDeclaration | StepLinePlotDeclaration | StepLineBRPlotDeclaration | HistogramPlotDeclaration | ColumnsPlotDeclaration | PointsPlotDeclaration | ShapePlotDeclaration | CharPlotDeclaration | ArrowPlotDeclaration;
```

声明的 Plot：按 kind 区分各图形及其专用字段。

<a id="type-91"></a>

### ScalarPlotDeclaration.kind

```ts
ScalarPlotDeclaration.kind: "line" | "linebr" | "stepline" | "steplinebr" | "histogram" | "columns" | "points" | "shape" | "char" | "arrow"
```

绘图类型：折线。
绘图类型：柱状图。
绘图类型：散点。
绘图类型：固定形状标记。
绘图类型：字符标记。
绘图类型：数值箭头，正负决定方向，绝对值决定长度。

<a id="type-92"></a>

### ScalarPlotDeclaration.name

```ts
ScalarPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-93"></a>

### ScalarPlotDeclaration.label

```ts
ScalarPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-94"></a>

### ScalarPlotDeclaration.color

```ts
ScalarPlotDeclaration.color?: string | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-95"></a>

### ScalarPlotDeclaration.format

```ts
ScalarPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-96"></a>

### ScalarPlotDeclaration.textColor

```ts
ScalarPlotDeclaration.textColor?: string | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。

<a id="type-97"></a>

### ScalarPlotDeclaration.offset

```ts
ScalarPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-98"></a>

### ScalarPlotDeclaration.visible

```ts
ScalarPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-99"></a>

### ScalarPlotDeclaration.size

```ts
ScalarPlotDeclaration.size?: number | ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.Auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。
固定逻辑像素柱宽，或 Size 档位；默认 1px。

<a id="type-100"></a>

### OhlcPlotDeclaration

```ts
export type OhlcPlotDeclaration = CandlePlotDeclaration | BarPlotDeclaration;
```

<a id="type-101"></a>

### OhlcPlotDeclaration.name

```ts
OhlcPlotDeclaration.name: string
```

<a id="type-102"></a>

### OhlcPlotDeclaration.kind

```ts
OhlcPlotDeclaration.kind: "candle" | "bar"
```

<a id="type-103"></a>

### InputDef

```ts
export interface InputDef<T> extends InputOptions {
    readonly default: T;
    readonly options?: readonly string[];
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}
```

单个输入参数的声明，由 input() 工厂产出。

<a id="type-104"></a>

### InputDef.default

```ts
InputDef.default: T
```

默认值，同时决定参数在面板中的编辑类型。

<a id="type-105"></a>

### InputDef.options

```ts
InputDef.options?: readonly string[] | undefined
```

<a id="type-106"></a>

### InputDef.min

```ts
InputDef.min?: number | undefined
```

<a id="type-107"></a>

### InputDef.max

```ts
InputDef.max?: number | undefined
```

<a id="type-108"></a>

### InputDef.step

```ts
InputDef.step?: number | undefined
```

<a id="type-109"></a>

### LinePlotDeclaration

```ts
export interface LinePlotDeclaration extends PlotDeclarationBase {
    readonly kind: 'line';
    readonly dash?: readonly number[];
}
```

普通折线及其样式，跨空值连接有效点。

<a id="type-110"></a>

### LinePlotDeclaration.kind

```ts
LinePlotDeclaration.kind: "line"
```

绘图类型：折线。

<a id="type-111"></a>

### LinePlotDeclaration.dash

```ts
LinePlotDeclaration.dash?: readonly number[] | undefined
```

虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。

<a id="type-112"></a>

### LinePlotDeclaration.name

```ts
LinePlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-113"></a>

### LinePlotDeclaration.label

```ts
LinePlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-114"></a>

### LinePlotDeclaration.color

```ts
LinePlotDeclaration.color?: string | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-115"></a>

### LinePlotDeclaration.format

```ts
LinePlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-116"></a>

### LinePlotDeclaration.textColor

```ts
LinePlotDeclaration.textColor?: string | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。

<a id="type-117"></a>

### LinePlotDeclaration.offset

```ts
LinePlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-118"></a>

### LinePlotDeclaration.visible

```ts
LinePlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-119"></a>

### LinePlotDeclaration.size

```ts
LinePlotDeclaration.size?: ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.Auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。

<a id="type-120"></a>

### LineBRPlotDeclaration

```ts
export interface LineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'linebr';
}
```

断线折线及其样式，空值处断开。

<a id="type-121"></a>

### LineBRPlotDeclaration.kind

```ts
LineBRPlotDeclaration.kind: "linebr"
```

<a id="type-122"></a>

### LineBRPlotDeclaration.dash

```ts
LineBRPlotDeclaration.dash?: readonly number[] | undefined
```

虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。

<a id="type-123"></a>

### LineBRPlotDeclaration.name

```ts
LineBRPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-124"></a>

### LineBRPlotDeclaration.label

```ts
LineBRPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-125"></a>

### LineBRPlotDeclaration.color

```ts
LineBRPlotDeclaration.color?: string | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-126"></a>

### LineBRPlotDeclaration.format

```ts
LineBRPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-127"></a>

### LineBRPlotDeclaration.textColor

```ts
LineBRPlotDeclaration.textColor?: string | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。

<a id="type-128"></a>

### LineBRPlotDeclaration.offset

```ts
LineBRPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-129"></a>

### LineBRPlotDeclaration.visible

```ts
LineBRPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-130"></a>

### LineBRPlotDeclaration.size

```ts
LineBRPlotDeclaration.size?: ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.Auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。

<a id="type-131"></a>

### StepLinePlotDeclaration

```ts
export interface StepLinePlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'stepline';
}
```

阶梯线声明，在相邻有效点的水平中点跳变，跨空值连接。

<a id="type-132"></a>

### StepLinePlotDeclaration.kind

```ts
StepLinePlotDeclaration.kind: "stepline"
```

<a id="type-133"></a>

### StepLineBRPlotDeclaration

```ts
export interface StepLineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'steplinebr';
}
```

断线阶梯线声明，空值处断开。

<a id="type-134"></a>

### StepLineBRPlotDeclaration.kind

```ts
StepLineBRPlotDeclaration.kind: "steplinebr"
```

<a id="type-135"></a>

### HistogramPlotDeclaration

```ts
export interface HistogramPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
    readonly kind: 'histogram';
    readonly baseline?: number;
    readonly size?: ShapeSize | number;
}
```

柱状图及其样式。

<a id="type-136"></a>

### HistogramPlotDeclaration.kind

```ts
HistogramPlotDeclaration.kind: "histogram"
```

绘图类型：柱状图。

<a id="type-137"></a>

### HistogramPlotDeclaration.baseline

```ts
HistogramPlotDeclaration.baseline?: number | undefined
```

柱状图的起始基线值；不填则取 0。

<a id="type-138"></a>

### HistogramPlotDeclaration.size

```ts
HistogramPlotDeclaration.size?: number | ShapeSize | undefined
```

固定逻辑像素柱宽，或 Size 档位；默认 1px。

<a id="type-139"></a>

### HistogramPlotDeclaration.name

```ts
HistogramPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-140"></a>

### HistogramPlotDeclaration.label

```ts
HistogramPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-141"></a>

### HistogramPlotDeclaration.color

```ts
HistogramPlotDeclaration.color?: string | undefined
```

图形颜色，支持 CSS 颜色值；可为每根 K 线设置不同颜色。

<a id="type-142"></a>

### HistogramPlotDeclaration.format

```ts
HistogramPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-143"></a>

### HistogramPlotDeclaration.textColor

```ts
HistogramPlotDeclaration.textColor?: string | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。

<a id="type-144"></a>

### HistogramPlotDeclaration.offset

```ts
HistogramPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-145"></a>

### HistogramPlotDeclaration.visible

```ts
HistogramPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-146"></a>

### ColumnsPlotDeclaration

```ts
export interface ColumnsPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
    readonly kind: 'columns';
    readonly baseline?: number;
    readonly size?: never;
}
```

自动柱宽随 K 线间距缩放，不支持 size。

<a id="type-147"></a>

### ColumnsPlotDeclaration.kind

```ts
ColumnsPlotDeclaration.kind: "columns"
```

<a id="type-148"></a>

### ColumnsPlotDeclaration.baseline

```ts
ColumnsPlotDeclaration.baseline?: number | undefined
```

<a id="type-149"></a>

### ColumnsPlotDeclaration.size

```ts
ColumnsPlotDeclaration.size?: undefined
```

<a id="type-150"></a>

### PointsPlotDeclaration

```ts
export interface PointsPlotDeclaration extends PlotDeclarationBase {
    readonly kind: 'points';
}
```

点图 Plot 声明；散点直径由公共 size 决定。

<a id="type-151"></a>

### PointsPlotDeclaration.kind

```ts
PointsPlotDeclaration.kind: "points"
```

绘图类型：散点。

<a id="type-152"></a>

### ShapePlotDeclaration

```ts
export interface ShapePlotDeclaration extends PlotDeclarationBase, ShapeOptions {
    readonly kind: 'shape';
}
```

形状标记及其样式。

<a id="type-153"></a>

### ShapePlotDeclaration.kind

```ts
ShapePlotDeclaration.kind: "shape"
```

绘图类型：固定形状标记。

<a id="type-154"></a>

### ShapePlotDeclaration.style

```ts
ShapePlotDeclaration.style?: ShapeStyle | undefined
```

标记形状；不填则使用 ShapeStyle.XCross。

<a id="type-155"></a>

### ShapePlotDeclaration.location

```ts
ShapePlotDeclaration.location?: ShapeLocation | undefined
```

标记位置；默认在 K 线上方，ShapeLocation.Absolute 表示绘制在 value 指定的价格处。

<a id="type-156"></a>

### ShapePlotDeclaration.text

```ts
ShapePlotDeclaration.text?: string | undefined
```

标记旁的附加文字；不填则不显示附加文字。

<a id="type-157"></a>

### CharPlotDeclaration

```ts
export interface CharPlotDeclaration extends PlotDeclarationBase, CharOptions {
    readonly kind: 'char';
}
```

字符标记声明。

<a id="type-158"></a>

### CharPlotDeclaration.kind

```ts
CharPlotDeclaration.kind: "char"
```

绘图类型：字符标记。

<a id="type-159"></a>

### CharPlotDeclaration.char

```ts
CharPlotDeclaration.char?: string | undefined
```

要绘制的单个 Unicode 字符；不填则显示 ★，填空字符串则只显示附加文字。

<a id="type-160"></a>

### ArrowPlotDeclaration

```ts
export interface ArrowPlotDeclaration extends PlotDeclarationBase, ArrowOptions {
    readonly kind: 'arrow';
}
```

数值箭头声明。

<a id="type-161"></a>

### ArrowPlotDeclaration.kind

```ts
ArrowPlotDeclaration.kind: "arrow"
```

绘图类型：数值箭头，正负决定方向，绝对值决定长度。

<a id="type-162"></a>

### ArrowPlotDeclaration.colorUp

```ts
ArrowPlotDeclaration.colorUp?: string | undefined
```

正值向上箭头的颜色，支持 CSS 颜色值；默认使用 color。

<a id="type-163"></a>

### ArrowPlotDeclaration.colorDown

```ts
ArrowPlotDeclaration.colorDown?: string | undefined
```

负值向下箭头的颜色，支持 CSS 颜色值；默认使用 color。

<a id="type-164"></a>

### CandlePlotDeclaration

```ts
export interface CandlePlotDeclaration extends CandlePlotOptions {
    readonly name: string;
    readonly kind: 'candle';
}
```

<a id="type-165"></a>

### CandlePlotDeclaration.name

```ts
CandlePlotDeclaration.name: string
```

<a id="type-166"></a>

### CandlePlotDeclaration.kind

```ts
CandlePlotDeclaration.kind: "candle"
```

<a id="type-167"></a>

### BarPlotDeclaration

```ts
export interface BarPlotDeclaration extends BarPlotOptions {
    readonly name: string;
    readonly kind: 'bar';
}
```

<a id="type-168"></a>

### BarPlotDeclaration.name

```ts
BarPlotDeclaration.name: string
```

<a id="type-169"></a>

### BarPlotDeclaration.kind

```ts
BarPlotDeclaration.kind: "bar"
```

<a id="type-170"></a>

### PlotDeclarationBase

```ts
export interface PlotDeclarationBase extends PlotStyleBase {
    readonly name: string;
}
```

声明式 Plot 的公共信息。

<a id="type-171"></a>

### ShapeSize

```ts
export type ShapeSize = 'auto' | 'tiny' | 'small' | 'normal' | 'large' | 'huge';
```

**@summary** 尺寸档位

图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。

| 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
| --- | --- | --- | --- | --- | --- |
| ShapeSize.Auto | 1 | 3 | 12 | 50 | 1 |
| ShapeSize.Tiny | 1 | 6 | 6 | 20 | 1 |
| ShapeSize.Small | 1 | 10 | 10 | 30 | 1 |
| ShapeSize.Normal | 2 | 14 | 14 | 40 | 2 |
| ShapeSize.Large | 3 | 20 | 20 | 60 | 3 |
| ShapeSize.Huge | 4 | 28 | 28 | 90 | 4 |

px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
Columns 不接受 size，柱宽随 K 线间距自动调整。

<a id="type-172"></a>

### ShapeOptions

```ts
export interface ShapeOptions extends MarkerOptions {
    readonly style?: ShapeStyle;
}
```

固定形状标记的专属样式。

<a id="type-173"></a>

### ShapeOptions.textColor

```ts
ShapeOptions.textColor?: string | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。

<a id="type-174"></a>

### CharOptions

```ts
export interface CharOptions extends MarkerOptions {
    readonly char?: string;
}
```

字符标记；空字符可只显示附加文字。

<a id="type-175"></a>

### ArrowOptions

```ts
export interface ArrowOptions {
    readonly colorUp?: string;
    readonly colorDown?: string;
}
```

数值箭头的方向颜色；箭头长度由 Plot 公共的 size 决定。

<a id="type-176"></a>

### PlotStyleBase

```ts
export interface PlotStyleBase {
    readonly label?: string;
    readonly color?: string;
    readonly format?: Format;
    readonly textColor?: string;
    readonly offset?: number;
    readonly visible?: boolean;
    readonly size?: ShapeSize;
}
```

声明式 Plot 的公共样式。

<a id="type-177"></a>

### MarkerOptions

```ts
export interface MarkerOptions {
    readonly location?: ShapeLocation;
    readonly text?: string;
    readonly textColor?: string;
}
```

Shape 与 Char 的共享样式；相对位置过滤零值，absolute 把 value 当价格。

<a id="type-178"></a>

### ShapeStyle

```ts
export type ShapeStyle = 'xcross' | 'cross' | 'circle' | 'square' | 'diamond' | 'triangleup' | 'triangledown' | 'arrowup' | 'arrowdown' | 'labelup' | 'labeldown' | 'flag';
```

标记 Plot 的形状、位置、尺寸和方向样式；宿主、VM 与编辑器共用契约。

**@summary** 标记形状

固定形状标记可选的外形；缺省使用 XCross。

<a id="type-179"></a>

### ShapeLocation

```ts
export type ShapeLocation = 'abovebar' | 'belowbar' | 'top' | 'bottom' | 'absolute';
```

**@summary** 标记位置

标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。

