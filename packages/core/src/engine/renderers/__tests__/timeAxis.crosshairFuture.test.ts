/**
 * timeAxis 十字签未来槽位时间解析测试。
 *
 * resolveCrosshairTimestamp：数据区内优先真实 bar（不走数据层外推）；
 * 越界槽位回退 context.getTimestampAtLogicalIndex；回调缺省或返回 null 时为 null。
 */
import { describe, expect, it } from 'vitest'

import { createKLineData, createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'

import { createTimeAxisLayer, resolveCrosshairTimestamp } from '../timeAxis'

/** 构造带外推回调与自定义数据量的 RenderContext；extrapolated 为任意越界索引的返回值。 */
function buildContext(options: {
  barCount?: number
  extrapolated?: number | null
  onExtrapolate?: () => void
}) {
  const data = createKLineData(options.barCount ?? 5)
  const context = createMockRenderContext({
    data,
    ...(options.onExtrapolate || options.extrapolated !== undefined
      ? {
          getTimestampAtLogicalIndex: (index: number) => {
            options.onExtrapolate?.()
            return index >= data.length ? (options.extrapolated ?? null) : null
          },
        }
      : {}),
  })
  return { context, data }
}

describe('resolveCrosshairTimestamp 十字线时间解析', () => {
  it('索引在数据区内返回真实 timestamp，不调用外推回调', () => {
    let calls = 0
    const { context, data } = buildContext({
      onExtrapolate: () => {
        calls++
      },
    })

    const result = resolveCrosshairTimestamp(context, 2)

    expect(result).toBe(data[2]?.timestamp)
    expect(calls).toBe(0)
  })

  it('索引越界时返回 getTimestampAtLogicalIndex 的值', () => {
    const { context } = buildContext({ extrapolated: 9_999 })

    expect(resolveCrosshairTimestamp(context, 7)).toBe(9_999)
  })

  it.each([
    { label: '回调缺省', options: {} },
    { label: '回调返回 null', options: { extrapolated: null } },
  ])('索引越界且$label时返回 null', ({ options }) => {
    const { context } = buildContext(options)

    expect(resolveCrosshairTimestamp(context, 7)).toBeNull()
  })
})

describe('timeAxis draw 越界十字签接线', () => {
  it('越界十字线索引在 xCrosshair 表面注册外推时间标签', () => {
    const data = createKLineData(5)
    const last = data[data.length - 1]!.timestamp
    const { context } = buildContext({ extrapolated: last + 60_000 })
    createTimeAxisLayer({
      height: 24,
      getCrosshair: () => ({ x: context.paneWidth, index: data.length }),
    }).paint({ ...context, paneId: 'xAxis', clear: false })

    const labels = context.axisLabels.forSurface('xCrosshair').labels
    expect(labels).toHaveLength(1)
    expect(labels[0]?.text).toBe(context.displayTimeFormatter.formatDate(last + 60_000))
    expect(labels[0]?.pos).toBe(context.paneWidth)
  })

  it.each([
    { label: '日历缺失的未来槽显示相对索引', indexOffset: 2, expected: 'T+3' as const },
    { label: '历史区显示真实日期', indexOffset: -1, expected: 'real' as const },
  ])('十字线索引 $label', ({ indexOffset, expected }) => {
    const { context, data } = buildContext({ extrapolated: null })
    createTimeAxisLayer({
      height: 24,
      getCrosshair: () => ({ x: 42, index: data.length + indexOffset }),
    }).paint({ ...context, paneId: 'xAxis', clear: false })

    const text = context.axisLabels.forSurface('xCrosshair').labels[0]?.text
    expect(text).toBe(
      expected === 'real'
        ? context.displayTimeFormatter.formatDate(data[data.length - 1]!.timestamp)
        : expected,
    )
  })
})
