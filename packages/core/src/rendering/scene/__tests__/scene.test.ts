/**
 * Behaviour tests for `createScene`.
 *
 * 覆盖契约：
 * - add / get / remove round-trips
 * - `layers` signal 在成员变化时触发
 * - `paint` 尊重 pane 归属、可见性、z 顺序与注册顺序
 * - 逐 Layer 异常隔离
 * - dispose 拆除全部 Layer 并冻结 Scene
 *
 * `MockLayer` 伪造 Layer 的绘制侧；不构造真实 GPU 资源。帧上下文在测试中
 * 以一个普通对象透传（`Layer<FrameStub>`），Scene 不感知其结构。
 */

import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import { createScene } from '../createScene'
import {
  type ContextLayer,
  type DrawListLayer,
  LAYER_PANE_GLOBAL,
  type Layer,
  type LayerPaint,
  type LayerRole,
  type SceneFrame,
} from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** 帧上下文桩：Scene 只透传，测试只关心是否被调用。 */
type FrameStub = { tag: string }

interface MockLayerOpts {
  id: string
  role: LayerRole
  pane: string
  z: number
  visible?: boolean
  onPaint?: () => void
  onDispose?: () => void
}

interface MockLayer extends ContextLayer<FrameStub> {
  paintCalls: Array<LayerPaint<FrameStub>>
  disposeCalls: number
}

function makeMockLayer(opts: MockLayerOpts): MockLayer {
  const paintCalls: Array<LayerPaint<FrameStub>> = []
  let disposeCalls = 0
  const layer: MockLayer = {
    id: opts.id,
    role: opts.role,
    pane: opts.pane,
    z: opts.z,
    visible: opts.visible ?? true,
    kind: 'context',
    paint: (ctx) => {
      paintCalls.push(ctx)
      opts.onPaint?.()
    },
    dispose: () => {
      disposeCalls += 1
      opts.onDispose?.()
    },
    get paintCalls() {
      return paintCalls
    },
    get disposeCalls() {
      return disposeCalls
    },
  }
  return layer
}

