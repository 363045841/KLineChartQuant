/** 两种执行后端共用的 line 行为测试，覆盖对象生命周期与 Pine 坐标语义。 */
import { describe, expect, it } from 'vitest'
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

const bars: Bar[] = [10, 20, 30].map((close, index) => ({ time: 1000 + index * 1000, open: close, high: close + 1, low: close - 1, close, volume: 1 }))
const backends = [
  { name: 'QuickJS', run: (source: string) => runQuickJSScript({ source, bars }) },
  { name: 'native', run: async (source: string) => prepareNativeScript(source).run(bars) },
]

describe.each(backends)('line API ($name)', ({ run }) => {
  it('shares one mutable line across bars and copies independently', async () => {
    const result = await run(`
      let ref;
      defineIndicator({ name: 'lines', position: Position.Main, onBar() {
        if (bar_index === 0) ref = line.new(0, 10, 1, 20);
        line.set_xy2(ref, bar_index + 1, close[0] + 10);
        if (bar_index === 2) {
          line.set_xy1(ref, -1, 5);
          line.set_x1(ref, 0); line.set_y1(ref, 10);
          line.set_x2(ref, 2); line.set_y2(ref, 30);
          line.set_color(ref, Color.Red); line.set_width(ref, 3);
          line.set_style(ref, line.style_arrow_both); line.set_extend(ref, extend.both);
          const copy = line.copy(ref);
          line.set_y2(copy, 99);
          plot.Line(line.get_price(ref, 4), 'price');
          plot.Line(line.get_x1(ref) + line.get_y1(ref) + line.get_x2(ref) + line.get_y2(ref), 'coords');
          plot.Line(line.get_width(ref), 'width');
          if (line.get_color(ref) !== Color.Red || line.get_style(ref) !== line.style_arrow_both || line.get_extend(ref) !== extend.both) throw new Error('getters');
          const removed = line.new(0, 1, 1, 2);
          line.delete(removed); line.delete(removed); line.delete(null);
          if (!Number.isNaN(line.get_y1(removed))) throw new Error('deleted');
          if (line.all.length !== 2) throw new Error('all');
          if (line.all[0] !== ref || line.all[1] !== copy) throw new Error('identity');
        }
      }});
    `)
    expect(result.drawings).toHaveLength(2)
    expect(result.drawings?.[0]).toMatchObject({ kind: 'trend-line', extend: 'both', style: { strokeWidth: 3, strokeStyle: 'arrow_both' }, anchors: [{ logicalIndex: 0, price: 10 }, { logicalIndex: 2, price: 30 }] })
    expect(result.drawings?.[1]?.anchors[1]?.price).toBe(99)
    expect(result.plots.find((p) => p.id === 'price')?.data[2]).toMatchObject({ value: 50 })
    expect(result.plots.find((p) => p.id === 'coords')?.data[2]).toMatchObject({ value: 42 })
  })

  it('supports chart.point overloads, timestamp coordinates and all six styles', async () => {
    const result = await run(`
      defineIndicator({ name: 'points', position: Position.Main, onBar() {
        if (bar_index !== 2) return;
        for (const style of [line.style_solid, line.style_dashed, line.style_dotted, line.style_arrow_left, line.style_arrow_right, line.style_arrow_both]) {
          line.new(chart.point.from_time(time[2], 10), chart.point.now(30), xloc.bar_time, extend.left, Color.Blue, style, 2);
        }
        line.new(chart.point.new(time[2], 0, 10), chart.point.copy(chart.point.from_index(2, 30)));
      }});
    `)
    expect(result.drawings).toHaveLength(7)
    expect(result.drawings?.[0]?.anchors).toMatchObject([{ time: 1000 }, { time: 3000 }])
    expect(result.drawings?.[6]?.anchors).toMatchObject([{ logicalIndex: 0 }, { logicalIndex: 2 }])
  })

  it('collects oldest objects and isolates repeated executions', async () => {
    const source = `defineIndicator({ name: 'gc', position: Position.Main, max_lines_count: 2, onBar() {
      line.new(bar_index, close[0], bar_index + 1, close[0]);
    }});`
    const first = await run(source)
    const second = await run(source)
    expect(first).toEqual(second)
    expect(first.drawings?.map((d) => d.anchors[0]?.logicalIndex)).toEqual([1, 2])
  })

  it('rejects get_price for timestamp lines', async () => {
    await expect(run(`defineIndicator({ name: 'time', position: Position.Main, onBar() {
      const id = line.new(time[0], 10, time[0] + 1000, 20, xloc.bar_time);
      line.get_price(id, 1);
    }});`)).rejects.toThrow('get_price')
  })

  it('preserves na coordinates and vertical line price semantics', async () => {
    const result = await run(`defineIndicator({ name: 'na', position: Position.Main, onBar() {
      if (bar_index !== 0) return;
      const vertical = line.new(0, 10, 0, 20);
      if (!Number.isNaN(line.get_price(vertical, 1))) throw new Error('vertical');
      const hidden = line.new(NaN, 1, 1, NaN);
      if (!Number.isNaN(line.get_x1(hidden)) || !Number.isNaN(line.get_y2(hidden))) throw new Error('na');
    }});`)
    expect(result.drawings).toHaveLength(2)
    expect(result.drawings?.[1]?.anchors[0]?.logicalIndex).toBeNaN()
    expect(result.drawings?.[1]?.anchors[1]?.price).toBeNaN()
  })
})
