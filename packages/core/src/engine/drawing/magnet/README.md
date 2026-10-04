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

## 档位语义

| 档位 | 候选价格 | Y 吸附半径 | X 行为 |
|------|----------|-----------|--------|
| off  | —        | —         | 不吸附 |
| weak | high/low | 8px       | Bar 中心可解析时吸附到中心 |
| strong | high/low/open/close | 无距离门槛，始终吸最近价格 | 同上 |

- X 吸附与 Y 是否命中无关：只要 `getScreenXAtLogicalIndex(barIndex)` 非 null，X 即改写为 Bar 中心；同一 Bar 内点击因此解析出同一时间戳，差异仅在 Bar 边界半个 Bar 宽内。
- 候选遍历顺序 `[high, low, open, close]`，距离用 `<=` 比较——同距离时后遍历者胜出。
- Bar 中心不可解析且 Y 无命中（完全无吸附点）时 `snapPointerToOhlc` 返回 null，调用方使用原始坐标。

档位是会话级交互配置，不属于 StateKernel（不持久化、不派生状态、不驱动 effect）；生效档位与修饰键分发在 `interaction/`。

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
