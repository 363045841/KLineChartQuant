# 绘图标签键不变式归领域

「标签以渲染输出的线段 / 区域序号为键」这条不变式原先只由 Agent 工具 schema 强制，领域类型与领域运行时都没有表达。本次把它收回领域，工具 schema 降级为跟随者。

## 问题

| 层 | 原状态 |
| --- | --- |
| Agent 工具 schema | 唯一强制点（`patternProperties` + `additionalProperties:false`） |
| 领域类型 `DrawingLabels` | `Record<string, DrawingLabel>`，允许任意字符串键 |
| 领域运行时 | 不校验 |
| 领域消费端 | 按 `String(index)` 查找，隐含依赖数字序号 |

后果：

- UI / 受控组件 / 导入导出 / 持久化文档这些不走工具的入口不受保护；
- 把 `line` / `area` 直接写成单个标签对象（扁平形状）时，归一化逻辑对字符串取 `.text` 抛空引用；
- 非数字键被静默忽略；
- 类型检查只能挡住扁平形状，挡不住"非数字键"。

## 决策：不变式归领域

### 1. 类型表达

```ts
/** 绘图标签的键：图元定义输出的线段或填充区域序号。 */
export type DrawingLabelIndex = `${number}`

export type DrawingLabels = {
  line: Record<DrawingLabelIndex, DrawingLabel>
  area: Record<DrawingLabelIndex, DrawingLabel>
}
```

对象字面量层面能挡住扁平形状与具名键；``Record<`${number}`, T>`` 与 `Record<string, T>` 互相可赋值，因此投影边界（Agent 快照等）不受连锁影响。

键的判定规则收紧为 `^(0|[1-9]\d*)$`：合法的键就是 `String(非负整数)`，排除 `-1`、`1.5`、`01`（前导零）、`position` 等渲染端不会产生的写法。

### 2. 运行时归一化

所有入口（创建 / 更新 / 写入 / 整份替换）共用一个归一化函数：只保留序号键，且值必须是形状完整的标签对象，否则丢弃；换行统一为字面量控制码。

选「丢弃」而非「抛错」的理由：序号以外的键在渲染端本就按序号查找、取不到，丢弃是唯一有意义的解释；对导入/持久化数据抛严苛错误会把链路变脆，违反仓库「不使用严苛校验」的约定。Agent 侧仍由工具 schema 拒绝并给出可修正反馈，两者职责不重叠。

归一化函数接收 `unknown`（它本就是解析不可信输入的边界），因此可以类型安全地用畸形值直接测试，无需 `as`。

### 3. 消费端构造键

消费端改用 `drawingLabelIndexKey(index)` 构造序号键，替代 `String(index)`。这样类型系统能保证索引来自真实序号，而不是任意字符串。

### 4. 工具 schema 跟随领域

Agent 工具参数的序号正则从 `DRAWING_LABEL_INDEX_PATTERN` 派生，与领域判定同源，避免再次分叉。

## 边界

- 持久化形状不变：仍是 `Record`，键仍是数字字符串，不改为数组，避免破坏已有文档。
- 不改「日内周期下日期命中多根 bar」这类行为问题。
- 附带把 `DRAWING_KIND_VALUES` 用 `satisfies ReadonlyArray<DrawingKind>` 绑到领域联合，避免枚举漂移。
