# session — 会话 overlay 与选择

`engine/drawing/session/` 承载不进 kernel、不持久化的临时状态：预览图元、拖拽覆盖与选中集合。

## 模块边界

本目录负责：

- `DrawingSessionOverlay`：预览与拖拽覆盖的存取，以及 `mergePaint` 把已确认图元与会话覆盖按 id 合并。
- `DrawingSelection`：选中集合的纯函数操作（清空、Ctrl 多选切换）。

本目录不负责：

- 已确认图元的持久化：属 `model/`。
- 指针事件解析与命中：属 `interaction/`。
- 绘制：属 `render/`。

## 目录结构

```text
session/
└── impl/
    ├── DrawingSessionOverlay.ts   # 预览/拖拽覆盖存取 + mergePaint + PREVIEW_ID
    └── DrawingSelection.ts        # 选中集合纯函数
```

> 本子模块没有独立对外契约，故不设 `types.ts`；其状态形状直接复用 `engine/drawing/types.ts`。

## 与 kernel 状态的区分

- 本目录的 `DrawingSessionOverlay` 是**非持久化会话层**，只持预览与拖拽覆盖。
- kernel 的已确认图元 SSOT 是 `engine/state/drawingState.ts` 的 `createDrawingState` / `DrawingStateModule`。
  两者名字刻意区分，避免混淆。

## 依赖

- `controllers/types.ts`：`DrawingDocumentPort`、`DrawingSessionPort`（adapter 端口）。
- `engine/drawing/types.ts`：`DrawingObject`。

## 约定

`DrawingSessionOverlay` 绝不持有已确认图元列表；已确认图元经 adapter 读写 kernel SSOT。
