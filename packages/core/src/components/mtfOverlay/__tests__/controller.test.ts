/**
 * MTF controller tests — series CRUD, recompute on mutation, EMA on a 1h
 * overlay against 5m bars.
 */

import { describe, expect, it, vi } from 'vitest'

import { createMtfController } from '../impl/createMtfController'
import type { BaseBar, ResampledBar } from '../types'
import { createBaseBar } from './helpers/createBaseBar'

const MIN = 60_000
const FIVE_MIN = 5 * MIN
const HOUR = 60 * MIN

/** A trivial "last close" compute fn for asserting against. */
const lastClose = (rs: ReadonlyArray<ResampledBar>): number[] => rs.map((r) => r.close)

describe('createMtfController — CRUD + recompute', () => {
  it('addSeries returns id and series signal fires', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100), createBaseBar(FIVE_MIN, 101)],
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
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    expect(() =>
      ctl.addSeries({ id: 'a', label: 'a2', targetIntervalMs: HOUR, compute: lastClose }),
    ).toThrow(/already in use/)
  })

  it('addSeries with targetIntervalMs not a multiple of baseIntervalMs throws', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    expect(() =>
      ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: 7 * MIN, compute: lastClose }),
    ).toThrow(/multiple/)
  })

  it('removeSeries returns true if found, false otherwise', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    expect(ctl.removeSeries('a')).toBe(true)
    expect(ctl.removeSeries('a')).toBe(false)
    expect(ctl.series()).toHaveLength(0)
  })

  it('updateSeries patches compute fn and re-runs it', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100), createBaseBar(FIVE_MIN, 200)],
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
    for (let i = 0; i < 12; i++) base.push(createBaseBar(i * FIVE_MIN, 100 + i))
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

  it('append extends aligned series by exactly one entry', () => {
    const base: BaseBar[] = [createBaseBar(0, 100)]
    const ctl = createMtfController({ initialBars: base, baseIntervalMs: FIVE_MIN })
    ctl.addSeries({
      id: 'a',
      label: 'a',
      targetIntervalMs: FIVE_MIN,
      compute: lastClose,
    })
    expect(ctl.series()[0]!.alignedValues).toEqual([100])
    ctl.append(createBaseBar(FIVE_MIN, 200))
    expect(ctl.series()[0]!.alignedValues).toEqual([100, 200])
  })

  it('two series at different higher TFs co-exist independently', () => {
    const base: BaseBar[] = []
    for (let i = 0; i < 12; i++) base.push(createBaseBar(i * FIVE_MIN, 100 + i))
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
  it('setData rebuilds all series', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose })
    expect(ctl.series()[0]!.alignedValues).toEqual([100])
    ctl.setData([createBaseBar(0, 1), createBaseBar(FIVE_MIN, 2)], FIVE_MIN)
    expect(ctl.series()[0]!.alignedValues).toEqual([1, 2])
  })

  it('rejects an incompatible base interval before publishing', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: HOUR, compute: lastClose })
    const before = ctl.series()
    expect(() => ctl.setData([createBaseBar(0, 1)], 7 * MIN)).toThrow(/multiple of baseIntervalMs/)
    expect(ctl.series()).toBe(before)
    ctl.append(createBaseBar(FIVE_MIN, 101))
    expect(ctl.series()[0]?.alignedValues).toEqual([101, 101])
  })

  it('leaves the previous snapshot and ID availability intact after compute fails', () => {
    const ctl = createMtfController({ initialBars: [createBaseBar(0, 3)], baseIntervalMs: FIVE_MIN })
    const listener = vi.fn()
    ctl.series.subscribe(listener)
    const error = new Error('calculation failed')
    const definition = { id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose }
    const fail = () => { throw error }
    expect(() => ctl.addSeries({ ...definition, compute: fail })).toThrow(error)
    expect(ctl.series()).toEqual([])
    expect(listener).not.toHaveBeenCalled()
    ctl.addSeries(definition)
    const snapshot = ctl.series()
    expect(() => ctl.updateSeries('a', { compute: fail })).toThrow(error)
    expect(ctl.series()).toBe(snapshot)
    expect('set' in ctl.series).toBe(false)
    ctl.append(createBaseBar(FIVE_MIN, 4))
    expect(ctl.series()[0]?.alignedValues).toEqual([3, 4])
  })

  it('dispose silences subsequent mutators', () => {
    const ctl = createMtfController({
      initialBars: [createBaseBar(0, 100)],
      baseIntervalMs: FIVE_MIN,
    })
    const listener = vi.fn()
    ctl.series.subscribe(listener)
    ctl.dispose()
    const beforeCalls = listener.mock.calls.length
    ctl.addSeries({ id: 'a', label: 'a', targetIntervalMs: FIVE_MIN, compute: lastClose })
    ctl.append(createBaseBar(FIVE_MIN, 200))
    expect(listener.mock.calls.length).toBe(beforeCalls)
  })
})
