# 绘图文字颜色与字号的唯一模型

## 背景

脚本里的颜色是别名（`Color.Blue` → `@blue`），由 `createScriptColorResolver` 在投影阶段换成当前主题的色值。
别名不是合法 CSS 颜色：直接把 `@blue` 交给 canvas，`fillStyle` 赋值会被忽略，文字沿用上一次的填充色，
表现为「深色模式下文字是黑的」，甚至完全看不见。

根因不在解析层，而在模型：文字颜色和字号曾同时存在于两个字段。

| 字段 | 写入方 | 说明 |
| --- | --- | --- |
| `DrawingStyle.textColor` / `fontSize` | 线标签、样式面板 | 图元样式，投影时解析 |
| `DrawingText.color` / `size` | `box.new`、`label.new` | 文字内容模型，投影后由定义层覆盖回样式 |

转换层的契约是 `DrawingStyle`，第二个字段不在它的入参里，所以别名在边界下游被重新注入图元，
渲染端拿到的仍是 `@blue`。

## 决策

**文字颜色与字号属于图元样式，只存 `DrawingStyle.textColor` / `fontSize`。**

- `DrawingText` 只保留内容与排版：`value`、`align`、`verticalAlign`、`offsetY`。
- `box.new` / `label.new` 的 `text_color` / `size` 参数写入样式，脚本 API 签名不变。
- `rectangle`、`label` 定义不再覆盖文字图元的样式，直接消费 `drawing.style`。
- 未指定文字颜色时跟随描边：`style.textColor` 缺省，由渲染端 `textColor ?? stroke` 取值。

这样「颜色 ⊆ `DrawingStyle`」成为真命题，`projectDrawingsForFrame` 一处解析即可覆盖全部绘制对象。

## 约束

- 新增绘图定义不允许自行解析颜色，也不允许在定义层重新组合颜色字段。
- 解析器按当前主题创建，不能跨主题缓存；换主题后必须重新投影。
- 渲染层保持纯消费：只认 `style`，不认识别名。

## 验证

- `frameProjection.test.ts` 断言 `style.textColor` 上的 `@red` 被解析成当前主题的 `scriptPalette.red`，字号直接透传。
- `drawingDefinitions.test.ts` 断言 Box / Label 的文字图元样式与对象样式一致。
