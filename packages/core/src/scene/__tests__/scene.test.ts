/**
 * Behaviour tests for `createScene`.
 *
 * The tests exercise the documented contract:
 * - add / get / remove round-trips
 * - the `layers` signal fires on membership change
 * - paintPane respects paneRole, visibility, z-order, and registration order
 * - dispose tears down every layer and freezes the scene
 *
 * `MockLayer` fakes the Renderer-touching side of a layer; we do not
 * construct any real GPU resources here. The Renderer parameter passed
 * to `paint` is a stub stamped onto the `PaintContext` — layers in this
 * test don't read it, they only record they were called.
 */

import { describe, it, expect } from 'vitest'

import type { Renderer } from '../../render/Renderer'
import { createScene } from '../createScene'
import type { Layer, LayerRole, PaintContext, PaneRole } from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MockLayerOpts {
  id: string
  role: LayerRole
  paneRole: PaneRole
  z: number
  visible?: boolean
  onPaint?: (ctx: PaintContext) => void
  onDispose?: () => void
}

interface MockLayer extends Layer {
  paintCalls: PaintContext[]
  disposeCalls: number
}

function makeMockLayer(opts: MockLayerOpts): MockLayer {
  const paintCalls: PaintContext[] = []
  let disposeCalls = 0
  const layer: MockLayer = {
    id: opts.id,
    role: opts.role,
    paneRole: opts.paneRole,
    z: opts.z,
    visible: opts.visible ?? true,
    paint: (ctx: PaintContext): void => {
      paintCalls.push(ctx)
      opts.onPaint?.(ctx)
    },
    dispose: (): void => {
      disposeCalls += 1
      opts.onDispose?.()
    },
    get paintCalls() {
      return paintCalls
    },
    get disposeCalls() {
      return disposeCalls
    },
  } as MockLayer
  return layer
}

// A minimal Renderer stub. The scene never touches its fields; we cast.
const stubRenderer = {} as Renderer

