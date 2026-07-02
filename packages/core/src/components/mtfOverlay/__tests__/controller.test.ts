/**
 * MTF controller tests — series CRUD, recompute on mutation, EMA on a 1h
 * overlay against 5m bars.
 */

import { describe, it, expect, vi } from 'vitest'

import { createMtfController } from '../createMtfController'
import type { BaseBar, ResampledBar } from '../types'

const MIN = 60_000
const FIVE_MIN = 5 * MIN
const HOUR = 60 * MIN

function bar(tsMs: number, c: number, v = 10): BaseBar {
  return { timestamp: tsMs, open: c, high: c, low: c, close: c, volume: v }
}

/** A trivial "last close" compute fn for asserting against. */
const lastClose = (rs: ReadonlyArray<ResampledBar>): number[] => rs.map((r) => r.close)

describe('createMtfController — CRUD + recompute', () => {
  it('addSeries returns id and series signal fires', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100), bar(FIVE_MIN, 101)],
      baseIntervalMs: FIVE_MIN,
    })
    const listener = vi.fn()
    ctl.series.subscribe(listener)
    const id = ctl.addSeries({
      id: 'lastClose-1h',
      label: 'last close 1h',
      targetIntervalMs: HOUR,
      compute: lastClose,
    })
    expect(id).toBe('lastClose-1h')
    expect(listener).toHaveBeenCalled()
    expect(ctl.series()).toHaveLength(1)
  })

  it('addSeries with duplicate id throws', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    expect(() =>
      ctl.addSeries({ id: 'a', label: 'a2', targetIntervalMs: HOUR, compute: lastClose }),
    ).toThrow(/already in use/)
  })

  it('addSeries with targetIntervalMs not a multiple of baseIntervalMs throws', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    expect(() =>
      ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: 7 * MIN, compute: lastClose }),
    ).toThrow(/multiple/)
  })

  it('removeSeries returns true if found, false otherwise', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    expect(ctl.removeSeries('a')).toBe(true)
    expect(ctl.removeSeries('a')).toBe(false)
    expect(ctl.series()).toHaveLength(0)
  })

  it('updateSeries patches compute fn and re-runs it', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100), bar(FIVE_MIN, 200)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose })
    const beforeValues = ctl.series()[0]!.alignedValues
    expect(beforeValues).toEqual([100, 200])
    ctl.updateSeries('a', { compute: (rs) => rs.map(() => 42) })
    expect(ctl.series()[0]!.alignedValues).toEqual([42, 42])
  })
})

describe('createMtfController — alignment correctness', () => {
  it('lifts a 1h compute onto 5m base bars (12 base bars share one hbar value)', () => {
    const base: BaseBar[] = []
    for (let i = 0; i < 12; i++) base.push(bar(i * FIVE_MIN, 100 + i))
    const ctl = createMtfController({
      initialBars: base,
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({
      id: 'a',
      label: 'last close 1h',
      targetIntervalMs: HOUR,
      compute: lastClose,
    })
    // All 12 base bars should see the same value — the close of the
    // single 1h resampled bar covering 0..59 min, which is base[11].close = 111
    const aligned = ctl.series()[0]!.alignedValues
    expect(aligned).toEqual(new Array(12).fill(111))
  })

  it('appendBaseBar extends aligned series by exactly one entry', () => {
    const base: BaseBar[] = [bar(0, 100)]
    const ctl = createMtfController({ initialBars: base, baseIntervalMs: FIVE_MIN })
    ctl.addSeries({
      id: 'a',
      label: 'a',
      targetIntervalMs: FIVE_MIN,
      compute: lastClose,
    })
    expect(ctl.series()[0]!.alignedValues).toEqual([100])
    ctl.appendBaseBar(bar(FIVE_MIN, 200))
    expect(ctl.series()[0]!.alignedValues).toEqual([100, 200])
  })

  it('two series at different higher TFs co-exist independently', () => {
    const base: BaseBar[] = []
    for (let i = 0; i < 12; i++) base.push(bar(i * FIVE_MIN, 100 + i))
    const ctl = createMtfController({ initialBars: base, baseIntervalMs: FIVE_MIN })
    ctl.addSeries({ id: '5m', label: '5m', targetIntervalMs: FIVE_MIN, compute: lastClose })
    ctl.addSeries({ id: '1h', label: '1h', targetIntervalMs: HOUR, compute: lastClose })

    const series = ctl.series()
    expect(series).toHaveLength(2)
    const fiveM = series.find((s) => s.definition.id === '5m')!
    const oneH = series.find((s) => s.definition.id === '1h')!
    // 5m series: each base bar reads its own close
    expect(fiveM.alignedValues).toEqual(base.map((b) => b.close))
    // 1h series: all 12 read the close of the single 1h bar = 111
    expect(oneH.alignedValues).toEqual(new Array(12).fill(111))
  })
})

describe('createMtfController — config + lifecycle', () => {
  it('setBaseBars rebuilds all series', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose })
    expect(ctl.series()[0]!.alignedValues).toEqual([100])
    ctl.setBaseBars([bar(0, 1), bar(FIVE_MIN, 2)], FIVE_MIN)
    expect(ctl.series()[0]!.alignedValues).toEqual([1, 2])
  })

  it('setBaseBars throws if an existing series target no longer cleanly divides', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    // Changing base to 7-minute bars makes 1h (3_600_000) no longer divisible by 7m (420_000)
    expect(() => ctl.setBaseBars([bar(0, 1)], 7 * MIN)).toThrow(/cleanly divide/)
  })

  it('dispose silences subsequent mutators', () => {
    const ctl = createMtfController({
      initialBars: [bar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    const listener = vi.fn()
    ctl.series.subscribe(listener)
    ctl.dispose()
    const beforeCalls = listener.mock.calls.length
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose })
    ctl.appendBaseBar(bar(FIVE_MIN, 200))
    expect(listener.mock.calls.length).toBe(beforeCalls)
  })
})
