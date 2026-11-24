/** 标签宽度估算：与绘制共用同一文本解析，值标签按列投影格式化。 */
import { describe, expect, it } from 'vitest'
import { measureAxisLabels } from '../impl/measure.js'
import type { AxisColumnProjection, AxisLabel, ValueAxisLabel } from '../types.js'

const projection: AxisColumnProjection = {
  kind: 'value',
  yFor: (value) => value,
  textFor: (value, format) => (format === 'percent' ? `${value.toFixed(2)}%` : value.toFixed(2)),
}

/** 单条值标签。 */
function valueLabel(value: number, extra: Partial<ValueAxisLabel> = {}): AxisLabel {
  return { kind: 'value', axisId: 'price', role: 'tag', value, background: '#f00', ...extra }
}

const measure = (label: AxisLabel): number => measureAxisLabels([label], projection)

describe('measureAxisLabels', () => {
  it.each<{ label: string; narrow: AxisLabel; wide: AxisLabel }>([
    { label: '宽度随文本增长', narrow: valueLabel(1), wide: valueLabel(123456.78) },
    {
      label: '两行标签取较宽一行',
      narrow: valueLabel(1),
      wide: valueLabel(1, { note: '12:34:56' }),
    },
    {
      label: '格式覆盖参与宽度计算',
      narrow: valueLabel(1234.5),
      wide: valueLabel(1234.5, { format: 'percent' }),
    },
  ])('$label', ({ narrow, wide }) => {
    expect(measure(wide)).toBeGreaterThan(measure(narrow))
  })
})
