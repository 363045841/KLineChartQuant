# 指标脚本

指标脚本通过 `defineIndicator` 声明，注册到图表后即可在“添加指标 - 用户自定义脚本”中找到并启用。

## 示例脚本

以下脚本计算 (开盘价 + 收盘价) / n，并画成一条折线：

```ts
/**
 * 指标模板：Open/Close 平均值。
 *
 * 这是 Script 引擎最早的验证指标，逐 bar 计算 (open + close) / 2 并画到图上。
 */
import { defineIndicator } from '../defineIndicator.js'
import { input } from '../input.js'

/** Open/Close 平均值：输出 (open + close) / n。 */
export const openCloseAverage = defineIndicator({
  /** 指标名称。 */
  name: 'OC Average',

  /** 注册到主图。 */
  pane: 'main',

  /** 输入参数声明：n 为除数，缺省 2 即两价均值。 */
  inputs: { n: input(2, '除数') },

  /** 每根 K 线执行一次：读取当前 bar 的 open / close，求和后除以 n 用 Plot 系函数输出。 */
  onBar(ctx, params) {
    const average = (ctx.open + ctx.close) / params.n
    ctx.plot(average, { id: 'oc-average', color: '#26a69a' })
  },
})
```

本例没有声明 `plots`，输出的 `oc-average` 自动按默认折线绘制。
需要指定类型、标签或样式时才写 `plots` 声明。

宿主在启动时开启一次自动注册，并引入定义脚本的模块：

```ts
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
// 引入脚本定义模块，其 defineIndicator 会被自动注册
import '@363045841yyt/klinechart-script/indicators'

registerDefinedScripts()
```

开启后，每个 `defineIndicator` 都会自动进入指标目录，不需要逐个注册。
`OC Average` 随即出现在指标选择弹窗的**用户自定义脚本**分组中。
用户通过现有指标 API 添加实例，参数、显隐和删除行为与内置指标一致。

## 脚本声明

一个脚本由以下字段组成。

| 字段 | 作用 |
| --- | --- |
| `name` | 指标名称，用于目录展示和实例身份；同名重复注册保持首次结果 |
| `pane` | 注册位置，`main` 主图 / `sub` 副图；缺省为副图 |
| `displayName` | 显示名称；缺省取 `name` |
| `inputs` | 参数声明表，键为参数名，值由 `input(默认值, 标题)` 生成；用户修改后按覆盖值执行 |
| `onBar` | 每根 K 线执行一次的计算函数，读取当前 bar 与参数，输出 Plot |

`onBar` 收到两个参数：`ctx` 是当前 K 线，`params` 是本次运行的参数。
`ctx` 提供 `open`、`high`、`low`、`close`、`volume` 五个只读字段，以及输出绘图点的 `plot()`。

参数用 `input(默认值, 标题)` 声明，表的键就是脚本里读的名字：

| 写法 | 面板编辑项 |
| --- | --- |
| `n: input(2, '除数')` | 数字输入 |
| `show: input(true, '显示')` | 开关 |
| `label: input('MA', '名称')` | 文本输入 |

编辑类型由默认值决定；标题缺省显示参数名。

```ts
onBar(ctx, params) {
  // ctx.close 是当前收盘价，params.period 是用户设置的周期
}
```

脚本按 bar 下标顺序执行。某一根 K 线没有输出时，该位置留空，不会影响其他位置。
输出 `NaN` 同样表示留空。

## Plot

Plot 是脚本与图表之间的绘图数据通道。`onBar` 通过 `ctx.plot(value, { id })` 输出数据点，
引擎按 `id` 收集为按 K 线下标对齐的序列，再交给通用绘图、坐标轴和图例链路。

`id` 区分不同的 Plot，同一根 K 线上可以输出多个不同 id 的点。
使用可选 `plots` 声明 Plot 时，输出未声明的 id 会报错；不声明时按默认折线处理。

### Plot 类型

| `kind` | 形状 | 额外样式 |
| --- | --- | --- |
| `line` | 折线 | `width` 线宽、`dash` 虚线 |
| `histogram` | 柱状图，柱宽随 K 线间距变化 | `baseline` 基准值 |
| `points` | 圆形散点 | `radius` 半径 |

### Plot 通用声明

| 字段 | 作用 |
| --- | --- |
| `id` | Plot 标识，与 `ctx.plot()` 的 `id` 对应 |
| `label` | 图例名称，缺省取 `id` |
| `color` | CSS 颜色字符串 |
| `offset` | 沿 K 线下标的偏移，用于前移或后移的序列 |
| `visible` | 是否绘制，缺省为 `true` |

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

`ctx.plot()` 的 `color` 覆盖该点颜色，缺省使用 Plot 的 `color`。
柱状图常用它按数值正负或涨跌着色。

```ts
onBar(ctx) {
  ctx.plot(ctx.close - ctx.open, { id: 'change', color: ctx.close >= ctx.open ? '#26a69a' : '#ef5350' })
}
```