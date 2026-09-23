# model — 持久化领域模型与命令层

`engine/drawing/model/` 承载已确认图元的持久化领域模型：文档 CRUD、唯一写入命令、
锚点物化与标签归一化。对外契约在 `types.ts`，实现在 `impl/`。

## 模块边界

本目录负责：

- `DrawingDocument`：图元 CRUD、锚点/标签校验与错误码，用户 UI 与 Agent 的统一入口。
- `DrawingCommands`：图元唯一写入口，提交状态变更并触发重绘副作用。
- 锚点数量表与持久化锚点物化、标签键归一化、锁定与锚点一致性判断。

本目录不负责：

- 会话预览与拖拽覆盖：属 `session/`。
- 命中、拖拽、磁吸等交互：属 `interaction/`。
- 坐标换算与帧投影：属 `geometry/`。

## 目录结构

```text
model/
├── types.ts                      # 声明式输入 patch、样式键与依赖接口（不依赖 impl/）
└── impl/
    ├── DrawingDocument.ts        # 图元 CRUD 领域模型
    ├── DrawingCommands.ts        # 唯一写入路径 + 请求重绘
    ├── drawingAccess.ts          # 锁定判断与锚点一致性比较
    ├── materializeAnchors.ts     # 锚点数量表与持久化锚点物化
    └── drawingLabels.ts          # 标签键契约与归一化
```

## 依赖

- `engine/drawing/types.ts`：图元领域模型契约。
- `foundation/plugin/types.ts`：`DrawingStyle` 等渲染 primitive。
- `data/provider/types.ts`：`TradingDate`。
- `engine/state/drawingState`：kernel 绘图状态模块，作为 `DrawingDocumentDependencies` 注入。

## 约定

- 已确认图元的写入必须走 `DrawingCommands` → `DrawingDocument` → adapter，禁止绕过命令层直写 kernel。
- `types.ts` 不依赖同模块 `impl/`；命令层通过结构化的 `DrawingCommandsDocumentPort` 依赖文档能力。
