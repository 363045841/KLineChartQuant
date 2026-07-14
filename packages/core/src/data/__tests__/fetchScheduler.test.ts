import { describe, expect, it, vi } from 'vitest'

import { FetchScheduler } from '../fetchScheduler'

describe('FetchScheduler generations', () => {
  it('does not execute a queued task from before reset', async () => {
    const scheduler = new FetchScheduler()
    let resolveFirst!: () => void
    const first = scheduler.run(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        }),
    )
    const queuedTask = vi.fn(async () => {})
    const queued = scheduler.run(queuedTask)

    scheduler.reset()
    resolveFirst()
    await first

    await expect(queued).rejects.toThrow('invalidated')
    expect(queuedTask).not.toHaveBeenCalled()
    expect(scheduler.loading.peek()).toBe(false)
  })
})
