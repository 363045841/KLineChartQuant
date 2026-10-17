/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */
/**
 * 常用色：色相顺序取自 Material Design 400 色阶，中性色单独取值。
 *
 * 脚本里用 `Color.Red` 即可，取值与同名字面量完全一致。
 */
declare enum Color {
  Red = "#ef5350",
  DeepOrange = "#ff7043",
  Orange = "#ffa726",
  Amber = "#ffca28",
  Yellow = "#ffee58",
  Lime = "#d4e157",
  LightGreen = "#9ccc65",
  Green = "#66bb6a",
  Teal = "#26a69a",
  Cyan = "#26c6da",
  LightBlue = "#29b6f6",
  Blue = "#42a5f5",
  Indigo = "#5c6bc0",
  Purple = "#ab47bc",
  Pink = "#ec407a",
  Brown = "#8d6e63",
  BlueGray = "#78909c",
  Gray = "#808080",
  White = "#ffffff",
  Black = "#000000",
}

/** 内置数据源身份；指定后严格路由，不做跨来源回退。 */
declare enum DataSource {
  Binance = "binance",
  Gotdx = "gotdx",
  BaoStock = "baostock",
  TradingView = "tradingview",
  MT5 = "mt5",
  THS = "ths",
  Mock = "mock",
}

declare enum PlotKind {
  Line = "line",
  Histogram = "histogram",
  Columns = "columns",
  Points = "points",
  Shape = "shape",
  Char = "char",
  Arrow = "arrow",
  Candle = "candle",
  Bar = "bar",
}

declare enum ShapeStyle {
  XCross = "xcross",
  Cross = "cross",
  Circle = "circle",
  Square = "square",
  Diamond = "diamond",
  TriangleUp = "triangleup",
  TriangleDown = "triangledown",
  ArrowUp = "arrowup",
  ArrowDown = "arrowdown",
  LabelUp = "labelup",
  LabelDown = "labeldown",
  Flag = "flag",
}

declare enum ShapeLocation {
  AboveBar = "abovebar",
  BelowBar = "belowbar",
  Top = "top",
  Bottom = "bottom",
  Absolute = "absolute",
}

/**
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
  Auto = "auto",
  Tiny = "tiny",
  Small = "small",
  Normal = "normal",
  Large = "large",
  Huge = "huge",
}
