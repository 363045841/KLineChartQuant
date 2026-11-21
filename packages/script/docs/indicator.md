# 指标脚本

指标脚本是一份完整的 JavaScript 文件，通过 `defineIndicator` 声明；注册后出现在
“添加指标 - 用户自定义脚本”中，参数、显隐和删除行为与内置指标一致。

本文只讲写法与规则。签名、选项和枚举取值见
[API 参考](../../../docs/script/api/index.md)：[运行环境](../../../docs/script/api/runtime.md)、[绘图](../../../docs/script/api/plot.md)、
[绘图对象](../../../docs/script/api/drawing.md)、[技术分析](../../../docs/script/api/ta.md)、[枚举](../../../docs/script/api/enums.md)。

## 最小脚本

```js
defineIndicator({
  version: 2,
  name: 'OC Average',
  position: Position.sub,
  onBar() {
    plot.Line((open + close) / 2, 'oc-average', { color: Color.teal })
  },
})
```

三个必填项：`version`、`name`、`position`（`Position.main` 主图 / `Position.sub` 副图）。
`onBar` 每根 K 线调用一次，序列与库由宿主注入，不需要参数。

## 写法版本

`version` 当前为 `2`。没有声明该字段的旧脚本按 v1 处理，注册时直接报错
`脚本版本 v1 已不再支持`，不做兼容转换；补上字段并按当前命名改写即可。

## 声明字段

| 字段 | 作用 |
| --- | --- |
| `version` | 写法版本，必填，当前为 `2` |
| `name` | 短名；同名脚本拒绝重复创建，稳定 ID 由框架分配并持久化 |
| `title` | 选择器里显示的长名称，缺省用 `name` |
| `info` | 选择器里的说明文本，缺省不展示 |
| `position` | 渲染位置，必填 |
| `format` | 指标级数值格式，驱动副图轴与图例显示 |
| `maxLinesCount` / `maxBoxesCount` / `maxLabelsCount` | 可保留的绘图对象数量上限 |
| `onBar` | 逐根 K 线执行的计算函数 |

## 序列与当前值

`open`、`high`、`low`、`close`、`volume`、`time` 是只读序列，`ta` 与 `derive` 的返回值同样是序列。

- `close[0]` 当前根、`close[1]` 上一根；历史不足返回 `NaN`，不能访问未来。
- 在数值运算、比较、条件判断和数值参数位置可以省略 `[0]`：`high - low`、`close > close[1]`、
  `Math.max(open, close)`、`plot.Line(close, 'close')` 都按当前值计算。
- 需要整段序列的位置要保留序列：`ta.sma(close, 20)`。
- `const src = close` 仍是序列别名，可继续 `src[1]` 或 `ta.sma(src, 20)`；
  需要固定成当前数值时写 `const current: number = close` 或显式 `close[0]`。

## 输入参数

参数在 `onBar` 顶层用 `const` 声明，变量名就是参数身份，返回值是用户设置的值：

| 写法 | 面板编辑项 |
| --- | --- |
| `const period = input.int(20, { min: 1 })` | 整数输入，默认步长 1 |
| `const n = input.float(2, { title: '除数', step: 0.1 })` | 小数输入 |
| `const show = input.bool(true, { title: '显示' })` | 开关 |
| `const name = input.string('MA', { title: '名称' })` | 文本输入 |
| `const type = input.string('SMA', { options: ['SMA', 'EMA'] })` | 下拉选择 |
| `const tf = input.timeframe(Timeframe.hour1)` | 周期选择 |
| `const hours = input.session('0930-1600')` | 时段字符串 |

规则：

- 只能直接初始化 `onBar` 顶层的 `const`，不能放进分支、循环或辅助函数。
- 默认值与选项必须是常量字面量（数字、字符串、布尔、数组、对象、枚举成员）。
- 注册时只提取配置，不执行 `onBar`。

## 跨 bar 状态

一次运行只在开始时执行一遍顶层代码，`onBar` 随后逐根调用。所以**文件顶层声明的变量跨 K 线保留**，
`onBar` 内部的变量每根重置：

