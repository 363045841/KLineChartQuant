# magnet — 绘图磁吸

`engine/drawing/magnet/` 承载绘图磁吸：把指针落点吸附到 OHLC、图元的线与指标值。
对外契约在 `types.ts`，实现在 `impl/`。设计决策见
`docs/design/drawing/magnet-candidates.md`。

## 模块边界

本目录负责：

- 档位契约：`MagnetMode`（off/weak/strong）、`ActiveMagnetMode`、`MagnetSnapConfig`。
- 候选契约：`SnapCandidate`、`SnapLine`、`SnapSource`、`SnapIndicatorValue`。
- 纯函数 `snapPointer`：采集候选 → 按屏幕距离选择 → 生成落点。

本目录不负责：

- 档位会话状态与修饰键（Ctrl/Meta/Shift）分发：属 `interaction/`。
- 候选数据来源：`getSnapLines` / `getIndicatorValues` 由适配器提供，磁吸只读。
- 命中、框选、标签等只读路径：不得传入磁吸配置，否则范围会随吸附漂移。

## 档位语义

| 档位 | 候选 | 半径 | X 行为 |
|------|------|------|--------|
| off  | — | — | 不吸附 |
| weak | OHLC 四值 + 图元线 + 指标值 | 8px | 命中时间锚点用其 X，否则落 Bar 中心 |
| strong | 同上 | 24px | 同上 |

- 两个档位的候选集合相同，只有半径不同——strong 是「够得着的范围更大」，不是无限吸附。

- 距离按候选语义取：点候选二维，值线只比 Y，时间锚点只比 X。
- 同距离先比来源优先级（图元线 / 指标值优先于 OHLC），再比候选 id。
- 全部坐标是 Pane 局部逻辑像素；本模块不读写 `pane.top`。

## 目录结构

```text
magnet/
├── types.ts              # 档位、候选、候选源与结果契约
├── README.md             # 本文
└── impl/
    └── snapPointer.ts    # 采集 / 选择 / 应用三段纯函数
```

## 依赖

- `@/controllers/types.js`：`DrawingViewportPort`、`PaneLayoutInfo`（坐标与 OHLC）。
- `@/foundation/plugin`：`SnapLine`（帧投影产出的可吸附线段）。

## 约定

- 保持纯函数、无状态，仅经 `resolveDrawingPointer` 的可选 `magnet` 参数生效。
- 候选必须来自**已提交层**：拖拽中的图元由调用方按 id 排除。
