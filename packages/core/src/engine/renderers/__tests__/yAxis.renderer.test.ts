/** 统一轴入口回归：同窗格独立轴的刻度、十字线、装饰标签不会互相覆盖。 */
import { describe, expect, it } from 'vitest'
import {
  createMockPaneInfo,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { AxisWidthEstimator } from '@/engine/axisWidth/impl/axisWidthEstimator.js'
import type { PaneAxisSpec } from '@/engine/pane/axisResolver.js'
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
  const specs: PaneAxisSpec[] = scales.map((_, index) => ({
    objectId: `object-${index}`,
    paneId: 'pane-7',
    axisId: `axis-${index}`,
    decimals: 2,
    visible: true,
    scaleType: ScaleType.Linear,
  }))
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
    expect(second.some((label) => label.text === '500.00')).toBe(true)
    const estimator = new AxisWidthEstimator()
    estimator.estimate({
      labels: context.axisLabels,
      axes: specs,
      updateStatic: true,
      updateOverlay: true,
    })
    const layout = estimator.getLayout(specs.map((spec) => spec.axisId))
    expect(layout['axis-0']!.width).toBeGreaterThan(0)
    expect(layout['axis-1']!.left).toBe(layout['axis-0']!.width)
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
