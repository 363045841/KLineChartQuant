import { describe, expect, it } from 'vitest'

import { createOriginShiftPolicy } from '../impl/originShift'

type ThresholdCase = {
  name: string
  initialRef: number
  threshold?: number
  calls: ReadonlyArray<readonly [mid: number, range: number]>
  changed: boolean[]
  finalRef: number
}

describe('createOriginShiftPolicy', () => {
  it('以 initialRef 为起点，shift 返回相对 ref 的差值', () => {
    const p = createOriginShiftPolicy(67000)
    expect(p.ref).toBe(67000)
    expect(p.shift(67000.5)).toBeCloseTo(0.5, 10)
    expect(p.shift(66999.25)).toBeCloseTo(-0.75, 10)
  })

  it.each([
    {
      name: '低于阈值（0.005 < 0.01）不重建',
      initialRef: 100,
      calls: [[100.5, 100]],
      changed: [false],
      finalRef: 100,
    },
    {
      name: '高于阈值（0.02 > 0.01）重建到新中点',
      initialRef: 100,
      calls: [[102, 100]],
      changed: [true],
      finalRef: 102,
    },
    {
      name: '正好等于阈值不重建（严格 >）',
      initialRef: 100,
      threshold: 0.01,
      calls: [[101, 100]],
      changed: [false],
      finalRef: 100,
    },
    {
      name: 'threshold=0 时任意漂移都重建，零漂移不重建',
      initialRef: 50,
      threshold: 0,
      calls: [
        [50.0001, 100],
        [50.0001, 100],
      ],
      changed: [true, false],
      finalRef: 50.0001,
    },
    {
      name: 'threshold=1 时不重建任何区间内漂移',
      initialRef: 50,
      threshold: 1,
      calls: [[149, 100]],
      changed: [false],
      finalRef: 50,
    },
  ] satisfies ThresholdCase[])('$name', ({ initialRef, threshold, calls, changed, finalRef }) => {
    const p =
      threshold === undefined
        ? createOriginShiftPolicy(initialRef)
        : createOriginShiftPolicy(initialRef, threshold)
    expect(calls.map(([mid, range]) => p.maybeRebaseline(mid, range))).toEqual(changed)
    expect(p.ref).toBe(finalRef)
  })

  it('连续重建时 ref 单调跟随漂移', () => {
    const p = createOriginShiftPolicy(0, 0.01)
    const history: number[] = []
    let mid = 0
    const range = 100
    for (let i = 0; i < 10; i++) {
      mid += 0.02 * range
      if (p.maybeRebaseline(mid, range)) history.push(p.ref)
    }

    expect(history).toHaveLength(10)
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).toBeGreaterThan(history[i - 1]!)
    }
  })

  it('退化区间（currentRange <= 0）拒绝重建', () => {
    const p = createOriginShiftPolicy(50)
    expect(p.maybeRebaseline(60, 0)).toBe(false)
    expect(p.maybeRebaseline(60, -10)).toBe(false)
    expect(p.ref).toBe(50)
  })

  it('非有限输入不污染 ref', () => {
    const p = createOriginShiftPolicy(50)
    expect(p.maybeRebaseline(Number.NaN, 100)).toBe(false)
    expect(p.maybeRebaseline(60, Number.POSITIVE_INFINITY)).toBe(false)
    expect(p.ref).toBe(50)
  })

  it.each([
    { name: 'initialRef 非有限', run: () => createOriginShiftPolicy(Number.NaN), pattern: /finite/ },
    { name: 'threshold 为负', run: () => createOriginShiftPolicy(0, -0.1), pattern: /threshold/ },
    {
      name: 'threshold 非有限',
      run: () => createOriginShiftPolicy(0, Number.POSITIVE_INFINITY),
      pattern: /threshold/,
    },
  ])('拒绝非法构造：$name', ({ run, pattern }) => {
    expect(run).toThrow(pattern)
  })
})
