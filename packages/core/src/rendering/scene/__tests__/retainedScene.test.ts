import { describe, expect, it } from 'vitest'

import { createRetainedScene } from '../retainedScene'

describe('createRetainedScene', () => {
  it('upserts by key and replaces geometry when revision changes', () => {
    const scene = createRetainedScene()
    scene.beginFrame(1)
    scene.upsert({
      kind: 'rects',
      key: 'main/candle/upBody',
      revision: 1,
      instances: new Float32Array([0, 0, 1, 2]),
      count: 1,
      color: '#0f0',
      scrollLeft: 0,
      z: 10,
      paneId: 'main',
    })
    scene.upsert({
      kind: 'rects',
      key: 'main/candle/upBody',
      revision: 2,
      instances: new Float32Array([1, 1, 1, 2]),
      count: 1,
      color: '#0f0',
      scrollLeft: 5,
      z: 10,
      paneId: 'main',
    })
    const nodes = scene.collectVisible('main')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.revision).toBe(2)
    expect(nodes[0]?.scrollLeft).toBe(5)
  })

  it('prunes keys not touched for N frames', () => {
    const scene = createRetainedScene({ staleFrames: 2 })
    scene.beginFrame(1)
    scene.upsert({
      kind: 'rects',
      key: 'a',
      revision: 1,
      instances: new Float32Array(4),
      count: 1,
      color: '#fff',
      scrollLeft: 0,
      z: 0,
      paneId: 'main',
    })
    scene.endFrame()
    scene.beginFrame(2)
    scene.endFrame()
    scene.beginFrame(3)
    const removed = scene.prune()
    expect(removed).toEqual(['a'])
    expect(scene.collectVisible('main')).toEqual([])
  })
})
