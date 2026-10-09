# Footprint 文本模式

## 决策

足迹图新增展示参数「文本模式」，取值 Volume / Delta / Bid Ask，默认 Bid Ask。Volume 与 Delta 为单值模式，文本统一渲染在中轴左侧；Bid Ask 保持既有双侧文字与不平衡加粗。参数面板新增 `select` 参数类型，经公共 `DropMenu` 选择。

## 原因

- 逐价位段的文本此前固定为 Bid/Ask 两侧。Volume 只需该价位的成交额合计，Delta 只需差值，都不涉及买卖方向；方向信息已由两侧色块表达。
- 文本模式只改变展示，不改变成交额计算。按 StateKernel 单一事实来源原则，展示配置走 `presentation`，不进入计算身份或计算去重键。

## 实现

- `footprint/types.ts` 新增 `FOOTPRINT_TEXT_MODES`、`FootprintTextMode`、`FOOTPRINT_TEXT_OPTIONS`，并在 `FootprintRenderState` 上增加可选 `textMode`。
- 指标定义声明 `presentation.defaultOptions = { textMode: 'bidAsk' }`；`resolvePresentation` 从实例参数中提取展示键，`composeRenderState` 将其投影到渲染状态，切换时只重建渲染投影、不触发重新计算。
- 渲染器按模式生成标签：Volume = Bid + Ask，Delta = Ask − Bid（正值显式带 `+`），两者右对齐绘制在中轴左侧；Bid Ask 保持既有双侧文字与不平衡加粗。
- `getTitleInfo` 在参数文本末尾拼接文本模式名称。
- 参数面板 `ParamConfig.type` 扩展 `'select'` 并新增 `options`；面板对 select 使用公共 `DropMenu`，编辑逻辑抽到 `useIndicatorParams` composable。
- `TitleInfo.params` 与 `LegendIndicatorRow.params` 由 `number[]` 放宽为 `(number | string)[]`，允许枚举参数进入标题参数文本。

## 边界

- 单值模式的文字宽度上限仍取半宽（中轴左侧），超宽时整列不显示数字，沿用既有 `resolveLabelFontSize` 的列级判定。
- 数值仍经 `compactValue`（Intl）在画布边界格式化，计算与内部表示保持十进制字符串。
