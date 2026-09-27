# magnet — OHLC 磁吸

`engine/drawing/magnet/` 承载绘图磁吸：把指针屏幕坐标吸附到最近 K 线的 OHLC 价格与 Bar 中心。
对外契约在 `types.ts`，实现在 `impl/`。

## 模块边界

本目录负责：

- 磁吸档位契约：`MagnetMode`（off/weak/strong）、生效档位 `ActiveMagnetMode` 与配置 `MagnetSnapConfig`。
- 纯函数 `snapPointerToOhlc`：weak 在 8px 内吸 high/low，strong 无距离门槛地吸最近 OHLC；Bar 中心可解析时吸附 X。

本目录不负责：

- 磁吸档位的会话状态与修饰键（Ctrl/Meta/Shift）分发：属 `interaction/`（`DrawingInteractionController`）。
- 落点解析与坐标换算：属 `geometry/`（`resolveDrawingPointer` 以可选 `magnet` 配置调用本模块）。
- 命中、框选、标签等只读路径：不得传入磁吸配置，否则范围会随吸附漂移。

## 目录结构

```text
magnet/
├── types.ts                # 磁吸档位、配置与吸附结果契约
└── impl/
    └── magnetSnapper.ts    # snapPointerToOhlc 纯函数与吸附半径常量
```

## 依赖

- `@/controllers/types.js`：`DrawingViewportPort`、`PaneLayoutInfo`（坐标/索引换算与 OHLC 数据）。

## 约定

- 实现保持纯函数、无状态，仅经 `resolveDrawingPointer` 的可选 `magnet` 参数在落点/预览路径生效。
- 磁吸只作用于落点与预览路径；命中、框选、标签等只读路径不得开启磁吸。
