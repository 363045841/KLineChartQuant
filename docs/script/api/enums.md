<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API · 枚举

> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验同步。写法与规则见[指标脚本](../../../packages/script/docs/indicator.md)。

## 取值

<a id="color"></a>

### Color

```ts
enum Color
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `Color.red` | `"@red"` | 红 |
| `Color.deepOrange` | `"@deepOrange"` | 深橙 |
| `Color.orange` | `"@orange"` | 橙 |
| `Color.amber` | `"@amber"` | 琥珀 |
| `Color.yellow` | `"@yellow"` | 黄 |
| `Color.lime` | `"@lime"` | 青柠 |
| `Color.lightGreen` | `"@lightGreen"` | 浅绿 |
| `Color.green` | `"@green"` | 绿 |
| `Color.teal` | `"@teal"` | 蓝绿 |
| `Color.cyan` | `"@cyan"` | 青 |
| `Color.lightBlue` | `"@lightBlue"` | 浅蓝 |
| `Color.blue` | `"@blue"` | 蓝 |
| `Color.indigo` | `"@indigo"` | 靛蓝 |
| `Color.purple` | `"@purple"` | 紫 |
| `Color.pink` | `"@pink"` | 粉 |
| `Color.brown` | `"@brown"` | 棕 |
| `Color.blueGray` | `"@blueGray"` | 蓝灰 |
| `Color.gray` | `"@gray"` | 灰 |
| `Color.foreground` | `"@foreground"` | 前景 |
| `Color.white` | `"#ffffff"` | 白 |
| `Color.black` | `"#000000"` | 黑 |

<a id="linestyle"></a>

### LineStyle

```ts
enum LineStyle
```

线型：实线、虚线与箭头；手绘和 line API 共用。

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `LineStyle.solid` | `"solid"` | 实线 |
| `LineStyle.dashed` | `"dashed"` | 虚线 |
| `LineStyle.dotted` | `"dotted"` | 点线 |
| `LineStyle.arrowLeft` | `"arrow_left"` | 左箭头 |
| `LineStyle.arrowRight` | `"arrow_right"` | 右箭头 |
| `LineStyle.arrowBoth` | `"arrow_both"` | 双箭头 |

<a id="extend"></a>

### extend

```ts
enum extend
```

延伸沿两锚点的参数方向，与屏幕左右方向无关。

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `extend.none` | `"none"` | 不延伸 |
| `extend.left` | `"left"` | 延伸至起点之外 |
| `extend.right` | `"right"` | 延伸至终点之外 |
| `extend.both` | `"both"` | 两端延伸 |

<a id="xloc"></a>

### xloc

```ts
enum xloc
```

决定 X 是第几根 K 线还是毫秒时间戳。

barIndex 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
允许范围是 0 到当前 barIndex，再向右最多 500 根；越界直接报错。
要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `xloc.barIndex` | `"bar_index"` | 第几根 K 线 |
| `xloc.barTime` | `"bar_time"` | 毫秒时间戳 |

<a id="datasource"></a>

### DataSource

```ts
enum DataSource
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `DataSource.binance` | `"binance"` | 币安 |
| `DataSource.gotdx` | `"gotdx"` | 通达信 |
| `DataSource.baoStock` | `"baostock"` | 证券宝 |
| `DataSource.tradingView` | `"tradingview"` | TradingView |
| `DataSource.mt5` | `"mt5"` | MetaTrader 5 |
| `DataSource.ths` | `"ths"` | 同花顺 |
| `DataSource.mock` | `"mock"` | 模拟数据 |

<a id="timeframe"></a>

### Timeframe

```ts
enum Timeframe
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `Timeframe.minute1` | `"1"` | 1 分钟 |
| `Timeframe.minute5` | `"5"` | 5 分钟 |
| `Timeframe.minute15` | `"15"` | 15 分钟 |
| `Timeframe.minute30` | `"30"` | 30 分钟 |
| `Timeframe.hour1` | `"60"` | 1 小时 |
| `Timeframe.hour4` | `"240"` | 4 小时 |
| `Timeframe.day` | `"D"` | 日线 |
| `Timeframe.week` | `"W"` | 周线 |
| `Timeframe.month1` | `"M"` | 月线 |
| `Timeframe.month3` | `"3M"` | 季线 |
| `Timeframe.month12` | `"12M"` | 年线 |

<a id="format"></a>

### Format

```ts
enum Format
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `Format.price` | `"price"` | 价格 |
| `Format.volume` | `"volume"` | 成交量 |
| `Format.percent` | `"percent"` | 百分比 |
| `Format.mintick` | `"mintick"` | 最小变动单位 |

<a id="hlinestyle"></a>

### HLineStyle

```ts
enum HLineStyle
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `HLineStyle.solid` | `"solid"` | 实线 |
| `HLineStyle.dashed` | `"dashed"` | 虚线 |
| `HLineStyle.dotted` | `"dotted"` | 点线 |

<a id="shapestyle"></a>

### ShapeStyle

```ts
enum ShapeStyle
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `ShapeStyle.xCross` | `"xcross"` | X 叉 |
| `ShapeStyle.cross` | `"cross"` | 十字 |
| `ShapeStyle.circle` | `"circle"` | 圆 |
| `ShapeStyle.square` | `"square"` | 方形 |
| `ShapeStyle.diamond` | `"diamond"` | 菱形 |
| `ShapeStyle.triangleUp` | `"triangleup"` | 上三角 |
| `ShapeStyle.triangleDown` | `"triangledown"` | 下三角 |
| `ShapeStyle.arrowUp` | `"arrowup"` | 上箭头 |
| `ShapeStyle.arrowDown` | `"arrowdown"` | 下箭头 |
| `ShapeStyle.labelUp` | `"labelup"` | 上标签 |
| `ShapeStyle.labelDown` | `"labeldown"` | 下标签 |
| `ShapeStyle.flag` | `"flag"` | 旗形 |

<a id="shapelocation"></a>

### ShapeLocation

```ts
enum ShapeLocation
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `ShapeLocation.aboveBar` | `"abovebar"` | 上方 |
| `ShapeLocation.belowBar` | `"belowbar"` | 下方 |
| `ShapeLocation.top` | `"top"` | 顶部 |
| `ShapeLocation.bottom` | `"bottom"` | 底部 |
| `ShapeLocation.absolute` | `"absolute"` | 按价格定位 |

<a id="shapesize"></a>

### ShapeSize

```ts
enum ShapeSize
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `ShapeSize.auto` | `"auto"` | 自动 |
| `ShapeSize.tiny` | `"tiny"` | 极小 |
| `ShapeSize.small` | `"small"` | 小 |
| `ShapeSize.normal` | `"normal"` | 常规 |
| `ShapeSize.large` | `"large"` | 大 |
| `ShapeSize.huge` | `"huge"` | 特大 |

<a id="position"></a>

### Position

```ts
enum Position
```

| 成员 | 值 | 说明 |
| --- | --- | --- |
| `Position.main` | `"main"` | 叠加到主图。 |
| `Position.sub` | `"sub"` | 独立副图。 |
