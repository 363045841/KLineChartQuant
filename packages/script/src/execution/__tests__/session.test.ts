/** 会话契约：区间执行、有状态重置与绘图增量。 */

import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'

/** 构造最小行情；时间戳决定 bar 身份。 */
function bar(time: number, close: number): Bar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 1 }
}

const boxSource = `defineIndicator({ name:'SessionBox', position:Position.Main, max_boxes_count:100, onBar(){
  box.new({ left: time[0], right: time[0] + 60000, top: high[0], bottom: low[0], xloc: xloc.bar_time, borderWidth: 0, backgroundColor: Color.Blue })
}})`

const plotSource = `defineIndicator({ name:'SessionPlot', position:Position.Main, onBar(){
  plot.Line(close[0], 'close')
}})`

describe.each(BACKENDS)('$name session', ({ prepare }) => {
  it('replays unmanaged top-level state instead of carrying the previous live bar forward', () => {
    const source = `let total=0; defineIndicator({name:'UnmanagedState',position:Position.Main,onBar(){total+=close[0];plot.Line(total,'total')}})`
    const script = prepare(source)
    const fresh = prepare(source)
    const bars = [bar(0, 10), bar(60_000, 20)]
    script.run(bars, {}, undefined, { start: 0, end: 2 })
    const changed = [bars[0]!, bar(60_000, 99)]
    expect(script.run(changed, {}, undefined, { start: 1, end: 2 })).toEqual(fresh.run(changed))
    script.dispose()
    fresh.dispose()
  })

  it('reuses stateful checkpoints when the host supplies a conservative full range', () => {
    const events: string[] = []
    const source = `console.log('init'); defineIndicator({name:'StatefulRange',position:Position.Main,onBar(){ plot.Line(ta.ema(close,2)[0],'ema') }})`
    const script = prepare(source, [], (event) => events.push(event.message))
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    script.run(bars, {}, undefined, { start: 0, end: 3 })
    const changed = [bars[0]!, bars[1]!, bar(120_000, 99)]
    const updated = script.run(changed, {}, undefined, { start: 0, end: 3 })
    const fresh = prepare(source)
    expect(updated).toEqual(fresh.run(changed))
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    const prepended = [bar(-60_000, 5), ...changed]
    expect(script.run(prepended, {}, undefined, { start: 0, end: 4 })).toEqual(fresh.run(prepended))
    expect(events.filter((message) => message === 'init')).toHaveLength(2)
    const corrected = [prepended[0]!, bar(0, 7), ...prepended.slice(2)]
    expect(script.run(corrected, {}, undefined, { start: 0, end: 4 })).toEqual(fresh.run(corrected))
    expect(events.filter((message) => message === 'init')).toHaveLength(3)
    script.dispose()
    fresh.dispose()
  })

  it('keeps completed drawings and only re-emits the changed tail', () => {
    const script = prepare(boxSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.runDetailed(bars.slice(0, 2), {}, undefined, { start: 0, end: 2 })
    const second = script.runDetailed(bars, {}, undefined, { start: 1, end: 3 })
    expect(first.drawingDelta.reset).toBe(true)
    expect(second.drawingDelta.reset).toBe(false)
    expect(second.collection.drawings?.[0]).toBe(first.collection.drawings?.[0])
    expect(second.collection.drawings).toHaveLength(3)
    // 旧末根会随检查点回滚重算，新根追加；已完成的第一根保持原对象。
    expect(second.drawingDelta.upsert).toHaveLength(2)
    script.dispose()
  })

  it('same-bar updates preserve earlier results with inferred and explicit ranges', () => {
    const script = prepare(plotSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.runDetailed(bars, {}, undefined, { start: 0, end: 3 })
    const values = (output: typeof first) =>
      output.collection.plots[0]?.data.map((point) =>
        point && 'value' in point ? point.value : undefined,
      )
    // 会话输出是运行态视图；下一次运行前先快照本次结果。
    const firstValues = values(first)
    const inferred = script.runDetailed([bars[0]!, bars[1]!, bar(120_000, 50)])
    expect(values(inferred)).toEqual([10, 20, 50])
    const changed = [bar(0, 10), bar(60_000, 20), bar(120_000, 99)]
    const second = script.runDetailed(changed, {}, undefined, { start: 2, end: 3 })
    expect(firstValues).toEqual([10, 20, 30])
    expect(values(second)).toEqual([10, 20, 99])
    script.dispose()
  })

  it('runs top-level initialization once across ticks', () => {
    const events: string[] = []
    const script = prepare(
      `defineIndicator({ name:'SessionLog', position:Position.Main, onBar(){} }); console.log('init')`,
      [],
      (event) => events.push(event.message),
    )
    script.run([bar(0, 10)], {}, undefined, { start: 0, end: 1 })
    script.run([bar(0, 10), bar(60_000, 20)], {}, undefined, { start: 1, end: 2 })
    expect(events.filter((message) => message === 'init')).toHaveLength(1)
    script.dispose()
  })
})
