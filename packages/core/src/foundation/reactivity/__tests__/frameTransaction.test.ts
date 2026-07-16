import { describe, it, expect, vi } from 'vitest'

import { createFrameTransaction } from '../frameTransaction'

type Input = { x: number; y: number }
type Snapshot = { generation: number; x: number; y: number; sum: number }

describe('createFrameTransaction', () => {
  it('coalesces many writeInput into one published snapshot on flush', () => {
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
    })
    const listener = vi.fn()
    ft.published$.subscribe(listener)

    ft.writeInput({ x: 1 })
    ft.writeInput({ x: 2, y: 3 })
    ft.writeInput({ x: 10 })
    expect(listener).not.toHaveBeenCalled()

    const snap = ft.flush()
    expect(snap).toEqual({ generation: 1, x: 10, y: 3, sum: 13 })
    expect(ft.published$.peek()).toEqual(snap)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('bumps generation only on successful flush', () => {
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
    })
    expect(ft.generation).toBe(0)
    ft.writeInput({ x: 1 })
    ft.flush()
    expect(ft.generation).toBe(1)
    ft.writeInput({ y: 2 })
    ft.flush()
    expect(ft.generation).toBe(2)
  })

  it('does not publish when derive throws; generation stays', () => {
    let fail = false
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => {
        if (fail) throw new Error('derive-fail')
        return { generation, x: input.x, y: input.y, sum: input.x + input.y }
      },
    })
    fail = true
    ft.writeInput({ x: 5 })
    expect(() => ft.flush()).toThrow('derive-fail')
    expect(ft.generation).toBe(0)
    expect(ft.published$.peek().generation).toBe(0)

    fail = false
    // 失败帧应保留 pending，无需再次 write 也能重试
    const snap = ft.flush()
    expect(snap.generation).toBe(1)
    expect(snap.x).toBe(5)
  })

  it('routes writeInput during render into next generation only', () => {
    const seen: number[] = []
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
      render: (snapshot) => {
        seen.push(snapshot.x)
        // re-entrant high-frequency write during paint
        ft.writeInput({ x: 99 })
      },
    })
    ft.writeInput({ x: 1 })
    const first = ft.flush()
    expect(first.x).toBe(1)
    expect(seen).toEqual([1])
    // re-entrant write not published yet
    expect(ft.published$.peek().x).toBe(1)
    const second = ft.flush()
    expect(second.x).toBe(99)
    expect(second.generation).toBe(2)
  })

  it('flush with no pending input returns published snapshot without notify', () => {
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 1, y: 2 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
    })
    // seed first publish
    ft.writeInput({ x: 1, y: 2 })
    ft.flush()
    const listener = vi.fn()
    ft.published$.subscribe(listener)
    const again = ft.flush()
    expect(again.generation).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('select publishes only when selected value changes by equality', () => {
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
    })
    const selected = ft.select((s) => s.x)
    const listener = vi.fn()
    selected.subscribe(listener)

    ft.writeInput({ x: 1, y: 0 })
    ft.flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(selected.peek()).toBe(1)

    ft.writeInput({ x: 1, y: 9 })
    ft.flush()
    // x unchanged
    expect(listener).toHaveBeenCalledTimes(1)

    ft.writeInput({ x: 2 })
    ft.flush()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(selected.peek()).toBe(2)
  })

  it('scheduleFlush coalesces to one raf-style runner', () => {
    const runners: Array<() => void> = []
    const schedule = (run: () => void) => {
      runners.push(run)
      return 1
    }
    const ft = createFrameTransaction<Input, Snapshot>({
      initialInput: { x: 0, y: 0 },
      derive: (input, generation) => ({
        generation,
        x: input.x,
        y: input.y,
        sum: input.x + input.y,
      }),
      schedule,
    })
    ft.writeInput({ x: 1 })
    ft.scheduleFlush()
    ft.writeInput({ x: 2 })
    ft.scheduleFlush()
    expect(runners).toHaveLength(1)
    runners[0]!()
    expect(ft.published$.peek().x).toBe(2)
    expect(ft.generation).toBe(1)
  })
})
