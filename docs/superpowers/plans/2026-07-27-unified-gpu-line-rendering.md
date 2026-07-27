# GPU 线条 PPI 适配补全计划

**目标：** 补全 `32842bffde098c613a99fd9db0597aa16ef9c020` 遗留的非整数 DPR
线宽和滚动后像素吸附问题，不改动其他渲染行为。

**设计：** `docs/superpowers/specs/2026-07-27-unified-gpu-line-rendering-design.md`

## 范围约束

- 保留 4x MSAA。
- 保留现有 native line 和 triangle 实现。
- 不修改 join、cap、resolve、composite 和帧模型。
- 不追求 WebGL 与 WebGPU 像素级一致。
- 不引入软件抗锯齿。

## Task 1：用失败测试固定 PPI 缺口

**Files:**

- `packages/core/src/rendering/render/__tests__/physicalLine.test.ts`
- `packages/core/src/rendering/render/__tests__/webglRenderer.test.ts`
- `packages/core/src/rendering/render/__tests__/webgpuRenderer.test.ts`

- [ ] 增加 `width = 1, dpr = 1.25` 保持 `logicalWidth = 1` 的测试。
- [ ] 增加 DPR 1 / 1.25 / 1.5 / 2 连续物理宽度测试。
- [ ] 增加小于 1 physical px 时提升到 1 physical px 的测试。
- [ ] 增加连续宽度下水平、垂直线吸附测试。
- [ ] 增加 fractional `scrollLeft` 下垂直线最终屏幕坐标吸附测试。
- [ ] 增加 1 physical px 走 native、超过 1 physical px 走 triangle 的后端测试。

运行：

```powershell
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/physicalLine.test.ts src/rendering/render/__tests__/webglRenderer.test.ts src/rendering/render/__tests__/webgpuRenderer.test.ts
```

新测试应先因整数宽度量化或忽略 `scrollLeft` 而失败。

## Task 2：修复公共 PPI 预处理

**File:** `packages/core/src/rendering/render/physicalLine.ts`

- [ ] 把 `max(1, round(width * dpr))` 改为 `max(1, width * dpr)`。
- [ ] 逻辑宽度继续回写为 `physicalWidth / dpr`。
- [ ] 轴向中心按连续物理宽度的一侧边缘吸附。
- [ ] 让垂直线吸附计入 `scrollLeft`，并还原为后端需要的世界坐标。
- [ ] 斜线保持原始顶点。
- [ ] 不改 `DrawLineStrip.width` 的 CSS 像素契约。

## Task 3：接通两个 GPU 后端

**Files:**

- `packages/core/src/rendering/render/createWebGLRenderer.ts`
- `packages/core/src/rendering/render/createWebGPURenderer.ts`
- `packages/core/src/engine/renderers/webgl/candleSurface.ts`

- [ ] 两个后端都把 `scrollLeft` 传给公共预处理。
- [ ] native/triangle 判断使用连续物理宽度，而不是取整后的宽度。
- [ ] WebGL `LineWebGLSurface` 继续接收逻辑坐标和逻辑宽度。
- [ ] WebGL surface 使用连续物理宽度选择 native/triangle 路径。
- [ ] WebGPU 继续使用现有 `line-strip` / `line-wide` pipeline。
- [ ] 不修改 MSAA 配置和 surface 合成流程。

## Task 4：验证

运行定向测试：

```powershell
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/rendering/render/__tests__/physicalLine.test.ts src/rendering/render/__tests__/webglRenderer.test.ts src/rendering/render/__tests__/webgpuRenderer.test.ts
```

运行 core 测试与构建：

```powershell
$env:TZ='Asia/Shanghai'; pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart-core build
```

手工检查 DPR 1 / 1.25 / 1.5 / 2：

- [ ] `1 CSS px` 线宽随 DPR 连续变化。
- [ ] 水平线没有明显像素边界漂移。
- [ ] 滚动后的垂直线仍正确吸附。
- [ ] WebGL 和 WebGPU 均保持 4x MSAA。
