# 可见表面 canvas 进入正式契约

`SurfaceBackend` 保持纯生命周期契约（可用性、尺寸、区域、清屏、合成、销毁），把「持有可挂到 DOM 的可见 canvas」拆成独立能力契约 `VisibleSurface`，并提供结构判别函数。消费方不再对 surface 强转取 canvas。

## 问题

`docs/design/webgl-visible-scene-canvas.md` 已确立「GPU 可见 canvas 直接叠到 2D 层下方」的分层要求，但基础契约 `SurfaceBackend` 没有 `canvas`，WebGL / WebGPU 后端各自用交叉类型补一个 `canvas` 字段。于是 `Chart.syncGpuSceneCanvas` 只能写：

```ts
const surface = this.rendererHost.renderer.surface as { canvas?: HTMLCanvasElement }
```

强转掩盖了真实的分层边界：契约缺字段，实现细节从强转泄漏；而 Canvas2D 后端本就没有可见 canvas，把它塞进基础契约会强行要求一个无意义的字段。

## 契约

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

## 消费方

`Chart.syncGpuSceneCanvas` 改用 `getVisibleCanvas(this.rendererHost.renderer.surface)`；返回 `null`（当前为 Canvas2D 后端）时直接移除 GPU 层。canvas 的分层挂载规则仍由 `Chart` 负责，`SurfaceBackend` 不感知 DOM。

## 边界

`SurfaceBackend` 仍是 `Renderer.surface` 的静态类型；`VisibleSurface` 是可选能力，不改变 `Renderer` 契约。其他需要区分「GPU 表面 vs 2D 表面」的场景复用 `isVisibleSurface`，不再新增交叉类型。
