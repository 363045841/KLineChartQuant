# interaction — 指针交互

`engine/drawing/interaction/` 承载绘图工具的指针交互：落点收集、预览构造、拖拽、命中、
框选、磁吸与工具表。对外契约在 `types.ts`，实现在 `impl/`。

## 模块边界

本目录负责：

- `DrawingInteractionController`：组合各交互件，处理工具切换、指针会话、选中与磁吸。
- 分步锚点累积、预览图元构造、拖拽与跟随策略、命中测试、框选会话、工具 ID 与锚点数表。

本目录不负责：

- 持久化写入：属 `model/`（交互层只调用 `DrawingCommands`）。
- 坐标换算与线表：属 `geometry/`。
- 绘制：属 `render/`。

## 目录结构

```text
interaction/
├── types.ts                    # DrawingToolId、磁吸/拖拽契约、命中结果、框选契约
└── impl/
    ├── interaction.ts          # DrawingInteractionController
    ├── AnchorCollector.ts      # 多锚点工具的分步锚点累积
    ├── PreviewRenderer.ts      # 依据待定锚点构造预览图元
    ├── DragHandler.ts          # 拖拽会话（单锚点/中点手柄/整体平移）
    ├── dragPolicy.ts           # 拖拽跟随策略
    ├── HitTester.ts            # 命中测试 + 线段输出供框选复用
    ├── magnetSnapper.ts        # OHLC 磁吸纯函数与档位
    ├── toolConfig.ts           # 工具表与 工具→图形 kind / extend 映射
    └── selectionMarquee.ts     # 框选几何与临时原语投影
```

## 依赖

- `geometry/`：坐标换算、线表、填充、标签布局、回归。
- `session/`：`DrawingState`、`DrawingSelection`。
- `model/`：`drawingAccess`、`drawingLabels`、`materializeAnchors`。
- `engine/drawing/types.ts`：图元领域模型契约。

## 约定

- 磁吸仅作用于落点与预览路径；命中、框选、标签等只读路径不得开启磁吸，否则命中范围会随吸附漂移。
- 命中、拖拽、绘制共用 `geometry/impl/lines.ts` 的线段声明，禁止各处自行推导锚点对。
