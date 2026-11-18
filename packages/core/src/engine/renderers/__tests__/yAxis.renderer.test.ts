/** 统一轴入口回归：同窗格独立轴的刻度、十字线、装饰标签不会互相覆盖。 */
import { describe, expect, it } from 'vitest'
import {
  createMockPaneInfo,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { layoutAxisColumns } from '@/engine/axisWidth/impl/axisColumns.js'
import { resolvePaneAxes } from '@/engine/pane/axisResolver.js'
import { PriceScale } from '@/engine/scale/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import { registerAxisLabel } from '../impl/labels/index.js'
import { axisFrameApi } from '../yAxis.js'

/** 两条数值数量级不同的轴共用同一 Pane，轴身份与 Pane 名称无关。 */
function fixture() {
  const scales = [new PriceScale(), new PriceScale()]
  scales.forEach((scale) => scale.setHeight(400))
  scales[0]!.setRange({ minPrice: 90, maxPrice: 110 })
  scales[1]!.setRange({ minPrice: 0, maxPrice: 1000 })
  const objects = scales.map((_, index) => ({
    objectId: `object-${index}`,
    paneId: 'pane-7',
    axisId: `axis-${index}`,
    decimals: 2,
    visible: true,
    scaleType: ScaleType.Linear,
  }))
  const specs = resolvePaneAxes(['pane-7'], [
    ...objects,
    { ...objects[0]!, objectId: 'same-price-axis' },
  ]).get('pane-7')!
  const pane = createMockPaneInfo({
    id: 'pane-7',
    height: 400,
    yAxis: scales[0],
    axes: specs.map((spec, index) => ({ axisId: spec.axisId, yAxis: scales[index]! })),
    axis: (id) => scales[specs.findIndex((spec) => spec.axisId === id)]!,
  })
  return { specs, context: createMockRenderContext({ pane }) }
}

describe('统一 Y 轴 API', () => {
  it('每条轴独立生成刻度和十字线，业务标签保留在指定轴', () => {
    const { specs, context } = fixture()
    registerAxisLabel(
      context,
      'yRightOverlay',
      { kind: 'tag', text: 'latest', pos: 30, bgColor: 'red', textColor: 'white' },
      'axis-0',
    )
    axisFrameApi.collect(context, specs, { y: 200, activePaneId: 'pane-7' })
    const first = context.axisLabels.forSurface('yRightOverlay', 'axis-0').labels
    const second = context.axisLabels.forSurface('yRightOverlay', 'axis-1').labels
    expect(first.map((label) => label.text)).toContain('latest')
    expect(second.map((label) => label.text)).not.toContain('latest')
    expect(first.some((label) => label.text === '100.00')).toBe(true)
    expect(first.filter((label) => label.text === '100.00')).toHaveLength(1)
    expect(second.some((label) => label.text === '500.00')).toBe(true)
    const ticks = context.axisLabels.forSurface('yRightStatic', 'axis-0').labels
    expect(ticks.length).toBeGreaterThan(0)
    expect(new Set(ticks.map((tick) => tick.pos)).size).toBe(ticks.length)
    // 列几何按轴顺序展开：主轴列在前，列宽之和等于提交的轴区宽度。
    const columns = layoutAxisColumns(
      specs.map((spec) => spec.axisId),
      { 'axis-0': 40, 'axis-1': 60 },
      100,
    )
    expect(columns[0]!.width).toBe(40)
    expect(columns[1]!.left).toBe(40)
    expect(columns[1]!.left + columns[1]!.width).toBe(100)
  })

  it('指定不存在的目标轴时在 API 层抛异常', () => {
    const { context } = fixture()
    expect(() =>
      registerAxisLabel(
        context,
        'yRightOverlay',
        { kind: 'tick', text: 'bad', pos: 0, color: 'red' },
        'missing',
      ),
    ).toThrow('missing')
  })
})
