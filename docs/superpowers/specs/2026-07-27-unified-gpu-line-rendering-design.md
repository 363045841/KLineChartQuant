# GPU 线条 PPI 适配补全设计

## 背景

提交 `32842bffde098c613a99fd9db0597aa16ef9c020` 让 WebGL 复用了 WebGPU 的
`prepareLineStripForPhysicalPixels`，解决了高 DPR 下 WebGL 始终使用
`gl.lineWidth(1)` 的问题，但没有彻底完成 PPI 适配。

当前公共规则把线宽取整到物理像素：

```ts
physicalWidth = max(1, round(width * dpr))
logicalWidth = physicalWidth / dpr
```

该规则在整数 DPR 下结果正确，但会丢失非整数 DPR 的线宽。例如
`width = 1, dpr = 1.25` 被处理成 `1 physical px / 0.8 CSS px`，实际线条仍比请求的
`1 CSS px` 窄。`32842bff` 只是把这套量化规则接入 WebGL，没有修正规则本身。

## 目标

- 保持 `DrawLineStrip.width` 的 CSS 像素语义。
- 非整数 DPR 下保留连续物理线宽，不再取整丢失 PPI 信息。
- WebGL 和 WebGPU 继续共用同一预处理规则。
- 保留现有 4x MSAA、native line 和 triangle 粗线实现。
- 只修复 PPI 适配，不调整 join、cap、合成和帧提交策略。

## 非目标

- 不统一 WebGL 与 WebGPU 的像素输出。
- 不重写折线几何。
- 不引入 coverage fringe、SDF 或其他软件抗锯齿。
- 不优化 WebGL resolve、clear 或 Canvas2D composite。
- 不修改 filled band、蜡烛图和 Canvas2D fallback。

## 根因

`physicalLineWidth` 返回整数：

```ts
Math.max(1, Math.round(width * dpr))
```

这适合做离散像素分类，不适合表达 MSAA target 上的连续几何宽度。当前后端已经具备绘制
fractional physical width 的条件：triangle 几何使用逻辑坐标，viewport 使用物理尺寸，最终宽度
自然变为 `logicalWidth * dpr`。4x MSAA 负责覆盖率，不需要先把宽度取整。

因此问题不在 WebGL shader、MSAA resolve 或二次 DPR 换算。预处理后的逻辑宽度在物理 viewport
中再次乘 DPR 是正确坐标变换。

## 设计

### 线宽规则

使用连续物理宽度，只保留 1 physical px 的下限：

```ts
physicalWidth = max(1, width * dpr)
logicalWidth = physicalWidth / dpr
```

典型结果：

| width | DPR | physicalWidth | logicalWidth |
|------:|----:|--------------:|-------------:|
| 1 | 1 | 1 | 1 |
| 1 | 1.25 | 1.25 | 1 |
| 1 | 1.5 | 1.5 | 1 |
| 1 | 2 | 2 | 1 |
| 0.5 | 1 | 1 | 1 |
| 0.5 | 2 | 1 | 0.5 |

### 后端分支

后端根据连续物理宽度选择现有路径：

```ts
physicalWidth <= 1  // native line
physicalWidth > 1   // triangle geometry
```

WebGL 的 `gl.LINE_STRIP` 和 WebGPU 的 `line-strip` 只能可靠表达 1 physical px，因此
`DPR = 1.25`、`width = 1` 必须进入 triangle 路径，才能得到 1.25 physical px，而不是退回
1 physical px。

为避免在后端重新推导已处理的宽度，可由公共 helper 返回物理宽度，或继续使用
`prepared.width * dpr`。实现优先选择最小改动，不扩展公开 `Renderer` 契约。

### 轴向像素吸附

整数奇偶判断不再适用于连续物理宽度。轴向线按线宽的一侧边缘对齐物理像素网格：

```ts
centerPx = round(value * dpr - physicalWidth / 2) + physicalWidth / 2
center = centerPx / dpr
```

该公式兼容 1 px 和 2 px，并允许 1.25 px、1.5 px 等连续宽度。水平线只调整 y，垂直线只调整
x；斜线保持原始顶点，由 MSAA 处理覆盖率。

水平线端点仍按世界坐标吸附，不随 `scrollLeft` 重建几何；端点 x 不影响水平线厚度。该行为只影响
轴向线，不改变普通指标折线形状。

### scrollLeft

垂直线的最终 x 为 `point.x - scrollLeft`。像素吸附必须基于最终屏幕坐标，否则 fractional
`scrollLeft` 会抵消预处理结果。预处理应接收 `scrollLeft`，按屏幕 x 吸附后再还原为世界坐标；
水平线的 y 不受滚动影响。

这是 `32842bff` 测试未覆盖的另一处 PPI 缺口。现有测试全部使用 `scrollLeft = 0`。

## 修改范围

- `packages/core/src/rendering/render/physicalLine.ts`
  - 连续物理线宽。
  - 支持连续宽度的轴向吸附。
  - 垂直线吸附计入 `scrollLeft`。
- `packages/core/src/rendering/render/createWebGLRenderer.ts`
  - 把 `scrollLeft` 传给预处理。
  - 使用连续物理宽度选择 native/triangle 路径。
- `packages/core/src/rendering/render/createWebGPURenderer.ts`
  - 同步公共 helper 调用参数和路径判断。
- `packages/core/src/engine/renderers/webgl/candleSurface.ts`
  - native/triangle 分支使用连续物理宽度，不再取整。
- 对应单元测试。

不修改 `candleSurface.ts` 的几何、MSAA 和 resolve 实现；它继续消费预处理后的逻辑宽度。

## 测试

### 公共规则

- `width = 1` 在 DPR 1 / 1.25 / 1.5 / 2 下分别得到 1 / 1.25 / 1.5 / 2 physical px。
- 小于 1 physical px 的请求提升到 1 physical px。
- 水平和垂直线按连续宽度吸附。
- 斜线只处理宽度，不改顶点。
- 垂直线在 fractional `scrollLeft` 下仍落在正确物理位置。

### 后端

- 1 physical px 使用 native line。
- 1.25 / 1.5 / 2 physical px 使用 triangle。
- WebGL 和 WebGPU 接收相同的预处理结果。
- 现有 4x MSAA 配置保持不变。

## 验收标准

- 非整数 DPR 下 `1 CSS px` 不再缩成 `1 physical px`。
- DPR 变化时线条 CSS 宽度保持稳定，物理覆盖宽度按 DPR 连续变化。
- fractional `scrollLeft` 不破坏垂直线的像素吸附。
- WebGL 和 WebGPU 的 native/triangle 分支依据相同物理宽度规则。
- 没有 PPI 修复之外的渲染架构改动。
