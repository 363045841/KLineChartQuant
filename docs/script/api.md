<!-- 此文件由 pnpm docs:script:generate 从 Script 编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API

本文与代码提示框使用同一份类型契约和注释。修改源码注释后运行 `pnpm docs:script:generate`，使用 `pnpm docs:script:check` 校验同步状态。

## 目录

- [Color](#api-0)
- [Color.red](#api-1)
- [Color.deepOrange](#api-2)
- [Color.orange](#api-3)
- [Color.amber](#api-4)
- [Color.yellow](#api-5)
- [Color.lime](#api-6)
- [Color.lightGreen](#api-7)
- [Color.green](#api-8)
- [Color.teal](#api-9)
- [Color.cyan](#api-10)
- [Color.lightBlue](#api-11)
- [Color.blue](#api-12)
- [Color.indigo](#api-13)
- [Color.purple](#api-14)
- [Color.pink](#api-15)
- [Color.brown](#api-16)
- [Color.blueGray](#api-17)
- [Color.gray](#api-18)
- [Color.foreground](#api-19)
- [Color.white](#api-20)
- [Color.black](#api-21)
- [LineStyle](#api-22)
- [LineStyle.solid](#api-23)
- [LineStyle.dashed](#api-24)
- [LineStyle.dotted](#api-25)
- [LineStyle.arrowLeft](#api-26)
- [LineStyle.arrowRight](#api-27)
- [LineStyle.arrowBoth](#api-28)
- [extend](#api-29)
- [extend.none](#api-30)
- [extend.left](#api-31)
- [extend.right](#api-32)
- [extend.both](#api-33)
- [xloc](#api-34)
- [xloc.barIndex](#api-35)
- [xloc.barTime](#api-36)
- [DataSource](#api-37)
- [DataSource.binance](#api-38)
- [DataSource.gotdx](#api-39)
- [DataSource.baoStock](#api-40)
- [DataSource.tradingView](#api-41)
- [DataSource.mt5](#api-42)
- [DataSource.ths](#api-43)
- [DataSource.mock](#api-44)
- [Timeframe](#api-45)
- [Timeframe.minute1](#api-46)
- [Timeframe.minute5](#api-47)
- [Timeframe.minute15](#api-48)
- [Timeframe.minute30](#api-49)
- [Timeframe.hour1](#api-50)
- [Timeframe.hour4](#api-51)
- [Timeframe.day](#api-52)
- [Timeframe.week](#api-53)
- [Timeframe.month1](#api-54)
- [Timeframe.month3](#api-55)
- [Timeframe.month12](#api-56)
- [Format](#api-57)
- [Format.price](#api-58)
- [Format.volume](#api-59)
- [Format.percent](#api-60)
- [Format.mintick](#api-61)
- [HLineStyle](#api-62)
- [HLineStyle.solid](#api-63)
- [HLineStyle.dashed](#api-64)
- [HLineStyle.dotted](#api-65)
- [ShapeStyle](#api-66)
- [ShapeStyle.xCross](#api-67)
- [ShapeStyle.cross](#api-68)
- [ShapeStyle.circle](#api-69)
- [ShapeStyle.square](#api-70)
- [ShapeStyle.diamond](#api-71)
- [ShapeStyle.triangleUp](#api-72)
- [ShapeStyle.triangleDown](#api-73)
- [ShapeStyle.arrowUp](#api-74)
- [ShapeStyle.arrowDown](#api-75)
- [ShapeStyle.labelUp](#api-76)
- [ShapeStyle.labelDown](#api-77)
- [ShapeStyle.flag](#api-78)
- [ShapeLocation](#api-79)
- [ShapeLocation.aboveBar](#api-80)
- [ShapeLocation.belowBar](#api-81)
- [ShapeLocation.top](#api-82)
- [ShapeLocation.bottom](#api-83)
- [ShapeLocation.absolute](#api-84)
- [ShapeSize](#api-85)
- [ShapeSize.auto](#api-86)
- [ShapeSize.tiny](#api-87)
- [ShapeSize.small](#api-88)
- [ShapeSize.normal](#api-89)
- [ShapeSize.large](#api-90)
- [ShapeSize.huge](#api-91)
- [console](#api-92)
- [console.log](#api-93)
- [console.info](#api-94)
- [console.warn](#api-95)
- [console.error](#api-96)
- [console.debug](#api-97)
- [box](#api-98)
- [box.new](#api-99)
- [box.all](#api-100)
- [box.setLeft](#api-101)
- [box.setTop](#api-102)
- [box.setRight](#api-103)
- [box.setBottom](#api-104)
- [box.setLeftTop](#api-105)
- [box.setRightBottom](#api-106)
- [box.setTopLeftPoint](#api-107)
- [box.setBottomRightPoint](#api-108)
- [box.setXLoc](#api-109)
- [box.setExtend](#api-110)
- [box.setBgColor](#api-111)
- [box.setBorderColor](#api-112)
- [box.setBorderWidth](#api-113)
- [box.setBorderStyle](#api-114)
- [box.setText](#api-115)
- [box.setTextColor](#api-116)
- [box.setTextSize](#api-117)
- [box.setTextHAlign](#api-118)
- [box.setTextVAlign](#api-119)
- [box.getLeft](#api-120)
- [box.getTop](#api-121)
- [box.getRight](#api-122)
- [box.getBottom](#api-123)
- [box.copy](#api-124)
- [box.delete](#api-125)
- [label](#api-126)
- [label.styleNone](#api-127)
- [label.new](#api-128)
- [label.all](#api-129)
- [label.setX](#api-130)
- [label.setY](#api-131)
- [label.setXY](#api-132)
- [label.setText](#api-133)
- [label.setTextColor](#api-134)
- [label.setSize](#api-135)
- [label.setTextAlign](#api-136)
- [label.setYOffset](#api-137)
- [label.getX](#api-138)
- [label.getY](#api-139)
- [label.getText](#api-140)
- [label.getYOffset](#api-141)
- [label.copy](#api-142)
- [label.delete](#api-143)
- [barstate](#api-144)
- [barstate.isLast](#api-145)
- [open](#api-146)
- [high](#api-147)
- [low](#api-148)
- [close](#api-149)
- [volume](#api-150)
- [time](#api-151)
- [timeOpen](#api-152)
- [timeClose](#api-153)
- [timeTradingDay](#api-154)
- [timeTradingDay.toString](#api-155)
- [timeTradingDay.toFixed](#api-156)
- [timeTradingDay.toExponential](#api-157)
- [timeTradingDay.toPrecision](#api-158)
- [timeTradingDay.valueOf](#api-159)
- [timeTradingDay.toLocaleString](#api-160)
- [timeframe](#api-161)
- [timeframe.period](#api-162)
- [timeframe.inSeconds](#api-163)
- [timeframe.change](#api-164)
- [session](#api-165)
- [session.isMarket](#api-166)
- [session.isPremarket](#api-167)
- [session.isPostmarket](#api-168)
- [session.isFirstBar](#api-169)
- [session.isFirstBarRegular](#api-170)
- [barIndex](#api-171)
- [barIndex.toString](#api-172)
- [barIndex.toFixed](#api-173)
- [barIndex.toExponential](#api-174)
- [barIndex.toPrecision](#api-175)
- [barIndex.valueOf](#api-176)
- [barIndex.toLocaleString](#api-177)
- [line](#api-178)
- [line.new](#api-179)
- [line.all](#api-180)
- [line.setXY1](#api-181)
- [line.setXY2](#api-182)
- [line.setX1](#api-183)
- [line.setY1](#api-184)
- [line.setX2](#api-185)
- [line.setY2](#api-186)
- [line.setColor](#api-187)
- [line.setStyle](#api-188)
- [line.setWidth](#api-189)
- [line.setExtend](#api-190)
- [line.getX1](#api-191)
- [line.getY1](#api-192)
- [line.getX2](#api-193)
- [line.getY2](#api-194)
- [line.getColor](#api-195)
- [line.getStyle](#api-196)
- [line.getWidth](#api-197)
- [line.getExtend](#api-198)
- [line.getPrice](#api-199)
- [line.copy](#api-200)
- [line.delete](#api-201)
- [chart](#api-202)
- [chart.point](#api-203)
- [chart.point.new](#api-204)
- [chart.point.now](#api-205)
- [chart.point.fromIndex](#api-206)
- [chart.point.fromTime](#api-207)
- [chart.point.copy](#api-208)
- [ta](#api-209)
- [ta.rising](#api-210)
- [ta.falling](#api-211)
- [ta.change](#api-212)
- [ta.sma](#api-213)
- [ta.sum](#api-214)
- [ta.maxsum](#api-215)
- [ta.highest](#api-216)
- [ta.lowest](#api-217)
- [ta.pivothigh](#api-218)
- [ta.pivotlow](#api-219)
- [ta.highestBars](#api-220)
- [ta.lowestBars](#api-221)
- [ta.rma](#api-222)
- [ta.swma](#api-223)
- [ta.alma](#api-224)
- [ta.stddev](#api-225)
- [ta.ema](#api-226)
- [ta.dema](#api-227)
- [ta.tema](#api-228)
- [ta.t3](#api-229)
- [ta.trima](#api-230)
- [ta.macd](#api-231)
- [ta.wma](#api-232)
- [ta.hma](#api-233)
- [ta.linreg](#api-234)
- [ta.cci](#api-235)
- [ta.vwma](#api-236)
- [ta.rsi](#api-237)
- [ta.stoch](#api-238)
- [ta.atr](#api-239)
- [ta.supertrend](#api-240)
- [ta.mom](#api-241)
- [ta.roc](#api-242)
- [ta.cmo](#api-243)
- [ta.crossover](#api-244)
- [ta.crossunder](#api-245)
- [Position](#api-246)
- [Position.main](#api-247)
- [Position.sub](#api-248)
- [input](#api-249)
- [input.session](#api-250)
- [input.int](#api-251)
- [input.float](#api-252)
- [input.bool](#api-253)
- [input.string](#api-254)
- [input.timeframe](#api-255)
- [defineIndicator](#api-256)
- [derive](#api-257)
- [plot](#api-258)
- [plot.Line](#api-259)
- [plot.LineBR](#api-260)
- [plot.StepLine](#api-261)
- [plot.StepLineBR](#api-262)
- [plot.Histogram](#api-263)
- [plot.Columns](#api-264)
- [plot.Point](#api-265)
- [plot.Shape](#api-266)
- [plot.Char](#api-267)
- [plot.Arrow](#api-268)
- [plot.Candle](#api-269)
- [plot.Bar](#api-270)
- [fill](#api-271)
- [fill](#api-272)
- [hline](#api-273)
- [defineLibrary](#api-274)
- [importLibrary](#api-275)
- [request](#api-276)
- [request.securityLowerTf](#api-277)
- [request.security](#api-278)
- [syminfo](#api-279)
- [syminfo.tickerId](#api-280)
- [syminfo.timezone](#api-281)
- [syminfo.session](#api-282)

## 全局 API

<a id="api-0"></a>

### Color

```ts
Color: typeof Color
```

**@summary** 常用色

常用色：主题色别名 + 白 / 黑两个绝对色。

脚本里用 `Color.red` 即可；别名与 Theme.colors.scriptPalette 的键一一对应。

<a id="api-1"></a>

### Color.red

```ts
Color.red = "@red"
```

**@summary** 红

<a id="api-2"></a>

### Color.deepOrange

```ts
Color.deepOrange = "@deepOrange"
```

**@summary** 深橙

<a id="api-3"></a>

### Color.orange

```ts
Color.orange = "@orange"
```

**@summary** 橙

<a id="api-4"></a>

### Color.amber

```ts
Color.amber = "@amber"
```

**@summary** 琥珀

<a id="api-5"></a>

### Color.yellow

```ts
Color.yellow = "@yellow"
```

**@summary** 黄

<a id="api-6"></a>

### Color.lime

```ts
Color.lime = "@lime"
```

**@summary** 青柠

<a id="api-7"></a>

### Color.lightGreen

```ts
Color.lightGreen = "@lightGreen"
```

**@summary** 浅绿

<a id="api-8"></a>

### Color.green

```ts
Color.green = "@green"
```

**@summary** 绿

<a id="api-9"></a>

### Color.teal

```ts
Color.teal = "@teal"
```

**@summary** 蓝绿

<a id="api-10"></a>

### Color.cyan

```ts
Color.cyan = "@cyan"
```

**@summary** 青

<a id="api-11"></a>

### Color.lightBlue

```ts
Color.lightBlue = "@lightBlue"
```

**@summary** 浅蓝

<a id="api-12"></a>

### Color.blue

```ts
Color.blue = "@blue"
```

**@summary** 蓝

<a id="api-13"></a>

### Color.indigo

```ts
Color.indigo = "@indigo"
```

**@summary** 靛蓝

<a id="api-14"></a>

### Color.purple

```ts
Color.purple = "@purple"
```

**@summary** 紫

<a id="api-15"></a>

### Color.pink

```ts
Color.pink = "@pink"
```

**@summary** 粉

<a id="api-16"></a>

### Color.brown

```ts
Color.brown = "@brown"
```

**@summary** 棕

<a id="api-17"></a>

### Color.blueGray

```ts
Color.blueGray = "@blueGray"
```

**@summary** 蓝灰

<a id="api-18"></a>

### Color.gray

```ts
Color.gray = "@gray"
```

**@summary** 灰

<a id="api-19"></a>

### Color.foreground

```ts
Color.foreground = "@foreground"
```

**@summary** 前景

<a id="api-20"></a>

### Color.white

```ts
Color.white = "#ffffff"
```

**@summary** 白

<a id="api-21"></a>

### Color.black

```ts
Color.black = "#000000"
```

**@summary** 黑

<a id="api-22"></a>

### LineStyle

```ts
LineStyle: typeof LineStyle
```

线型：实线、虚线与箭头；手绘和 line API 共用。

<a id="api-23"></a>

### LineStyle.solid

```ts
LineStyle.solid = "solid"
```

**@summary** 实线

<a id="api-24"></a>

### LineStyle.dashed

```ts
LineStyle.dashed = "dashed"
```

**@summary** 虚线

<a id="api-25"></a>

### LineStyle.dotted

```ts
LineStyle.dotted = "dotted"
```

**@summary** 点线

<a id="api-26"></a>

### LineStyle.arrowLeft

```ts
LineStyle.arrowLeft = "arrow_left"
```

**@summary** 左箭头

<a id="api-27"></a>

### LineStyle.arrowRight

```ts
LineStyle.arrowRight = "arrow_right"
```

**@summary** 右箭头

<a id="api-28"></a>

### LineStyle.arrowBoth

```ts
LineStyle.arrowBoth = "arrow_both"
```

**@summary** 双箭头

<a id="api-29"></a>

### extend

```ts
extend: typeof extend
```

延伸沿两锚点的参数方向，与屏幕左右方向无关。

<a id="api-30"></a>

### extend.none

```ts
extend.none = "none"
```

**@summary** 不延伸

<a id="api-31"></a>

### extend.left

```ts
extend.left = "left"
```

**@summary** 延伸至起点之外

<a id="api-32"></a>

### extend.right

```ts
extend.right = "right"
```

**@summary** 延伸至终点之外

<a id="api-33"></a>

### extend.both

```ts
extend.both = "both"
```

**@summary** 两端延伸

<a id="api-34"></a>

### xloc

```ts
xloc: typeof xloc
```

决定 X 是第几根 K 线还是毫秒时间戳。

barIndex 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
允许范围是 0 到当前 barIndex，再向右最多 500 根；越界直接报错。
要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。

<a id="api-35"></a>

### xloc.barIndex

```ts
xloc.barIndex = "bar_index"
```

**@summary** 第几根 K 线

<a id="api-36"></a>

### xloc.barTime

```ts
xloc.barTime = "bar_time"
```

**@summary** 毫秒时间戳

<a id="api-37"></a>

### DataSource

```ts
DataSource: typeof DataSource
```

**@summary** 数据源

内置数据源身份；指定后严格路由，不做跨来源回退。

<a id="api-38"></a>

### DataSource.binance

```ts
DataSource.binance = "binance"
```

**@summary** 币安

<a id="api-39"></a>

### DataSource.gotdx

```ts
DataSource.gotdx = "gotdx"
```

**@summary** 通达信

<a id="api-40"></a>

### DataSource.baoStock

```ts
DataSource.baoStock = "baostock"
```

**@summary** 证券宝

<a id="api-41"></a>

### DataSource.tradingView

```ts
DataSource.tradingView = "tradingview"
```

**@summary** TradingView

<a id="api-42"></a>

### DataSource.mt5

```ts
DataSource.mt5 = "mt5"
```

**@summary** MetaTrader 5

<a id="api-43"></a>

### DataSource.ths

```ts
DataSource.ths = "ths"
```

**@summary** 同花顺

<a id="api-44"></a>

### DataSource.mock

```ts
DataSource.mock = "mock"
```

**@summary** 模拟数据

<a id="api-45"></a>

### Timeframe

```ts
Timeframe: typeof Timeframe
```

**@summary** 目标周期

脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。

取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。

<a id="api-46"></a>

### Timeframe.minute1

```ts
Timeframe.minute1 = "1"
```

**@summary** 1 分钟

<a id="api-47"></a>

### Timeframe.minute5

```ts
Timeframe.minute5 = "5"
```

**@summary** 5 分钟

<a id="api-48"></a>

### Timeframe.minute15

```ts
Timeframe.minute15 = "15"
```

**@summary** 15 分钟

<a id="api-49"></a>

### Timeframe.minute30

```ts
Timeframe.minute30 = "30"
```

**@summary** 30 分钟

<a id="api-50"></a>

### Timeframe.hour1

```ts
Timeframe.hour1 = "60"
```

**@summary** 1 小时

<a id="api-51"></a>

### Timeframe.hour4

```ts
Timeframe.hour4 = "240"
```

**@summary** 4 小时

<a id="api-52"></a>

### Timeframe.day

```ts
Timeframe.day = "D"
```

**@summary** 日线

<a id="api-53"></a>

### Timeframe.week

```ts
Timeframe.week = "W"
```

**@summary** 周线

<a id="api-54"></a>

### Timeframe.month1

```ts
Timeframe.month1 = "M"
```

**@summary** 月线

<a id="api-55"></a>

### Timeframe.month3

```ts
Timeframe.month3 = "3M"
```

**@summary** 季线

<a id="api-56"></a>

### Timeframe.month12

```ts
Timeframe.month12 = "12M"
```

**@summary** 年线

<a id="api-57"></a>

### Format

```ts
Format: typeof Format
```

**@summary** 数值格式

数值格式化档位；脚本里用 `Format.volume` 即可，不填时按 `Format.price` 处理。

| 成员 | 示例 |
| --- | --- |
| `Format.price` | `1234.567` |
| `Format.volume` | `1.25K`、`12.30M`、`3.40B` |
| `Format.percent` | `3.45%`、`-12.30%` |
| `Format.mintick` | `1234.5678901` |

<a id="api-58"></a>

### Format.price

```ts
Format.price = "price"
```

**@summary** 价格

<a id="api-59"></a>

### Format.volume

```ts
Format.volume = "volume"
```

**@summary** 成交量

<a id="api-60"></a>

### Format.percent

```ts
Format.percent = "percent"
```

**@summary** 百分比

<a id="api-61"></a>

### Format.mintick

```ts
Format.mintick = "mintick"
```

**@summary** 最小变动单位

<a id="api-62"></a>

### HLineStyle

```ts
HLineStyle: typeof HLineStyle
```

**@summary** 水平线线型

`hline` 的线型档位；与手绘 line 的 `LineStyle` 同义，只保留线型子集。

<a id="api-63"></a>

### HLineStyle.solid

```ts
HLineStyle.solid = "solid"
```

**@summary** 实线

<a id="api-64"></a>

### HLineStyle.dashed

```ts
HLineStyle.dashed = "dashed"
```

**@summary** 虚线

<a id="api-65"></a>

### HLineStyle.dotted

```ts
HLineStyle.dotted = "dotted"
```

**@summary** 点线

<a id="api-66"></a>

### ShapeStyle

```ts
ShapeStyle: typeof ShapeStyle
```

**@summary** 标记形状

固定形状标记可选的外形；缺省使用 XCross。

<a id="api-67"></a>

### ShapeStyle.xCross

```ts
ShapeStyle.xCross = "xcross"
```

**@summary** X 叉

<a id="api-68"></a>

### ShapeStyle.cross

```ts
ShapeStyle.cross = "cross"
```

**@summary** 十字

<a id="api-69"></a>

### ShapeStyle.circle

```ts
ShapeStyle.circle = "circle"
```

**@summary** 圆

<a id="api-70"></a>

### ShapeStyle.square

```ts
ShapeStyle.square = "square"
```

**@summary** 方形

<a id="api-71"></a>

### ShapeStyle.diamond

```ts
ShapeStyle.diamond = "diamond"
```

**@summary** 菱形

<a id="api-72"></a>

### ShapeStyle.triangleUp

```ts
ShapeStyle.triangleUp = "triangleup"
```

**@summary** 上三角

<a id="api-73"></a>

### ShapeStyle.triangleDown

```ts
ShapeStyle.triangleDown = "triangledown"
```

**@summary** 下三角

<a id="api-74"></a>

### ShapeStyle.arrowUp

```ts
ShapeStyle.arrowUp = "arrowup"
```

**@summary** 上箭头

<a id="api-75"></a>

### ShapeStyle.arrowDown

```ts
ShapeStyle.arrowDown = "arrowdown"
```

**@summary** 下箭头

<a id="api-76"></a>

### ShapeStyle.labelUp

```ts
ShapeStyle.labelUp = "labelup"
```

**@summary** 上标签

<a id="api-77"></a>

### ShapeStyle.labelDown

```ts
ShapeStyle.labelDown = "labeldown"
```

**@summary** 下标签

<a id="api-78"></a>

### ShapeStyle.flag

```ts
ShapeStyle.flag = "flag"
```

**@summary** 旗形

<a id="api-79"></a>

### ShapeLocation

```ts
ShapeLocation: typeof ShapeLocation
```

**@summary** 标记位置

标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。

<a id="api-80"></a>

### ShapeLocation.aboveBar

```ts
ShapeLocation.aboveBar = "abovebar"
```

**@summary** 上方

<a id="api-81"></a>

### ShapeLocation.belowBar

```ts
ShapeLocation.belowBar = "belowbar"
```

**@summary** 下方

<a id="api-82"></a>

### ShapeLocation.top

```ts
ShapeLocation.top = "top"
```

**@summary** 顶部

<a id="api-83"></a>

### ShapeLocation.bottom

```ts
ShapeLocation.bottom = "bottom"
```

**@summary** 底部

<a id="api-84"></a>

### ShapeLocation.absolute

```ts
ShapeLocation.absolute = "absolute"
```

**@summary** 按价格定位

<a id="api-85"></a>

### ShapeSize

```ts
ShapeSize: typeof ShapeSize
```

**@summary** 尺寸档位

图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。

| 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
| --- | --- | --- | --- | --- | --- |
| ShapeSize.auto | 1 | 3 | 12 | 50 | 1 |
| ShapeSize.tiny | 1 | 6 | 6 | 20 | 1 |
| ShapeSize.small | 1 | 10 | 10 | 30 | 1 |
| ShapeSize.normal | 2 | 14 | 14 | 40 | 2 |
| ShapeSize.large | 3 | 20 | 20 | 60 | 3 |
| ShapeSize.huge | 4 | 28 | 28 | 90 | 4 |

px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
Columns 不接受 size，柱宽随 K 线间距自动调整。

<a id="api-86"></a>

### ShapeSize.auto

```ts
ShapeSize.auto = "auto"
```

**@summary** 自动

<a id="api-87"></a>

### ShapeSize.tiny

```ts
ShapeSize.tiny = "tiny"
```

**@summary** 极小

<a id="api-88"></a>

### ShapeSize.small

```ts
ShapeSize.small = "small"
```

**@summary** 小

<a id="api-89"></a>

### ShapeSize.normal

```ts
ShapeSize.normal = "normal"
```

**@summary** 常规

<a id="api-90"></a>

### ShapeSize.large

```ts
ShapeSize.large = "large"
```

**@summary** 大

<a id="api-91"></a>

### ShapeSize.huge

```ts
ShapeSize.huge = "huge"
```

**@summary** 特大

<a id="api-92"></a>

### console

```ts
console: { log(...values: unknown[]): void; info(...values: unknown[]): void; warn(...values: unknown[]): void; error(...values: unknown[]): void; debug(...values: unknown[]): void; }
```

输出到编辑器底部的“输出”面板；支持多个参数和对象。

<a id="api-93"></a>

### console.log

```ts
console.log(...values: unknown[]): void
```

<a id="api-94"></a>

### console.info

```ts
console.info(...values: unknown[]): void
```

<a id="api-95"></a>

### console.warn

```ts
console.warn(...values: unknown[]): void
```

<a id="api-96"></a>

### console.error

```ts
console.error(...values: unknown[]): void
```

<a id="api-97"></a>

### console.debug

```ts
console.debug(...values: unknown[]): void
```

<a id="api-98"></a>

### box

```ts
box: DrawingBoxApi
```

创建、修改、读取和删除矩形；位置参数顺序与 Pine box.new 一致。

<a id="api-99"></a>

### box.new

```ts
box.new(left: number, top: number, right: number, bottom: number, border_color?: Color | (string & {}), border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | (string & {}), text?: string, text_size?: number, text_color?: Color | (string & {})): BoxRef
box.new(top_left: ChartPoint, bottom_right: ChartPoint, border_color?: Color | (string & {}), border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | (string & {}), text?: string, text_size?: number, text_color?: Color | (string & {})): BoxRef
box.new(options: BoxOptions): BoxRef
```

<a id="api-100"></a>

### box.all

```ts
box.all: readonly BoxRef[]
```

<a id="api-101"></a>

### box.setLeft

```ts
box.setLeft(id: BoxRef, left: number): void
```

<a id="api-102"></a>

### box.setTop

```ts
box.setTop(id: BoxRef, top: number): void
```

<a id="api-103"></a>

### box.setRight

```ts
box.setRight(id: BoxRef, right: number): void
```

<a id="api-104"></a>

### box.setBottom

```ts
box.setBottom(id: BoxRef, bottom: number): void
```

<a id="api-105"></a>

### box.setLeftTop

```ts
box.setLeftTop(id: BoxRef, left: number, top: number): void
```

<a id="api-106"></a>

### box.setRightBottom

```ts
box.setRightBottom(id: BoxRef, right: number, bottom: number): void
```

<a id="api-107"></a>

### box.setTopLeftPoint

```ts
box.setTopLeftPoint(id: BoxRef, point: ChartPoint): void
```

<a id="api-108"></a>

### box.setBottomRightPoint

```ts
box.setBottomRightPoint(id: BoxRef, point: ChartPoint): void
```

<a id="api-109"></a>

### box.setXLoc

```ts
box.setXLoc(id: BoxRef, left: number, right: number, xloc: LineXLoc): void
```

<a id="api-110"></a>

### box.setExtend

```ts
box.setExtend(id: BoxRef, extend: LineExtend): void
```

<a id="api-111"></a>

### box.setBgColor

```ts
box.setBgColor(id: BoxRef, color: Color | (string & {})): void
```

<a id="api-112"></a>

### box.setBorderColor

```ts
box.setBorderColor(id: BoxRef, color: Color | (string & {})): void
```

<a id="api-113"></a>

### box.setBorderWidth

```ts
box.setBorderWidth(id: BoxRef, width: number): void
```

<a id="api-114"></a>

### box.setBorderStyle

```ts
box.setBorderStyle(id: BoxRef, style: BoxBorderStyle): void
```

<a id="api-115"></a>

### box.setText

```ts
box.setText(id: BoxRef, text: string): void
```

<a id="api-116"></a>

### box.setTextColor

```ts
box.setTextColor(id: BoxRef, color: Color | (string & {})): void
```

<a id="api-117"></a>

### box.setTextSize

```ts
box.setTextSize(id: BoxRef, size: number): void
```

<a id="api-118"></a>

### box.setTextHAlign

```ts
box.setTextHAlign(id: BoxRef, align: DrawingText["align"]): void
```

<a id="api-119"></a>

### box.setTextVAlign

```ts
box.setTextVAlign(id: BoxRef, align: DrawingText["verticalAlign"]): void
```

<a id="api-120"></a>

### box.getLeft

```ts
box.getLeft(id: BoxRef): number
```

<a id="api-121"></a>

### box.getTop

```ts
box.getTop(id: BoxRef): number
```

<a id="api-122"></a>

### box.getRight

```ts
box.getRight(id: BoxRef): number
```

<a id="api-123"></a>

### box.getBottom

```ts
box.getBottom(id: BoxRef): number
```

<a id="api-124"></a>

### box.copy

```ts
box.copy(id: BoxRef): BoxRef | null
```

<a id="api-125"></a>

### box.delete

```ts
box.delete(id: BoxRef | null): void
```

<a id="api-126"></a>

### label

```ts
label: DrawingLabelApi
```

在历史 bar 的价格位置创建纯文字标签，支持 label.styleNone。

<a id="api-127"></a>

### label.styleNone

```ts
label.styleNone: "none"
```

<a id="api-128"></a>

### label.new

```ts
label.new(x: number, y: number, text?: string, xloc?: LineXLoc, location?: "price", color?: Color | (string & {}), style?: "none", textcolor?: Color | (string & {}), size?: number, textalign?: DrawingText["align"], offsetY?: number): LabelRef
label.new(options: LabelOptions): LabelRef
```

绘制价格锚点标签，位置参数或选项对象二选一。

**@summary** 绘制标签

返回标签引用；超过 maxLabelsCount 时最旧的标签被回收。

<a id="api-129"></a>

### label.all

```ts
label.all: readonly LabelRef[]
```

<a id="api-130"></a>

### label.setX

```ts
label.setX(id: LabelRef, x: number): void
```

<a id="api-131"></a>

### label.setY

```ts
label.setY(id: LabelRef, y: number): void
```

<a id="api-132"></a>

### label.setXY

```ts
label.setXY(id: LabelRef, x: number, y: number): void
```

<a id="api-133"></a>

### label.setText

```ts
label.setText(id: LabelRef, text: string): void
```

<a id="api-134"></a>

### label.setTextColor

```ts
label.setTextColor(id: LabelRef, color: Color | (string & {})): void
```

<a id="api-135"></a>

### label.setSize

```ts
label.setSize(id: LabelRef, size: number): void
```

<a id="api-136"></a>

### label.setTextAlign

```ts
label.setTextAlign(id: LabelRef, align: DrawingText["align"]): void
```

<a id="api-137"></a>

### label.setYOffset

```ts
label.setYOffset(id: LabelRef, offsetY: number): void
```

设置垂直偏移；逻辑像素，正数向上。

**@summary** 设置垂直偏移

<a id="api-138"></a>

### label.getX

```ts
label.getX(id: LabelRef): number
```

<a id="api-139"></a>

### label.getY

```ts
label.getY(id: LabelRef): number
```

<a id="api-140"></a>

### label.getText

```ts
label.getText(id: LabelRef): string | null
```

<a id="api-141"></a>

### label.getYOffset

```ts
label.getYOffset(id: LabelRef): number
```

读取垂直偏移；标签已删除返回 0。

**@summary** 垂直偏移

<a id="api-142"></a>

### label.copy

```ts
label.copy(id: LabelRef): LabelRef | null
```

<a id="api-143"></a>

### label.delete

```ts
label.delete(id: LabelRef | null): void
```

<a id="api-144"></a>

### barstate

```ts
barstate: { readonly isLast: boolean; }
```

当前执行 bar 是否是本次数据的最后一根。

<a id="api-145"></a>

### barstate.isLast

```ts
barstate.isLast: boolean
```

<a id="api-146"></a>

### open

```ts
open: ScriptSeries
```

<a id="api-147"></a>

### high

```ts
high: ScriptSeries
```

<a id="api-148"></a>

### low

```ts
low: ScriptSeries
```

<a id="api-149"></a>

### close

```ts
close: ScriptSeries
```

<a id="api-150"></a>

### volume

```ts
volume: ScriptSeries
```

<a id="api-151"></a>

### time

```ts
time: ScriptSeries
```

<a id="api-152"></a>

### timeOpen

```ts
timeOpen(period?: string, session?: string, timezone?: string): number
```

指定周期的开盘时间；自定义时段外返回 NaN。

<a id="api-153"></a>

### timeClose

```ts
timeClose(period?: string, session?: string, timezone?: string): number
```

指定周期的收盘时间；自定义时段外返回 NaN。

<a id="api-154"></a>

### timeTradingDay

```ts
timeTradingDay: number
```

<a id="api-155"></a>

### timeTradingDay.toString

```ts
timeTradingDay.toString(radix?: number): string
```

Returns a string representation of an object.

**@param** radix Specifies a radix for converting numeric values to strings. This value is only used for numbers.

<a id="api-156"></a>

### timeTradingDay.toFixed

```ts
timeTradingDay.toFixed(fractionDigits?: number): string
```

Returns a string representing a number in fixed-point notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-157"></a>

### timeTradingDay.toExponential

```ts
timeTradingDay.toExponential(fractionDigits?: number): string
```

Returns a string containing a number represented in exponential notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-158"></a>

### timeTradingDay.toPrecision

```ts
timeTradingDay.toPrecision(precision?: number): string
```

Returns a string containing a number represented either in exponential or fixed-point notation with a specified number of digits.

**@param** precision Number of significant digits. Must be in the range 1 - 21, inclusive.

<a id="api-159"></a>

### timeTradingDay.valueOf

```ts
timeTradingDay.valueOf(): number
```

Returns the primitive value of the specified object.

<a id="api-160"></a>

### timeTradingDay.toLocaleString

```ts
timeTradingDay.toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string
timeTradingDay.toLocaleString(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string
```

Converts a number to a string by using the current or specified locale.

**@param** locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

**@param** locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

<a id="api-161"></a>

### timeframe

```ts
timeframe: { readonly period: string; inSeconds(period?: string): number; change(period: string): boolean; }
```

<a id="api-162"></a>

### timeframe.period

```ts
timeframe.period: string
```

<a id="api-163"></a>

### timeframe.inSeconds

```ts
timeframe.inSeconds(period?: string): number
```

<a id="api-164"></a>

### timeframe.change

```ts
timeframe.change(period: string): boolean
```

<a id="api-165"></a>

### session

```ts
session: { readonly isMarket: boolean; readonly isPremarket: boolean; readonly isPostmarket: boolean; readonly isFirstBar: boolean; readonly isFirstBarRegular: boolean; }
```

<a id="api-166"></a>

### session.isMarket

```ts
session.isMarket: boolean
```

<a id="api-167"></a>

### session.isPremarket

```ts
session.isPremarket: boolean
```

<a id="api-168"></a>

### session.isPostmarket

```ts
session.isPostmarket: boolean
```

<a id="api-169"></a>

### session.isFirstBar

```ts
session.isFirstBar: boolean
```

<a id="api-170"></a>

### session.isFirstBarRegular

```ts
session.isFirstBarRegular: boolean
```

<a id="api-171"></a>

### barIndex

```ts
barIndex: number
```

当前 K 线索引，从 0 开始。

<a id="api-172"></a>

### barIndex.toString

```ts
barIndex.toString(radix?: number): string
```

Returns a string representation of an object.

**@param** radix Specifies a radix for converting numeric values to strings. This value is only used for numbers.

<a id="api-173"></a>

### barIndex.toFixed

```ts
barIndex.toFixed(fractionDigits?: number): string
```

Returns a string representing a number in fixed-point notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-174"></a>

### barIndex.toExponential

```ts
barIndex.toExponential(fractionDigits?: number): string
```

Returns a string containing a number represented in exponential notation.

**@param** fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.

<a id="api-175"></a>

### barIndex.toPrecision

```ts
barIndex.toPrecision(precision?: number): string
```

Returns a string containing a number represented either in exponential or fixed-point notation with a specified number of digits.

**@param** precision Number of significant digits. Must be in the range 1 - 21, inclusive.

<a id="api-176"></a>

### barIndex.valueOf

```ts
barIndex.valueOf(): number
```

Returns the primitive value of the specified object.

<a id="api-177"></a>

### barIndex.toLocaleString

```ts
barIndex.toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string
barIndex.toLocaleString(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string
```

Converts a number to a string by using the current or specified locale.

**@param** locales A locale string or array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

**@param** locales A locale string, array of locale strings, Intl.Locale object, or array of Intl.Locale objects that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.

**@param** options An object that contains one or more properties that specify comparison options.

<a id="api-178"></a>

### line

```ts
line: DrawingLineApi
```

创建、修改、读取和删除线段，跨 bar 保留。

只能在 onBar 内新建与修改；引用只在本次运行内有效，重算后旧引用失效。

```ts
const id = line.new(barIndex, low[0], barIndex + 5, high[0])
line.setColor(id, Color.red)
```

<a id="api-179"></a>

### line.new

```ts
line.new(first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: Color | (string & {}), style?: LineStyle, width?: number): LineRef
line.new(x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: Color | (string & {}), style?: LineStyle, width?: number): LineRef
line.new(options: LineOptions): LineRef
```

绘制线段；两个重载分别接受 chart.point 端点与起止点的 X / Y。

**@summary** 绘制线段

<a id="api-180"></a>

### line.all

```ts
line.all: readonly LineRef[]
```

本次运行绘制的全部线段引用，按创建顺序；与创建返回的引用相等，可直接比较。

**@summary** 全部线段

<a id="api-181"></a>

### line.setXY1

```ts
line.setXY1(id: LineRef, x: number, y: number): void
```

同时设置起点 X 和 Y；X 的取值方式沿用创建时的 xloc。

**@summary** 设置起点

<a id="api-182"></a>

### line.setXY2

```ts
line.setXY2(id: LineRef, x: number, y: number): void
```

同时设置终点 X 和 Y；X 的取值方式沿用创建时的 xloc。

**@summary** 设置终点

<a id="api-183"></a>

### line.setX1

```ts
line.setX1(id: LineRef, x: number): void
```

设置起点 X；取值方式沿用创建时的 xloc。

**@summary** 设置起点 X

<a id="api-184"></a>

### line.setY1

```ts
line.setY1(id: LineRef, y: number): void
```

设置起点价格。

**@summary** 设置起点价格

<a id="api-185"></a>

### line.setX2

```ts
line.setX2(id: LineRef, x: number): void
```

设置终点 X；取值方式沿用创建时的 xloc。

**@summary** 设置终点 X

<a id="api-186"></a>

### line.setY2

```ts
line.setY2(id: LineRef, y: number): void
```

设置终点价格。

**@summary** 设置终点价格

<a id="api-187"></a>

### line.setColor

```ts
line.setColor(id: LineRef, color: Color | (string & {})): void
```

设置线段颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。

**@summary** 设置颜色

<a id="api-188"></a>

### line.setStyle

```ts
line.setStyle(id: LineRef, style: LineStyle): void
```

设置线型，包括实线、虚线和箭头。

**@summary** 设置线型

<a id="api-189"></a>

### line.setWidth

```ts
line.setWidth(id: LineRef, width: number): void
```

设置线宽，正整数逻辑像素。

**@summary** 设置线宽

<a id="api-190"></a>

### line.setExtend

```ts
line.setExtend(id: LineRef, extend: LineExtend): void
```

设置延伸方向；left 延伸至起点之外，right 延伸至终点之外。

**@summary** 设置延伸

<a id="api-191"></a>

### line.getX1

```ts
line.getX1(id: LineRef): number
```

读取起点 X；线段已删除返回 NaN。

**@summary** 起点 X

<a id="api-192"></a>

### line.getY1

```ts
line.getY1(id: LineRef): number
```

读取起点价格；线段已删除返回 NaN。

**@summary** 起点价格

<a id="api-193"></a>

### line.getX2

```ts
line.getX2(id: LineRef): number
```

读取终点 X；线段已删除返回 NaN。

**@summary** 终点 X

<a id="api-194"></a>

### line.getY2

```ts
line.getY2(id: LineRef): number
```

读取终点价格；线段已删除返回 NaN。

**@summary** 终点价格

<a id="api-195"></a>

### line.getColor

```ts
line.getColor(id: LineRef): string | null
```

读取颜色；线段已删除返回 null。

**@summary** 颜色

<a id="api-196"></a>

### line.getStyle

```ts
line.getStyle(id: LineRef): LineStyle | null
```

读取线型；线段已删除返回 null。

**@summary** 线型

<a id="api-197"></a>

### line.getWidth

```ts
line.getWidth(id: LineRef): number
```

读取线宽；线段已删除返回 NaN。

**@summary** 线宽

<a id="api-198"></a>

### line.getExtend

```ts
line.getExtend(id: LineRef): LineExtend | null
```

读取延伸方向；线段已删除返回 null。

**@summary** 延伸方向

<a id="api-199"></a>

### line.getPrice

```ts
line.getPrice(id: LineRef, x: number): number
```

按线段所在直线求 x 处的价格，与 extend 无关；只支持 xloc.barIndex，垂直线或已删除返回 NaN。

**@summary** 求价格

<a id="api-200"></a>

### line.copy

```ts
line.copy(id: LineRef): LineRef | null
```

复制为新线段并返回其引用，副本独立于原线段。

**@summary** 复制线段

<a id="api-201"></a>

### line.delete

```ts
line.delete(id: LineRef | null): void
```

删除线段；传入 null 或已删除对象无操作。

**@summary** 删除线段

<a id="api-202"></a>

### chart

```ts
chart: { readonly point: { "new"(time: number, index: number, price: number): ChartPoint; now(price: number): ChartPoint; fromIndex(index: number, price: number): ChartPoint; fromTime(time: number, price: number): ChartPoint; copy(point: ChartPoint): ChartPoint; }; }
```

chart.point 坐标工厂；line.new 会复制坐标，不保留 point 对象引用。

<a id="api-203"></a>

### chart.point

```ts
chart.point: { "new"(time: number, index: number, price: number): ChartPoint; now(price: number): ChartPoint; fromIndex(index: number, price: number): ChartPoint; fromTime(time: number, price: number): ChartPoint; copy(point: ChartPoint): ChartPoint; }
```

<a id="api-204"></a>

### chart.point.new

```ts
chart.point.new(time: number, index: number, price: number): ChartPoint
```

用时间戳、bar 索引和价格构造 point；xloc 决定 line.new 读取哪个字段。

<a id="api-205"></a>

### chart.point.now

```ts
chart.point.now(price: number): ChartPoint
```

当前 K 线的 point，索引取 barIndex。

<a id="api-206"></a>

### chart.point.fromIndex

```ts
chart.point.fromIndex(index: number, price: number): ChartPoint
```

只带 bar 索引的 point，用于 xloc.barIndex。

<a id="api-207"></a>

### chart.point.fromTime

```ts
chart.point.fromTime(time: number, price: number): ChartPoint
```

只带毫秒时间戳的 point，用于 xloc.barTime。

<a id="api-208"></a>

### chart.point.copy

```ts
chart.point.copy(point: ChartPoint): ChartPoint
```

复制 point，得到独立值对象。

<a id="api-209"></a>

### ta

```ts
ta: TechnicalAnalysisLibrary
```

内建技术分析库
序列结果用 [0] 取当前值、[1] 取上一根值，例如 ta.sma(close, 20)[0]。

<a id="api-210"></a>

### ta.rising

```ts
ta.rising(source: Series, length: number): boolean
```

当前值严格高于前 length 根中的所有有效值，不要求逐根上涨。

**@summary** 上涨判断

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，不包含当前根。

**@returns** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

<a id="api-211"></a>

### ta.falling

```ts
ta.falling(source: Series, length: number): boolean
```

当前值严格低于前 length 根中的所有有效值，不要求逐根下跌。

**@summary** 下跌判断

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，不包含当前根。

**@returns** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

<a id="api-212"></a>

### ta.change

```ts
ta.change(source: Series, length?: number): Series
```

当前值减去 length 根之前的值。

**@summary** 数值变化

**@param** source 数据序列，如 volume。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 差值序列；历史不足或任一端为 NaN 时为 NaN。

<a id="api-213"></a>

### ta.sma

```ts
ta.sma(source: Series, length: number): Series
```

简单移动平均（SMA）。

**@summary** 简单移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值，完整窗口之前为 NaN。

<a id="api-214"></a>

### ta.sum

```ts
ta.sum(source: Series, length: number): Series
```

窗口求和（SUM）。

**@summary** 窗口求和

**@param** source 数据序列，如 volume。

**@param** length 窗口长度，正整数。

**@returns** 求和序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

<a id="api-215"></a>

### ta.maxsum

```ts
ta.maxsum(source: Series, length: number): readonly [Series, Series, Series]
```

最近 length 根内累计值最大的连续区间（最大子段和，Kadane）。

**@summary** 最大子段和

**@param** source 有符号数据序列，如对数收益、价格差分或带符号成交量。

**@param** length 窗口长度，正整数，包含当前根。

**@returns** [子段和, 起点偏移, 终点偏移]；偏移为相对当前根的负值（与 highestBars 一致），
完整窗口之前或窗口内含 NaN 时三者均为 NaN。

<a id="api-216"></a>

### ta.highest

```ts
ta.highest(source: Series, length: number): Series
```

最近 length 根 K 线的最高值，包含当前 K 线。

**@summary** 窗口最高值

**@param** source 数据序列，如 high。

**@param** length 窗口长度，正整数。

**@returns** 最高值序列；[0] 取当前窗口的结果。

<a id="api-217"></a>

### ta.lowest

```ts
ta.lowest(source: Series, length: number): Series
```

最近 length 根 K 线的最低值，包含当前 K 线。

**@summary** 窗口最低值

**@param** source 数据序列，如 low。

**@param** length 窗口长度，正整数。

**@returns** 最低值序列；[0] 取当前窗口的结果。

<a id="api-218"></a>

### ta.pivothigh

```ts
ta.pivothigh(source: Series, leftBars: number, rightBars: number): Series
```

确认后的摆动高点；结果出现在右侧窗口完成的 bar，无摆点为 NaN。

<a id="api-219"></a>

### ta.pivotlow

```ts
ta.pivotlow(source: Series, leftBars: number, rightBars: number): Series
```

确认后的摆动低点；并列极值取更靠右的 bar。

<a id="api-220"></a>

### ta.highestBars

```ts
ta.highestBars(source: Series, length: number): Series
```

最近 length 根 K 线最高值相对当前 K 线的偏移，负值或 0。

**@summary** 最高值偏移

**@param** source 数据序列，如 high。

**@param** length 窗口长度，正整数。

**@returns** 偏移序列；并列最高取更早一根，完整窗口之前为 NaN。

<a id="api-221"></a>

### ta.lowestBars

```ts
ta.lowestBars(source: Series, length: number): Series
```

最近 length 根 K 线最低值相对当前 K 线的偏移，负值或 0。

**@summary** 最低值偏移

**@param** source 数据序列，如 low。

**@param** length 窗口长度，正整数。

**@returns** 偏移序列；并列最低取更早一根，完整窗口之前为 NaN。

<a id="api-222"></a>

### ta.rma

```ts
ta.rma(source: Series, length: number): Series
```

Wilder 平滑均线（RMA），alpha = 1 / length，以首个完整窗口 SMA 初始化。

**@summary** Wilder 平滑均线

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；完整窗口之前为 NaN。

<a id="api-223"></a>

### ta.swma

```ts
ta.swma(source: Series): Series
```

对称加权均线，固定 4 根窗口，权重由旧到新为 1/6、2/6、2/6、1/6。

**@summary** 对称加权均线

**@param** source 数据序列，如 close。

**@returns** 均线序列；前 3 根为 NaN。

<a id="api-224"></a>

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

<a id="api-225"></a>

### ta.stddev

```ts
ta.stddev(source: Series, length: number): Series
```

总体标准差（STDDEV），窗口内数值相对窗口均值的偏差，除以 length。

**@summary** 总体标准差

**@param** source 数据序列，如 close。

**@param** length 窗口长度，正整数。

**@returns** 标准差序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

<a id="api-226"></a>

### ta.ema

```ts
ta.ema(source: Series, length: number): Series
```

指数移动平均（EMA），以首个完整窗口的 SMA 为初值。

**@summary** 指数移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值。

<a id="api-227"></a>

### ta.dema

```ts
ta.dema(source: Series, length: number): Series
```

双重指数均线：2×EMA(source)−EMA(EMA(source))。

**@summary** 双重指数均线

**@param** source 数据序列。

**@param** length 正整数周期，各层 EMA 以完整窗口均值初始化。

**@returns** DEMA 序列，前 2×(length−1) 根为 NaN。

<a id="api-228"></a>

### ta.tema

```ts
ta.tema(source: Series, length: number): Series
```

三重指数均线：3×EMA1−3×EMA2+EMA3。

**@summary** 三重指数均线

**@param** source 数据序列。

**@param** length 正整数周期，各层 EMA 以完整窗口均值初始化。

**@returns** TEMA 序列，前 3×(length−1) 根为 NaN。

<a id="api-229"></a>

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

<a id="api-230"></a>

### ta.trima

```ts
ta.trima(source: Series, length: number): Series
```

三角均线：SMA(SMA(source, ceil(length/2)), floor(length/2)+1)。

**@summary** 三角移动平均

**@param** source 数据序列。

**@param** length 正整数周期。

**@returns** TRIMA 序列，前 length−1 根为 NaN。

<a id="api-231"></a>

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

<a id="api-232"></a>

### ta.wma

```ts
ta.wma(source: Series, length: number): Series
```

加权移动平均（WMA），越新的值权重越大。

**@summary** 加权移动平均

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** 均线序列；[0] 取当前值。

<a id="api-233"></a>

### ta.hma

```ts
ta.hma(source: Series, length: number): Series
```

Hull 移动平均，组合 WMA(2×WMA(source, floor(length/2))−WMA(source, length), round(sqrt(length)))。

**@summary** Hull 移动平均

**@param** source 数据序列。

**@param** length 正整数周期，派生窗口最小为 1。

**@returns** 均线序列，完整组合窗口之前为 NaN。

<a id="api-234"></a>

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

<a id="api-235"></a>

### ta.cci

```ts
ta.cci(source: Series, length: number): Series
```

顺势指标：(source−SMA)/(0.015×平均绝对偏差)。

**@summary** 顺势指标

**@param** source 数据序列，通常为 (high+low+close)/3。

**@param** length 正整数周期。

**@returns** CCI 序列；窗口不足为 NaN，平均绝对偏差为零时为 0。

<a id="api-236"></a>

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

<a id="api-237"></a>

### ta.rsi

```ts
ta.rsi(source: Series, length: number): Series
```

相对强弱指数（RSI），使用 Wilder 平滑；窗口内无下跌（含平盘）为 100。

**@summary** 相对强弱指数

**@param** source 数据序列，如 close。

**@param** length 周期，正整数。

**@returns** RSI 序列，范围 0–100；[0] 取当前值，完整窗口之前为 NaN。

<a id="api-238"></a>

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

<a id="api-239"></a>

### ta.atr

```ts
ta.atr(length: number): Series
```

平均真实波幅（ATR），首个完整窗口取真实波幅均值，之后使用 Wilder 平滑。

**@summary** 平均真实波幅

**@param** length 周期，正整数。

**@returns** ATR 序列；第一根真实波幅为 high-low，完整窗口之前为 NaN。

<a id="api-240"></a>

### ta.supertrend

```ts
ta.supertrend(multiplier: number, atrPeriod: number): readonly [Series, Series]
```

Supertrend，保留原生指标的上涨初始方向与 ATR 通道递推规则。

**@summary** 超级趋势

**@param** multiplier ATR 倍数，有限正数。

**@param** atrPeriod ATR 周期，正整数。

**@returns** [趋势线序列, 方向序列]；-1 为上涨、1 为下跌，预热期间两者均为 NaN。

<a id="api-241"></a>

### ta.mom

```ts
ta.mom(source: Series, length?: number): Series
```

动量（MOM），当前值减去 length 根之前的值。

**@summary** 动量

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 差值序列，按数值轴绘制；历史不足时为 NaN。

<a id="api-242"></a>

### ta.roc

```ts
ta.roc(source: Series, length?: number): Series
```

当前值相对 length 根之前的百分比变化（ROC）。

**@summary** 变化率

**@param** source 数据序列，如 close。

**@param** length 回看根数，正整数，缺省为 1。

**@returns** 百分比变化序列；历史不足或基准为 0 时为 NaN。

<a id="api-243"></a>

### ta.cmo

```ts
ta.cmo(source: Series, length: number): Series
```

Chande 动量振荡器：100 × (涨幅和 − 跌幅和) / (涨幅和 + 跌幅和)，窗口含 length 个差分。

**@summary** 钱德动量振荡器

**@param** source 数据序列，如 close。

**@param** length 差分窗口，正整数。

**@returns** CMO 序列，范围 -100–100；完整窗口之前为 NaN，平盘（分母为零）为 0。

<a id="api-244"></a>

### ta.crossover

```ts
ta.crossover(left: Series, right: Series): boolean
```

判断当前 K 线是否发生上穿：left 当前大于 right，上一根小于或等于 right。

**@summary** 上穿

**@param** left 穿越方序列。

**@param** right 被穿越方序列。

**@returns** 发生上穿时为 true。

<a id="api-245"></a>

### ta.crossunder

```ts
ta.crossunder(left: Series, right: Series): boolean
```

判断当前 K 线是否发生下穿：left 当前小于 right，上一根大于或等于 right。

**@summary** 下穿

**@param** left 穿越方序列。

**@param** right 被穿越方序列。

**@returns** 发生下穿时为 true。

<a id="api-246"></a>

### Position

```ts
Position: typeof PositionEnum
```

**@summary** 渲染位置

指标渲染位置，由宿主注入 VM。

| 取值 | 含义 |
| --- | --- |
| `Position.main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.sub` | 独立副图 |

<a id="api-247"></a>

### Position.main

```ts
Position.main = "main"
```

叠加到主图。

**@summary** 主图

<a id="api-248"></a>

### Position.sub

```ts
Position.sub = "sub"
```

独立副图。

**@summary** 副图

<a id="api-249"></a>

### input

```ts
input: ScriptInput
```

输入参数：int / float 支持范围和步长，bool 显示开关，string 支持下拉选项。

<a id="api-250"></a>

### input.session

```ts
input.session(value: string, options?: InputOptions): string
```

Pine时段字符串，例如0930-1600，时区由time调用指定。

<a id="api-251"></a>

### input.int

```ts
input.int(value: number, options?: NumberInputOptions): number
```

整数输入；min、max 和 step 必须为整数。

**@summary** 整数

<a id="api-252"></a>

### input.float

```ts
input.float(value: number, options?: NumberInputOptions): number
```

浮点数输入，支持数值范围与步长。

**@summary** 浮点数

<a id="api-253"></a>

### input.bool

```ts
input.bool(value: boolean, options?: InputOptions): boolean
```

布尔输入，在参数面板中显示开关。

**@summary** 开关

<a id="api-254"></a>

### input.string

```ts
input.string(value: string, options?: StringInputOptions): string
```

字符串输入；提供 options 时显示下拉选项。

**@summary** 字符串

<a id="api-255"></a>

### input.timeframe

```ts
input.timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe
```

目标周期输入；缺省列出全部受支持周期，返回值可直接传给 request.security。

**@summary** 目标周期

<a id="api-256"></a>

### defineIndicator

```ts
defineIndicator(definition: ScriptIndicatorDeclaration): void
```

定义一个指标。
顶层代码只执行一次，顶层变量跨 bar 保留；逐根计算写在 onBar 内。
scriptVersion 必须写当前版本 2，旧写法在注册期直接拒绝。

```ts
defineIndicator({
  scriptVersion: 2,
  name: 'OC Average',
  position: Position.sub,
  onBar() {
    plot.Line((open + close) / 2, 'oc-average')
  },
})
```

<a id="api-257"></a>

### derive

```ts
derive(key: string, compute: (self: Series, offset: number) => number): Series
```

惰性派生序列；读取时按绝对 bar 缓存，不主动填充历史。
key 必须稳定且区分输入与参数；同 key 复用首次注册的回调。
回调用 offset 读取输入历史，用 self[offset + 1] 读取自身上一根；历史越界返回 NaN。
不要捕获当前 bar 的数值快照，应捕获 Series 并按 offset 取值。

<a id="api-258"></a>

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
| `plot.Columns` | 柱形图 | 柱形图数值 |
| `plot.Point` | 散点 | 散点数值 |
| `plot.Shape` | 形状标记 | 数值或布尔条件；false 留空，absolute 定位时数值为价格 |
| `plot.Char` | 字符标记 | 数值或布尔条件；false 留空，absolute 定位时数值为价格 |
| `plot.Arrow` | 箭头 | 正负决定方向，绝对值决定长度 |
| `plot.Candle` | 蜡烛图 | 接收四个价格 |
| `plot.Bar` | 美国线 | 接收四个价格 |

<a id="api-259"></a>

### plot.Line

```ts
plot.Line(value: number | null, name: string, options?: PlotStyleOptions<"line">): PlotRef
```

输出普通折线点，跨空值连接前后有效点，对应 Pine plot.style_line。

**@summary** 折线

<a id="api-260"></a>

### plot.LineBR

```ts
plot.LineBR(value: number | null, name: string, options?: PlotStyleOptions<"linebr">): PlotRef
```

输出断线折线点，空值处断开，对应 Pine plot.style_linebr。

**@summary** 断线折线

<a id="api-261"></a>

### plot.StepLine

```ts
plot.StepLine(value: number | null, name: string, options?: PlotStyleOptions<"stepline">): PlotRef
```

输出阶梯线点，在相邻有效点的水平中点跳变，跨空值连接，对应 Pine plot.style_stepline。

**@summary** 阶梯线

<a id="api-262"></a>

### plot.StepLineBR

```ts
plot.StepLineBR(value: number | null, name: string, options?: PlotStyleOptions<"steplinebr">): PlotRef
```

输出断线阶梯线点，空值处断开，对应 Pine plot.style_steplinebr。

**@summary** 断线阶梯线

<a id="api-263"></a>

### plot.Histogram

```ts
plot.Histogram(value: number | null, name: string, options?: PlotStyleOptions<"histogram">): PlotRef
```

固定像素柱宽；size 接受正数像素或 ShapeSize 枚举，默认 1px。

**@summary** 柱状图(定宽)

<a id="api-264"></a>

### plot.Columns

```ts
plot.Columns(value: number | null, name: string, options?: PlotStyleOptions<"columns">): PlotRef
```

填充当前时间槽位，左右各留 1 个物理像素，不跟随蜡烛实体宽度，不支持 size。
槽宽仅有 1–2 个物理像素时取消留白，避免柱体消失或跨槽覆盖。

**@summary** 柱形图(槽位填充)

<a id="api-265"></a>

### plot.Point

```ts
plot.Point(value: number | null, name: string, options?: PlotStyleOptions<"points">): PlotRef
```

输出散点。

**@summary** 散点

<a id="api-266"></a>

### plot.Shape

```ts
plot.Shape(value: number | boolean | null, name: string, options?: PlotStyleOptions<"shape">): PlotRef
```

输出形状标记；false 留空，absolute 定位时数值为价格。

**@summary** 形状标记

<a id="api-267"></a>

### plot.Char

```ts
plot.Char(value: number | boolean | null, name: string, options?: PlotStyleOptions<"char">): PlotRef
```

输出字符标记；false 留空，absolute 定位时数值为价格。

**@summary** 字符标记

<a id="api-268"></a>

### plot.Arrow

```ts
plot.Arrow(value: number | null, name: string, options?: PlotStyleOptions<"arrow">): PlotRef
```

输出数值箭头，正负决定方向，绝对值决定长度。

**@summary** 箭头

<a id="api-269"></a>

### plot.Candle

```ts
plot.Candle(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: CandlePlotOptions): void
```

输出蜡烛；任一价格缺失时留空，实体、影线和边框可独立着色。

**@summary** 蜡烛图

<a id="api-270"></a>

### plot.Bar

```ts
plot.Bar(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: BarPlotOptions): void
```

输出美国线；左侧短横线为开盘，右侧短横线为收盘。

**@summary** 美国线(OHLC)

<a id="api-271"></a>

### fill

```ts
fill(from: PlotRef, to: PlotRef, color: Color | (string & {}) | null, title?: string, options?: ScriptFillOptions): void
fill(from: HLineRef, to: HLineRef, color: Color | (string & {}) | null, title?: string, options?: ScriptFillOptions): void
```

声明两个 Plot 之间的填充区域；两个句柄由 plot.* 返回，仅在 onBar 中调用。
每根 bar 保存调用处求出的颜色；null 表示该 bar 不填充。

| 参数 | 含义 |
| --- | --- |
| `from` / `to` | 填充的两个边界 Plot |
| `color` | 当前 bar 的颜色，支持 CSS 颜色值，常用色可用 `Color` 枚举，透明度由颜色携带 |
| `title` | 填充标识；不填则按 from/to 生成 |
声明两条水平参考线之间的填充区域；整幅宽度、单色，不随 bar 变化。
只能在文件顶层调用，两个句柄都必须来自 hline。

<a id="api-272"></a>

### fill

```ts
fill(from: PlotRef, to: PlotRef, color: Color | (string & {}) | null, title?: string, options?: ScriptFillOptions): void
fill(from: HLineRef, to: HLineRef, color: Color | (string & {}) | null, title?: string, options?: ScriptFillOptions): void
```

声明两个 Plot 之间的填充区域；两个句柄由 plot.* 返回，仅在 onBar 中调用。
每根 bar 保存调用处求出的颜色；null 表示该 bar 不填充。

| 参数 | 含义 |
| --- | --- |
| `from` / `to` | 填充的两个边界 Plot |
| `color` | 当前 bar 的颜色，支持 CSS 颜色值，常用色可用 `Color` 枚举，透明度由颜色携带 |
| `title` | 填充标识；不填则按 from/to 生成 |
声明两条水平参考线之间的填充区域；整幅宽度、单色，不随 bar 变化。
只能在文件顶层调用，两个句柄都必须来自 hline。

<a id="api-273"></a>

### hline

```ts
hline(price: number, options?: HLineOptions): HLineRef
```

图表级水平参考线：固定价格、贯穿整幅宽度，不占用逐 bar 数据列。

只能在文件顶层声明；颜色、线型与线宽在整轮运行内固定，不随 bar 变化。

```ts
hline(70, { color: Color.gray, linestyle: HLineStyle.dashed })
```

**@param** price 水平线价格

**@param** options 标题、颜色、线型与线宽

**@returns** 句柄；可交给 fill 与另一条水平线围出带状区域

<a id="api-274"></a>

### defineLibrary

```ts
defineLibrary<T extends object>(name: string, members: T, state?: { checkpoint(): unknown; rollback(state: unknown): void; }): Readonly<T>
```

注册一个库，其成员同时绑定到同名全局对象。

<a id="api-275"></a>

### importLibrary

```ts
importLibrary<K extends keyof LibraryModules>(name: K): LibraryModules[K]
```

读取已注册的库，内置名称由统一库类型目录提供。

<a id="api-276"></a>

### request

```ts
request: ScriptRequest
```

获取指定品种周期的数据；`syminfo.tickerId` 是当前图表品种。

<a id="api-277"></a>

### request.securityLowerTf

```ts
request.securityLowerTf<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: LowerTimeframeOptions): IntrabarResult<T>
```

按时间升序返回当前主图bar内全部可用明细；元组表达式返回对应的多个数组。

<a id="api-278"></a>

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
const [o, h, l, c] = request.security(syminfo.tickerId, Timeframe.hour1, () => [open, high, low, close] as const)
```

<a id="api-279"></a>

### syminfo

```ts
syminfo: { readonly tickerId: string; readonly timezone: string; readonly session: string; }
```

当前图表品种信息；`tickerId` 可直接传给 `request.security`。

<a id="api-280"></a>

### syminfo.tickerId

```ts
syminfo.tickerId: string
```

<a id="api-281"></a>

### syminfo.timezone

```ts
syminfo.timezone: string
```

<a id="api-282"></a>

### syminfo.session

```ts
syminfo.session: string
```

## 相关类型

- [Series](#type-0)
- [Series.0](#type-1)
- [Series.1](#type-2)
- [Series.at](#type-3)
- [LineRef](#type-4)
- [LineRef.id](#type-5)
- [BoxRef](#type-6)
- [BoxRef.id](#type-7)
- [LabelRef](#type-8)
- [LabelRef.id](#type-9)
- [DrawingBoxApi](#type-10)
- [BoxFactory](#type-11)
- [ChartPoint](#type-12)
- [ChartPoint.index](#type-13)
- [ChartPoint.time](#type-14)
- [ChartPoint.price](#type-15)
- [LineXLoc](#type-16)
- [LineExtend](#type-17)
- [Color](#type-18)
- [BoxBorderStyle](#type-19)
- [DrawingText](#type-20)
- [DrawingText.value](#type-21)
- [DrawingText.align](#type-22)
- [DrawingText.verticalAlign](#type-23)
- [DrawingText.offsetY](#type-24)
- [DrawingLabelApi](#type-25)
- [LabelFactory](#type-26)
- [ScriptParameters](#type-27)
- [DrawingLineApi](#type-28)
- [LineFactory](#type-29)
- [LineStyle](#type-30)
- [TechnicalAnalysisLibrary](#type-31)
- [Position](#type-32)
- [ScriptInput](#type-33)
- [InputOptions](#type-34)
- [InputOptions.title](#type-35)
- [NumberInputOptions](#type-36)
- [NumberInputOptions.min](#type-37)
- [NumberInputOptions.max](#type-38)
- [NumberInputOptions.step](#type-39)
- [StringInputOptions](#type-40)
- [StringInputOptions.options](#type-41)
- [Timeframe](#type-42)
- [TimeframeInputOptions](#type-43)
- [TimeframeInputOptions.options](#type-44)
- [ScriptIndicatorDeclaration](#type-45)
- [ScriptIndicatorDeclaration.scriptVersion](#type-46)
- [ScriptIndicatorDeclaration.onBar](#type-47)
- [ScriptIndicatorDeclaration.name](#type-48)
- [ScriptIndicatorDeclaration.format](#type-49)
- [ScriptIndicatorDeclaration.title](#type-50)
- [ScriptIndicatorDeclaration.info](#type-51)
- [ScriptIndicatorDeclaration.position](#type-52)
- [ScriptIndicatorDeclaration.maxLinesCount](#type-53)
- [ScriptIndicatorDeclaration.maxBoxesCount](#type-54)
- [ScriptIndicatorDeclaration.maxLabelsCount](#type-55)
- [ScriptPlot](#type-56)
- [PlotStyleOptions](#type-57)
- [PlotStyleOptions.label](#type-58)
- [PlotStyleOptions.color](#type-59)
- [PlotStyleOptions.format](#type-60)
- [PlotStyleOptions.offset](#type-61)
- [PlotStyleOptions.visible](#type-62)
- [PlotRef](#type-63)
- [PlotRef.name](#type-64)
- [CandlePlotOptions](#type-65)
- [CandlePlotOptions.wickColor](#type-66)
- [CandlePlotOptions.borderColor](#type-67)
- [CandlePlotOptions.label](#type-68)
- [CandlePlotOptions.visible](#type-69)
- [CandlePlotOptions.offset](#type-70)
- [CandlePlotOptions.showLast](#type-71)
- [CandlePlotOptions.color](#type-72)
- [CandlePlotOptions.format](#type-73)
- [BarPlotOptions](#type-74)
- [ScriptFillOptions](#type-75)
- [ScriptFillOptions.visible](#type-76)
- [HLineRef](#type-77)
- [HLineRef.hline](#type-78)
- [HLineOptions](#type-79)
- [HLineOptions.title](#type-80)
- [HLineOptions.color](#type-81)
- [HLineOptions.linestyle](#type-82)
- [HLineOptions.linewidth](#type-83)
- [LibraryModules](#type-84)
- [ScriptRequest](#type-85)
- [RequestValue](#type-86)
- [LowerTimeframeOptions](#type-87)
- [LowerTimeframeOptions.ignoreInvalidTimeframe](#type-88)
- [LowerTimeframeOptions.source](#type-89)
- [LowerTimeframeOptions.calcBarsCount](#type-90)
- [IntrabarResult](#type-91)
- [SecurityOptions](#type-92)
- [SecurityOptions.source](#type-93)
- [SecurityOptions.calcBarsCount](#type-94)
- [SecurityOptions.gaps](#type-95)
- [RequestResult](#type-96)
- [BoxOptions](#type-97)
- [BoxOptions.left](#type-98)
- [BoxOptions.top](#type-99)
- [BoxOptions.right](#type-100)
- [BoxOptions.bottom](#type-101)
- [BoxOptions.borderColor](#type-102)
- [BoxOptions.borderWidth](#type-103)
- [BoxOptions.borderStyle](#type-104)
- [BoxOptions.extend](#type-105)
- [BoxOptions.xloc](#type-106)
- [BoxOptions.backgroundColor](#type-107)
- [BoxOptions.text](#type-108)
- [BoxOptions.textSize](#type-109)
- [BoxOptions.textColor](#type-110)
- [LabelOptions](#type-111)
- [LabelOptions.x](#type-112)
- [LabelOptions.y](#type-113)
- [LabelOptions.text](#type-114)
- [LabelOptions.xloc](#type-115)
- [LabelOptions.color](#type-116)
- [LabelOptions.textColor](#type-117)
- [LabelOptions.size](#type-118)
- [LabelOptions.align](#type-119)
- [LabelOptions.offsetY](#type-120)
- [LineOptions](#type-121)
- [LineOptions.x1](#type-122)
- [LineOptions.y1](#type-123)
- [LineOptions.x2](#type-124)
- [LineOptions.y2](#type-125)
- [LineOptions.xloc](#type-126)
- [LineOptions.extend](#type-127)
- [LineOptions.color](#type-128)
- [LineOptions.style](#type-129)
- [LineOptions.width](#type-130)
- [InputOption](#type-131)
- [InputOption.value](#type-132)
- [InputOption.label](#type-133)
- [QuickJSScriptDefinition](#type-134)
- [QuickJSScriptDefinition.scriptVersion](#type-135)
- [QuickJSScriptDefinition.name](#type-136)
- [QuickJSScriptDefinition.title](#type-137)
- [QuickJSScriptDefinition.info](#type-138)
- [QuickJSScriptDefinition.position](#type-139)
- [QuickJSScriptDefinition.format](#type-140)
- [QuickJSScriptDefinition.maxLinesCount](#type-141)
- [QuickJSScriptDefinition.maxBoxesCount](#type-142)
- [QuickJSScriptDefinition.maxLabelsCount](#type-143)
- [QuickJSScriptDefinition.inputs](#type-144)
- [PlotDeclaration](#type-145)
- [PlotDeclaration.kind](#type-146)
- [PlotDeclaration.name](#type-147)
- [PlotDeclaration.label](#type-148)
- [PlotDeclaration.color](#type-149)
- [PlotDeclaration.format](#type-150)
- [PlotDeclaration.offset](#type-151)
- [PlotDeclaration.visible](#type-152)
- [OhlcPlotOptions](#type-153)
- [HLineStyle](#type-154)
- [DataSource](#type-155)
- [Format](#type-156)
- [InputSchema](#type-157)
- [ScriptParamValue](#type-158)
- [ScalarPlotDeclaration](#type-159)
- [ScalarPlotDeclaration.kind](#type-160)
- [ScalarPlotDeclaration.name](#type-161)
- [ScalarPlotDeclaration.label](#type-162)
- [ScalarPlotDeclaration.color](#type-163)
- [ScalarPlotDeclaration.format](#type-164)
- [ScalarPlotDeclaration.textColor](#type-165)
- [ScalarPlotDeclaration.offset](#type-166)
- [ScalarPlotDeclaration.visible](#type-167)
- [ScalarPlotDeclaration.size](#type-168)
- [OhlcPlotDeclaration](#type-169)
- [OhlcPlotDeclaration.name](#type-170)
- [OhlcPlotDeclaration.kind](#type-171)
- [InputDef](#type-172)
- [InputDef.default](#type-173)
- [InputDef.options](#type-174)
- [InputDef.min](#type-175)
- [InputDef.max](#type-176)
- [InputDef.step](#type-177)
- [LinePlotDeclaration](#type-178)
- [LinePlotDeclaration.kind](#type-179)
- [LinePlotDeclaration.dash](#type-180)
- [LinePlotDeclaration.name](#type-181)
- [LinePlotDeclaration.label](#type-182)
- [LinePlotDeclaration.color](#type-183)
- [LinePlotDeclaration.format](#type-184)
- [LinePlotDeclaration.textColor](#type-185)
- [LinePlotDeclaration.offset](#type-186)
- [LinePlotDeclaration.visible](#type-187)
- [LinePlotDeclaration.size](#type-188)
- [LineBRPlotDeclaration](#type-189)
- [LineBRPlotDeclaration.kind](#type-190)
- [LineBRPlotDeclaration.dash](#type-191)
- [LineBRPlotDeclaration.name](#type-192)
- [LineBRPlotDeclaration.label](#type-193)
- [LineBRPlotDeclaration.color](#type-194)
- [LineBRPlotDeclaration.format](#type-195)
- [LineBRPlotDeclaration.textColor](#type-196)
- [LineBRPlotDeclaration.offset](#type-197)
- [LineBRPlotDeclaration.visible](#type-198)
- [LineBRPlotDeclaration.size](#type-199)
- [StepLinePlotDeclaration](#type-200)
- [StepLinePlotDeclaration.kind](#type-201)
- [StepLineBRPlotDeclaration](#type-202)
- [StepLineBRPlotDeclaration.kind](#type-203)
- [HistogramPlotDeclaration](#type-204)
- [HistogramPlotDeclaration.kind](#type-205)
- [HistogramPlotDeclaration.baseline](#type-206)
- [HistogramPlotDeclaration.size](#type-207)
- [HistogramPlotDeclaration.name](#type-208)
- [HistogramPlotDeclaration.label](#type-209)
- [HistogramPlotDeclaration.color](#type-210)
- [HistogramPlotDeclaration.format](#type-211)
- [HistogramPlotDeclaration.textColor](#type-212)
- [HistogramPlotDeclaration.offset](#type-213)
- [HistogramPlotDeclaration.visible](#type-214)
- [ColumnsPlotDeclaration](#type-215)
- [ColumnsPlotDeclaration.kind](#type-216)
- [ColumnsPlotDeclaration.baseline](#type-217)
- [ColumnsPlotDeclaration.size](#type-218)
- [PointsPlotDeclaration](#type-219)
- [PointsPlotDeclaration.kind](#type-220)
- [ShapePlotDeclaration](#type-221)
- [ShapePlotDeclaration.kind](#type-222)
- [ShapePlotDeclaration.style](#type-223)
- [ShapePlotDeclaration.location](#type-224)
- [ShapePlotDeclaration.text](#type-225)
- [CharPlotDeclaration](#type-226)
- [CharPlotDeclaration.kind](#type-227)
- [CharPlotDeclaration.char](#type-228)
- [ArrowPlotDeclaration](#type-229)
- [ArrowPlotDeclaration.kind](#type-230)
- [ArrowPlotDeclaration.colorUp](#type-231)
- [ArrowPlotDeclaration.colorDown](#type-232)
- [CandlePlotDeclaration](#type-233)
- [CandlePlotDeclaration.name](#type-234)
- [CandlePlotDeclaration.kind](#type-235)
- [BarPlotDeclaration](#type-236)
- [BarPlotDeclaration.name](#type-237)
- [BarPlotDeclaration.kind](#type-238)
- [PlotDeclarationBase](#type-239)
- [ShapeSize](#type-240)
- [ShapeOptions](#type-241)
- [ShapeOptions.textColor](#type-242)
- [CharOptions](#type-243)
- [ArrowOptions](#type-244)
- [PlotStyleBase](#type-245)
- [MarkerOptions](#type-246)
- [ShapeStyle](#type-247)
- [ShapeLocation](#type-248)

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

### BoxRef

```ts
export interface BoxRef {
    readonly id: string;
}
```

Box 对象引用，仅在所属运行中有效。

<a id="type-7"></a>

### BoxRef.id

```ts
BoxRef.id: string
```

<a id="type-8"></a>

### LabelRef

```ts
export interface LabelRef {
    readonly id: string;
}
```

Label 对象引用，仅在所属运行中有效。

<a id="type-9"></a>

### LabelRef.id

```ts
LabelRef.id: string
```

<a id="type-10"></a>

### DrawingBoxApi

```ts
export interface DrawingBoxApi {
    readonly new: BoxFactory;
    readonly all: readonly BoxRef[];
    setLeft(id: BoxRef, left: number): void;
    setTop(id: BoxRef, top: number): void;
    setRight(id: BoxRef, right: number): void;
    setBottom(id: BoxRef, bottom: number): void;
    setLeftTop(id: BoxRef, left: number, top: number): void;
    setRightBottom(id: BoxRef, right: number, bottom: number): void;
    setTopLeftPoint(id: BoxRef, point: ChartPoint): void;
    setBottomRightPoint(id: BoxRef, point: ChartPoint): void;
    setXLoc(id: BoxRef, left: number, right: number, xloc: LineXLoc): void;
    setExtend(id: BoxRef, extend: LineExtend): void;
    setBgColor(id: BoxRef, color: Color | (string & {})): void;
    setBorderColor(id: BoxRef, color: Color | (string & {})): void;
    setBorderWidth(id: BoxRef, width: number): void;
    setBorderStyle(id: BoxRef, style: BoxBorderStyle): void;
    setText(id: BoxRef, text: string): void;
    setTextColor(id: BoxRef, color: Color | (string & {})): void;
    setTextSize(id: BoxRef, size: number): void;
    setTextHAlign(id: BoxRef, align: DrawingText['align']): void;
    setTextVAlign(id: BoxRef, align: DrawingText['verticalAlign']): void;
    getLeft(id: BoxRef): number;
    getTop(id: BoxRef): number;
    getRight(id: BoxRef): number;
    getBottom(id: BoxRef): number;
    copy(id: BoxRef): BoxRef | null;
    delete(id: BoxRef | null): void;
}
```

跨 bar 保留的矩形对象；复用手绘 rectangle 模型。

<a id="type-11"></a>

### BoxFactory

```ts
export interface BoxFactory {
    (left: number, top: number, right: number, bottom: number, border_color?: Color | (string & {}), border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | (string & {}), text?: string, text_size?: number, text_color?: Color | (string & {})): BoxRef;
    (top_left: ChartPoint, bottom_right: ChartPoint, border_color?: Color | (string & {}), border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | (string & {}), text?: string, text_size?: number, text_color?: Color | (string & {})): BoxRef;
    (options: BoxOptions): BoxRef;
}
```

Pine 风格 Box 创建重载；可选参数顺序与 Pine 相同。

<a id="type-12"></a>

### ChartPoint

```ts
export interface ChartPoint {
    readonly index?: number;
    readonly time?: number;
    readonly price: number;
}
```

chart.point 值对象；绘制线段时复制坐标。

<a id="type-13"></a>

### ChartPoint.index

```ts
ChartPoint.index?: number | undefined
```

bar 索引；xloc.barIndex 时 line 读取该字段。

<a id="type-14"></a>

### ChartPoint.time

```ts
ChartPoint.time?: number | undefined
```

K 线时间戳（毫秒）；xloc.barTime 时 line 读取该字段。

<a id="type-15"></a>

### ChartPoint.price

```ts
ChartPoint.price: number
```

价格。

<a id="type-16"></a>

### LineXLoc

```ts
export type LineXLoc = (typeof xloc)[keyof typeof xloc];
```

<a id="type-17"></a>

### LineExtend

```ts
export type LineExtend = (typeof extend)[keyof typeof extend];
```

<a id="type-18"></a>

### Color

```ts
export type Color = (typeof Color)[keyof typeof Color];
```

常用色的字面量联合。

颜色参数的类型为 `Color | (string & {})`：既接受常用色，也接受任意 CSS 颜色值
（包括 `Color.teal + '80'` 这类带 alpha 的拼接结果）。

**@summary** 常用色

常用色：主题色别名 + 白 / 黑两个绝对色。

脚本里用 `Color.red` 即可；别名与 Theme.colors.scriptPalette 的键一一对应。

<a id="type-19"></a>

### BoxBorderStyle

```ts
export type BoxBorderStyle = 'solid' | 'dashed' | 'dotted';
```

Box 的边框不包含箭头。

<a id="type-20"></a>

### DrawingText

```ts
export interface DrawingText {
    value: string;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    offsetY?: number;
}
```

对象文字内容与排版；颜色和字号属于图元样式，统一放在 DrawingStyle.textColor / fontSize。

文字是绘制结果的一部分，不再保留自己的颜色与字号，避免同一属性存两份、
让主题色解析只能覆盖其中一份。

<a id="type-21"></a>

### DrawingText.value

```ts
DrawingText.value: string
```

<a id="type-22"></a>

### DrawingText.align

```ts
DrawingText.align: "left" | "right" | "center"
```

<a id="type-23"></a>

### DrawingText.verticalAlign

```ts
DrawingText.verticalAlign: "top" | "middle" | "bottom"
```

<a id="type-24"></a>

### DrawingText.offsetY

```ts
DrawingText.offsetY?: number | undefined
```

垂直像素偏移；正数向上，0 表示贴合锚点。点标签与 Box 文字消费。

<a id="type-25"></a>

### DrawingLabelApi

```ts
export interface DrawingLabelApi {
    readonly styleNone: 'none';
    readonly new: LabelFactory;
    readonly all: readonly LabelRef[];
    setX(id: LabelRef, x: number): void;
    setY(id: LabelRef, y: number): void;
    setXY(id: LabelRef, x: number, y: number): void;
    setText(id: LabelRef, text: string): void;
    setTextColor(id: LabelRef, color: Color | (string & {})): void;
    setSize(id: LabelRef, size: number): void;
    setTextAlign(id: LabelRef, align: DrawingText['align']): void;
    setYOffset(id: LabelRef, offsetY: number): void;
    getX(id: LabelRef): number;
    getY(id: LabelRef): number;
    getText(id: LabelRef): string | null;
    getYOffset(id: LabelRef): number;
    copy(id: LabelRef): LabelRef | null;
    delete(id: LabelRef | null): void;
}
```

第一版 Label 使用价格锚点和纯文字样式，与 Pine styleNone 对应。

<a id="type-26"></a>

### LabelFactory

```ts
export interface LabelFactory {
    (x: number, y: number, text?: string, xloc?: LineXLoc, location?: 'price', color?: Color | (string & {}), style?: 'none', textcolor?: Color | (string & {}), size?: number, textalign?: DrawingText['align'], offsetY?: number): LabelRef;
    (options: LabelOptions): LabelRef;
}
```

Pine 风格 Label 创建重载：位置参数与选项对象等价。

<a id="type-27"></a>

### ScriptParameters

```ts
interface ScriptParameters {
}
```

编辑器从当前 inputs 推导并合并具体参数。

<a id="type-28"></a>

### DrawingLineApi

```ts
export interface DrawingLineApi {
    readonly new: LineFactory;
    readonly all: readonly LineRef[];
    setXY1(id: LineRef, x: number, y: number): void;
    setXY2(id: LineRef, x: number, y: number): void;
    setX1(id: LineRef, x: number): void;
    setY1(id: LineRef, y: number): void;
    setX2(id: LineRef, x: number): void;
    setY2(id: LineRef, y: number): void;
    setColor(id: LineRef, color: Color | (string & {})): void;
    setStyle(id: LineRef, style: LineStyle): void;
    setWidth(id: LineRef, width: number): void;
    setExtend(id: LineRef, extend: LineExtend): void;
    getX1(id: LineRef): number;
    getY1(id: LineRef): number;
    getX2(id: LineRef): number;
    getY2(id: LineRef): number;
    getColor(id: LineRef): string | null;
    getStyle(id: LineRef): LineStyle | null;
    getWidth(id: LineRef): number;
    getExtend(id: LineRef): LineExtend | null;
    getPrice(id: LineRef, x: number): number;
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
| `line.new(...)` | 绘制线段，超出 maxLinesCount 时回收最旧 |
| `line.set_*` | 修改端点、颜色、线型、线宽或延伸 |
| `line.get_*` | 读取对应属性；已删除返回 NaN 或 null |
| `line.getPrice(id, x)` | 按线段所在直线求价格，只支持 barIndex |
| `line.copy` / `line.delete` | 复制为新线段 / 删除线段 |

<a id="type-29"></a>

### LineFactory

```ts
export interface LineFactory {
    (first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: Color | (string & {}), style?: LineStyle, width?: number): LineRef;
    (x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: Color | (string & {}), style?: LineStyle, width?: number): LineRef;
    (options: LineOptions): LineRef;
}
```

line.new 的重载：用 chart.point 端点或直接给出起止点的 X / Y 绘制线段。

<a id="type-30"></a>

### LineStyle

```ts
export type LineStyle = (typeof LineStyle)[keyof typeof LineStyle];
```

线型：实线、虚线与箭头；手绘和 line API 共用。

<a id="type-31"></a>

### TechnicalAnalysisLibrary

```ts
export type TechnicalAnalysisLibrary = {
    rising(source: Series, length: number): boolean;
    falling(source: Series, length: number): boolean;
    change(source: Series, length?: number): Series;
    sma(source: Series, length: number): Series;
    sum(source: Series, length: number): Series;
    maxsum(source: Series, length: number): readonly [
        Series,
        Series,
        Series
    ];
    highest(source: Series, length: number): Series;
    lowest(source: Series, length: number): Series;
    pivothigh(source: Series, leftBars: number, rightBars: number): Series;
    pivotlow(source: Series, leftBars: number, rightBars: number): Series;
    highestBars(source: Series, length: number): Series;
    lowestBars(source: Series, length: number): Series;
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

<a id="type-32"></a>

### Position

```ts
export enum Position {
    main = 'main',
    sub = 'sub'
}
```

**@summary** 渲染位置

指标渲染位置；脚本声明、编辑器与宿主共用同一组取值。

<a id="type-33"></a>

### ScriptInput

```ts
export interface ScriptInput {
    session(value: string, options?: InputOptions): string;
    int(value: number, options?: NumberInputOptions): number;
    float(value: number, options?: NumberInputOptions): number;
    bool(value: boolean, options?: InputOptions): boolean;
    string(value: string, options?: StringInputOptions): string;
    timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe;
}
```

按输入类型声明默认值与对应选项，params 根据返回声明推导值类型。

<a id="type-34"></a>

### InputOptions

```ts
export interface InputOptions {
    readonly title?: string;
}
```

输入参数的公共展示选项。

<a id="type-35"></a>

### InputOptions.title

```ts
InputOptions.title?: string | undefined
```

参数面板中的显示名；不填则显示参数名。

<a id="type-36"></a>

### NumberInputOptions

```ts
export interface NumberInputOptions extends InputOptions {
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}
```

数值输入的范围与步长。

<a id="type-37"></a>

### NumberInputOptions.min

```ts
NumberInputOptions.min?: number | undefined
```

<a id="type-38"></a>

### NumberInputOptions.max

```ts
NumberInputOptions.max?: number | undefined
```

<a id="type-39"></a>

### NumberInputOptions.step

```ts
NumberInputOptions.step?: number | undefined
```

<a id="type-40"></a>

### StringInputOptions

```ts
export interface StringInputOptions extends InputOptions {
    readonly options?: readonly (string | InputOption)[];
}
```

字符串输入可通过 options 渲染下拉选择。

<a id="type-41"></a>

### StringInputOptions.options

```ts
StringInputOptions.options?: readonly (string | InputOption)[] | undefined
```

<a id="type-42"></a>

### Timeframe

```ts
export type Timeframe = (typeof Timeframe)[keyof typeof Timeframe];
```

**@summary** 目标周期

脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。

取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。

<a id="type-43"></a>

### TimeframeInputOptions

```ts
export interface TimeframeInputOptions extends InputOptions {
    readonly options?: readonly Timeframe[];
}
```

周期输入的 options 只允许 Timeframe 中登记的周期。

<a id="type-44"></a>

### TimeframeInputOptions.options

```ts
TimeframeInputOptions.options?: readonly Timeframe[] | undefined
```

<a id="type-45"></a>

### ScriptIndicatorDeclaration

```ts
export interface ScriptIndicatorDeclaration extends Omit<QuickJSScriptDefinition, 'inputs'> {
    readonly scriptVersion: typeof SCRIPT_VERSION;
    onBar(): void;
}
```

完整脚本的声明与逐 bar 执行回调。

<a id="type-46"></a>

### ScriptIndicatorDeclaration.scriptVersion

```ts
ScriptIndicatorDeclaration.scriptVersion: 2
```

必须写当前写法版本；旧脚本没有声明时按 1 处理，注册期直接拒绝。

<a id="type-47"></a>

### ScriptIndicatorDeclaration.onBar

```ts
ScriptIndicatorDeclaration.onBar(): void
```

逐根 K 线调用一次

<a id="type-48"></a>

### ScriptIndicatorDeclaration.name

```ts
ScriptIndicatorDeclaration.name: string
```

稳定身份与选择器短名；注册身份由宿主维护。

<a id="type-49"></a>

### ScriptIndicatorDeclaration.format

```ts
ScriptIndicatorDeclaration.format?: Format | undefined
```

指标级数值格式；驱动副图轴与图例显示，缺省按价格。

<a id="type-50"></a>

### ScriptIndicatorDeclaration.title

```ts
ScriptIndicatorDeclaration.title?: string | undefined
```

指标选择器/图例显示的长名称；缺省用 name。

<a id="type-51"></a>

### ScriptIndicatorDeclaration.info

```ts
ScriptIndicatorDeclaration.info?: string | undefined
```

指标选择器里的说明文本；缺省不展示说明。

<a id="type-52"></a>

### ScriptIndicatorDeclaration.position

```ts
ScriptIndicatorDeclaration.position: Position
```

指标渲染位置。

| 取值 | 含义 |
| --- | --- |
| `Position.main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.sub` | 独立副图 |

<a id="type-53"></a>

### ScriptIndicatorDeclaration.maxLinesCount

```ts
ScriptIndicatorDeclaration.maxLinesCount?: number | undefined
```

可保留的 line 对象数；默认 50，范围 1..2000。

<a id="type-54"></a>

### ScriptIndicatorDeclaration.maxBoxesCount

```ts
ScriptIndicatorDeclaration.maxBoxesCount?: number | undefined
```

可保留的 Box 数量；默认值与范围由公共 drawing 契约管理。

<a id="type-55"></a>

### ScriptIndicatorDeclaration.maxLabelsCount

```ts
ScriptIndicatorDeclaration.maxLabelsCount?: number | undefined
```

可保留的 Label 数量。

<a id="type-56"></a>

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

<a id="type-57"></a>

### PlotStyleOptions

```ts
export type PlotStyleOptions<K extends PlotDeclaration['kind']> = Omit<Extract<PlotDeclaration, {
    kind: K;
}>, 'kind' | 'name'>;
```

从共享声明提取对应图形的样式选项，类型由方法名确定。

<a id="type-58"></a>

### PlotStyleOptions.label

```ts
PlotStyleOptions.label?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["label"] | undefined
```

图例名称；不填则取 name。

<a id="type-59"></a>

### PlotStyleOptions.color

```ts
PlotStyleOptions.color?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["color"] | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。
实体颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。

<a id="type-60"></a>

### PlotStyleOptions.format

```ts
PlotStyleOptions.format?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["format"] | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-61"></a>

### PlotStyleOptions.offset

```ts
PlotStyleOptions.offset?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["offset"] | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-62"></a>

### PlotStyleOptions.visible

```ts
PlotStyleOptions.visible?: (Extract<LinePlotDeclaration, { kind: K; }> | Extract<LineBRPlotDeclaration, { kind: K; }> | Extract<StepLinePlotDeclaration, { kind: K; }> | Extract<StepLineBRPlotDeclaration, { kind: K; }> | Extract<HistogramPlotDeclaration, { kind: K; }> | Extract<ColumnsPlotDeclaration, { kind: K; }> | Extract<PointsPlotDeclaration, { kind: K; }> | Extract<ShapePlotDeclaration, { kind: K; }> | Extract<CharPlotDeclaration, { kind: K; }> | Extract<ArrowPlotDeclaration, { kind: K; }> | Extract<CandlePlotDeclaration, { kind: K; }> | Extract<BarPlotDeclaration, { kind: K; }>)["visible"] | undefined
```

是否显示图形；不填则显示。

<a id="type-63"></a>

### PlotRef

```ts
export interface PlotRef {
    readonly name: string;
}
```

plot.* 返回的绘图句柄；fill 借它引用两个 Plot。

<a id="type-64"></a>

### PlotRef.name

```ts
PlotRef.name: string
```

句柄所属 Plot 的 name。

<a id="type-65"></a>

### CandlePlotOptions

```ts
export interface CandlePlotOptions extends OhlcPlotOptions {
    readonly wickColor?: Color | (string & {}) | null;
    readonly borderColor?: Color | (string & {}) | null;
}
```

蜡烛实体、影线和边框可独立着色。

<a id="type-66"></a>

### CandlePlotOptions.wickColor

```ts
CandlePlotOptions.wickColor?: Color | (string & {}) | null | undefined
```

影线颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。

<a id="type-67"></a>

### CandlePlotOptions.borderColor

```ts
CandlePlotOptions.borderColor?: Color | (string & {}) | null | undefined
```

边框颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。

<a id="type-68"></a>

### CandlePlotOptions.label

```ts
CandlePlotOptions.label?: string | undefined
```

<a id="type-69"></a>

### CandlePlotOptions.visible

```ts
CandlePlotOptions.visible?: boolean | undefined
```

<a id="type-70"></a>

### CandlePlotOptions.offset

```ts
CandlePlotOptions.offset?: number | undefined
```

<a id="type-71"></a>

### CandlePlotOptions.showLast

```ts
CandlePlotOptions.showLast?: number | undefined
```

<a id="type-72"></a>

### CandlePlotOptions.color

```ts
CandlePlotOptions.color?: Color | (string & {}) | null | undefined
```

实体颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。

<a id="type-73"></a>

### CandlePlotOptions.format

```ts
CandlePlotOptions.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-74"></a>

### BarPlotOptions

```ts
export interface BarPlotOptions extends OhlcPlotOptions {
}
```

美国线的竖线和左右短横线共用颜色。

<a id="type-75"></a>

### ScriptFillOptions

```ts
export interface ScriptFillOptions {
    readonly visible?: boolean;
}
```

fill 第 5 个参数的可选样式；title 缺省时按 from/to 生成填充标识。

<a id="type-76"></a>

### ScriptFillOptions.visible

```ts
ScriptFillOptions.visible?: boolean | undefined
```

是否绘制填充；不填则绘制。

<a id="type-77"></a>

### HLineRef

```ts
export interface HLineRef {
    readonly hline: string;
}
```

hline 返回的句柄；fill 借它引用两条水平线之间的区域。

<a id="type-78"></a>

### HLineRef.hline

```ts
HLineRef.hline: string
```

句柄所属水平线的 id，只在本轮运行内有效。

<a id="type-79"></a>

### HLineOptions

```ts
export interface HLineOptions {
    readonly title?: string;
    readonly color?: Color | (string & {});
    readonly linestyle?: HLineStyle;
    readonly linewidth?: number;
}
```

`hline` 的调用样式；价格由位置参数提供。

<a id="type-80"></a>

### HLineOptions.title

```ts
HLineOptions.title?: string | undefined
```

无障碍标题；缺省不显示。

<a id="type-81"></a>

### HLineOptions.color

```ts
HLineOptions.color?: Color | (string & {}) | undefined
```

颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。

<a id="type-82"></a>

### HLineOptions.linestyle

```ts
HLineOptions.linestyle?: HLineStyle | undefined
```

线型；缺省实线。

<a id="type-83"></a>

### HLineOptions.linewidth

```ts
HLineOptions.linewidth?: number | undefined
```

线宽，逻辑像素；缺省 1。

<a id="type-84"></a>

### LibraryModules

```ts
export interface LibraryModules {
}
```

库的类型目录，由宿主按库名补充，不负责运行时加载。

<a id="type-85"></a>

### ScriptRequest

```ts
export interface ScriptRequest {
    securityLowerTf<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: LowerTimeframeOptions): IntrabarResult<T>;
    security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: SecurityOptions): RequestResult<T>;
}
```

跨品种、跨周期取数入口，等价于 Pine 的 request.security。

<a id="type-86"></a>

### RequestValue

```ts
export type RequestValue = number | string | boolean | null | readonly RequestValue[];
```

<a id="type-87"></a>

### LowerTimeframeOptions

```ts
export interface LowerTimeframeOptions extends Omit<SecurityOptions, 'gaps'> {
    readonly ignoreInvalidTimeframe?: boolean;
}
```

<a id="type-88"></a>

### LowerTimeframeOptions.ignoreInvalidTimeframe

```ts
LowerTimeframeOptions.ignoreInvalidTimeframe?: boolean | undefined
```

高于主图的请求周期：默认报错，开启时返回空数组。

<a id="type-89"></a>

### LowerTimeframeOptions.source

```ts
LowerTimeframeOptions.source?: DataSource | undefined
```

目标来源的 source；仅当请求品种与图表品种不同时必须显式指定。

<a id="type-90"></a>

### LowerTimeframeOptions.calcBarsCount

```ts
LowerTimeframeOptions.calcBarsCount?: number | undefined
```

图表历史起点之前额外加载的目标周期预热根数，缺省 300。

<a id="type-91"></a>

### IntrabarResult

```ts
export type IntrabarResult<T> = T extends readonly unknown[] ? {
    readonly [K in keyof T]: readonly RequestResult<T[K]>[];
} : readonly RequestResult<T>[];
```

<a id="type-92"></a>

### SecurityOptions

```ts
export interface SecurityOptions {
    readonly source?: DataSource;
    readonly calcBarsCount?: number;
    readonly gaps?: 'off' | 'on';
}
```

<a id="type-93"></a>

### SecurityOptions.source

```ts
SecurityOptions.source?: DataSource | undefined
```

目标来源的 source；仅当请求品种与图表品种不同时必须显式指定。

<a id="type-94"></a>

### SecurityOptions.calcBarsCount

```ts
SecurityOptions.calcBarsCount?: number | undefined
```

图表历史起点之前额外加载的目标周期预热根数，缺省 300。

<a id="type-95"></a>

### SecurityOptions.gaps

```ts
SecurityOptions.gaps?: "off" | "on" | undefined
```

缺口策略：`off` 延续最近可用结果，`on` 只在新目标结果出现时输出，其余点留空。

<a id="type-96"></a>

### RequestResult

```ts
export type RequestResult<T> = T extends Series ? number : T extends readonly unknown[] ? {
    readonly [K in keyof T]: RequestResult<T[K]>;
} : T;
```

<a id="type-97"></a>

### BoxOptions

```ts
export interface BoxOptions {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly borderColor?: Color | (string & {});
    readonly borderWidth?: number;
    readonly borderStyle?: BoxBorderStyle;
    readonly extend?: LineExtend;
    readonly xloc?: LineXLoc;
    readonly backgroundColor?: Color | (string & {});
    readonly text?: string;
    readonly textSize?: number;
    readonly textColor?: Color | (string & {});
}
```

Box 的选项对象形态；只写需要的字段，省略只接受单一取值的参数。

<a id="type-98"></a>

### BoxOptions.left

```ts
BoxOptions.left: number
```

左边界；按 xloc 读取索引或时间戳。

<a id="type-99"></a>

### BoxOptions.top

```ts
BoxOptions.top: number
```

上边界价格。

<a id="type-100"></a>

### BoxOptions.right

```ts
BoxOptions.right: number
```

右边界；规则同 left。

<a id="type-101"></a>

### BoxOptions.bottom

```ts
BoxOptions.bottom: number
```

下边界价格。

<a id="type-102"></a>

### BoxOptions.borderColor

```ts
BoxOptions.borderColor?: Color | (string & {}) | undefined
```

边框颜色，缺省 Color.blue。

<a id="type-103"></a>

### BoxOptions.borderWidth

```ts
BoxOptions.borderWidth?: number | undefined
```

边框宽度，逻辑像素；0 表示不画边框。

<a id="type-104"></a>

### BoxOptions.borderStyle

```ts
BoxOptions.borderStyle?: BoxBorderStyle | undefined
```

边框线型，缺省 solid。

<a id="type-105"></a>

### BoxOptions.extend

```ts
BoxOptions.extend?: LineExtend | undefined
```

延伸方向，缺省不延伸。

<a id="type-106"></a>

### BoxOptions.xloc

```ts
BoxOptions.xloc?: LineXLoc | undefined
```

X 坐标单位，缺省 barIndex。

<a id="type-107"></a>

### BoxOptions.backgroundColor

```ts
BoxOptions.backgroundColor?: Color | (string & {}) | undefined
```

填充颜色；缺省与边框同色。

<a id="type-108"></a>

### BoxOptions.text

```ts
BoxOptions.text?: string | undefined
```

框内文字，缺省为空。

<a id="type-109"></a>

### BoxOptions.textSize

```ts
BoxOptions.textSize?: number | undefined
```

文字字号，缺省 12。

<a id="type-110"></a>

### BoxOptions.textColor

```ts
BoxOptions.textColor?: Color | (string & {}) | undefined
```

文字颜色；缺省跟随边框颜色。

<a id="type-111"></a>

### LabelOptions

```ts
export interface LabelOptions {
    readonly x: number;
    readonly y: number;
    readonly text?: string;
    readonly xloc?: LineXLoc;
    readonly color?: Color | (string & {});
    readonly textColor?: Color | (string & {});
    readonly size?: number;
    readonly align?: DrawingText['align'];
    readonly offsetY?: number;
}
```

Label 的选项对象形态；只写需要的字段，省略 location/style 这类只有一个取值的参数。

<a id="type-112"></a>

### LabelOptions.x

```ts
LabelOptions.x: number
```

锚点 X；按 xloc 读取索引或时间戳。

<a id="type-113"></a>

### LabelOptions.y

```ts
LabelOptions.y: number
```

锚点价格。

<a id="type-114"></a>

### LabelOptions.text

```ts
LabelOptions.text?: string | undefined
```

文字，缺省为空字符串。

<a id="type-115"></a>

### LabelOptions.xloc

```ts
LabelOptions.xloc?: LineXLoc | undefined
```

X 坐标单位，缺省 barIndex。

<a id="type-116"></a>

### LabelOptions.color

```ts
LabelOptions.color?: Color | (string & {}) | undefined
```

文字颜色；同时作为标签颜色。

<a id="type-117"></a>

### LabelOptions.textColor

```ts
LabelOptions.textColor?: Color | (string & {}) | undefined
```

文字颜色覆盖；缺省跟随 color。

<a id="type-118"></a>

### LabelOptions.size

```ts
LabelOptions.size?: number | undefined
```

字号，逻辑像素，缺省 12。

<a id="type-119"></a>

### LabelOptions.align

```ts
LabelOptions.align?: "left" | "right" | "center" | undefined
```

水平对齐，缺省 center。

<a id="type-120"></a>

### LabelOptions.offsetY

```ts
LabelOptions.offsetY?: number | undefined
```

垂直偏移，逻辑像素，正数向上，缺省 0。

<a id="type-121"></a>

### LineOptions

```ts
export interface LineOptions {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly xloc?: LineXLoc;
    readonly extend?: LineExtend;
    readonly color?: Color | (string & {});
    readonly style?: LineStyle;
    readonly width?: number;
}
```

Line 的选项对象形态；只写需要的字段，等价于位置参数。

<a id="type-122"></a>

### LineOptions.x1

```ts
LineOptions.x1: number
```

起点 X；按 xloc 读取索引或时间戳。

<a id="type-123"></a>

### LineOptions.y1

```ts
LineOptions.y1: number
```

起点价格。

<a id="type-124"></a>

### LineOptions.x2

```ts
LineOptions.x2: number
```

终点 X；规则同 x1。

<a id="type-125"></a>

### LineOptions.y2

```ts
LineOptions.y2: number
```

终点价格。

<a id="type-126"></a>

### LineOptions.xloc

```ts
LineOptions.xloc?: LineXLoc | undefined
```

X 坐标单位，缺省 barIndex。

<a id="type-127"></a>

### LineOptions.extend

```ts
LineOptions.extend?: LineExtend | undefined
```

延伸方向，缺省不延伸。

<a id="type-128"></a>

### LineOptions.color

```ts
LineOptions.color?: Color | (string & {}) | undefined
```

颜色，缺省 Color.blue。

<a id="type-129"></a>

### LineOptions.style

```ts
LineOptions.style?: LineStyle | undefined
```

线型或箭头，缺省实线。

<a id="type-130"></a>

### LineOptions.width

```ts
LineOptions.width?: number | undefined
```

线宽，逻辑像素，缺省 1。

<a id="type-131"></a>

### InputOption

```ts
export interface InputOption {
    readonly value: string;
    readonly label: string;
}
```

参数值与展示标签在生产者契约中定义，所有参数面板共用。

<a id="type-132"></a>

### InputOption.value

```ts
InputOption.value: string
```

<a id="type-133"></a>

### InputOption.label

```ts
InputOption.label: string
```

<a id="type-134"></a>

### QuickJSScriptDefinition

```ts
export interface QuickJSScriptDefinition {
    readonly scriptVersion: number;
    readonly name: string;
    readonly title?: string;
    readonly info?: string;
    readonly position: Position;
    readonly format?: Format;
    readonly maxLinesCount?: number;
    readonly maxBoxesCount?: number;
    readonly maxLabelsCount?: number;
    readonly inputs: InputSchema<Record<string, ScriptParamValue>>;
}
```

从完整脚本文件声明中读取的元数据，函数仍留在 VM 内执行。

<a id="type-135"></a>

### QuickJSScriptDefinition.scriptVersion

```ts
QuickJSScriptDefinition.scriptVersion: number
```

脚本写法版本；宿主按 SCRIPT_VERSION 校验，缺失按 1 处理。

<a id="type-136"></a>

### QuickJSScriptDefinition.name

```ts
QuickJSScriptDefinition.name: string
```

稳定身份与选择器短名；注册身份由宿主维护。

<a id="type-137"></a>

### QuickJSScriptDefinition.title

```ts
QuickJSScriptDefinition.title?: string | undefined
```

指标选择器/图例显示的长名称；缺省用 name。

<a id="type-138"></a>

### QuickJSScriptDefinition.info

```ts
QuickJSScriptDefinition.info?: string | undefined
```

指标选择器里的说明文本；缺省不展示说明。

<a id="type-139"></a>

### QuickJSScriptDefinition.position

```ts
QuickJSScriptDefinition.position: Position
```

指标渲染位置。

| 取值 | 含义 |
| --- | --- |
| `Position.main` | 叠加到主图，与 K 线共用主图价格轴 |
| `Position.sub` | 独立副图 |

<a id="type-140"></a>

### QuickJSScriptDefinition.format

```ts
QuickJSScriptDefinition.format?: Format | undefined
```

指标级数值格式；驱动副图轴与图例显示，缺省按价格。

<a id="type-141"></a>

### QuickJSScriptDefinition.maxLinesCount

```ts
QuickJSScriptDefinition.maxLinesCount?: number | undefined
```

可保留的 line 对象数；默认 50，范围 1..2000。

<a id="type-142"></a>

### QuickJSScriptDefinition.maxBoxesCount

```ts
QuickJSScriptDefinition.maxBoxesCount?: number | undefined
```

可保留的 Box 数量；默认值与范围由公共 drawing 契约管理。

<a id="type-143"></a>

### QuickJSScriptDefinition.maxLabelsCount

```ts
QuickJSScriptDefinition.maxLabelsCount?: number | undefined
```

可保留的 Label 数量。

<a id="type-144"></a>

### QuickJSScriptDefinition.inputs

```ts
QuickJSScriptDefinition.inputs: InputSchema<Record<string, ScriptParamValue>>
```

<a id="type-145"></a>

### PlotDeclaration

```ts
export type PlotDeclaration = ScalarPlotDeclaration | OhlcPlotDeclaration;
```

<a id="type-146"></a>

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

<a id="type-147"></a>

### PlotDeclaration.name

```ts
PlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-148"></a>

### PlotDeclaration.label

```ts
PlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-149"></a>

### PlotDeclaration.color

```ts
PlotDeclaration.color?: Color | (string & {}) | null | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。
实体颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。

<a id="type-150"></a>

### PlotDeclaration.format

```ts
PlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-151"></a>

### PlotDeclaration.offset

```ts
PlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-152"></a>

### PlotDeclaration.visible

```ts
PlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-153"></a>

### OhlcPlotOptions

```ts
export interface OhlcPlotOptions {
    readonly label?: string;
    readonly visible?: boolean;
    readonly offset?: number;
    readonly showLast?: number;
    readonly color?: Color | (string & {}) | null;
    readonly format?: Format;
}
```

四价格图形的调用样式；颜色允许逐 bar 变化，null 隐藏对应部分。

<a id="type-154"></a>

### HLineStyle

```ts
export type HLineStyle = (typeof HLineStyle)[keyof typeof HLineStyle];
```

水平线线型取值。

**@summary** 水平线线型

`hline` 的线型档位；与手绘 line 的 `LineStyle` 同义，只保留线型子集。

<a id="type-155"></a>

### DataSource

```ts
export type DataSource = (typeof DataSource)[keyof typeof DataSource];
```

**@summary** 数据源

内置数据源身份；指定后严格路由，不做跨来源回退。

<a id="type-156"></a>

### Format

```ts
export type Format = (typeof Format)[keyof typeof Format];
```

**@summary** 数值格式

数值格式化档位；脚本里用 `Format.volume` 即可，不填时按 `Format.price` 处理。

| 成员 | 示例 |
| --- | --- |
| `Format.price` | `1234.567` |
| `Format.volume` | `1.25K`、`12.30M`、`3.40B` |
| `Format.percent` | `3.45%`、`-12.30%` |
| `Format.mintick` | `1234.5678901` |

<a id="type-157"></a>

### InputSchema

```ts
export type InputSchema<P> = {
    [K in keyof P]: InputDef<P[K]>;
};
```

输入声明表：键即参数名，P 为解析后的参数值类型。

<a id="type-158"></a>

### ScriptParamValue

```ts
export type ScriptParamValue = number | string | boolean;
```

可以在脚本中作为 `params` 读取的输入值。

<a id="type-159"></a>

### ScalarPlotDeclaration

```ts
export type ScalarPlotDeclaration = LinePlotDeclaration | LineBRPlotDeclaration | StepLinePlotDeclaration | StepLineBRPlotDeclaration | HistogramPlotDeclaration | ColumnsPlotDeclaration | PointsPlotDeclaration | ShapePlotDeclaration | CharPlotDeclaration | ArrowPlotDeclaration;
```

声明的 Plot：按 kind 区分各图形及其专用字段。

<a id="type-160"></a>

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

<a id="type-161"></a>

### ScalarPlotDeclaration.name

```ts
ScalarPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-162"></a>

### ScalarPlotDeclaration.label

```ts
ScalarPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-163"></a>

### ScalarPlotDeclaration.color

```ts
ScalarPlotDeclaration.color?: Color | (string & {}) | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。

<a id="type-164"></a>

### ScalarPlotDeclaration.format

```ts
ScalarPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-165"></a>

### ScalarPlotDeclaration.textColor

```ts
ScalarPlotDeclaration.textColor?: Color | (string & {}) | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。

<a id="type-166"></a>

### ScalarPlotDeclaration.offset

```ts
ScalarPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-167"></a>

### ScalarPlotDeclaration.visible

```ts
ScalarPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-168"></a>

### ScalarPlotDeclaration.size

```ts
ScalarPlotDeclaration.size?: number | ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。
固定逻辑像素柱宽，或 Size 档位；默认 1px。

<a id="type-169"></a>

### OhlcPlotDeclaration

```ts
export type OhlcPlotDeclaration = CandlePlotDeclaration | BarPlotDeclaration;
```

<a id="type-170"></a>

### OhlcPlotDeclaration.name

```ts
OhlcPlotDeclaration.name: string
```

<a id="type-171"></a>

### OhlcPlotDeclaration.kind

```ts
OhlcPlotDeclaration.kind: "candle" | "bar"
```

<a id="type-172"></a>

### InputDef

```ts
export interface InputDef<T> extends InputOptions {
    readonly default: T;
    readonly options?: readonly (string | InputOption)[];
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}
```

单个输入参数的声明，由 input() 工厂产出。

<a id="type-173"></a>

### InputDef.default

```ts
InputDef.default: T
```

默认值，同时决定参数在面板中的编辑类型。

<a id="type-174"></a>

### InputDef.options

```ts
InputDef.options?: readonly (string | InputOption)[] | undefined
```

<a id="type-175"></a>

### InputDef.min

```ts
InputDef.min?: number | undefined
```

<a id="type-176"></a>

### InputDef.max

```ts
InputDef.max?: number | undefined
```

<a id="type-177"></a>

### InputDef.step

```ts
InputDef.step?: number | undefined
```

<a id="type-178"></a>

### LinePlotDeclaration

```ts
export interface LinePlotDeclaration extends PlotDeclarationBase {
    readonly kind: 'line';
    readonly dash?: readonly number[];
}
```

普通折线及其样式，跨空值连接有效点。

<a id="type-179"></a>

### LinePlotDeclaration.kind

```ts
LinePlotDeclaration.kind: "line"
```

绘图类型：折线。

<a id="type-180"></a>

### LinePlotDeclaration.dash

```ts
LinePlotDeclaration.dash?: readonly number[] | undefined
```

虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。

<a id="type-181"></a>

### LinePlotDeclaration.name

```ts
LinePlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-182"></a>

### LinePlotDeclaration.label

```ts
LinePlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-183"></a>

### LinePlotDeclaration.color

```ts
LinePlotDeclaration.color?: Color | (string & {}) | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。

<a id="type-184"></a>

### LinePlotDeclaration.format

```ts
LinePlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-185"></a>

### LinePlotDeclaration.textColor

```ts
LinePlotDeclaration.textColor?: Color | (string & {}) | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。

<a id="type-186"></a>

### LinePlotDeclaration.offset

```ts
LinePlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-187"></a>

### LinePlotDeclaration.visible

```ts
LinePlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-188"></a>

### LinePlotDeclaration.size

```ts
LinePlotDeclaration.size?: ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。

<a id="type-189"></a>

### LineBRPlotDeclaration

```ts
export interface LineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'linebr';
}
```

断线折线及其样式，空值处断开。

<a id="type-190"></a>

### LineBRPlotDeclaration.kind

```ts
LineBRPlotDeclaration.kind: "linebr"
```

<a id="type-191"></a>

### LineBRPlotDeclaration.dash

```ts
LineBRPlotDeclaration.dash?: readonly number[] | undefined
```

虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。

<a id="type-192"></a>

### LineBRPlotDeclaration.name

```ts
LineBRPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-193"></a>

### LineBRPlotDeclaration.label

```ts
LineBRPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-194"></a>

### LineBRPlotDeclaration.color

```ts
LineBRPlotDeclaration.color?: Color | (string & {}) | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。

<a id="type-195"></a>

### LineBRPlotDeclaration.format

```ts
LineBRPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-196"></a>

### LineBRPlotDeclaration.textColor

```ts
LineBRPlotDeclaration.textColor?: Color | (string & {}) | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。

<a id="type-197"></a>

### LineBRPlotDeclaration.offset

```ts
LineBRPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-198"></a>

### LineBRPlotDeclaration.visible

```ts
LineBRPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-199"></a>

### LineBRPlotDeclaration.size

```ts
LineBRPlotDeclaration.size?: ShapeSize | undefined
```

图形尺寸档位；不填则使用 ShapeSize.auto。
折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。
具体尺寸见 ShapeSize 的档位对照表。

<a id="type-200"></a>

### StepLinePlotDeclaration

```ts
export interface StepLinePlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'stepline';
}
```

阶梯线声明，在相邻有效点的水平中点跳变，跨空值连接。

<a id="type-201"></a>

### StepLinePlotDeclaration.kind

```ts
StepLinePlotDeclaration.kind: "stepline"
```

<a id="type-202"></a>

### StepLineBRPlotDeclaration

```ts
export interface StepLineBRPlotDeclaration extends Omit<LinePlotDeclaration, 'kind'> {
    readonly kind: 'steplinebr';
}
```

断线阶梯线声明，空值处断开。

<a id="type-203"></a>

### StepLineBRPlotDeclaration.kind

```ts
StepLineBRPlotDeclaration.kind: "steplinebr"
```

<a id="type-204"></a>

### HistogramPlotDeclaration

```ts
export interface HistogramPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
    readonly kind: 'histogram';
    readonly baseline?: number;
    readonly size?: ShapeSize | number;
}
```

柱状图及其样式。

<a id="type-205"></a>

### HistogramPlotDeclaration.kind

```ts
HistogramPlotDeclaration.kind: "histogram"
```

绘图类型：柱状图。

<a id="type-206"></a>

### HistogramPlotDeclaration.baseline

```ts
HistogramPlotDeclaration.baseline?: number | undefined
```

柱状图的起始基线值；不填则取 0。

<a id="type-207"></a>

### HistogramPlotDeclaration.size

```ts
HistogramPlotDeclaration.size?: number | ShapeSize | undefined
```

固定逻辑像素柱宽，或 Size 档位；默认 1px。

<a id="type-208"></a>

### HistogramPlotDeclaration.name

```ts
HistogramPlotDeclaration.name: string
```

绘图名称，相同名称的数据会画在同一条线或同一组标记中。

<a id="type-209"></a>

### HistogramPlotDeclaration.label

```ts
HistogramPlotDeclaration.label?: string | undefined
```

图例名称；不填则取 name。

<a id="type-210"></a>

### HistogramPlotDeclaration.color

```ts
HistogramPlotDeclaration.color?: Color | (string & {}) | undefined
```

图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。

<a id="type-211"></a>

### HistogramPlotDeclaration.format

```ts
HistogramPlotDeclaration.format?: Format | undefined
```

数值格式档位；缺省继承指标级 format，用于图例数值显示。

<a id="type-212"></a>

### HistogramPlotDeclaration.textColor

```ts
HistogramPlotDeclaration.textColor?: Color | (string & {}) | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。

<a id="type-213"></a>

### HistogramPlotDeclaration.offset

```ts
HistogramPlotDeclaration.offset?: number | undefined
```

图形移动的 K 线根数；正值向右、负值向左，不填则不移动。

<a id="type-214"></a>

### HistogramPlotDeclaration.visible

```ts
HistogramPlotDeclaration.visible?: boolean | undefined
```

是否显示图形；不填则显示。

<a id="type-215"></a>

### ColumnsPlotDeclaration

```ts
export interface ColumnsPlotDeclaration extends Omit<PlotDeclarationBase, 'size'> {
    readonly kind: 'columns';
    readonly baseline?: number;
    readonly size?: never;
}
```

按时间槽位填充、左右各留 1 个物理像素，不支持 size。

<a id="type-216"></a>

### ColumnsPlotDeclaration.kind

```ts
ColumnsPlotDeclaration.kind: "columns"
```

<a id="type-217"></a>

### ColumnsPlotDeclaration.baseline

```ts
ColumnsPlotDeclaration.baseline?: number | undefined
```

<a id="type-218"></a>

### ColumnsPlotDeclaration.size

```ts
ColumnsPlotDeclaration.size?: undefined
```

<a id="type-219"></a>

### PointsPlotDeclaration

```ts
export interface PointsPlotDeclaration extends PlotDeclarationBase {
    readonly kind: 'points';
}
```

点图 Plot 声明；散点直径由公共 size 决定。

<a id="type-220"></a>

### PointsPlotDeclaration.kind

```ts
PointsPlotDeclaration.kind: "points"
```

绘图类型：散点。

<a id="type-221"></a>

### ShapePlotDeclaration

```ts
export interface ShapePlotDeclaration extends PlotDeclarationBase, ShapeOptions {
    readonly kind: 'shape';
}
```

形状标记及其样式。

<a id="type-222"></a>

### ShapePlotDeclaration.kind

```ts
ShapePlotDeclaration.kind: "shape"
```

绘图类型：固定形状标记。

<a id="type-223"></a>

### ShapePlotDeclaration.style

```ts
ShapePlotDeclaration.style?: ShapeStyle | undefined
```

标记形状；不填则使用 ShapeStyle.xCross。

<a id="type-224"></a>

### ShapePlotDeclaration.location

```ts
ShapePlotDeclaration.location?: ShapeLocation | undefined
```

标记位置；默认在 K 线上方，ShapeLocation.absolute 表示绘制在 value 指定的价格处。

<a id="type-225"></a>

### ShapePlotDeclaration.text

```ts
ShapePlotDeclaration.text?: string | undefined
```

标记旁的附加文字；不填则不显示附加文字。

<a id="type-226"></a>

### CharPlotDeclaration

```ts
export interface CharPlotDeclaration extends PlotDeclarationBase, CharOptions {
    readonly kind: 'char';
}
```

字符标记声明。

<a id="type-227"></a>

### CharPlotDeclaration.kind

```ts
CharPlotDeclaration.kind: "char"
```

绘图类型：字符标记。

<a id="type-228"></a>

### CharPlotDeclaration.char

```ts
CharPlotDeclaration.char?: string | undefined
```

要绘制的单个 Unicode 字符；不填则显示 ★，填空字符串则只显示附加文字。

<a id="type-229"></a>

### ArrowPlotDeclaration

```ts
export interface ArrowPlotDeclaration extends PlotDeclarationBase, ArrowOptions {
    readonly kind: 'arrow';
}
```

数值箭头声明。

<a id="type-230"></a>

### ArrowPlotDeclaration.kind

```ts
ArrowPlotDeclaration.kind: "arrow"
```

绘图类型：数值箭头，正负决定方向，绝对值决定长度。

<a id="type-231"></a>

### ArrowPlotDeclaration.colorUp

```ts
ArrowPlotDeclaration.colorUp?: Color | (string & {}) | undefined
```

正值向上箭头的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认使用 color。

<a id="type-232"></a>

### ArrowPlotDeclaration.colorDown

```ts
ArrowPlotDeclaration.colorDown?: Color | (string & {}) | undefined
```

负值向下箭头的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认使用 color。

<a id="type-233"></a>

### CandlePlotDeclaration

```ts
export interface CandlePlotDeclaration extends CandlePlotOptions {
    readonly name: string;
    readonly kind: 'candle';
}
```

<a id="type-234"></a>

### CandlePlotDeclaration.name

```ts
CandlePlotDeclaration.name: string
```

<a id="type-235"></a>

### CandlePlotDeclaration.kind

```ts
CandlePlotDeclaration.kind: "candle"
```

<a id="type-236"></a>

### BarPlotDeclaration

```ts
export interface BarPlotDeclaration extends BarPlotOptions {
    readonly name: string;
    readonly kind: 'bar';
}
```

<a id="type-237"></a>

### BarPlotDeclaration.name

```ts
BarPlotDeclaration.name: string
```

<a id="type-238"></a>

### BarPlotDeclaration.kind

```ts
BarPlotDeclaration.kind: "bar"
```

<a id="type-239"></a>

### PlotDeclarationBase

```ts
export interface PlotDeclarationBase extends PlotStyleBase {
    readonly name: string;
}
```

声明式 Plot 的公共信息。

<a id="type-240"></a>

### ShapeSize

```ts
export type ShapeSize = 'auto' | 'tiny' | 'small' | 'normal' | 'large' | 'huge';
```

**@summary** 尺寸档位

图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。

| 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
| --- | --- | --- | --- | --- | --- |
| ShapeSize.auto | 1 | 3 | 12 | 50 | 1 |
| ShapeSize.tiny | 1 | 6 | 6 | 20 | 1 |
| ShapeSize.small | 1 | 10 | 10 | 30 | 1 |
| ShapeSize.normal | 2 | 14 | 14 | 40 | 2 |
| ShapeSize.large | 3 | 20 | 20 | 60 | 3 |
| ShapeSize.huge | 4 | 28 | 28 | 90 | 4 |

px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
Columns 不接受 size，柱宽随 K 线间距自动调整。

<a id="type-241"></a>

### ShapeOptions

```ts
export interface ShapeOptions extends MarkerOptions {
    readonly style?: ShapeStyle;
}
```

固定形状标记的专属样式。

<a id="type-242"></a>

### ShapeOptions.textColor

```ts
ShapeOptions.textColor?: Color | (string & {}) | undefined
```

标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。

<a id="type-243"></a>

### CharOptions

```ts
export interface CharOptions extends MarkerOptions {
    readonly char?: string;
}
```

字符标记；空字符可只显示附加文字。

<a id="type-244"></a>

### ArrowOptions

```ts
export interface ArrowOptions {
    readonly colorUp?: Color | (string & {});
    readonly colorDown?: Color | (string & {});
}
```

数值箭头的方向颜色；箭头长度由 Plot 公共的 size 决定。

<a id="type-245"></a>

### PlotStyleBase

```ts
export interface PlotStyleBase {
    readonly label?: string;
    readonly color?: Color | (string & {});
    readonly format?: Format;
    readonly textColor?: Color | (string & {});
    readonly offset?: number;
    readonly visible?: boolean;
    readonly size?: ShapeSize;
}
```

声明式 Plot 的公共样式。

<a id="type-246"></a>

### MarkerOptions

```ts
export interface MarkerOptions {
    readonly location?: ShapeLocation;
    readonly text?: string;
    readonly textColor?: Color | (string & {});
}
```

Shape 与 Char 的共享样式；相对位置过滤零值，absolute 把 value 当价格。

<a id="type-247"></a>

### ShapeStyle

```ts
export type ShapeStyle = 'xcross' | 'cross' | 'circle' | 'square' | 'diamond' | 'triangleup' | 'triangledown' | 'arrowup' | 'arrowdown' | 'labelup' | 'labeldown' | 'flag';
```

**@summary** 标记形状

固定形状标记可选的外形；缺省使用 XCross。

<a id="type-248"></a>

### ShapeLocation

```ts
export type ShapeLocation = 'abovebar' | 'belowbar' | 'top' | 'bottom' | 'absolute';
```

**@summary** 标记位置

标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。

