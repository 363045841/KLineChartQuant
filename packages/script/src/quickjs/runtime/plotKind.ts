/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */
// biome-ignore-all format: 枚举声明由生成器统一序列化
/**
 * @summary 常用色
 *
 * 常用色：主题色别名 + 白 / 黑两个绝对色。
 *
 * 脚本里用 `Color.red` 即可；别名与 Theme.colors.scriptPalette 的键一一对应。
 */
declare enum Color {
  /** @summary 红 */
  red = "@red",
  /** @summary 深橙 */
  deepOrange = "@deepOrange",
  /** @summary 橙 */
  orange = "@orange",
  /** @summary 琥珀 */
  amber = "@amber",
  /** @summary 黄 */
  yellow = "@yellow",
  /** @summary 青柠 */
  lime = "@lime",
  /** @summary 浅绿 */
  lightGreen = "@lightGreen",
  /** @summary 绿 */
  green = "@green",
  /** @summary 蓝绿 */
  teal = "@teal",
  /** @summary 青 */
  cyan = "@cyan",
  /** @summary 浅蓝 */
  lightBlue = "@lightBlue",
  /** @summary 蓝 */
  blue = "@blue",
  /** @summary 靛蓝 */
  indigo = "@indigo",
  /** @summary 紫 */
  purple = "@purple",
  /** @summary 粉 */
  pink = "@pink",
  /** @summary 棕 */
  brown = "@brown",
  /** @summary 蓝灰 */
  blueGray = "@blueGray",
  /** @summary 灰 */
  gray = "@gray",
  /** @summary 前景 */
  foreground = "@foreground",
  /** @summary 白 */
  white = "#ffffff",
  /** @summary 黑 */
  black = "#000000",
}

/** 线型：实线、虚线与箭头；手绘和 line API 共用。 */
declare enum LineStyle {
  /** @summary 实线 */
  solid = "solid",
  /** @summary 虚线 */
  dashed = "dashed",
  /** @summary 点线 */
  dotted = "dotted",
  /** @summary 左箭头 */
  arrowLeft = "arrow_left",
  /** @summary 右箭头 */
  arrowRight = "arrow_right",
  /** @summary 双箭头 */
  arrowBoth = "arrow_both",
}

/** 延伸沿两锚点的参数方向，与屏幕左右方向无关。 */
declare enum extend {
  /** @summary 不延伸 */
  none = "none",
  /** @summary 延伸至起点之外 */
  left = "left",
  /** @summary 延伸至终点之外 */
  right = "right",
  /** @summary 两端延伸 */
  both = "both",
}

/**
 * 决定 X 是第几根 K 线还是毫秒时间戳。
 *
 * barIndex 从当前已加载数据的第一根算起；左侧加载更多历史后，同一根 K 线的序号会变大。
 * 允许范围是 0 到当前 barIndex，再向右最多 500 根；越界直接报错。
 * 要让线段跨历史保持在固定的 K 线上，用 bar_time 传 time[offset]。
 */
declare enum xloc {
  /** @summary 第几根 K 线 */
  barIndex = "bar_index",
  /** @summary 毫秒时间戳 */
  barTime = "bar_time",
}

/**
 * @summary 数据源
 *
 * 内置数据源身份；指定后严格路由，不做跨来源回退。
 */
declare enum DataSource {
  /** @summary 币安 */
  binance = "binance",
  /** @summary 通达信 */
  gotdx = "gotdx",
  /** @summary 证券宝 */
  baoStock = "baostock",
  /** @summary TradingView */
  tradingView = "tradingview",
  /** @summary MetaTrader 5 */
  mt5 = "mt5",
  /** @summary 同花顺 */
  ths = "ths",
  /** @summary 模拟数据 */
  mock = "mock",
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
  minute1 = "1",
  /** @summary 5 分钟 */
  minute5 = "5",
  /** @summary 15 分钟 */
  minute15 = "15",
  /** @summary 30 分钟 */
  minute30 = "30",
  /** @summary 1 小时 */
  hour1 = "60",
  /** @summary 4 小时 */
  hour4 = "240",
  /** @summary 日线 */
  day = "D",
  /** @summary 周线 */
  week = "W",
  /** @summary 月线 */
  month1 = "M",
  /** @summary 季线 */
  month3 = "3M",
  /** @summary 年线 */
  month12 = "12M",
}

