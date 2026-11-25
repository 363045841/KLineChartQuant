/** 会话契约：区间执行、有状态重置与绘图增量。 */

import { readFileSync } from 'node:fs'
import { type Bar, resolveComputeRange } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'

/** 构造最小行情；时间戳决定 bar 身份。 */
function bar(time: number, close: number): Bar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 1 }
}

/** 只比较序列部分；绘图增量与时序相关，不参与跨会话等价断言。 */
function seriesOf(output: {
  plots: unknown
  fills: unknown
  drawings?: unknown
  hlines?: unknown
  hlineFills?: unknown
}) {
  const { plots, fills, drawings, hlines, hlineFills } = output
  return { plots, fills, drawings, hlines, hlineFills }
}

const boxSource = `defineIndicator({ version: 2, name:'SessionBox', position:Position.main, maxBoxesCount:100, onBar(){
  box.new({ left: time[0], right: time[0] + 60000, top: high[0], bottom: low[0], xloc: xloc.barTime, borderWidth: 0, backgroundColor: Color.blue })
}})`

const plotSource = `defineIndicator({ version: 2, name:'SessionPlot', position:Position.main, onBar(){
  plot.Line(close[0], 'close')
}})`

const volumeSource = readFileSync(new URL('../../../scripts/vol.ts', import.meta.url), 'utf8')

describe.each(BACKENDS)('$name session', ({ prepare }) => {
  it('rebuilds VOL after history changes and resumes tail updates on the rebuilt timeline', () => {
    const script = prepare(volumeSource)
    const fresh = prepare(volumeSource)
    const bars = [10, 20, 30, 40, 50].map((volume, index) => ({
      ...bar((index + 2) * 60_000, volume),
      volume,
    }))
    const paged = [{ ...bar(0, 1) }, { ...bar(60_000, 2), volume: 2 }, ...bars]
    const corrected = paged.map((item, index) => (index === 2 ? { ...item, volume: 99 } : item))
    const lastIndex = corrected.length - 1
    const updated = [...corrected.slice(0, lastIndex), { ...corrected[lastIndex]!, volume: 123 }]
    const appended = [...updated, { ...bar(7 * 60_000, 60), volume: 60 }]

    expect(script.definition.dependency).toEqual({ kind: 'stateless', lookback: 1 })
    for (const { data, change, reset } of [
      { data: bars, change: { start: 0, end: 1 }, reset: true },
      { data: paged, change: { start: 0, end: 2 }, reset: true },
      { data: corrected, change: { start: 2, end: 3 }, reset: true },
      { data: updated, change: { start: lastIndex, end: updated.length }, reset: false },
      { data: appended, change: { start: updated.length, end: appended.length }, reset: false },
      { data: appended, change: { start: 0, end: appended.length, reset: true }, reset: true },
    ]) {
      const range = resolveComputeRange(change, script.definition.dependency, data.length)
      const result = script.output(data, {}, undefined, range)
      const replay = fresh.output(data, {}, undefined, { start: 0, end: data.length, reset: true })
      expect(seriesOf(result)).toEqual(seriesOf(replay))
      expect(result.drawingDelta.reset).toBe(reset)
    }
    script.dispose()
    fresh.dispose()
  })

  it('replays unmanaged top-level state instead of carrying the previous live bar forward', () => {
    const source = `let total=0; defineIndicator({ version: 2,name:'UnmanagedState',position:Position.main,onBar(){total+=close[0];plot.Line(total,'total')}})`
    const script = prepare(source)
    const fresh = prepare(source)
    const bars = [bar(0, 10), bar(60_000, 20)]
    script.output(bars, {}, undefined, { start: 0, end: 2 })
    const changed = [bars[0]!, bar(60_000, 99)]
    expect(seriesOf(script.output(changed, {}, undefined, { start: 1, end: 2 }))).toEqual(seriesOf(fresh.output(changed)))
    script.dispose()
    fresh.dispose()
  })

  it('reuses stateful checkpoints when the host supplies a conservative full range', () => {
    const events: string[] = []
    const source = `console.log('init'); defineIndicator({ version: 2,name:'StatefulRange',position:Position.main,onBar(){ plot.Line(ta.ema(close,2)[0],'ema') }})`
    const script = prepare(source, [], (event) => events.push(event.message))
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    script.output(bars, {}, undefined, { start: 0, end: 3 })
    const changed = [bars[0]!, bars[1]!, bar(120_000, 99)]
    const updated = script.output(changed, {}, undefined, { start: 0, end: 3 })
    const fresh = prepare(source)
    expect(seriesOf(updated)).toEqual(seriesOf(fresh.output(changed)))
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    const prepended = [bar(-60_000, 5), ...changed]
    expect(seriesOf(script.output(prepended, {}, undefined, { start: 0, end: 4 }))).toEqual(seriesOf(fresh.output(prepended)))
    expect(events.filter((message) => message === 'init')).toHaveLength(2)
    const corrected = [prepended[0]!, bar(0, 7), ...prepended.slice(2)]
    expect(seriesOf(script.output(corrected, {}, undefined, { start: 0, end: 4 }))).toEqual(seriesOf(fresh.output(corrected)))
    expect(events.filter((message) => message === 'init')).toHaveLength(3)
    script.dispose()
    fresh.dispose()
  })

  it('keeps completed drawings and only re-emits the changed tail', () => {
    const script = prepare(boxSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.output(bars.slice(0, 2), {}, undefined, { start: 0, end: 2 })
    const second = script.output(bars, {}, undefined, { start: 1, end: 3 })
    expect(first.drawingDelta.reset).toBe(true)
    expect(second.drawingDelta.reset).toBe(false)
    expect(second.drawings?.[0]).toBe(first.drawings?.[0])
    expect(second.drawings).toHaveLength(3)
    // 旧末根会随检查点回滚重算，新根追加；已完成的第一根保持原对象。
    expect(second.drawingDelta.upsert).toHaveLength(2)
    script.dispose()
  })

  it('same-bar updates preserve earlier results with inferred and explicit ranges', () => {
    const script = prepare(plotSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.output(bars, {}, undefined, { start: 0, end: 3 })
    const values = (output: typeof first) =>
      output.plots[0]?.data.map((point) =>
        point && 'value' in point ? point.value : undefined,
      )
    // 会话输出是运行态视图；下一次运行前先快照本次结果。
    const firstValues = values(first)
    const inferred = script.output([bars[0]!, bars[1]!, bar(120_000, 50)])
    expect(values(inferred)).toEqual([10, 20, 50])
    const changed = [bar(0, 10), bar(60_000, 20), bar(120_000, 99)]
    const second = script.output(changed, {}, undefined, { start: 2, end: 3 })
    expect(firstValues).toEqual([10, 20, 30])
    expect(values(second)).toEqual([10, 20, 99])
    script.dispose()
  })

  it('runs top-level initialization once across ticks', () => {
    const events: string[] = []
    const script = prepare(
      `defineIndicator({ version: 2, name:'SessionLog', position:Position.main, onBar(){} }); console.log('init')`,
      [],
      (event) => events.push(event.message),
    )
    script.output([bar(0, 10)], {}, undefined, { start: 0, end: 1 })
    script.output([bar(0, 10), bar(60_000, 20)], {}, undefined, { start: 1, end: 2 })
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    script.dispose()
  })
})




