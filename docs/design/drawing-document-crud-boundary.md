# 绘图文档 CRUD 边界设计

## 目的

将已确认图元的 CRUD 从 `DrawingInteractionController` 会话对象收归 `DrawingDocument`，让用户交互、受控组件和后续 Agent Tool 通过同一套声明式命令写入 `kernel.drawing`。

## 决策

- `kernel.drawing.drawings` 继续是已确认图元的唯一 SSOT；Scene 渲染只读取它与会话 overlay 的投影。
- `DrawingDocument` 提供 `list / get / create / update / remove / clear / replace`。`replace` 只服务受控组件和导入导出，日常变更必须使用按 id 的命令。
- `drawingState.actions` 提供原子 `upsert / update / remove`，负责不可变快照及选中 id 一致性。
- `DrawingInteractionController` 只持有 preview、drag override、锚点采集和命中检测；确认创建、拖拽提交、样式更新及删除均委托 `DrawingChartAdapter` 的领域命令。
- 外部创建和更新锚点使用 `time + price`。`DrawingDocument` 根据当前数据解析 `index`，不向调用方暴露派生渲染坐标。

## 调用链

```text
pointer 交互 / Controller API / Agent Tool
                 |
                 v
           DrawingDocument
                 |
                 v
     drawingState 原子领域 action
                 |
                 v
      kernel.drawing -> Scene 投影
```

## 约束

- `__preview__` 仅属于会话 overlay，不能通过声明式 CRUD 持久化或暴露给 Agent。
- `DrawingDocument` 不依赖 DOM，不承担 pointer 坐标换算和渲染职责。
- 旧 AI runtime 的 `drawing.add` 暂保留 `barIndex` 入参兼容，但必须先映射为时间戳后委托 `ChartController.createDrawing`；它不再构造内部 `DrawingObject` 或整表替换。

## Agent Tool

`ChartAgentController` 已使用 TypeBox schema 注册以下工具，并全部委托同一个 `DrawingDocument`：

- `drawings_list`：read-only，返回不含 `index` 与 preview 的图元快照。
- `drawing_create`：destructive，输入 `kind`、现有 `paneId` 与 `time + price` 锚点。
- `drawing_update`：destructive，按 id 应用非空 patch。
- `drawing_delete`：destructive，按 id 删除。
- `drawings_clear`：destructive，清除全部已确认图元。

浏览器 Agent 的 read-only 运行模式会按既有 `ChartToolSafety` 过滤 destructive 工具。destructive 工具的人工审批策略仍统一依赖 Agent 协议 issue #121。
