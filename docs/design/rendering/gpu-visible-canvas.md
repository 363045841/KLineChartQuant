# GPU 可见画布

## 直接叠放

WebGL 与 WebGPU 的场景 canvas 都直接挂载在每个 pane 的主 canvas 与 overlay canvas 之间。GPU 渲染的图元不再用 `drawImage` 复制进 Canvas2D。

原因：旧 WebGL 路径把每个 GPU 渲染层复制进 pane 的 Canvas2D canvas，多个指标因此在一帧内重复整块 GPU→2D 拷贝。直接 DOM 合成让浏览器在呈现时一次性把 GPU canvas 与透明 Canvas2D 层合并。

## 渲染规则

- Canvas2D 保持在 GPU canvas 之上，并在 GPU 绘制返回 `false` 时作为 fail-closed 回退。
- GPU 填充把 alpha 烘进绘制颜色，因为不再有 Canvas2D 合成步骤来应用 `globalAlpha`。
- Overlay pass 绑定 GPU 区域但不清理，因此不会擦除主 GPU 结果。

## WebGL 抗锯齿

WebGL 拥有一个由所有 pane 与 GPU 图元共享的整绘图区 MSAA 颜色缓冲。所有绘制经既有 region viewport 与 scissor 写入该缓冲；`Renderer.endFrame()` 把它一次性 resolve 到可见 canvas。这样蜡烛、线条和填充与 WebGPU 使用同一套 4x-MSAA 目标模型，并防止某条线渲染器在自身 resolve 时替换已绘制的蜡烛像素。

WebGL shader 按每个 region 的物理缓冲尺寸投影。蜡烛边缘在投影前对齐到物理像素，与 WebGPU 一致，因此 MSAA 让斜向几何保持平滑，而不会软化轴对齐的实体与影线。

## 帧边界

`SharedWebGLSurface` 在两个显式层级拥有 GPU 状态：

- `beginFrame()` 绑定并可选清理完整的 MSAA 目标。
- `bindRegion()` 是 pane 作用域，在该帧活动期间只设置 viewport 与 scissor。
- `endFrame()` 关闭 pane scissor，把整个目标 resolve 一次，并恢复中性 framebuffer 状态。

Pane renderer 不能自行清理或 resolve 共享目标。

## 可见表面契约

基础契约 `SurfaceBackend` 保持纯生命周期（可用性、尺寸、区域、清屏、合成、销毁），不包含 `canvas`。此前 WebGL / WebGPU 后端各自用交叉类型补一个 `canvas` 字段，`Chart.syncGpuSceneCanvas` 只能强转取 canvas：

```ts
const surface = this.rendererHost.renderer.surface as { canvas?: HTMLCanvasElement }
```

强转掩盖了真实的分层边界：契约缺字段，实现细节从强转泄漏；而 Canvas2D 后端本就没有可见 canvas，把它塞进基础契约会强行要求一个无意义的字段。

因此把「持有可挂到 DOM 的可见 canvas」拆成独立能力契约：

```ts
export interface VisibleSurface extends SurfaceBackend {
  readonly canvas: HTMLCanvasElement
}

export function isVisibleSurface(surface: SurfaceBackend): surface is VisibleSurface {
  return 'canvas' in surface
}

export function getVisibleCanvas(surface: SurfaceBackend): HTMLCanvasElement | null {
  return isVisibleSurface(surface) ? surface.canvas : null
}
```

- WebGL / WebGPU 后端实现 `VisibleSurface`；Canvas2D 后端不实现。
- 判别用结构检查 `'canvas' in surface`，不依赖 `HTMLCanvasElement` 等 DOM 全局对象，因此 Node 环境下可测。
- 强转收敛为 0：取 canvas 统一走 `getVisibleCanvas`。

消费方 `Chart.syncGpuSceneCanvas` 改用 `getVisibleCanvas(this.rendererHost.renderer.surface)`；返回 `null`（当前为 Canvas2D 后端）时直接移除 GPU 层。canvas 的分层挂载规则仍由 `Chart` 负责，`SurfaceBackend` 不感知 DOM。

`SurfaceBackend` 仍是 `Renderer.surface` 的静态类型；`VisibleSurface` 是可选能力，不改变 `Renderer` 契约。其他需要区分「GPU 表面 vs 2D 表面」的场景复用 `isVisibleSurface`，不再新增交叉类型。
