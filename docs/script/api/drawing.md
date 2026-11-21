<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API · 绘图对象

> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验同步。写法与规则见[指标脚本](../../../packages/script/docs/indicator.md)。

## 线段

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `line.all` | `readonly LineRef[]` | 本次运行绘制的全部线段引用，按创建顺序；与创建返回的引用相等，可直接比较。 |

<a id="line-new"></a>

### line.new

```ts
line.new(first_point: ChartPoint, second_point: ChartPoint, xloc?: LineXLoc, extend?: LineExtend, color?: Color | string, style?: LineStyle, width?: number): LineRef
line.new(x1: number, y1: number, x2: number, y2: number, xloc?: LineXLoc, extend?: LineExtend, color?: Color | string, style?: LineStyle, width?: number): LineRef
line.new(options: LineOptions): LineRef
```

绘制线段；两个重载分别接受 chart.point 端点与起止点的 X / Y。

<a id="line-setxy1"></a>

### line.setXY1

```ts
line.setXY1(id: LineRef, x: number, y: number): void
```

同时设置起点 X 和 Y；X 的取值方式沿用创建时的 xloc。

<a id="line-setxy2"></a>

### line.setXY2

```ts
line.setXY2(id: LineRef, x: number, y: number): void
```

同时设置终点 X 和 Y；X 的取值方式沿用创建时的 xloc。

<a id="line-setx1"></a>

### line.setX1

```ts
line.setX1(id: LineRef, x: number): void
```

设置起点 X；取值方式沿用创建时的 xloc。

<a id="line-sety1"></a>

### line.setY1

```ts
line.setY1(id: LineRef, y: number): void
```

设置起点价格。

<a id="line-setx2"></a>

### line.setX2

```ts
line.setX2(id: LineRef, x: number): void
```

设置终点 X；取值方式沿用创建时的 xloc。

<a id="line-sety2"></a>

### line.setY2

```ts
line.setY2(id: LineRef, y: number): void
```

设置终点价格。

<a id="line-setcolor"></a>

### line.setColor

```ts
line.setColor(id: LineRef, color: Color | string): void
```

设置线段颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。

<a id="line-setstyle"></a>

### line.setStyle

```ts
line.setStyle(id: LineRef, style: LineStyle): void
```

设置线型，包括实线、虚线和箭头。

<a id="line-setwidth"></a>

### line.setWidth

```ts
line.setWidth(id: LineRef, width: number): void
```

设置线宽，正整数逻辑像素。

<a id="line-setextend"></a>

### line.setExtend

```ts
line.setExtend(id: LineRef, extend: LineExtend): void
```

设置延伸方向；left 延伸至起点之外，right 延伸至终点之外。

<a id="line-getx1"></a>

### line.getX1

```ts
line.getX1(id: LineRef): number
```

读取起点 X；线段已删除返回 NaN。

<a id="line-gety1"></a>

### line.getY1

```ts
line.getY1(id: LineRef): number
```

读取起点价格；线段已删除返回 NaN。

<a id="line-getx2"></a>

### line.getX2

```ts
line.getX2(id: LineRef): number
```

读取终点 X；线段已删除返回 NaN。

<a id="line-gety2"></a>

### line.getY2

```ts
line.getY2(id: LineRef): number
```

读取终点价格；线段已删除返回 NaN。

<a id="line-getcolor"></a>

### line.getColor

```ts
line.getColor(id: LineRef): string | null
```

读取颜色；线段已删除返回 null。

<a id="line-getstyle"></a>

### line.getStyle

```ts
line.getStyle(id: LineRef): LineStyle | null
```

读取线型；线段已删除返回 null。

<a id="line-getwidth"></a>

### line.getWidth

```ts
line.getWidth(id: LineRef): number
```

读取线宽；线段已删除返回 NaN。

<a id="line-getextend"></a>

### line.getExtend

```ts
line.getExtend(id: LineRef): LineExtend | null
```

读取延伸方向；线段已删除返回 null。

<a id="line-getprice"></a>

### line.getPrice

```ts
line.getPrice(id: LineRef, x: number): number
```

按线段所在直线求 x 处的价格，与 extend 无关；只支持 xloc.barIndex，垂直线或已删除返回 NaN。

<a id="line-copy"></a>

### line.copy

```ts
line.copy(id: LineRef): LineRef | null
```

复制为新线段并返回其引用，副本独立于原线段。

<a id="line-delete"></a>

### line.delete

```ts
line.delete(id: LineRef | null): void
```

删除线段；传入 null 或已删除对象无操作。

## 矩形

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `box.all` | `readonly BoxRef[]` | — |

<a id="box-new"></a>