```js
let obv = 0 // 顶层：整轮运行只初始化一次

defineIndicator({
  version: 2,
  name: 'OBV',
  position: Position.sub,
  onBar() {
    const previous = close[1]
    if (!Number.isNaN(previous)) {
      if (close > previous) obv += volume
      else if (close < previous) obv -= volume
    }
    plot.Line(obv, 'obv')
  },
})
```

每次重算都从第一根按序重建状态，不依赖上一次运行。能用 `ta` 与 `derive` 表达的计算优先交给它们。

## 绘图

`plot.*` 每次调用输出当前 K 线的一个点。第二个参数 `id` 是数据通道身份：
同一根 K 线可以输出多个 `id`，每个 `id` 收集成一列，交给引擎对齐、缩放和绘制。

| 方法 | 形状 |
| --- | --- |
| `plot.Line` / `plot.LineBR` | 折线；`BR` 在空值处断开 |
| `plot.StepLine` / `plot.StepLineBR` | 阶梯线；`BR` 在空值处断开 |
| `plot.Histogram` | 固定像素柱宽，`size` 可为像素或 `ShapeSize` |
| `plot.Columns` | 柱宽随 K 线间距缩放，不支持 `size` |
| `plot.Point` | 散点 |
| `plot.Shape` / `plot.Char` | 形状 / 字符标记，也接受布尔条件 |
| `plot.Arrow` | 数值箭头，正负决定方向 |
| `plot.Candle` / `plot.Bar` | 蜡烛 / 美国线，接收四个价格 |

- 值可以是 `number | null`，也可以直接传序列（取当前值）；`null` 主动留空，`NaN` 同样留空。
- 同一个 `id` 在一次运行内必须使用同一种图形，整列样式也要一致；逐点变化的只有颜色与 `textColor`。
- `plot.Candle` / `plot.Bar` 返回句柄，可以参与 `fill`；任一价格缺失时整根留空。

### 颜色

`color`、`textColor`、`colorUp` / `colorDown`、填充色都接受 CSS 颜色字符串，
常用色用全局 `Color` 枚举（取值表见[枚举](../../../docs/script/api/enums.md)）。

前 19 个是主题色别名：脚本只声明色相，具体色值由图表按 light / dark 主题取，换主题后同一份输出自动适配。
`Color.white` / `Color.black` 是绝对色，用于文字或彩色底块上的叠加。
需要透明度时在别名后拼两位十六进制 alpha，例如 `Color.teal + '80'`。

### 填充

`fill(from, to, color, title?, options?)` 在两个已输出的 Plot 之间填充，不复制序列数据。
`color` 每根 bar 求值，`null` 表示该 bar 不填充：

```js
defineIndicator({
  version: 2,
  name: 'Cloud',
  position: Position.main,
  onBar() {
    const fastValue = ta.sma(close, 5)
    const slowValue = ta.sma(close, 20)
    const fast = plot.Line(fastValue, 'fast')
    const slow = plot.Line(slowValue, 'slow')
    plot.Line(fastValue, 'fast-line', { visible: false })
    fill(fast, slow, fastValue > slowValue ? Color.teal : Color.red, 'cloud')
  },
})
```

- 边界句柄来自 `plot.*` 或 `hline`；`fill` 只能在 `onBar` 内，水平线填充只能在文件顶层。
- 同一对边界可以用不同 `title` 声明多层填充；相邻两点之间使用右端 bar 的颜色。
- 图表级参考线用 `hline(price, { color, linestyle, linewidth })`，只能在文件顶层声明。

### 逐点颜色

`color` 可以逐 bar 变化，柱状图常用来按正负着色：

```js
defineIndicator({
  version: 2,
  name: 'Body Change',
  position: Position.sub,
  onBar() {
    plot.Histogram(close - open, 'change', {
      color: close >= open ? Color.teal : Color.red,
    })
  },
})
```

## 标记与绘图对象

跨 bar 保留的图形用 `line`、`box`、`label`，坐标由 `chart.point` 或 K 线索引给出：

