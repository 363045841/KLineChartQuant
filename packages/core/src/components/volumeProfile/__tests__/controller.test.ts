import { describe, expect, it } from 'vitest'

import { createVolumeProfileController } from '../impl/createVolumeProfileController'

const bar = { low: 10, high: 11, close: 10.5, volume: 10 }

describe('createVolumeProfileController', () => {
  it('空输入清空状态，dispose 后所有 mutator 静默', () => {
    const controller = createVolumeProfileController()
    controller.ingest([bar])
    expect(controller.state.peek()).not.toBeNull()

    controller.ingest([])
    expect(controller.state.peek()).toBeNull()

    controller.dispose()
    controller.ingest([bar])
    expect(controller.state.peek()).toBeNull()
  })

  it('重新 ingest 从零重算总量，并给出 POC/VA 价格', () => {
    const controller = createVolumeProfileController()
    controller.ingest([bar])
    const first = controller.state.peek()!

    controller.ingest([{ ...bar, volume: 20 }])
    const second = controller.state.peek()!

    expect(first.totalVolume).toBeCloseTo(10)
    expect(second.totalVolume).toBeCloseTo(20)
    expect(second.poc).toBeGreaterThanOrEqual(bar.low)
    expect(second.poc).toBeLessThanOrEqual(bar.high)
    expect(second.val).toBeLessThanOrEqual(second.poc)
    expect(second.vah).toBeGreaterThanOrEqual(second.poc)
  })

  it('buckets 每次读取返回副本，外部修改不影响后续快照', () => {
    const controller = createVolumeProfileController()
    controller.ingest([bar])

    const buckets = controller.state.peek()!.buckets
    buckets.fill(0)

    const reread = controller.state.peek()!
    expect(reread.buckets.reduce((sum, value) => sum + value, 0)).toBeCloseTo(reread.totalVolume)
    expect(reread.totalVolume).toBeCloseTo(10)
  })

  it('binCount 变化使旧桶失效，其它配置变化保留当前快照', () => {
    const controller = createVolumeProfileController()
    controller.ingest([bar])
    const before = controller.state.peek()

    controller.setConfig({ valueAreaPercent: 0.9 })
    expect(controller.state.peek()).toBe(before)

    controller.setConfig({ binCount: 50 })
    expect(controller.state.peek()).toBeNull()
  })

  it('初始化时夹住越界配置', () => {
    const controller = createVolumeProfileController({
      config: { binCount: 0, valueAreaPercent: 2 },
    })
    expect(controller.config.peek()).toMatchObject({ binCount: 1, valueAreaPercent: 1 })
  })
})
