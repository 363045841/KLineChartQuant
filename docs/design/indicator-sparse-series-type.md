# 指标序列的稀疏类型修正

`calcBOLLData` / `calcENEData` 返回的序列是稀疏数组（预热期前若干项无值），其返回类型与 `BOLLRenderState.series` / `ENERenderState.series` 的声明改为 `Array<Point | undefined>`，与运行时表示一致。

## 问题

两个计算器都用 `new Array(data.length)` 建结果：

```ts
const result: BOLLPoint[] = new Array(data.length)
```

`new Array(n)` 在运行时产出的是空洞数组，预热期读取到的是 `undefined`；注释也写着“稀疏：前 period-1 项为 undefined”。但类型声明为 `BOLLPoint[]` / `ENEPoint[]`，等于宣称每项都非空。

后果：

- 消费方（renderer、legend、测试）必须靠 `!point` 之类的运行时判断兜底，而类型系统认为这些判断恒假。
- 测试要构造预热期数据时只能写 `as unknown as`，或整体 `@ts-nocheck`；这也是 #178 里 boll / ene 测试类型报错的直接来源。
- `Array<Point|undefined>` 才是真实契约，类型与实现长期不符属于潜在 bug。

## 方案

- `calcBOLLData` / `calcENEData` 返回类型与内部 `result` 标注改为 `Array<BOLLPoint | undefined>` / `Array<ENEPoint | undefined>`。
- `BOLLRenderState.series` / `ENERenderState.series` 同步为 `Array<... | undefined>`。
- 测试侧（`boll.renderer.test.ts` / `ene.renderer.test.ts` / `soa.test.ts`）不再需要强转或 `@ts-nocheck`。

## 边界

- 运行时行为零变化：只是把既有稀疏语义写进类型。
- 消费方已按 `undefined` 处理（`if (!point) continue` / `return null`），类型放宽后语义不变。
- 影响面有限：仅 `bands.ts`、`bollState.ts`、`eneState.ts` 及对应测试；`soa.test.ts` 的 SoA 包装函数返回类型同步更新。