### box.new

```ts
box.new(left: number, top: number, right: number, bottom: number, border_color?: Color | string, border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | string, text?: string, text_size?: number, text_color?: Color | string): BoxRef
box.new(top_left: ChartPoint, bottom_right: ChartPoint, border_color?: Color | string, border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | string, text?: string, text_size?: number, text_color?: Color | string): BoxRef
box.new(options: BoxOptions): BoxRef
```

<a id="box-setleft"></a>

### box.setLeft

```ts
box.setLeft(id: BoxRef, left: number): void
```

<a id="box-settop"></a>

### box.setTop

```ts
box.setTop(id: BoxRef, top: number): void
```

<a id="box-setright"></a>

### box.setRight

```ts
box.setRight(id: BoxRef, right: number): void
```

<a id="box-setbottom"></a>

### box.setBottom

```ts
box.setBottom(id: BoxRef, bottom: number): void
```

<a id="box-setlefttop"></a>

### box.setLeftTop

```ts
box.setLeftTop(id: BoxRef, left: number, top: number): void
```

<a id="box-setrightbottom"></a>

### box.setRightBottom

```ts
box.setRightBottom(id: BoxRef, right: number, bottom: number): void
```

<a id="box-settopleftpoint"></a>

### box.setTopLeftPoint

```ts
box.setTopLeftPoint(id: BoxRef, point: ChartPoint): void
```

<a id="box-setbottomrightpoint"></a>

### box.setBottomRightPoint

```ts
box.setBottomRightPoint(id: BoxRef, point: ChartPoint): void
```

<a id="box-setxloc"></a>

### box.setXLoc

```ts
box.setXLoc(id: BoxRef, left: number, right: number, xloc: LineXLoc): void
```

<a id="box-setextend"></a>

### box.setExtend

```ts
box.setExtend(id: BoxRef, extend: LineExtend): void
```

<a id="box-setbgcolor"></a>

### box.setBgColor

```ts
box.setBgColor(id: BoxRef, color: Color | string): void
```

<a id="box-setbordercolor"></a>

### box.setBorderColor

```ts
box.setBorderColor(id: BoxRef, color: Color | string): void
```

<a id="box-setborderwidth"></a>

### box.setBorderWidth

```ts
box.setBorderWidth(id: BoxRef, width: number): void
```

<a id="box-setborderstyle"></a>

### box.setBorderStyle

```ts
box.setBorderStyle(id: BoxRef, style: BoxBorderStyle): void
```

<a id="box-settext"></a>

### box.setText

```ts
box.setText(id: BoxRef, text: string): void
```

<a id="box-settextcolor"></a>

### box.setTextColor

```ts
box.setTextColor(id: BoxRef, color: Color | string): void
```

<a id="box-settextsize"></a>

### box.setTextSize

```ts
box.setTextSize(id: BoxRef, size: number): void
```

<a id="box-settexthalign"></a>

### box.setTextHAlign

```ts
box.setTextHAlign(id: BoxRef, align: DrawingText["align"]): void
```

<a id="box-settextvalign"></a>

### box.setTextVAlign

```ts
box.setTextVAlign(id: BoxRef, align: DrawingText["verticalAlign"]): void
```

<a id="box-getleft"></a>

### box.getLeft

```ts
box.getLeft(id: BoxRef): number
```

<a id="box-gettop"></a>

### box.getTop

```ts
box.getTop(id: BoxRef): number
```

<a id="box-getright"></a>

### box.getRight

```ts
box.getRight(id: BoxRef): number
```

<a id="box-getbottom"></a>

### box.getBottom

```ts
box.getBottom(id: BoxRef): number
```

<a id="box-copy"></a>

### box.copy

```ts
box.copy(id: BoxRef): BoxRef | null
```

<a id="box-delete"></a>

### box.delete

```ts
box.delete(id: BoxRef | null): void
```

## 标签

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `label.styleNone` | `"none"` | — |
| `label.all` | `readonly LabelRef[]` | — |

<a id="label-new"></a>

### label.new

```ts
label.new(x: number, y: number, text?: string, xloc?: LineXLoc, location?: "price", color?: Color | string, style?: "none", textcolor?: Color | string, size?: number, textalign?: DrawingText["align"], offsetY?: number): LabelRef
label.new(options: LabelOptions): LabelRef
```

绘制价格锚点标签，位置参数或选项对象二选一。

<a id="label-setx"></a>

### label.setX

```ts
label.setX(id: LabelRef, x: number): void
```

<a id="label-sety"></a>

### label.setY

```ts
label.setY(id: LabelRef, y: number): void
```

<a id="label-setxy"></a>

