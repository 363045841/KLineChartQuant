<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API · 绘图

> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验同步。写法与规则见[指标脚本](../../../packages/script/docs/indicator.md)。

## 绘图方法

**plot** 当前 K 线的绘图方法；仅在 onBar 中调用，name 必填，null 主动留空。

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

<a id="plot-line"></a>

### plot.Line

```ts
plot.Line(value: number | null, name: string, options?: PlotStyleOptions<"line">): PlotRef
```

输出普通折线点，跨空值连接前后有效点，对应 Pine plot.style_line。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `dash?` | `readonly number[]` | 虚线的线段与间隔长度，单位为逻辑像素；不填或填空数组则画实线。 |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `ShapeSize` | 图形尺寸档位；不填则使用 ShapeSize.auto。 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。 具体尺寸见 ShapeSize 的档位对照表。 |

<a id="plot-linebr"></a>

### plot.LineBR

```ts
plot.LineBR(value: number | null, name: string, options?: PlotStyleOptions<"linebr">): PlotRef
```

输出断线折线点，空值处断开，对应 Pine plot.style_linebr。

选项与 [plot.Line](#plot-line) 相同。

<a id="plot-stepline"></a>

### plot.StepLine

```ts
plot.StepLine(value: number | null, name: string, options?: PlotStyleOptions<"stepline">): PlotRef
```

输出阶梯线点，在相邻有效点的水平中点跳变，跨空值连接，对应 Pine plot.style_stepline。

选项与 [plot.Line](#plot-line) 相同。

<a id="plot-steplinebr"></a>

### plot.StepLineBR

```ts
plot.StepLineBR(value: number | null, name: string, options?: PlotStyleOptions<"steplinebr">): PlotRef
```

输出断线阶梯线点，空值处断开，对应 Pine plot.style_steplinebr。

选项与 [plot.Line](#plot-line) 相同。

<a id="plot-histogram"></a>

### plot.Histogram

```ts
plot.Histogram(value: number | null, name: string, options?: PlotStyleOptions<"histogram">): PlotRef
```

固定像素柱宽；size 接受正数像素或 ShapeSize 枚举，默认 1px。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `number \| ShapeSize` | 固定逻辑像素柱宽，或 Size 档位；默认 1px。 |
| `baseline?` | `number` | 柱状图的起始基线值；不填则取 0。 |

<a id="plot-columns"></a>

### plot.Columns

```ts
plot.Columns(value: number | null, name: string, options?: PlotStyleOptions<"columns">): PlotRef
```

填充当前时间槽位，左右各留 1 个物理像素，不跟随蜡烛实体宽度，不支持 size。
槽宽仅有 1–2 个物理像素时取消留白，避免柱体消失或跨槽覆盖。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `undefined` | — |
| `baseline?` | `number` | — |

<a id="plot-point"></a>

### plot.Point

```ts
plot.Point(value: number | null, name: string, options?: PlotStyleOptions<"points">): PlotRef
```

输出散点。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `ShapeSize` | 图形尺寸档位；不填则使用 ShapeSize.auto。 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。 具体尺寸见 ShapeSize 的档位对照表。 |

<a id="plot-shape"></a>

### plot.Shape

```ts
plot.Shape(value: number | boolean | null, name: string, options?: PlotStyleOptions<"shape">): PlotRef
```

输出形状标记；false 留空，absolute 定位时数值为价格。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `ShapeSize` | 图形尺寸档位；不填则使用 ShapeSize.auto。 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。 具体尺寸见 ShapeSize 的档位对照表。 |
| `style?` | `ShapeStyle` | 标记形状；不填则使用 ShapeStyle.xCross。 |
| `location?` | `ShapeLocation` | 标记位置；默认在 K 线上方，ShapeLocation.absolute 表示绘制在 value 指定的价格处。 |
| `text?` | `string` | 标记旁的附加文字；不填则不显示附加文字。 |

<a id="plot-char"></a>

### plot.Char

```ts
plot.Char(value: number | boolean | null, name: string, options?: PlotStyleOptions<"char">): PlotRef
```

输出字符标记；false 留空，absolute 定位时数值为价格。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `ShapeSize` | 图形尺寸档位；不填则使用 ShapeSize.auto。 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。 具体尺寸见 ShapeSize 的档位对照表。 |
| `char?` | `string` | 要绘制的单个 Unicode 字符；不填则显示 ★，填空字符串则只显示附加文字。 |
| `location?` | `ShapeLocation` | 标记位置；默认在 K 线上方，ShapeLocation.absolute 表示绘制在 value 指定的价格处。 |
| `text?` | `string` | 标记旁的附加文字；不填则不显示附加文字。 |

<a id="plot-arrow"></a>

### plot.Arrow

```ts
plot.Arrow(value: number | null, name: string, options?: PlotStyleOptions<"arrow">): PlotRef
```

输出数值箭头，正负决定方向，绝对值决定长度。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | 图例名称；不填则取 name。 |
| `color?` | `Color \| string` | 图形颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，可为每根 K 线设置不同颜色。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |
| `textColor?` | `Color \| string` | 标记附加文字的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认与图形颜色一致。 |
| `offset?` | `number` | 图形移动的 K 线根数；正值向右、负值向左，不填则不移动。 |
| `visible?` | `boolean` | 是否显示图形；不填则显示。 |
| `size?` | `ShapeSize` | 图形尺寸档位；不填则使用 ShapeSize.auto。 折线控制线宽，散点控制直径，形状和字符控制外框，箭头控制最大高度。 具体尺寸见 ShapeSize 的档位对照表。 |
| `colorUp?` | `Color \| string` | 正值向上箭头的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认使用 color。 |
| `colorDown?` | `Color \| string` | 负值向下箭头的颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，默认使用 color。 |

<a id="plot-candle"></a>

### plot.Candle

```ts
plot.Candle(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: CandlePlotOptions): void
```

输出蜡烛；任一价格缺失时留空，实体、影线和边框可独立着色。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `wickColor?` | `Color \| string \| null` | 影线颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。 |
| `borderColor?` | `Color \| string \| null` | 边框颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。 |
| `label?` | `string` | — |
| `visible?` | `boolean` | — |
| `offset?` | `number` | — |
| `showLast?` | `number` | — |
| `color?` | `Color \| string \| null` | 实体颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |

<a id="plot-bar"></a>

### plot.Bar

```ts
plot.Bar(open: number | null, high: number | null, low: number | null, close: number | null, name: string, options?: BarPlotOptions): void
```

输出美国线；左侧短横线为开盘，右侧短横线为收盘。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `label?` | `string` | — |
| `visible?` | `boolean` | — |
| `offset?` | `number` | — |
| `showLast?` | `number` | — |
| `color?` | `Color \| string \| null` | 实体颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举，null 隐藏该部分。 |
| `format?` | `Format` | 数值格式档位；缺省继承指标级 format，用于图例数值显示。 |

## 填充与参考线

<a id="fill"></a>

### fill

```ts
fill(from: PlotRef, to: PlotRef, color: Color | string | null, title?: string, options?: ScriptFillOptions): void
fill(from: HLineRef, to: HLineRef, color: Color | string | null, title?: string, options?: ScriptFillOptions): void
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

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `visible?` | `boolean` | 是否绘制填充；不填则绘制。 |

<a id="hline"></a>

### hline

```ts
hline(price: number, options?: HLineOptions): HLineRef
```

图表级水平参考线：固定价格、贯穿整幅宽度，不占用逐 bar 数据列。

只能在文件顶层声明；颜色、线型与线宽在整轮运行内固定，不随 bar 变化。

```ts
hline(70, { color: Color.gray, linestyle: HLineStyle.dashed })
```

**返回** 句柄；可交给 fill 与另一条水平线围出带状区域

- `price` 水平线价格
- `options` 标题、颜色、线型与线宽

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `title?` | `string` | 无障碍标题；缺省不显示。 |
| `color?` | `Color \| string` | 颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。 |
| `linestyle?` | `HLineStyle` | 线型；缺省实线。 |
| `linewidth?` | `number` | 线宽，逻辑像素；缺省 1。 |

## 值类型

<a id="plotref"></a>

### PlotRef

```ts
interface PlotRef {
    readonly name: string;
}
```

plot.* 返回的绘图句柄；fill 借它引用两个 Plot。

<a id="hlineref"></a>

### HLineRef

```ts
interface HLineRef {
    readonly hline: string;
}
```

hline 返回的句柄；fill 借它引用两条水平线之间的区域。
