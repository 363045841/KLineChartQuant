# geometry — 坐标、投影与纯几何

`engine/drawing/geometry/` 承载绘图子系统的纯几何计算：锚点坐标换算、帧投影、线表、
填充多边形、标签布局、线性回归与线段视口裁剪。对外契约在 `types.ts`，实现在 `impl/`。

## 模块边界

本目录负责：

- 锚点逻辑坐标（时间戳 + 价格）↔ 屏幕坐标换算、`resolveDrawingPointer`、点线距离几何。
- 把当前 Pane 的图元投影为帧数据（`ResolvedDrawingObject` + 绘制原语列表）。
- 图元的线段构成与手柄声明、通道填充多边形装配、标签布局、回归计算、线段裁剪。

本目录不负责：

- 指针事件会话与命中：属 `interaction/`。
- 绘制到 canvas：属 `render/`。
- 持久化：属 `model/`。

## 目录结构

```text
geometry/
├── types.ts            # 跨子模块契约（锚点/指针/线表/标签布局）
└── impl/
    ├── coordinateUtils.ts    # 坐标换算、指针解析、点线距离
    ├── frameProjection.ts    # 图元 → 帧数据投影
    ├── linearRegression.ts   # 回归通道线性回归
    ├── lines.ts              # 线段构成与中点手柄声明
    ├── fillRegions.ts        # 填充多边形装配
    ├── labelLayout.ts        # 线段标签布局
    └── lineClipping.ts       # 线段视口裁剪（Cohen–Sutherland）与延长线求交
```

## 依赖

- `foundation/plugin/types.ts`：`ScreenPoint`、`DrawingPrimitive` 等渲染 primitive；`foundation/tokens`。
- `engine/drawing/types.ts`：图元领域模型契约。
- `render/impl/`：`frameProjection` 消费 `DrawingStore` / `DrawingDefinitionRegistry`。
- `interaction/impl/magnetSnapper.ts`：`coordinateUtils` 在落点解析时应用磁吸。

## 约定

- 几何计算保持纯函数、无状态，便于单测。
- 图元的线段构成与手柄开启只声明在 `lines.ts`，绘制、命中、拖拽不得各自推导锚点对。
- 跨子模块依赖是单向的 `geometry → interaction`（仅类型与磁吸函数）。
