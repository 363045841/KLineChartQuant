/** 两种执行后端共用的 line 行为测试，覆盖对象生命周期与 Pine 坐标语义。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses, plotById } from '../../__tests__/marketData.js'

const bars = barsFromCloses([10, 20, 30], { spread: 1 }).map((bar, index) => ({
  ...bar,
  time: 1000 + index * 1000,
}))
const backends = BACKENDS.map(({ name, prepare }) => ({
  name,
  run: async (source: string) => prepare(source).run(bars),
}))

describe.each(backends)('line API ($name)', ({ run }) => {
  it('shares one mutable line across bars and copies independently', async () => {
    const result = await run(`
      let ref;
      defineIndicator({ version: 2, name: 'lines', position: Position.main, onBar() {
        if (barIndex === 0) ref = line.new(0, 10, 1, 20);
        line.setXY2(ref, barIndex + 1, close[0] + 10);
        if (barIndex === 2) {
          line.setXY1(ref, 0, 5);
          line.setX1(ref, 0); line.setY1(ref, 10);
          line.setX2(ref, 2); line.setY2(ref, 30);
          line.setColor(ref, Color.red); line.setWidth(ref, 3);
          line.setStyle(ref, LineStyle.arrowBoth); line.setExtend(ref, extend.both);
          const copy = line.copy(ref);
          line.setY2(copy, 99);
          plot.Line(line.getPrice(ref, 4), 'price');
          plot.Line(line.getX1(ref) + line.getY1(ref) + line.getX2(ref) + line.getY2(ref), 'coords');
          plot.Line(line.getWidth(ref), 'width');
          if (line.getColor(ref) !== Color.red || line.getStyle(ref) !== LineStyle.arrowBoth || line.getExtend(ref) !== extend.both) throw new Error('getters');
          const removed = line.new(0, 1, 1, 2);
          line.delete(removed); line.delete(removed); line.delete(null);
          if (!Number.isNaN(line.getY1(removed))) throw new Error('deleted');
          if (line.all.length !== 2) throw new Error('all');
          if (line.all[0] !== ref || line.all[1] !== copy) throw new Error('identity');
        }
      }});
    `)
    expect(result.drawings).toHaveLength(2)
    expect(result.drawings?.[0]).toMatchObject({
      kind: 'trend-line',
      extend: 'both',
      style: { strokeWidth: 3, strokeStyle: 'arrow_both' },
      anchors: [
        { logicalIndex: 0, price: 10 },
        { logicalIndex: 2, price: 30 },
      ],
    })
    expect(result.drawings?.[1]?.anchors[1]?.price).toBe(99)
    expect(plotById(result, 'price').data[2]).toMatchObject({ value: 50 })
    expect(plotById(result, 'coords').data[2]).toMatchObject({ value: 42 })
  })

  it('supports chart.point overloads, timestamp coordinates and all six styles', async () => {
    const result = await run(`
      defineIndicator({ version: 2, name: 'points', position: Position.main, onBar() {
        if (barIndex !== 2) return;
        for (const style of [LineStyle.solid, LineStyle.dashed, LineStyle.dotted, LineStyle.arrowLeft, LineStyle.arrowRight, LineStyle.arrowBoth]) {
          line.new(chart.point.fromTime(time[2], 10), chart.point.now(30), xloc.barTime, extend.left, Color.blue, style, 2);
        }
        line.new(chart.point.new(time[2], 0, 10), chart.point.copy(chart.point.fromIndex(2, 30)));
      }});
    `)
    expect(result.drawings).toHaveLength(7)
    expect(result.drawings?.[0]?.anchors).toMatchObject([{ time: 1000 }, { time: 3000 }])
    expect(result.drawings?.[6]?.anchors).toMatchObject([{ logicalIndex: 0 }, { logicalIndex: 2 }])
  })

  it('collects oldest objects and isolates repeated executions', async () => {
    const source = `defineIndicator({ version: 2, name: 'gc', position: Position.main, maxLinesCount: 2, onBar() {
      line.new(barIndex, close[0], barIndex + 1, close[0]);
    }});`
    const first = await run(source)
    const second = await run(source)
    expect(first).toEqual(second)
    expect(first.drawings?.map((d) => d.anchors[0]?.logicalIndex)).toEqual([1, 2])
  })

  it('rejects getPrice for timestamp lines', async () => {
    await expect(
      run(`defineIndicator({ version: 2, name: 'time', position: Position.main, onBar() {
      const id = line.new(time[0], 10, time[0] + 1000, 20, xloc.barTime);
      line.getPrice(id, 1);
    }});`),
    ).rejects.toThrow('getPrice')
  })

  it.each([
    { name: 'past', body: `line.new(-1, 10, 1, 20);` },
    // 时间戳误用默认 xloc：万亿级数值远超未来槽位上限。
    { name: 'time', body: `line.new(time[0], 10, time[0] + 1000, 20);` },
    { name: 'future', body: `line.new(barIndex, 10, barIndex + 501, 20);` },
  ])('rejects barIndex coordinates outside the loaded window: $name', async ({ name, body }) => {
    await expect(
      run(`defineIndicator({ version: 2, name: '${name}', position: Position.main, onBar() {
      ${body}
    }});`),
    ).rejects.toThrow('barIndex')
  })

  it('accepts future barIndex coordinates within the slot limit', async () => {
    const result =
      await run(`defineIndicator({ version: 2, name: 'future', position: Position.main, onBar() {
      if (barIndex !== 0) return;
      line.new(0, 10, barIndex + 500, 20);
    }});`)
    expect(result.drawings?.[0]?.anchors[1]?.logicalIndex).toBe(500)
  })

  it('preserves na coordinates and vertical line price semantics', async () => {
    const result =
      await run(`defineIndicator({ version: 2, name: 'na', position: Position.main, onBar() {
      if (barIndex !== 0) return;
      const vertical = line.new(0, 10, 0, 20);
      if (!Number.isNaN(line.getPrice(vertical, 1))) throw new Error('vertical');
      const hidden = line.new(NaN, 1, 1, NaN);
      if (!Number.isNaN(line.getX1(hidden)) || !Number.isNaN(line.getY2(hidden))) throw new Error('na');
    }});`)
    expect(result.drawings).toHaveLength(2)
    expect(result.drawings?.[1]?.anchors[0]?.logicalIndex).toBeNaN()
    expect(result.drawings?.[1]?.anchors[1]?.price).toBeNaN()
  })
})
