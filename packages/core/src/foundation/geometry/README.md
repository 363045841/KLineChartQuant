# geometry — 与业务无关的二维几何

`foundation/geometry/` 提供跨模块复用的纯几何谓词与构造：点、圆、矩形、线段、多边形之间的判定。
对外契约在 `types.ts`，实现在 `impl/`，唯一公开入口是 `index.ts`。

## 模块边界

本模块负责：

- 值类型：`Point`、`Rect`。
- 谓词：`pointInCircle`、`pointInRect`、`pointInPolygon`、`pointToSegmentDistanceSq`、`segmentIntersectsRect`。
- 构造与度量：`rectFromPoints`、`midpoint`、`distanceSq`。

本模块不负责：

- 命中优先级、对象选择、拖拽目标语义：由各调用方（drawing `HitTester`、marker `registry`、candle 命中、框选等）保留。
- 坐标换算（时间戳 / 价格 ↔ 屏幕 px）：属 `engine/drawing/geometry`。
- 渲染、状态与 DOM。

## 目录结构

```text
geometry/
├── types.ts                # 对外契约：Point / Rect
├── index.ts                # 唯一公开入口
└── impl/
    └── geometryUtils.ts    # 纯几何谓词与构造
```

## 依赖

零依赖。本模块不得 import `engine/`、`foundation/plugin` 或任何上层模块；`foundation/plugin/types.ts` 反向引用本模块的 `Point`。

## 约定

- 全部为纯函数、无状态、无副作用，便于表驱动单测。
- 距离比较统一用平方值（`distanceSq` / `pointToSegmentDistanceSq`），避免开方。
- 边界语义：`pointInRect` / `pointInCircle` 含边界；`pointInPolygon` 不保证边界结果，调用方命中判定先看线段。
- 只收「与业务无关的几何」；一旦需要坐标换算、Pane 等业务概念，就不属于本模块。
