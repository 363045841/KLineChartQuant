/** 标签布局：锚点投影、超界隐藏、标签避让与钉住标签的实际行为。 */
import { describe, expect, it } from 'vitest'
import { layoutAxisLabels } from '../impl/layout.js'
import { axisTagHeight } from '../impl/metrics.js'
import type { AxisColumn, AxisLabel, ValueAxisLabel } from '../types.js'

/** 1 价格 = 10 像素的值轴列；标签铺满列宽，因此只需纵向几何。 */
function valueColumn(height = 200): AxisColumn {
  return {
    dpr: 1,
    width: 60,
    height,
    offsetX: 0,
    projection: {
      kind: 'value',
      yFor: (value) => value * 10,
      textFor: (value) => value.toFixed(2),
    },
    palette: { text: '#111', onBackground: '#fff' },
  }
}

/** 时间轴列：1 逻辑槽位 = 10 像素。 */
function timeColumn(width = 200, height = 24): AxisColumn {
  return {
    dpr: 1,
    width,
    height,
    offsetX: 0,
    projection: { kind: 'time', xFor: (index) => index * 10 },
    palette: { text: '#111', onBackground: '#fff' },
  }
}

/** 带底色的自由标签。 */
function tag(value: number, extra: Partial<ValueAxisLabel> = {}): ValueAxisLabel {
  return { kind: 'value', axisId: 'price', role: 'tag', value, background: '#f00', ...extra }
}

describe('layoutAxisLabels', () => {
  it('超界锚点直接隐藏，不做边缘吸附', () => {
    const placed = layoutAxisLabels([tag(5), tag(25)], valueColumn(200))
    expect(placed).toHaveLength(1)
    expect(placed[0]?.label).toMatchObject({ value: 5 })
  })

  it.each([
    {
      label: '单行标签',
      labels: () => [tag(10), tag(10.1)],
      minimum: axisTagHeight(1),
    },
    {
      label: '单行与两行混排',
      labels: () => [tag(10, { note: '12:34' }), tag(10.1)],
      minimum: (axisTagHeight(2) + axisTagHeight(1)) / 2,
    },
  ])('$label 按标签高度错开，不产生像素重叠', ({ labels, minimum }) => {
    const placed = layoutAxisLabels(labels(), valueColumn(200))
    const [first, second] = placed.map((item) => item.center).sort((a, b) => a - b)
    expect(Math.abs(second! - first!)).toBeGreaterThanOrEqual(minimum)
  })

  it.each([
    { label: '刻度', role: 'tick' as const },
    { label: '钉住标签', role: 'marker' as const },
  ])('$label 不参与避让，保持锚点位置', ({ role }) => {
    const labels: ValueAxisLabel[] = [
      { kind: 'value', axisId: 'price', role, value: 10, background: '#0f0' },
      tag(10.1),
    ]
    const placed = layoutAxisLabels(labels, valueColumn(200))
    expect(placed.find((item) => item.label.role === role)?.center).toBe(100)
  })

  it('钉住标签被夹在列内', () => {
    const placed = layoutAxisLabels(
      [{ kind: 'value', axisId: 'price', role: 'marker', value: 0, background: '#0f0' }],
      valueColumn(200),
    )
    expect(placed[0]?.center).toBe(axisTagHeight(1) / 2)
  })

  it('时间轴刻度避开画布两端留白', () => {
    const labels: AxisLabel[] = [
      { kind: 'time', role: 'tick', index: 0, text: '0' },
      { kind: 'time', role: 'tick', index: 10, text: '10' },
    ]
    const placed = layoutAxisLabels(labels, timeColumn(200))
    expect(placed.map((item) => item.anchor)).toEqual([100])
  })

  it('时间轴色块宽度按文本估算并夹在可视区内', () => {
    const placed = layoutAxisLabels(
      [{ kind: 'time', role: 'marker', index: 0, text: '09:30:00', background: '#f00' }],
      timeColumn(200),
    )
    const item = placed[0]!
    expect(item.width).toBeGreaterThan(0)
    expect(item.center).toBe(item.width / 2)
  })
})