/** 构造一次帧：单个 pane。 */
function frame(paneId: string, clear = false, roles?: ReadonlyArray<LayerRole>): SceneFrame {
  return {
    panes: [
      {
        paneId,
        context: { tag: paneId },
        renderer: createMockRenderer(),
        targets: {
          main: createMockCanvasContext(),
          drawing: createMockCanvasContext(),
          overlay: createMockCanvasContext(),
        },
        frameNumber: 0,
        deltaMs: 0,
        roles,
        clear,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createScene', () => {
  it('selects each pane target before painting and keeps drawing separate from the main target', () => {
    const scene = createScene<FrameStub>()
    const input = frame('main')
    const targets = input.panes[0]!.targets
    const painted: CanvasRenderingContext2D[] = []
    for (const [id, role] of [
      ['main', 'primary'],
      ['drawing', 'drawing'],
      ['overlay', 'overlay'],
    ] as const) {
      scene.addLayer({
        id,
        pane: 'main',
        role,
        z: 0,
        visible: true,
        paint(context) {
          painted.push(context.ctx)
        },
        dispose() {},
      })
    }
    scene.paint(input)
    expect(painted).toEqual([targets.main, targets.drawing, targets.overlay])
    for (const target of Object.values(targets)) {
      expect(target?.save).toHaveBeenCalledOnce()
      expect(target?.restore).toHaveBeenCalledOnce()
      expect(target?.clearRect).not.toHaveBeenCalled()
    }
  })

  it('injects the same target-bound primitives submitter into ctx and draw-list layers', () => {
    const scene = createScene<FrameStub>()
    const renderer = createMockRenderer()
    const main = createMockCanvasContext()
    const input: SceneFrame = {
      panes: [
        {
          paneId: 'main',
          context: { tag: 'main' },
          renderer,
          targets: { main, drawing: null, overlay: null },
          frameNumber: 0,
          deltaMs: 0,
          clear: false,
        },
      ],
    }
    const circle = (x: number) =>
      ({ kind: 'circle', x, y: 0, radius: 1, color: '#ffffff' }) as const
    const contextLayer: ContextLayer<FrameStub> = {
      id: 'context',
      role: 'primary',
      pane: 'main',
      z: 0,
      visible: true,
      paint(context) {
        context.primitives!([circle(1)], 1)
      },
      dispose() {},
    }
    const drawListLayer: DrawListLayer<FrameStub> = {
      id: 'draw-list',
      role: 'primary',
      pane: 'main',
      z: 1,
      visible: true,
      kind: 'draw-list',
      paint(context) {
        context.primitives!([circle(2)], 1)
      },
      dispose() {},
    }
    scene.addLayer(contextLayer)
    scene.addLayer(drawListLayer)
    scene.paint(input)

    // 两种图层都必须以 (primitives, dpr) 调用，目标由 Scene 绑定；传错形状会抛 not iterable。
    expect(renderer.primitives.paint).toHaveBeenCalledTimes(2)
    const [firstTarget, firstBatch] = renderer.primitives.paint.mock.calls[0]!
    expect(firstTarget).toBe(main)
    expect(firstBatch).toEqual([circle(1)])
    const [secondTarget, secondBatch] = renderer.primitives.paint.mock.calls[1]!
    expect(secondTarget).toBe(main)
    expect(secondBatch).toEqual([circle(2)])
  })

  it('addLayer then getLayer round-trips by id', () => {
    const scene = createScene<FrameStub>()
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    scene.addLayer(a)
    expect(scene.getLayer('a')).toBe(a)
    expect(scene.getLayer('missing')).toBeNull()
  })

  it('removeLayer returns true on hit and false on miss', () => {
    const scene = createScene<FrameStub>()
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    scene.addLayer(a)
    expect(scene.removeLayer('missing')).toBe(false)
    expect(scene.removeLayer('a')).toBe(true)
    expect(scene.getLayer('a')).toBeNull()
    expect(scene.removeLayer('a')).toBe(false)
  })

  it('removeLayer disposes the detached layer exactly once', () => {
    const scene = createScene<FrameStub>()
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    scene.addLayer(a)

    expect(scene.removeLayer('a')).toBe(true)
    expect(a.disposeCalls).toBe(1)

    // 已移除的层不再被 scene.dispose 二次释放
    scene.dispose()
    expect(a.disposeCalls).toBe(1)
  })

  it('dispose isolates a throwing layer and still releases siblings', () => {
    const scene = createScene<FrameStub>()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = makeMockLayer({
      id: 'boom',
      role: 'primary',
      pane: 'main',
      z: 0,
      onDispose: () => {
        throw new Error('cleanup failed')
      },
    })
    const ok = makeMockLayer({ id: 'ok', role: 'primary', pane: 'main', z: 1 })
    scene.addLayer(boom)
    scene.addLayer(ok)

    expect(() => scene.dispose()).not.toThrow()
    expect(boom.disposeCalls).toBe(1)
    expect(ok.disposeCalls).toBe(1)
    errorLog.mockRestore()
  })

  it('layers signal fires on add and remove with a NEW array reference', () => {
    const scene = createScene<FrameStub>()
    const seen: ReadonlyArray<Layer<FrameStub>>[] = []
    const unsubscribe = scene.layers.subscribe(() => {
      seen.push(scene.layers.peek())
    })
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    const b = makeMockLayer({ id: 'b', role: 'primary', pane: 'main', z: 1 })
    scene.addLayer(a)
    scene.addLayer(b)
    scene.removeLayer('a')
    unsubscribe()

    expect(seen).toHaveLength(3)
    const refs = new Set(seen)
    expect(refs.size).toBe(3)
    expect(seen[2]?.map((l) => l.id)).toEqual(['b'])
  })

  it('duplicate id on addLayer is silently ignored (first wins)', () => {
    const scene = createScene<FrameStub>()
    const first = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    const imposter = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 9 })
    scene.addLayer(first)
    scene.addLayer(imposter)
    expect(scene.getLayer('a')).toBe(first)
    expect(scene.layers.peek()).toHaveLength(1)
  })

  it('setLayerVisibility toggles the field on the existing layer', () => {
    const scene = createScene<FrameStub>()
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    scene.addLayer(a)
    expect(a.visible).toBe(true)
    expect(scene.setLayerVisibility('a', false)).toBe(true)
    expect(a.visible).toBe(false)
    expect(scene.setLayerVisibility('a', true)).toBe(true)
    expect(a.visible).toBe(true)
    expect(scene.setLayerVisibility('missing', false)).toBe(false)
  })

  it('paint calls paint() on every matching layer in z order', () => {
    const scene = createScene<FrameStub>()
    const order: string[] = []
    scene.addLayer(
      makeMockLayer({
        id: 'a',
        role: 'primary',
        pane: 'main',
        z: 5,
        onPaint: () => order.push('a'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'b',
        role: 'primary',
        pane: 'main',
        z: 1,
        onPaint: () => order.push('b'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'c',
        role: 'overlay',
        pane: 'main',
        z: 3,
        onPaint: () => order.push('c'),
      }),
    )
    scene.paint(frame('main'))
    // main 目标内按 z 排序，overlay 层带始终与实际 DOM 一样位于其上。
    expect(order).toEqual(['b', 'a', 'c'])
  })

  it('paint skips invisible layers', () => {
    const scene = createScene<FrameStub>()
    const order: string[] = []
    scene.addLayer(
      makeMockLayer({
        id: 'a',
        role: 'primary',
        pane: 'main',
        z: 0,
        visible: false,
        onPaint: () => order.push('a'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'b',
        role: 'primary',
        pane: 'main',
        z: 1,
        onPaint: () => order.push('b'),
      }),
    )
    scene.paint(frame('main'))
    expect(order).toEqual(['b'])
    scene.setLayerVisibility('a', true)
    scene.paint(frame('main'))
    expect(order).toEqual(['b', 'a', 'b'])
  })

  it('paint skips layers from other panes, keeps global layers', () => {
    const scene = createScene<FrameStub>()
    const order: string[] = []
    scene.addLayer(
      makeMockLayer({
        id: 'main-1',
        role: 'primary',
        pane: 'main',
        z: 0,
        onPaint: () => order.push('main-1'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'sub-1',
        role: 'primary',
        pane: 'RSI_0',
        z: 1,
        onPaint: () => order.push('sub-1'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'global-1',
        role: 'background',
        pane: LAYER_PANE_GLOBAL,
        z: 2,
        onPaint: () => order.push('global-1'),
      }),
    )

    scene.paint(frame('main'))
    expect(order).toEqual(['main-1', 'global-1'])

    order.length = 0
    scene.paint(frame('RSI_0'))
    expect(order).toEqual(['sub-1', 'global-1'])
  })

  it('paint filters by role when roles are provided', () => {
    const scene = createScene<FrameStub>()
    const order: string[] = []
    scene.addLayer(
      makeMockLayer({
        id: 'primary',
        role: 'primary',
        pane: 'main',
        z: 0,
        onPaint: () => order.push('primary'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'overlay',
        role: 'overlay',
        pane: 'main',
        z: 1,
        onPaint: () => order.push('overlay'),
      }),
    )
    scene.paint(frame('main', false, ['overlay']))
    expect(order).toEqual(['overlay'])
  })

  it('injects paneId and clear into the layer paint context', () => {
    const scene = createScene<FrameStub>()
    const seen: Array<LayerPaint<FrameStub>> = []
    scene.addLayer(
      makeMockLayer({
        id: 'a',
        role: 'primary',
        pane: 'main',
        z: 0,
        onPaint: undefined,
      }),
    )
    const layer = scene.getLayer('a') as MockLayer
    layer.paint = ((ctx) => {
      seen.push(ctx)
    }) as MockLayer['paint']

    scene.paint(frame('main', true))
    expect(seen[0]).toMatchObject({ tag: 'main', paneId: 'main', clear: true })
  })

  it('one layer throw does not abort sibling layers', () => {
    const scene = createScene<FrameStub>()
    const ok = vi.fn()
    const boom = vi.fn(() => {
      throw new Error('boom')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    scene.addLayer(
      makeMockLayer({ id: 'boom', role: 'primary', pane: 'main', z: 0, onPaint: boom }),
    )
    scene.addLayer(makeMockLayer({ id: 'ok', role: 'primary', pane: 'main', z: 1, onPaint: ok }))

    expect(() => scene.paint(frame('main'))).not.toThrow()
    expect(boom).toHaveBeenCalledOnce()
    expect(ok).toHaveBeenCalledOnce()
    err.mockRestore()
  })

  it('dispose tears down every layer and freezes the scene', () => {
    const scene = createScene<FrameStub>()
    const a = makeMockLayer({ id: 'a', role: 'primary', pane: 'main', z: 0 })
    const b = makeMockLayer({ id: 'b', role: 'primary', pane: 'main', z: 1 })
    scene.addLayer(a)
    scene.addLayer(b)

    scene.dispose()
    expect(a.disposeCalls).toBe(1)
    expect(b.disposeCalls).toBe(1)
    expect(scene.layers.peek()).toEqual([])

    // A fresh layer object — addLayer must silently no-op, the scene is dead.
    const late = makeMockLayer({ id: 'late', role: 'primary', pane: 'main', z: 2 })
    scene.addLayer(late)
    expect(scene.getLayer('late')).toBeNull()
    expect(() => scene.paint(frame('main'))).not.toThrow()
    expect(a.paintCalls).toHaveLength(0)
  })
})
