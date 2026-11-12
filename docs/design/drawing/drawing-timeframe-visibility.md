# 图元时间周期可见性

## 决策

图元只保存**一条可见性规则**，不保存周期清单：

```ts
type DrawingTimeframeVisibility =
  | { mode: 'all' }
  | { mode: 'above' | 'below' | 'current'; period: string }
```

- `period` 是用户选择规则时的当前图表周期，作为比较参考。
- `above`：当前周期大于等于参考周期时可见（含参考周期）。
- `below`：当前周期小于等于参考周期时可见（含参考周期）。
- `current`：只在参考周期可见。
- `all` 或字段缺省：所有周期可见。

规则在消费时求值，不把“用户当时看到了哪些周期”预先展开成数组。新增/删除周期档位不需要迁移图元数据。

## 求值

`isDrawingVisibleInPeriod(visibility, period)` 是唯一求值入口，按 `KLINE_PERIODS` 的声明顺序比较高低周期：

- 周期顺序由数据层 `KLINE_PERIODS` 提供，绘图模块不复制第二份顺序表。
- 当前周期或参考周期不在标准周期集合内时，受限规则返回 `false`；不把自定义周期猜测成标准周期的相邻档位。
- 分时是独立 `workspaceId`，不参与这套规则；分时视图不展示该菜单项。

## 过滤入口

`DrawingScope` 统一承载 `workspaceId / symbolKey / period / paneId`，`isDrawingInScope()` 是唯一可见性谓词：

```ts
isDrawingInScope(drawing, scope)
  = 工作区匹配
  && 标的匹配
  && Pane 匹配（可选）
  && isDrawingVisibleInPeriod(drawing.timeframeVisibility, scope.period)
```

- 渲染：`DrawingStore.getVisibleByPane(scope)` 先按作用域过滤，再按 `visible` 过滤并排序。
- 命中：`DrawingInteractionController.getSelectableDrawings(scope)` 复用同一谓词，再叠加 `visible` 与 `isDrawingInteractive`。
- 查询：`ChartDrawingFacade.drawings` 复用同一谓词；文档增删改仍按 id，不按周期过滤，避免切周期后丢失可管理数据。
- `frameProjection` 只做时间范围、锚点与几何判断，不再重复标的或周期过滤。

## 写入

菜单只提供四个选项：当前及以上 / 当前及以下 / 仅当前 / 所有。选择后通过
`controller.updateBatch(ids, { timeframeVisibility })` 一次事务写入所有目标；不需要逐图元计算，也没有独立批量命令。

菜单打开时快照目标 ids 与各图元的规则；勾选态只在所有目标规则与“当前周期 + 该选项”完全一致时显示。写入后直接使用 `updateBatch` 返回的快照更新勾选态，不维护第二份图元状态。

## 选择与恢复

切换周期时清空选中集合；周期可见性是视图态，画面上不存在的图元不应继续参与工具栏与命令。
图元本身留在文档中，切回满足规则的周期即可重新看到并编辑。

## 边界

- 规则参考周期是选择时的周期，不是渲染时的“当前”；否则 `above` / `below` 会随视图漂移。
- 受限规则在任何有意义的当前周期下都包含参考周期本身，所以选择规则后当前画面不会立刻消失。
- 不存在“至少勾选一个周期”的校验，因为规则天然保证至少一个参考周期。
