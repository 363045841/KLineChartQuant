/** 图例行工厂的几何与文本间距契约测试。 */
import { describe, expect, it } from 'vitest'
import { PANE_HEADER_INSET_PX } from '@/engine/pane/types'
import { LEGEND_GAP_PX, LEGEND_ROW_HEIGHT_PX, legendRowTop } from '../impl/legendGeometry'
import { createLegendRow } from '../impl/legendRow'

describe('createLegendRow', () => {
  it('统一换算行盒几何并解析每段文本间距', () => {
    const row = createLegendRow(
      { paneId: 'main', paneTop: 100, paneWidth: 800, index: 2 },
      {
        key: 'main:MA',
        texts: [
          { text: 'MA', color: 'red' },
          { text: '(5)', color: 'gray' },
          { text: 'MA5 100.000', color: 'blue', gapBefore: 2 },
        ],
      },
    )

    expect(row).toMatchObject({
      key: 'main:MA',
      paneId: 'main',
      x: PANE_HEADER_INSET_PX,
      y: legendRowTop(100, 2),
      maxWidth: 800 - PANE_HEADER_INSET_PX,
      height: LEGEND_ROW_HEIGHT_PX,
      actions: [],
    })
    expect(row.texts.map((text) => text.gapBefore)).toEqual([0, LEGEND_GAP_PX, 2])
  })

  it('主图可通过布局覆盖内边距、行高与默认间距', () => {
    const row = createLegendRow(
      { paneId: 'main', paneTop: 0, paneWidth: 500, index: 0 },
      { key: 'main:bar', texts: [{ text: 'O 10.00', color: 'red' }] },
      { inset: 20, height: 30, gap: 6 },
    )

    expect(row).toMatchObject({ x: 20, y: legendRowTop(0, 0), maxWidth: 480, height: 30 })
  })
})
