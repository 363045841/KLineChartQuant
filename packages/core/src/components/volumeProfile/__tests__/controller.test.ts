import { expect, it } from 'vitest'
import { createVolumeProfileController } from '../impl/createVolumeProfileController'

it('keeps previously published buckets consistent and protects the current snapshot', () => {
  const controller = createVolumeProfileController()
  const bar = { low: 10, high: 11, close: 10.5, volume: 10 }
  controller.ingest([bar])
  const before = controller.state.peek()!
  controller.ingest([{ ...bar, volume: 20 }])
  const current = controller.state.peek()!
  current.buckets.fill(0)
  expect(before.buckets.reduce((sum, value) => sum + value, 0)).toBeCloseTo(before.totalVolume)
  expect(current.buckets.reduce((sum, value) => sum + value, 0)).toBeCloseTo(current.totalVolume)
  expect(before.totalVolume).toBeCloseTo(10)
  expect(current.totalVolume).toBeCloseTo(20)
})
