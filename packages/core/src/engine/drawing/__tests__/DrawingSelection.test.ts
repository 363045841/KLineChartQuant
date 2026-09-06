/** 验证绘图选择 API 在不同交互入口下保持同一 Ctrl 语义。 */
import { describe, expect, it } from 'vitest'

import { clearDrawingSelection, toggleDrawingSelection } from '../DrawingSelection'

describe('DrawingSelection', () => {
  it('clears every selected drawing', () => {
    expect(clearDrawingSelection()).toEqual([])
  })

  it('toggles one or many target ids while preserving selection order', () => {
    expect(toggleDrawingSelection(['first', 'second'], ['second', 'third'])).toEqual([
      'first',
      'third',
    ])
  })

  it('does not add duplicate target ids', () => {
    expect(toggleDrawingSelection([], ['first', 'first'])).toEqual(['first'])
  })
})
