# 指标脚本

指标脚本是一份完整的 JavaScript 文件，通过 `defineIndicator` 声明。
注册到图表后即可在“添加指标 - 用户自定义脚本”中找到并启用。

## 示例脚本

以下脚本计算 (开盘价 + 收盘价) / n，并画成一条折线：

```js
defineIndicator({
  name: 'OC Average',
  position: Position.Sub,
  onBar() {
    const n = input.float(2, { title: '除数' })
    const a = input.float(0, { title: '偏移量' })
    const average = (open + close) / n + a
    plot.Line(average, 'oc-average', { color: '#26a69a' })
    plot.Line(high, 'oc-high')
    plot.Line(low, 'oc-low')
  },
})
```

本例没有声明 `plots`，输出的 `oc-average` 自动按默认折线绘制。
需要指定类型、标签或样式时才写 `plots` 声明。

宿主通过脚本服务加载这份文件，源码、修订号和派生定义一起提交：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import source from './open-close-average.js?raw'

const scripts = await createScriptService()
await scripts.create(source)
```

`OC Average` 随即出现在指标选择弹窗的**用户自定义脚本**分组中。
用户通过现有指标 API 添加实例，参数、显隐和删除行为与内置指标一致。

## 脚本声明

一个文件通过 `defineIndicator` 声明一个指标，由以下字段组成。

| 字段 | 作用 |
| --- | --- |
| `name` | 指标显示名称；用户脚本可通过修改名称并保存来重命名，同名脚本拒绝重复创建。稳定 ID 由框架自动分配并持久化，重命名保留实例和配置 |
| `position` | 指标渲染位置，必填：`Position.Main` 主图 / `Position.Sub` 副图 |
| `plots` / `fills` | 可选的 Plot 与填充声明 |
| `onBar` | 每根 K 线执行一次的计算函数，读取全局序列与参数，输出 Plot |

`onBar` 不需要参数：行情序列和库由宿主注入，输入参数通过局部变量读取。
`close[0]` 是当前 K 线，`close[1]` 是前一根；历史不足返回 `NaN`，永远不能访问未来。

在数值运算、比较、条件判断，以及要求数值的参数位置，可以省略 `[0]`。
例如 `high - low`、`close > close[1]`、`Math.max(open, close)` 和 `plot.Line(close, 'close')`。
`open`、`high`、`low`、`close`、`volume`、`time` 和 `ta` 返回的派生序列都遵循同一规则。

需要完整序列的位置仍然保留序列，例如 `ta.sma(close, 20)`。
未标注类型的 `const src = close` 是序列别名，可继续使用 `src[1]` 或 `ta.sma(src, 20)`；
需要保存当前数值时使用 `const current: number = close` 或显式的 `close[0]`。
编译器和编辑器共用这套规则，转换仅发生在源码变化时，逐 bar 计算不进行类型分析。

参数直接在 `onBar` 顶层用 `const` 声明，返回值就是用户设置的参数值，无需 `inputs` 或 `params`：

| 写法 | 面板编辑项 |
| --- | --- |
| `const period = input.int(20, { min: 1 })` | 整数输入，默认步长为 1 |
| `const n = input.float(2, { title: '除数', step: 0.1 })` | 小数输入 |
| `const show = input.bool(true, { title: '显示' })` | 开关 |
| `const label = input.string('MA', { title: '名称' })` | 文本输入 |
| `const type = input.string('SMA', { options: ['SMA', 'EMA'] })` | 下拉选择 |

数值输入支持 `min`、`max`、`step`；布尔输入只接受标题；字符串输入支持 `options`。默认值和选项使用常量字面量，变量名作为内部参数身份，标题缺省显示变量名。输入声明不能放在分支、循环或辅助函数中；注册时只提取配置，不执行 `onBar`。

脚本按 bar 下标顺序执行。某一根 K 线没有输出时，该位置留空，不会影响其他位置。
输出 `NaN` 同样表示留空。

## Plot

Plot 是脚本与图表之间的绘图数据通道。`onBar` 通过 `plot.Line(value, name)` 输出数据点，
引擎按 `name` 收集为按 K 线下标对齐的序列，再交给通用绘图、坐标轴和图例链路。

`name` 区分不同的 Plot，同一根 K 线上可以输出多个不同 name 的点。
使用 `plot.Line`、`plot.Point` 等方法选择图形：第一个参数是绘图值，第二个参数是必填的绘图名称，
第三个参数是可选的样式对象。
也可通过 `globalThis.plot` 访问。绘图类型由方法名决定，无需 `plots` 声明。
同一个 name 在一次运行中必须使用同一种类型。
使用可选 `plots` 声明样式时，输出未声明的 name 会报错；类型专用样式仅在声明与调用类型相同时生效。

### Plot 类型

| 方法 | 形状 | 额外样式 |
| --- | --- | --- |
| `plot.Line` | 折线 | `dash` 虚线 |
| `plot.Histogram` | 柱状图，柱宽随 K 线间距变化 | `baseline` 基准值 |
| `plot.Point` | 圆形散点 | — |
| `plot.Shape` | 形状标记 | `style`、`location`、`text`、`textColor` |
| `plot.Char` | 字符标记 | `char`、`location`、`text`、`textColor` |
| `plot.Arrow` | 数值箭头 | `colorUp`、`colorDown` |

所有方法接受 `number | null`，`null` 主动留空。`plot.Shape` 和 `plot.Char` 也接受布尔条件，`false` 留空。

### Plot 通用声明

| 字段 | 作用 |
| --- | --- |
| `name` | Plot 名称，与绘图方法的第二个参数对应 |
| `label` | 图例名称，缺省取 `name` |
| `color` | CSS 颜色字符串，或用内置 `Color` 常用色 |
| `offset` | 沿 K 线下标的偏移，用于前移或后移的序列 |
| `visible` | 是否绘制，缺省为 `true` |
| `size` | `ShapeSize` 尺寸档位，控制线宽、点径或标记大小 |

### 颜色

`color`、`textColor`、`colorUp` / `colorDown`、填充色都接受 CSS 颜色字符串。
需要常用色时用全局 `Color` 枚举，省去记十六进制：

色相取自 Material 400 色阶：`Color.Red`、`Color.DeepOrange`、`Color.Orange`、`Color.Amber`、
`Color.Yellow`、`Color.Lime`、`Color.LightGreen`、`Color.Green`、`Color.Teal`、`Color.Cyan`、
`Color.LightBlue`、`Color.Blue`、`Color.Indigo`、`Color.Purple`、`Color.Pink`、`Color.Brown`、
`Color.BlueGray`；中性色为 `Color.Gray`、`Color.White`、`Color.Black`。

枚举是固定色值，不随主题变化；其他颜色直接写字符串，例如 `color: '#808080'`。

### 填充

`fills` 引用两个已声明的 Plot，填充它们之间的区域，不复制序列数据。
两条曲线相交时，在交点切换正反颜色。

| 字段 | 作用 |
| --- | --- |
| `name` | 填充标识 |
| `from` | 起始 Plot 的 `name` |
| `to` | 结束 Plot 的 `name` |
| `color` | `from` 低于 `to` 时的填充色 |
| `reverseColor` | `from` 高于 `to` 时的填充色 |
| `opacity` | 不透明度 |
| `visible` | 是否绘制，缺省为 `true` |

### 逐点颜色

绘图方法的 `color` 覆盖该点颜色，缺省使用 Plot 的 `color`。
柱状图常用它按数值正负或涨跌着色。

```js
onBar() {
  plot.Histogram(close - open, 'change', {
    color: close >= open ? Color.Teal : Color.Red,
  })
}
```

## 库

脚本通过全局 `defineLibrary(name, members)` 声明库，`importLibrary(name)` 使用库。
内置 `ta` 库提供 `sma`、`ema`、`wma`、`vwma`、`rsi`、`highest`、`lowest`、`crossover`、`crossunder`，
使用同一协议加载，用户库也可以这样加入。

```js
onBar() {
  const period = input.int(20, { title: '周期', min: 1 })
  const ma = ta.sma(close, period)
  plot.Line(ma, 'sma')
}
```
