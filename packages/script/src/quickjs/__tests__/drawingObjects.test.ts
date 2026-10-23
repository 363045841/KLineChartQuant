/** 验证公共绘图 API 的两个执行后端、对象生命周期和真实内置指标源码。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, shippedSource, wavyCloses } from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { createScriptLanguageSession } from '../../language/impl/createScriptLanguageSession.js'
import { SCRIPT_SOURCE_FILE } from '../../language/impl/scriptFiles.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'
import type { ScriptParamValue } from '../types.js'

const backends = [
  { name: 'QuickJS', run: (source: string, bars: readonly Bar[], params: Record<string, ScriptParamValue> = {}) => runQuickJSScript({ source, bars, params }) },
  { name: 'native', run: async (source: string, bars: readonly Bar[], params: Record<string, ScriptParamValue> = {}) => prepareNativeScript(source).run(bars, params) },
]

describe.each(backends)('drawing objects ($name)', ({ run }) => {
  it('creates shared rectangles, copies text independently and preserves reference identity', async () => {
    const result = await run(`
      let original: BoxRef | null = null
      defineIndicator({ name: 'Boxes', position: Position.Main, onBar() {
        if (bar_index === 0) {
          original = box.new(chart.point.from_index(0, 20), chart.point.from_index(1, 10), Color.Red, 0, line.style_dashed, extend.right, xloc.bar_index, '#ff000040', 'FVG')
          if (box.all[0] !== original) throw new Error('reference mismatch')
          const copied = box.copy(original)!
          box.set_text(copied, 'copy')
          box.set_top(copied, 25)
          label.new(0, 20, 'HH', xloc.bar_index, yloc.price, Color.Red, label.style_none, Color.Red, 11)
        }
        if (original) box.set_right(original, bar_index)
      } })`, barsFromCloses([10, 11, 12]))
    expect(result.drawings).toHaveLength(3)
    expect(result.drawings?.[0]).toMatchObject({ kind: 'rectangle', extend: 'right', anchors: [{ logicalIndex: 0, price: 20 }, { logicalIndex: 2, price: 10 }], style: { strokeWidth: 0, fillOpacity: 1 }, text: { value: 'FVG' } })
    expect(result.drawings?.[1]).toMatchObject({ anchors: [{ price: 25 }, { logicalIndex: 1 }], text: { value: 'copy' } })
    expect(result.drawings?.[2]).toMatchObject({ kind: 'label', text: { value: 'HH', size: 11 } })
  })

  it('counts and evicts each object kind separately; deleted references stay deleted', async () => {
    const result = await run(`
      defineIndicator({ name: 'Limits', position: Position.Main, max_boxes_count: 1, max_labels_count: 1, max_lines_count: 1, onBar() {
        const old = box.new(0, 20, 1, 10)
        box.new(0, 30, 1, 15)
        box.set_top(old, 999)
        if (!Number.isNaN(box.get_top(old)) || box.copy(old) !== null) throw new Error('eviction failed')
        label.new(0, 10, 'old')
        label.new(0, 20, 'new')
        line.new(0, 10, 1, 20)
      } })`, barsFromCloses([10]))
    expect(result.drawings?.map((drawing) => drawing.kind)).toEqual(['rectangle', 'label', 'trend-line'])
    expect(result.drawings?.[0]?.anchors[0]?.price).toBe(30)
    expect(result.drawings?.[1]?.text?.value).toBe('new')
  })

  it('supports time coordinates, changing xloc, and hidden NaN geometry', async () => {
    const result = await run(`defineIndicator({ name: 'Coordinates', position: Position.Main, onBar() {
      const b = box.new(chart.point.from_time(1000, 20), chart.point.from_time(2000, 10), Color.Blue, 1, line.style_solid, extend.none, xloc.bar_time)
      if (box.get_left(b) !== 1000) throw new Error('time mismatch')
      box.set_xloc(b, 0, 2, xloc.bar_index)
      box.set_bottom_right_point(b, chart.point.from_index(3, 5))
      box.new(0, Number.NaN, 1, 0)
    } })`, barsFromCloses([10]))
    expect(result.drawings?.[0]).toMatchObject({ xloc: 'bar_index', anchors: [{ logicalIndex: 0, price: 20 }, { logicalIndex: 3, price: 5 }] })
    expect(result.drawings?.[1]?.anchors[0]?.price).toBeNaN()
  })

  it('confirms pivots after the right window and resolves equal highs to the right', async () => {
    const result = await run(`defineIndicator({ name: 'Pivots', position: Position.Main, onBar() {
      plot.Line(ta.pivothigh(high, 1, 1)[0], 'high')
    } })`, barsFromCloses([1, 3, 3, 1, 2]))
    const plot = result.plots[0]
    if (!plot || plot.kind !== 'line') throw new Error('missing pivot plot')
    expect(plot.data.map((point) => point?.value)).toEqual([undefined, undefined, undefined, 3, undefined])
  })

  it('VP calculates once at the last bar with bar-based widths and POC / value area', async () => {
    const bars = barsFromCloses([10, 11, 12, 13, 14], { spread: 0.5, volumes: [1, 1, 20, 1, 1] })
    const result = await run(shippedSource('volume-profile'), bars, { bins: 5, widthBars: 4, valueAreaPercent: 70 })
    const rectangles = result.drawings!.filter((drawing) => drawing.kind === 'rectangle')
    expect(rectangles).toHaveLength(1)
    expect(rectangles[0]?.anchors).toMatchObject([{ logicalIndex: 0, price: 12.5 }, { logicalIndex: 4, price: 11.5 }])
    const lines = result.drawings!.filter((drawing) => drawing.kind === 'trend-line')
    expect(lines.map((drawing) => drawing.anchors[0]!.price)).toEqual([12, 11.5, 12.5])
    expect((await run(shippedSource('volume-profile'), barsFromCloses([10, 10]))).drawings).toEqual([])
  })

  it('FVG survives a partial fill and ends only at its far boundary', async () => {
    const source = shippedSource('zones')
    const bars = barsFromCloses([10, 12, 14, 13, 12], { spread: 1 })
    const partial = await run(source, bars.slice(0, 4), { showOB: false })
    expect(partial.drawings).toHaveLength(1)
    expect(partial.drawings?.[0]?.anchors).toMatchObject([{ logicalIndex: 0, price: 13 }, { logicalIndex: 3, price: 11 }])
    expect((await run(source, bars, { showOB: false })).drawings).toEqual([])
    const retained = await run(source, bars, { showOB: false, keepMitigated: true })
    expect(retained.drawings).toHaveLength(1)
    expect(retained.drawings?.[0]?.anchors[1]?.logicalIndex).toBe(4)
  })

  it('Structure consumes confirmed levels once and marks a reversal CHoCH', async () => {
    const result = await run(shippedSource('structure'), barsFromCloses([10, 14, 11, 16, 13, 9]), { leftBars: 1, rightBars: 1, showSwings: false })
    expect(result.drawings?.filter((drawing) => drawing.kind === 'label').map((drawing) => drawing.text?.value)).toEqual(['BOS', 'CHoCH'])
    expect(result.drawings?.filter((drawing) => drawing.kind === 'trend-line')).toHaveLength(2)
  })

  it('Order Block uses the last opposite candle before a confirmed structure break', async () => {
    const bars = barsFromCloses([10, 14, 11, 16], { spread: 1 })
    bars[2] = { ...bars[2]!, open: 12 }
    const result = await run(shippedSource('zones'), bars, { showFVG: false, swingLength: 1 })
    expect(result.drawings).toHaveLength(1)
    expect(result.drawings?.[0]).toMatchObject({ text: { value: 'OB' }, anchors: [{ logicalIndex: 2, price: 12 }, { logicalIndex: 3, price: 10 }] })
  })

  it.each(['structure', 'zones', 'volume-profile'])('%s starts each run from a fresh object state', async (name) => {
    const source = shippedSource(name)
    const bars = barsFromCloses(wavyCloses(100), { spread: 1 })
    expect(await run(source, bars)).toEqual(await run(source, bars))
    expect((await run(source, [])).drawings).toEqual([])
  })
})

describe('drawing indicator editor contracts', () => {
  it.each(['structure', 'zones', 'volume-profile'])('%s has no editor type errors', (name) => {
    const session = createScriptLanguageSession()
    session.updateSource(shippedSource(name))
    const diagnostics = session.environment.languageService.getSemanticDiagnostics(SCRIPT_SOURCE_FILE)
    expect(diagnostics.map((diagnostic) => diagnostic.messageText)).toEqual([])
  })
})