/**
 * @summary 数值格式
 *
 * 数值格式化档位；脚本里用 `Format.volume` 即可，不填时按 `Format.price` 处理。
 *
 * | 成员 | 示例 |
 * | --- | --- |
 * | `Format.price` | `1234.567` |
 * | `Format.volume` | `1.25K`、`12.30M`、`3.40B` |
 * | `Format.percent` | `3.45%`、`-12.30%` |
 * | `Format.mintick` | `1234.5678901` |
 */
declare enum Format {
  /** @summary 价格 */
  price = "price",
  /** @summary 成交量 */
  volume = "volume",
  /** @summary 百分比 */
  percent = "percent",
  /** @summary 最小变动单位 */
  mintick = "mintick",
}

/**
 * @summary 水平线线型
 *
 * `hline` 的线型档位；与手绘 line 的 `LineStyle` 同义，只保留线型子集。
 */
declare enum HLineStyle {
  /** @summary 实线 */
  solid = "solid",
  /** @summary 虚线 */
  dashed = "dashed",
  /** @summary 点线 */
  dotted = "dotted",
}

/**
 * @summary 标记形状
 *
 * 固定形状标记可选的外形；缺省使用 XCross。
 */
declare enum ShapeStyle {
  /** @summary X 叉 */
  xCross = "xcross",
  /** @summary 十字 */
  cross = "cross",
  /** @summary 圆 */
  circle = "circle",
  /** @summary 方形 */
  square = "square",
  /** @summary 菱形 */
  diamond = "diamond",
  /** @summary 上三角 */
  triangleUp = "triangleup",
  /** @summary 下三角 */
  triangleDown = "triangledown",
  /** @summary 上箭头 */
  arrowUp = "arrowup",
  /** @summary 下箭头 */
  arrowDown = "arrowdown",
  /** @summary 上标签 */
  labelUp = "labelup",
  /** @summary 下标签 */
  labelDown = "labeldown",
  /** @summary 旗形 */
  flag = "flag",
}

/**
 * @summary 标记位置
 *
 * 标记相对 K 线的位置；缺省在 K 线上方，Absolute 表示按价格定位。
 */
declare enum ShapeLocation {
  /** @summary 上方 */
  aboveBar = "abovebar",
  /** @summary 下方 */
  belowBar = "belowbar",
  /** @summary 顶部 */
  top = "top",
  /** @summary 底部 */
  bottom = "bottom",
  /** @summary 按价格定位 */
  absolute = "absolute",
}

/**
 * @summary 尺寸档位
 *
 * 图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。
 *
 * | 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | Histogram 柱宽（px） |
 * | --- | --- | --- | --- | --- | --- |
 * | ShapeSize.auto | 1 | 3 | 12 | 50 | 1 |
 * | ShapeSize.tiny | 1 | 6 | 6 | 20 | 1 |
 * | ShapeSize.small | 1 | 10 | 10 | 30 | 1 |
 * | ShapeSize.normal | 2 | 14 | 14 | 40 | 2 |
 * | ShapeSize.large | 3 | 20 | 20 | 60 | 3 |
 * | ShapeSize.huge | 4 | 28 | 28 | 90 | 4 |
 *
 * px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
 * Columns 不接受 size，柱宽随 K 线间距自动调整。
 */
declare enum ShapeSize {
  /** @summary 自动 */
  auto = "auto",
  /** @summary 极小 */
  tiny = "tiny",
  /** @summary 小 */
  small = "small",
  /** @summary 常规 */
  normal = "normal",
  /** @summary 大 */
  large = "large",
  /** @summary 特大 */
  huge = "huge",
}
