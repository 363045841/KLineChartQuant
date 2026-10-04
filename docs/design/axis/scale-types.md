# 价格轴刻度类型词汇表 SSOT 化

## 背景

`linear / log / percent` 这组价格轴刻度类型此前以字符串字面量形式散落在 Core 引擎各层：类型联合被重复定义 5 次，运行时比较（`=== 'log'` 等）散落 20 余处。任何一处新增类型或改值都需要人工全仓库查找，且 `Record` 分派无法获得编译期穷尽性保障。

## 问题

- **重复定义**：`ScaleMode`（scale）、`ScaleType`（engine）、`PriceScaleTypeSetting` / `RightAxisTypeSetting`（config）、plugin 内联联合各自声明同一组字符串。
- **字面量比较**：`createPriceScale`、`engine/scale/priceScale`、`tickPosition`、`chart`、`candle`、`chartPaneLayout`、`chartRenderer`、`indicator_scale`、`axisSettings`、`chartSettings` 均直接写 `'log'` / `'linear'` / `'percent'`。
- 违反仓库「禁止硬编码字符串」「单一事实来源」约定。

## 决策

新增唯一词汇表 `packages/core/src/foundation/types/scaleType.ts`，用 `as const` 对象承载取值并派生出字符串联合类型：

```ts
export const ScaleType = { Linear: 'linear', Log: 'log', Percent: 'percent' } as const
export type ScaleType = (typeof ScaleType)[keyof typeof ScaleType]

export const AXIS_TYPE_NONE = 'none' as const
export type AxisType = ScaleType | typeof AXIS_TYPE_NONE
```

- 取值定义收敛到本文件；`ScaleMode` / `PriceScaleTypeSetting` / `RightAxisTypeSetting` / plugin 契约全部从它派生。
- 所有运行时比较改用 `ScaleType.Xxx`，默认值与兜底值同样引用常量。
- 不保留旧 `tickPosition.ts` 的 `ScaleType` 再导出，6 个引用点直接改为从词汇表导入，避免兼容层。

分层归属：`foundation/types/` 是最底层领域词汇（与 `chartPeriod.ts` 同层），`scale` / `engine` / `foundation/config` 均可依赖它，无循环。

## 非目标

- **不合并** headless `scale/impl/createPriceScale.ts` 与 `engine/scale/priceScale.ts` 两套价格坐标实现。
- **不纳入** `AxisDisplaySetting = 'none' | 'price' | 'percent'`：它是轴标签展示语义，与刻度类型是两套词汇；`yAxis` / `leftYAxis` / `resolveAxisDisplaySetting` 中的字面量保持不变。
- **不改测试**：用例中的 `'log'` 字面量作为公开字符串契约锚点保留，改常量反而会掩盖常量值被误改的问题。
- 不改 `vue` / `react` / `angular` 包（经检索不引用相关类型与字面量）。

## 影响面

新增 1 文件，编辑 12 个生产文件；公共导出面不变（`ScaleType` 此前也非公开 API，`ScaleMode` 仍从 `scale/index.ts` 导出）。
