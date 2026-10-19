/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */
// biome-ignore-all format: 枚举声明由生成器统一序列化
/**
 * @summary 常用色
 *
 * 常用色：色相顺序取自 Material Design 400 色阶，中性色单独取值。
 *
 * 脚本里用 `Color.Red` 即可，取值与同名字面量完全一致。
 */
declare enum Color {
  /** @summary 红 */
  Red = "#ef5350",
  /** @summary 深橙 */
  DeepOrange = "#ff7043",
  /** @summary 橙 */
  Orange = "#ffa726",
  /** @summary 琥珀 */
  Amber = "#ffca28",
  /** @summary 黄 */
  Yellow = "#ffee58",
  /** @summary 青柠 */
  Lime = "#d4e157",
  /** @summary 浅绿 */
  LightGreen = "#9ccc65",
  /** @summary 绿 */
  Green = "#66bb6a",
  /** @summary 蓝绿 */
  Teal = "#26a69a",
  /** @summary 青 */
  Cyan = "#26c6da",
  /** @summary 浅蓝 */
  LightBlue = "#29b6f6",
  /** @summary 蓝 */
  Blue = "#42a5f5",
  /** @summary 靛蓝 */
  Indigo = "#5c6bc0",
  /** @summary 紫 */
  Purple = "#ab47bc",
  /** @summary 粉 */
  Pink = "#ec407a",
  /** @summary 棕 */
  Brown = "#8d6e63",
  /** @summary 蓝灰 */
  BlueGray = "#78909c",
  /** @summary 灰 */
  Gray = "#808080",
  /** @summary 白 */
  White = "#ffffff",
  /** @summary 黑 */
  Black = "#000000",
}

/**
 * @summary 数据源
 *
 * 内置数据源身份；指定后严格路由，不做跨来源回退。
 */
declare enum DataSource {
  /** @summary 币安 */
  Binance = "binance",
  /** @summary 通达信 */
  Gotdx = "gotdx",
  /** @summary 证券宝 */
  BaoStock = "baostock",
  /** @summary TradingView */
  TradingView = "tradingview",
  /** @summary MetaTrader 5 */
  MT5 = "mt5",
  /** @summary 同花顺 */
  THS = "ths",
  /** @summary 模拟数据 */
  Mock = "mock",
}

/**
 * @summary 目标周期
 *
 * 脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。
 *
 * 取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
 * 再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。
 */
declare enum Timeframe {
  /** @summary 1 分钟 */
  Minute1 = "1",
  /** @summary 5 分钟 */
  Minute5 = "5",
  /** @summary 15 分钟 */
  Minute15 = "15",
  /** @summary 30 分钟 */
  Minute30 = "30",
  /** @summary 1 小时 */
  Hour1 = "60",
  /** @summary 4 小时 */
  Hour4 = "240",
  /** @summary 日线 */
  Day = "D",
  /** @summary 周线 */
  Week = "W",
  /** @summary 月线 */
  Month1 = "M",
  /** @summary 季线 */
  Month3 = "3M",
  /** @summary 年线 */
  Month12 = "12M",
}

/**
 * @summary 绘图类型
 *
 * 脚本 `plot.*` 的图形种类；取值与 Plot 声明的 `kind` 完全一致。
 */
declare enum PlotKind {
  /** @summary 折线 */
  Line = "line",
  /** @summary 断线折线 */
  LineBR = "linebr",
  /** @summary 阶梯线 */
  StepLine = "stepline",
  /** @summary 断线阶梯线 */
  StepLineBR = "steplinebr",
  /** @summary 柱状图 */
  Histogram = "histogram",
  /** @summary 柱形图 */
  Columns = "columns",
  /** @summary 散点 */
  Points = "points",
  /** @summary 形状标记 */
  Shape = "shape",
  /** @summary 字符标记 */
  Char = "char",
  /** @summary 箭头 */
  Arrow = "arrow",
  /** @summary 蜡烛图 */
  Candle = "candle",
  /** @summary 美国线 */
  Bar = "bar",
}

/**
 * @summary 数值格式
 *
 * 数值格式化档位；脚本里用 `Format.Volume` 即可，不填时按 `Format.Price` 处理。
 *
 * | 成员 | 示例 |
 * | --- | --- |
 * | `Format.Price` | `1234.567` |
 * | `Format.Volume` | `1.25K`、`12.30M`、`3.40B` |
 * | `Format.Percent` | `3.45%`、`-12.30%` |
 * | `Format.Mintick` | `1234.5678901` |
 */
declare enum Format {
  /** @summary 价格 */
  Price = "price",
  /** @summary 成交量 */
  Volume = "volume",
  /** @summary 百分比 */
  Percent = "percent",
  /** @summary 最小变动单位 */
  Mintick = "mintick",
}

/**
 * @summary 标记形状
 *
 * 固定形状标记可选的外形；缺省使用 XCross。
 */
declare enum ShapeStyle {
  /** @summary X 叉 */
  XCross = "xcross",
  /** @summary 十字 */
  Cross = "cross",
  /** @summary 圆 */
  Circle = "circle",
  /** @summary 方形 */
  Square = "square",
  /** @summary 菱形 */
  Diamond = "diamond",
  /** @summary 上三角 */
  TriangleUp = "triangleup",
  /** @summary 下三角 */
  TriangleDown = "triangledown",
  /** @summary 上箭头 */
  ArrowUp = "arrowup",
  /** @summary 下箭头 */
  ArrowDown = "arrowdown",
  /** @summary 上标签 */
  LabelUp = "labelup",
  /** @summary 下标签 */
  LabelDown = "labeldown",
  /** @summary 旗形 */
  Flag = "flag",
}

/**
 * @summary 标记位置
 *
 * 标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。
 */
declare enum ShapeLocation {
  /** @summary 上方 */
  AboveBar = "abovebar",
  /** @summary 下方 */
  BelowBar = "belowbar",
  /** @summary 顶部 */
  Top = "top",
  /** @summary 底部 */
  Bottom = "bottom",
  /** @summary 按价格定位 */
  Absolute = "absolute",
}

/**
 * @summary 尺寸档位
 *
 * 图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。
 *
 * | 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
 * | --- | --- | --- | --- | --- | --- |
 * | ShapeSize.Auto | 1 | 3 | 12 | 50 | 1 |
 * | ShapeSize.Tiny | 1 | 6 | 6 | 20 | 1 |
 * | ShapeSize.Small | 1 | 10 | 10 | 30 | 1 |
 * | ShapeSize.Normal | 2 | 14 | 14 | 40 | 2 |
 * | ShapeSize.Large | 3 | 20 | 20 | 60 | 3 |
 * | ShapeSize.Huge | 4 | 28 | 28 | 90 | 4 |
 *
 * px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
 * Columns 不接受 size，柱宽随 K 线间距自动调整。
 */
declare enum ShapeSize {
  /** @summary 自动 */
  Auto = "auto",
  /** @summary 极小 */
  Tiny = "tiny",
  /** @summary 小 */
  Small = "small",
  /** @summary 常规 */
  Normal = "normal",
  /** @summary 大 */
  Large = "large",
  /** @summary 特大 */
  Huge = "huge",
}
