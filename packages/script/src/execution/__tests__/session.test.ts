/** 会话契约：显式变化驱动重放、状态回滚与绘图尾部增量。 */

import { readFileSync } from 'node:fs'
import type { Bar, ComputeChange } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'

/** 构造最小行情；时间戳决定 bar 身份。 */
function bar(time: number, close: number): Bar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 1 }
}

/** 只比较序列部分；绘图增量与时序相关，不参与跨会话等价断言。 */
function seriesOf(output: { plots: unknown; fills: unknown; drawings?: unknown; hlines?: unknown; hlineFills?: unknown }) {
  const { plots, fills, drawings, hlines, hlineFills } = output
  return { plots, fills, drawings, hlines, hlineFills }
}

/** 全量重放用的变化。 */
const reset = (revision: number): ComputeChange => ({ kind: 'reset', start: 0, revision })

const plotSource = `defineIndicator({ version: 2, name:'SessionPlot', position:Position.main, onBar(){
  plot.Line(close[0], 'close')
}})`

const boxSource = `defineIndicator({ version: 2, name:'SessionBox', position:Position.main, maxBoxesCount:100, onBar(){
  box.new({ left: time[0], right: time[0] + 60000, top: high[0], bottom: low[0], xloc: xloc.barTime, borderWidth: 0, backgroundColor: Color.blue })
}})`

const stateSource = (name: string) => `const acc = state({ total: 0 })
defineIndicator({ version: 2, name:'${name}', position:Position.main, onBar(){
  acc.total += close[0]
  plot.Line(acc.total, 'total')
}})`

const volumeSource = readFileSync(new URL('../../../scripts/vol.ts', import.meta.url), 'utf8')

describe.each(BACKENDS)('$name session', ({ prepare }) => {
  it('replays from the explicit change point and matches a fresh full run', () => {
    const script = prepare(volumeSource)
    const fresh = prepare(volumeSource)
    const first = [10, 20, 30, 40, 50].map((volume, index) => ({
      ...bar(index * 60_000, volume),
      volume,
    }))
    const appended = [...first, { ...bar(5 * 60_000, 60), volume: 60 }]
    const updated = [...appended.slice(0, -1), { ...appended.at(-1)!, volume: 999 }]
    const prepended = [bar(-60_000, 5), ...updated]

    script.output(first, {}, undefined, false, reset(0))
    for (const [bars, change] of [
      [appended, { kind: 'append', start: first.length, revision: 1 }],
      [updated, { kind: 'update', start: updated.length - 1, revision: 2 }],
      [prepended, { kind: 'replace', start: 0, revision: 3 }],
    ] as const) {
      const result = script.output(bars, {}, undefined, false, change)
      const replay = fresh.output(bars, {}, undefined, false, reset(99))
      expect(seriesOf(result)).toEqual(seriesOf(replay))
    }
    script.dispose()
    fresh.dispose()
  })

  it('rolls declared state back when the last bar updates', () => {
    const script = prepare(stateSource('StateRollback'))
    const fresh = prepare(stateSource('StateRollback'))
    const bars = [bar(0, 10), bar(60_000, 20)]
    script.output(bars, {}, undefined, false, reset(0))
    const changed = [bars[0]!, bar(60_000, 99)]
    const updated = script.output(changed, {}, undefined, false, {
      kind: 'update',
      start: 1,
      revision: 1,
    })
    expect(seriesOf(updated)).toEqual(
      seriesOf(fresh.output(changed, {}, undefined, false, reset(1))),
    )
    script.dispose()
    fresh.dispose()
  })

  it('keeps declared state across appends without reinitializing', () => {
    const events: string[] = []
    const source = `const acc = state({ total: 0 }); console.log('init')
defineIndicator({ version: 2, name:'StateAppend', position:Position.main, onBar(){
  acc.total += close[0]
  plot.Line(acc.total, 'total')
}})`
    const script = prepare(source, [], (event) => events.push(event.message))
    const first = [bar(0, 10)]
    script.output(first, {}, undefined, false, reset(0))
    script.output([...first, bar(60_000, 20)], {}, undefined, false, {
      kind: 'append',
      start: 1,
      revision: 1,
    })
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    script.dispose()
  })

  it('reuses checkpoints on last-bar updates and rebuilds on history changes', () => {
    const events: string[] = []
    const source = `console.log('init'); defineIndicator({ version: 2,name:'StatefulRange',position:Position.main,onBar(){ plot.Line(ta.ema(close,2)[0],'ema') }})`
    const script = prepare(source, [], (event) => events.push(event.message))
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    script.output(bars, {}, undefined, false, reset(0))
    const changed = [bars[0]!, bars[1]!, bar(120_000, 99)]
    script.output(changed, {}, undefined, false, { kind: 'update', start: 2, revision: 1 })
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    const prepended = [bar(-60_000, 5), ...changed]
    script.output(prepended, {}, undefined, false, { kind: 'replace', start: 0, revision: 2 })
    expect(events.filter((message) => message === 'init')).toHaveLength(2)
    script.dispose()
  })

  it('keeps completed drawings and only re-emits the changed tail', () => {
    const script = prepare(boxSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.output(bars.slice(0, 2), {}, undefined, false, reset(0))
    const second = script.output(bars, {}, undefined, false, {
      kind: 'append',
      start: 2,
      revision: 1,
    })
    expect(first.drawingDelta.reset).toBe(true)
    expect(second.drawingDelta.reset).toBe(false)
    expect(second.drawings?.[0]).toBe(first.drawings?.[0])
    expect(second.drawings).toHaveLength(3)
    expect(second.drawingDelta.upsert).toHaveLength(1)
    script.dispose()
  })

  it('updates the last bar without disturbing earlier values', () => {
    const script = prepare(plotSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.output(bars, {}, undefined, false, reset(0))
    const values = (output: typeof first) =>
      output.plots[0]?.data.map((point) => (point && 'value' in point ? point.value : undefined))
    const firstValues = values(first)
    const updated = script.output([bars[0]!, bars[1]!, bar(120_000, 99)], {}, undefined, false, {
      kind: 'update',
      start: 2,
      revision: 1,
    })
    expect(firstValues).toEqual([10, 20, 30])
    expect(values(updated)).toEqual([10, 20, 99])
    script.dispose()
  })

  it('runs top-level initialization once across appended bars', () => {
    const events: string[] = []
    const script = prepare(
      `defineIndicator({ version: 2, name:'SessionLog', position:Position.main, onBar(){} }); console.log('init')`,
      [],
      (event) => events.push(event.message),
    )
    script.output([bar(0, 10)], {}, undefined, false, reset(0))
    script.output([bar(0, 10), bar(60_000, 20)], {}, undefined, false, {
      kind: 'append',
      start: 1,
      revision: 1,
    })
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    script.dispose()
  })
})