```js
defineIndicator({
  version: 2,
  name: 'Swing Mark',
  position: Position.main,
  onBar() {
    const highRef = ta.highest(high, 10)
    if (high === highRef[0]) {
      plot.Shape(true, 'swing-high', { location: ShapeLocation.aboveBar, text: 'HH' })
      label.new({ x: barIndex, y: high[0], text: 'swing', color: Color.teal })
    }
  },
})
```

- 对象只能在 `onBar` 内创建与修改；引用只在本次运行内有效。
- 坐标用 `xloc.barIndex`（默认）或 `xloc.barTime`，不读取视口像素。
- 超过 `maxLinesCount` / `maxBoxesCount` / `maxLabelsCount` 时最旧的对象被回收。

## 跨品种与跨周期

`request.security(id, 周期, 回调, options?)` 在目标行情上独立计算，再把结果对齐到主图 K 线：

```ts
defineIndicator({
  version: 2,
  name: '高周期蜡烛',
  position: Position.main,
  onBar() {
    const target = input.timeframe(Timeframe.day, {
      title: '目标周期',
      options: [Timeframe.hour1, Timeframe.hour4, Timeframe.day, Timeframe.week],
    })
    const [o, h, l, c] = request.security(syminfo.tickerId, target, () => [
      open,
      high,
      low,
      close,
    ] as const)
    const color = c >= o ? Color.green : Color.red
    plot.Candle(o, h, l, c, 'higher-timeframe', { color, wickColor: color, borderColor: color })
  },
})
```

- 请求必须在 `onBar` 顶层声明；回调内的行情、索引和 `ta` 都属于目标周期。
- 请求其他品种时必须显式给 `source`（如 `DataSource.binance`），否则直接报错，不会跨数据源回退。
- `calcBarsCount` 是主图历史之前额外加载的预热根数；`gaps: 'off'` 延续最近结果，`'on'` 只在新结果出现时输出。
- 嵌套请求与逐 bar 改变品种都不支持。

## 库与派生序列

内置 `ta` 库提供常用计算原语，`importLibrary(name)` 读取自定义库，`defineLibrary` 声明库：

```js
const stats = defineLibrary('stats', {
  /** @summary 均价 */
  mean(left, right) {
    return (left + right) / 2
  },
})

defineIndicator({
  version: 2,
  name: 'Derived',
  position: Position.sub,
  onBar() {
    // derive 造一个惰性序列：读取时按 bar 计算并缓存，可以读自己上一根。
    const smoothed = derive('smoothed', (self, offset) => {
      const previous = self[offset + 1]
      if (Number.isNaN(previous)) return close[offset]
      return previous + (close[offset] - previous) * 0.2
    })
    plot.Line(stats.mean(smoothed[0], close[0]), 'blend')
  },
})
```

## 常见错误

| 写法 | 结果 |
| --- | --- |
| 缺少 `version` 或写成 `1` | 注册期报错：脚本版本 v1 已不再支持 |
| `input.*` 写在分支、循环或辅助函数里 | 编译期报错：必须直接初始化 onBar 顶层的 const |
| `plot(Position.main, ...)` 这类旧式调用 | 运行期报错：不是函数 |
| 在文件顶层调用 `plot.*` | 报错：只能在 onBar 中调用 |
| 在 `onBar` 内声明 `hline` | 报错：只能在文件顶层声明 |
| 同一个 `id` 先 `plot.Line` 再 `plot.Point` | 报错：同一列不能改变图形类型 |
| 逐 bar 改变 `id` 的 `style` / `location` | 报错：整列样式必须一致 |
| 数值参数传 `undefined` 或非有限值 | 该点留空或被拒绝，取决于位置 |

## 参考资料

- [运行环境](../../../docs/script/api/runtime.md)：序列、时间与时段、输入、跨周期取数、声明入口
- [绘图](../../../docs/script/api/plot.md)：每个绘图方法的签名与选项表
- [绘图对象](../../../docs/script/api/drawing.md)：`line` / `box` / `label` / `chart.point`
- [技术分析](../../../docs/script/api/ta.md)：`ta` 全部函数的参数、返回值与 NaN 边界
- [枚举](../../../docs/script/api/enums.md)：颜色、线型、尺寸、周期与数据源取值
