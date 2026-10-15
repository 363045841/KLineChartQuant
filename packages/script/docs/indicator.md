# 指标脚本

指标脚本是一份完整的 JavaScript 文件，通过 `defineIndicator` 声明。
注册到图表后即可在“添加指标 - 用户自定义脚本”中找到并启用。

## 示例脚本

以下脚本计算 (开盘价 + 收盘价) / n，并画成一条折线：

```js
defineIndicator({
  name: 'OC Average',
  pane: PaneKind.Sub,
  inputs: {
    n: input(2, { title: '除数' }),
    a: input(0, { title: '偏移量' }),
  },
  onBar() {
    const average = (open[0] + close[0]) / params.n + params.a
    plot.Line(average, { id: 'oc-average', color: '#26a69a' })
    plot.Line(high[0], { id: 'oc-high' })
    plot.Line(low[0], { id: 'oc-low' })
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
| `pane` | 注册位置，`PaneKind.Main` 主图 / `PaneKind.Sub` 副图；缺省为副图 |
| `inputs` | 参数声明表，值由 `input(默认值, 选项)` 生成；用户修改后按覆盖值执行 |
| `plots` / `fills` | 可选的 Plot 与填充声明 |
| `onBar` | 每根 K 线执行一次的计算函数，读取全局序列与参数，输出 Plot |

`onBar` 不需要参数：行情序列、库和参数都是注入的全局。
`close[0]` 是当前 K 线，`close[1]` 是前一根；历史不足返回 `NaN`，永远不能访问未来。

参数用 `input(默认值, 选项)` 声明，表的键就是脚本里通过 `params` 读的名字：

| 写法 | 面板编辑项 |
| --- | --- |
| `n: input(2, { title: '除数' })` | 数字输入 |
| `show: input(true, { title: '显示' })` | 开关 |
| `label: input('MA', { title: '名称' })` | 文本输入 |
| `type: input('SMA', { title: '算法', options: ['SMA', 'EMA'] })` | 下拉选择 |

编辑类型由默认值决定，标题缺省显示参数名；字符串参数声明 `options` 后渲染为下拉选择，取值必须在选项内。

脚本按 bar 下标顺序执行。某一根 K 线没有输出时，该位置留空，不会影响其他位置。
输出 `NaN` 同样表示留空。

## Plot

Plot 是脚本与图表之间的绘图数据通道。`onBar` 通过 `plot.Line(value, { id })` 输出数据点，
引擎按 `id` 收集为按 K 线下标对齐的序列，再交给通用绘图、坐标轴和图例链路。

`id` 区分不同的 Plot，同一根 K 线上可以输出多个不同 id 的点。
使用 `plot.Line`、`plot.Point` 等方法选择图形，第一个参数是绘图值，第二个参数是包含 `id` 的样式选项。
也可通过 `globalThis.plot` 访问。绘图类型由方法名决定，无需 `plots` 声明。
同一个 id 在一次运行中必须使用同一种类型。
使用可选 `plots` 声明样式时，输出未声明的 id 会报错；类型专用样式仅在声明与调用类型相同时生效。

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
| `id` | Plot 标识，与绘图方法的 `id` 对应 |
| `label` | 图例名称，缺省取 `id` |
| `color` | CSS 颜色字符串 |
| `offset` | 沿 K 线下标的偏移，用于前移或后移的序列 |
| `visible` | 是否绘制，缺省为 `true` |
| `size` | `ShapeSize` 尺寸档位，控制线宽、点径或标记大小 |

### 填充

`fills` 引用两个已声明的 Plot，填充它们之间的区域，不复制序列数据。
两条曲线相交时，在交点切换正反颜色。

| 字段 | 作用 |
| --- | --- |
| `id` | 填充标识 |
| `from` | 起始 Plot 的 `id` |
| `to` | 结束 Plot 的 `id` |
| `color` | `from` 低于 `to` 时的填充色 |
| `reverseColor` | `from` 高于 `to` 时的填充色 |
| `opacity` | 不透明度 |
| `visible` | 是否绘制，缺省为 `true` |

### 逐点颜色

绘图方法的 `color` 覆盖该点颜色，缺省使用 Plot 的 `color`。
柱状图常用它按数值正负或涨跌着色。

```js
onBar() {
  plot.Histogram(close[0] - open[0], {
    id: 'change',
    color: close[0] >= open[0] ? '#26a69a' : '#ef5350',
  })
}
```

## 库

脚本通过全局 `defineLibrary(name, members)` 声明库，`importLibrary(name)` 使用库。
内置 `ta` 库提供 `sma`、`ema`、`wma`、`vwma`、`rsi`、`highest`、`lowest`、`crossover`、`crossunder`，
使用同一协议加载，用户库也可以这样加入。

```js
onBar() {
  const ma = ta.sma(close, params.period)
  plot.Line(ma[0], { id: 'sma' })
}
```