function makeCtx(paneRole: PaneRole, frameNumber = 0, paneId = 'main'): PaintContext {
  return {
    renderer: stubRenderer,
    region: { x: 0, y: 0, width: 800, height: 600, dpr: 1 },
    paneRole,
    paneId,
    frameNumber,
    deltaMs: 0,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createScene', () => {
  it('addLayer then getLayer round-trips by id', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    scene.addLayer(a)
    expect(scene.getLayer('a')).toBe(a)
    expect(scene.getLayer('missing')).toBeNull()
  })

  it('removeLayer returns true on hit and false on miss', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    scene.addLayer(a)
    expect(scene.removeLayer('missing')).toBe(false)
    expect(scene.removeLayer('a')).toBe(true)
    expect(scene.getLayer('a')).toBeNull()
    // Second remove of the same id is now a miss
    expect(scene.removeLayer('a')).toBe(false)
  })

  it('layers signal fires on add and remove with a NEW array reference', () => {
    const scene = createScene()
    const seen: ReadonlyArray<Layer>[] = []
    const unsubscribe = scene.layers.subscribe(() => {
      seen.push(scene.layers.peek())
    })
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
    })
    scene.addLayer(a)
    scene.addLayer(b)
    scene.removeLayer('a')
    unsubscribe()

    expect(seen).toHaveLength(3)
    // Every snapshot must be a fresh array — never the same reference.
    const refs = new Set(seen)
    expect(refs.size).toBe(3)
    expect(seen[2]?.map((l) => l.id)).toEqual(['b'])
  })

  it('setLayerVisibility toggles the field on the existing layer', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    scene.addLayer(a)
    expect(a.visible).toBe(true)
    expect(scene.setLayerVisibility('a', false)).toBe(true)
    expect(a.visible).toBe(false)
    expect(scene.setLayerVisibility('a', true)).toBe(true)
    expect(a.visible).toBe(true)
    expect(scene.setLayerVisibility('missing', false)).toBe(false)
  })

  it('paintPane calls paint() on every matching layer in z order', () => {
    const scene = createScene()
    const order: string[] = []
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 5,
      onPaint: () => order.push('a'),
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
      onPaint: () => order.push('b'),
    })
    const c = makeMockLayer({
      id: 'c',
      role: 'overlay',
      paneRole: 'main',
      z: 3,
      onPaint: () => order.push('c'),
    })
    scene.addLayer(a)
    scene.addLayer(b)
    scene.addLayer(c)
    scene.paintPane(makeCtx('main'))
    // z order: b (1) → c (3) → a (5)
    expect(order).toEqual(['b', 'c', 'a'])
  })

  it('paintPane skips invisible layers', () => {
    const scene = createScene()
    const order: string[] = []
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
      visible: false,
      onPaint: () => order.push('a'),
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
      onPaint: () => order.push('b'),
    })
    scene.addLayer(a)
    scene.addLayer(b)
    scene.paintPane(makeCtx('main'))
    expect(order).toEqual(['b'])
    // Flipping visibility back in via setLayerVisibility re-enables paint.
    scene.setLayerVisibility('a', true)
    scene.paintPane(makeCtx('main'))
    expect(order).toEqual(['b', 'a', 'b'])
  })

  it('paintPane skips layers from other panes', () => {
    const scene = createScene()
    const order: string[] = []
    scene.addLayer(
      makeMockLayer({
        id: 'main-1',
        role: 'primary',
        paneRole: 'main',
        z: 0,
        onPaint: () => order.push('main-1'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'sub-1',
        role: 'primary',
        paneRole: 'sub',
        z: 0,
        onPaint: () => order.push('sub-1'),
      }),
    )
    scene.paintPane(makeCtx('main'))
    expect(order).toEqual(['main-1'])
    scene.paintPane(makeCtx('sub'))
    expect(order).toEqual(['main-1', 'sub-1'])
  })

  it('ties in z are broken by registration order (stable sort)', () => {
    const scene = createScene()
    const order: string[] = []
    // All three layers share z=2; first-registered must paint first.
    scene.addLayer(
      makeMockLayer({
        id: 'first',
        role: 'indicator',
        paneRole: 'main',
        z: 2,
        onPaint: () => order.push('first'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'second',
        role: 'indicator',
        paneRole: 'main',
        z: 2,
        onPaint: () => order.push('second'),
      }),
    )
    scene.addLayer(
      makeMockLayer({
        id: 'third',
        role: 'indicator',
        paneRole: 'main',
        z: 2,
        onPaint: () => order.push('third'),
      }),
    )
    scene.paintPane(makeCtx('main'))
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('paintPane forwards the same context object to every layer', () => {
    const scene = createScene()
    const seenCtx: PaintContext[] = []
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
      onPaint: (ctx) => seenCtx.push(ctx),
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
      onPaint: (ctx) => seenCtx.push(ctx),
    })
    scene.addLayer(a)
    scene.addLayer(b)
    const ctx = makeCtx('main', 42)
    scene.paintPane(ctx)
    expect(seenCtx).toHaveLength(2)
    expect(seenCtx[0]).toBe(ctx)
    expect(seenCtx[1]).toBe(ctx)
    expect(seenCtx[0]?.frameNumber).toBe(42)
  })

  it('dispose calls dispose() on every layer exactly once', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
    })
    scene.addLayer(a)
    scene.addLayer(b)
    scene.dispose()
    expect(a.disposeCalls).toBe(1)
    expect(b.disposeCalls).toBe(1)
    // Calling dispose again is a no-op — layers must not be torn down twice.
    scene.dispose()
    expect(a.disposeCalls).toBe(1)
    expect(b.disposeCalls).toBe(1)
    expect(scene.layers.peek()).toEqual([])
  })

  it('mutations are no-ops after dispose', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    scene.addLayer(a)
    scene.dispose()
    // a fresh layer object — addLayer must silently no-op, the scene is dead
    const late = makeMockLayer({
      id: 'late',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    scene.addLayer(late)
    expect(scene.getLayer('late')).toBeNull()
    expect(scene.removeLayer('late')).toBe(false)
    expect(scene.setLayerVisibility('late', false)).toBe(false)
    // paintPane after dispose does nothing — the late layer was never added.
    expect(() => scene.paintPane(makeCtx('main'))).not.toThrow()
    expect(late.paintCalls).toHaveLength(0)
  })

  it('duplicate id on addLayer is silently ignored (first wins)', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
    })
    const aImposter = makeMockLayer({
      id: 'a',
      role: 'overlay',
      paneRole: 'sub',
      z: 99,
    })
    scene.addLayer(a)
    scene.addLayer(aImposter)
    expect(scene.getLayer('a')).toBe(a)
    expect(scene.layers.peek()).toHaveLength(1)
  })

  it('dispose continues even if a layer.dispose throws', () => {
    const scene = createScene()
    const a = makeMockLayer({
      id: 'a',
      role: 'primary',
      paneRole: 'main',
      z: 0,
      onDispose: () => {
        throw new Error('a-blew-up')
      },
    })
    const b = makeMockLayer({
      id: 'b',
      role: 'primary',
      paneRole: 'main',
      z: 1,
    })
    scene.addLayer(a)
    scene.addLayer(b)
    expect(() => scene.dispose()).not.toThrow()
    // a's onDispose ran (and threw); b's dispose still ran afterwards.
    expect(a.disposeCalls).toBe(1)
    expect(b.disposeCalls).toBe(1)
  })
})
