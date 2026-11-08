// 验证各 Pane 的最终标签统一估算、增量帧保留与删除后的收缩。
import { describe, expect, it } from 'vitest'
import { AXIS_LABEL_KIND } from '../../../foundation/plugin/types.js'
import { createAxisLabelsFrame } from '../../renderers/impl/labels/impl/axisLabelCollector.js'
import {
  AxisWidthEstimator,
  estimateAxisTextWidth,
  resolveAxisWidth,
} from '../impl/axisWidthEstimator.js'

describe('AxisWidthEstimator', () => {
  it('根据字符组成与字号估算文本宽度', () => {
    expect(estimateAxisTextWidth('-100.00%')).toBeGreaterThan(estimateAxisTextWidth('100.00'))
    expect(estimateAxisTextWidth('亿')).toBeGreaterThan(estimateAxisTextWidth('1'))
    expect(estimateAxisTextWidth('123', 24)).toBe(estimateAxisTextWidth('123', 12) * 2)
  })

  it('副图可撑宽公共轴，删除后收缩，左右分别汇总', () => {
    const estimator = new AxisWidthEstimator()
    const labels = createAxisLabelsFrame()
    for (const [id, text] of [
      ['main', '10.00'],
      ['sub', '-123456789.123456'],
    ] as const) {
      labels.forSurface('yRightStatic', id).register({
        kind: AXIS_LABEL_KIND.TICK,
        text,
        pos: 0,
        color: '',
      })
    }
    labels.forSurface('yLeftStatic', 'main').register({
      kind: AXIS_LABEL_KIND.TICK,
      text: '1.00%',
      pos: 0,
      color: '',
    })
    const full = estimator.estimate({
      labels,
      paneIds: ['main', 'sub'],
      updateStatic: true,
      updateOverlay: true,
    })
    expect(full.right).toBeGreaterThan(full.left)
    const overlay = estimator.estimate({
      labels: createAxisLabelsFrame(),
      paneIds: ['main', 'sub'],
      updateStatic: false,
      updateOverlay: true,
    })
    expect(overlay).toEqual(full)
    const removed = estimator.estimate({
      labels,
      paneIds: ['main'],
      updateStatic: true,
      updateOverlay: true,
    })
    expect(removed.right).toBeLessThan(full.right)
    expect(removed.left).toBe(full.left)
  })

  it('格式、字号与倒计时变化会改变估算宽度', () => {
    const estimator = new AxisWidthEstimator()
    const estimate = (text: string, fontSize: number, countdown?: string) => {
      const labels = createAxisLabelsFrame()
      labels.forSurface('yRightOverlay', 'main').register({
        kind: AXIS_LABEL_KIND.TAG,
        text,
        fontSize,
        countdown,
        pos: 0,
        bgColor: '',
        textColor: '',
      })
      return estimator.estimate({
        labels,
        paneIds: ['main'],
        updateStatic: true,
        updateOverlay: true,
      }).right
    }
    expect(estimate('-1.00%', 12)).toBeGreaterThan(estimate('1.00', 12))
    expect(estimate('1.00', 18)).toBeGreaterThan(estimate('1.00', 12))
    expect(estimate('1', 12, '12:34:56')).toBeGreaterThan(estimate('1', 12))
  })

  it('锁定后轴宽只增不减，解锁后按当前需求重算', () => {
    // 缩放过程中标签会变窄；已提交宽度必须保留，否则绘图区会改变宽度。
    expect(resolveAxisWidth(60, 40, 67)).toBe(67)
    // 出现更宽的标签时仍可撑宽。
    expect(resolveAxisWidth(60, 80, 67)).toBe(80)
    // 配置下限始终生效。
    expect(resolveAxisWidth(60, 0, null)).toBe(60)
    // 布局变化后解锁：按当前需求重算，允许收缩。
    expect(resolveAxisWidth(60, 48, null)).toBe(60)
  })
})
