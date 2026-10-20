/** Renderer 替身只实现公共原语；类型检查阻止重新引入可见 surface 或旧绘制 API。 */
import { vi } from 'vitest'
import type { PaintPrimitive } from '@/rendering/primitives/types'
import type { Renderer, RendererName } from '../../Renderer'

/** 只声明后端名称差异，其余 spy 构造共用。 */
export function createMockRenderer(options: { capsName?: RendererName } = {}) {
  const primitives = {
    paint: vi.fn(
      (_target: CanvasRenderingContext2D, _primitives: readonly PaintPrimitive[], _dpr: number) =>
        true,
    ),
    dispose: vi.fn(),
  }
  return {
    caps: { name: options.capsName ?? 'webgl2' },
    primitives,
    dispose: vi.fn(() => primitives.dispose()),
  } satisfies Renderer
}
