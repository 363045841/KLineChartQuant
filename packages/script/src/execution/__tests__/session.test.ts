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

  it('same-bar update matches a fresh full run', () => {
    const script = prepare(plotSource)
    const bars = [bar(0, 10), bar(60_000, 20)]
    const changed = [bar(0, 10), bar(60_000, 30)]
    script.run(bars)
    const updated = script.run(changed)
    const fresh = prepare(plotSource).run(changed)
    expect(updated).toEqual(fresh)
    script.dispose()
  })

  it('stateless range keeps results outside the range', () => {
    const script = prepare(plotSource)
    const bars = [bar(0, 10), bar(60_000, 20), bar(120_000, 30)]
    const first = script.runDetailed(bars, {}, undefined, { start: 0, end: 3 })
    const values = (output: typeof first) =>
      output.collection.plots[0]?.data.map((point) =>
        point && 'value' in point ? point.value : undefined,
      )
    // 会话输出是运行态视图；下一次运行前先快照本次结果。
    const firstValues = values(first)
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