### label.setXY

```ts
label.setXY(id: LabelRef, x: number, y: number): void
```

<a id="label-settext"></a>

### label.setText

```ts
label.setText(id: LabelRef, text: string): void
```

<a id="label-settextcolor"></a>

### label.setTextColor

```ts
label.setTextColor(id: LabelRef, color: Color | string): void
```

<a id="label-setsize"></a>

### label.setSize

```ts
label.setSize(id: LabelRef, size: number): void
```

<a id="label-settextalign"></a>

### label.setTextAlign

```ts
label.setTextAlign(id: LabelRef, align: DrawingText["align"]): void
```

<a id="label-setyoffset"></a>

### label.setYOffset

```ts
label.setYOffset(id: LabelRef, offsetY: number): void
```

设置垂直偏移；逻辑像素，正数向上。

<a id="label-getx"></a>

### label.getX

```ts
label.getX(id: LabelRef): number
```

<a id="label-gety"></a>

### label.getY

```ts
label.getY(id: LabelRef): number
```

<a id="label-gettext"></a>

### label.getText

```ts
label.getText(id: LabelRef): string | null
```

<a id="label-getyoffset"></a>

### label.getYOffset

```ts
label.getYOffset(id: LabelRef): number
```

读取垂直偏移；标签已删除返回 0。

<a id="label-copy"></a>

### label.copy

```ts
label.copy(id: LabelRef): LabelRef | null
```

<a id="label-delete"></a>

### label.delete

```ts
label.delete(id: LabelRef | null): void
```

## 坐标

<a id="chart-point-new"></a>

### chart.point.new

```ts
chart.point.new(time: number, index: number, price: number): ChartPoint
```

用时间戳、bar 索引和价格构造 point；xloc 决定 line.new 读取哪个字段。

<a id="chart-point-now"></a>

### chart.point.now

```ts
chart.point.now(price: number): ChartPoint
```

当前 K 线的 point，索引取 barIndex。

<a id="chart-point-fromindex"></a>

### chart.point.fromIndex

```ts
chart.point.fromIndex(index: number, price: number): ChartPoint
```

只带 bar 索引的 point，用于 xloc.barIndex。

<a id="chart-point-fromtime"></a>

### chart.point.fromTime

```ts
chart.point.fromTime(time: number, price: number): ChartPoint
```

只带毫秒时间戳的 point，用于 xloc.barTime。

<a id="chart-point-copy"></a>

### chart.point.copy

```ts
chart.point.copy(point: ChartPoint): ChartPoint
```

复制 point，得到独立值对象。

## 值类型

<a id="lineref"></a>

### LineRef

```ts
interface LineRef {
    readonly id: string;
}
```

不暴露可修改对象本身的引用，只在所属运行内有效。

<a id="boxref"></a>

### BoxRef

```ts
interface BoxRef {
    readonly id: string;
}
```

Box 对象引用，仅在所属运行中有效。

<a id="labelref"></a>

### LabelRef

```ts
interface LabelRef {
    readonly id: string;
}
```

Label 对象引用，仅在所属运行中有效。

<a id="chartpoint"></a>

### ChartPoint

```ts
interface ChartPoint {
    readonly index?: number;
    readonly time?: number;
    readonly price: number;
}
```

chart.point 值对象；绘制线段时复制坐标。

<a id="lineoptions"></a>

### LineOptions

```ts
interface LineOptions {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly xloc?: LineXLoc;
    readonly extend?: LineExtend;
    readonly color?: Color | string;
    readonly style?: LineStyle;
    readonly width?: number;
}
```

Line 的选项对象形态；只写需要的字段，等价于位置参数。

<a id="labeloptions"></a>

### LabelOptions

```ts
interface LabelOptions {
    readonly x: number;
    readonly y: number;
    readonly text?: string;
    readonly xloc?: LineXLoc;
    readonly color?: Color | string;
    readonly textColor?: Color | string;
    readonly size?: number;
    readonly align?: DrawingText['align'];
    readonly offsetY?: number;
}
```

Label 的选项对象形态；只写需要的字段，省略 location/style 这类只有一个取值的参数。

<a id="boxoptions"></a>

### BoxOptions

```ts
interface BoxOptions {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly borderColor?: Color | string;
    readonly borderWidth?: number;
    readonly borderStyle?: BoxBorderStyle;
    readonly extend?: LineExtend;
    readonly xloc?: LineXLoc;
    readonly backgroundColor?: Color | string;
    readonly text?: string;
    readonly textSize?: number;
    readonly textColor?: Color | string;
}
```

Box 的选项对象形态；只写需要的字段，省略只接受单一取值的参数。
