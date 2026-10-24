/** 验证绘图文字摆放：线段法线偏移、点标签垂直偏移、框内文字与层级文字定位。 */
import { describe, expect, it } from 'vitest'

import {
  FIB_LABEL_GAP,
  LINE_LABEL_NORMAL_OFFSET,
  resolveFibLabelLayout,
  resolveLineLabelLayout,
  resolvePointLabelLayout,
  resolveRectLabelLayout,
} from '../impl/labelLayout'

describe('resolveLineLabelLayout', () => {
  it('offsets the center anchor along the upper normal of a horizontal segment', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'center')).toEqual({
      x: 100,
      y: 100 - LINE_LABEL_NORMAL_OFFSET,
      rotation: 0,
      align: 'center',
    })
  })

  it('keeps endpoints unmoved and aligns outward for start and end', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'start')).toMatchObject({
      x: 0,
      align: 'left',
    })
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'end')).toMatchObject({
      x: 200,
      align: 'right',
    })
  })

  it('normalizes a right-to-left segment to a readable rotation', () => {
    expect(resolveLineLabelLayout({ x: 200, y: 0 }, { x: 0, y: 0 }, 'center').rotation).toBe(0)
  })

  it('defaults an undefined position to the center anchor', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 0 }, { x: 10, y: 0 }, undefined)).toMatchObject({
      x: 5,
      align: 'center',
    })
  })
})

describe('resolvePointLabelLayout', () => {
  const anchor = { x: 20, y: 100 }

  it.each([
    {
      label: 'no offset',
      text: { align: 'left' as const, verticalAlign: 'top' as const },
      expected: { point: { x: 20, y: 100 }, align: 'left', baseline: 'top' },
    },
    {
      label: 'an upward offset',
      text: { align: 'center' as const, verticalAlign: 'middle' as const, offsetY: 8 },
      expected: { point: { x: 20, y: 92 }, align: 'center', baseline: 'middle' },
    },
    {
      label: 'a downward offset',
      text: { align: 'center' as const, verticalAlign: 'middle' as const, offsetY: -6 },
      expected: { point: { x: 20, y: 106 }, align: 'center', baseline: 'middle' },
    },
  ])('places the text with $label', ({ text, expected }) => {
    expect(resolvePointLabelLayout(anchor, text)).toEqual(expected)
  })
})

describe('resolveRectLabelLayout', () => {
  const topLeft = { x: 10, y: 20 }
  const topRight = { x: 110, y: 20 }
  const bottomLeft = { x: 10, y: 80 }

  it.each([
    {
      label: 'centered with an upward offset',
      text: { align: 'center' as const, verticalAlign: 'middle' as const, offsetY: 5 },
      point: { x: 60, y: 45 },
    },
    {
      label: 'at the top-left corner',
      text: { align: 'left' as const, verticalAlign: 'top' as const },
      point: { x: 10, y: 20 },
    },
    {
      label: 'at the bottom-right corner',
      text: { align: 'right' as const, verticalAlign: 'bottom' as const },
      point: { x: 110, y: 80 },
    },
  ])('places the text $label', ({ text, point }) => {
    expect(resolveRectLabelLayout(topLeft, topRight, bottomLeft, text)).toMatchObject({
      point,
      align: text.align,
      baseline: text.verticalAlign,
    })
  })
})

describe('resolveFibLabelLayout', () => {
  it('places the level text just outside the right edge, vertically centered', () => {
    expect(resolveFibLabelLayout(100, 50)).toEqual({
      point: { x: 100 + FIB_LABEL_GAP, y: 50 },
      baseline: 'middle',
    })
  })
})
