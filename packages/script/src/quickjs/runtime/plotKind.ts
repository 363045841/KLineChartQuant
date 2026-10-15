/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */
declare enum PlotKind {
  Line = "line",
  Histogram = "histogram",
  Points = "points",
  Shape = "shape",
  Char = "char",
  Arrow = "arrow",
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
 * | 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | 柱宽 / K 线间距 |
 * | --- | --- | --- | --- | --- | --- |
 * | ShapeSize.Auto | 1 | 3 | 12 | 50 | 1 |
 * | ShapeSize.Tiny | 1 | 6 | 6 | 20 | 0.4 |
 * | ShapeSize.Small | 1 | 10 | 10 | 30 | 0.6 |
 * | ShapeSize.Normal | 2 | 14 | 14 | 40 | 0.8 |
 * | ShapeSize.Large | 3 | 20 | 20 | 60 | 1.2 |
 * | ShapeSize.Huge | 4 | 28 | 28 | 90 | 1.6 |
 *
 * px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
 */
declare enum ShapeSize {
  Auto = "auto",
  Tiny = "tiny",
  Small = "small",
  Normal = "normal",
  Large = "large",
  Huge = "huge",
}

/** 内置业务分类取值；VM 枚举与跨边界校验共用，宿主不重复书写字符串。 */
declare enum IndicatorType {
  MovingAverage = "moving-average",
  Trend = "trend",
  Momentum = "momentum",
  Volatility = "volatility",
  Channel = "channel",
  Volume = "volume",
  SupportResistance = "support-resistance",
  Structure = "structure",
  Other = "other",
}
