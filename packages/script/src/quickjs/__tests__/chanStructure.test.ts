/**
 * CHAN 脚本的结构输出回归：中枢必须能结束并再次成立、存续期延伸，且长历史下不被额度淘汰。
 *
 * 这两条都是真实踩过的坑：旧实现在第一个中枢成立后永不新建，向右加载历史时重算会把
 * 唯一的中枢挪到老数据区，看起来像「已画的中枢消失」；笔线又共用默认 50 条额度，
 * 超出后最早的对象被 API 淘汰，历史区的笔直接消失。
 */
import { describe, expect, it } from 'vitest'
import { shippedSource } from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 生成带多段波动的日线：既要有足够多的分型成笔，也要有反复回到区间的走势成中枢。 */
function syntheticBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const base =
      100 + Math.sin(index / 11) * 12 + Math.sin(index / 3.7) * 4 + Math.sin(index / 61) * 25
    return {
      time: index,
      open: base - Math.sin(index / 5) * 1.5,
      high: base + 2.4 + Math.abs(Math.cos(index / 4)) * 1.2,
      low: base - 2.4 - Math.abs(Math.sin(index / 6)) * 1.2,
      close: base,
      volume: 10,
    }
  })
}

/** 一次执行供全部用例共享：脚本是确定性的，不必每个用例重跑 2600 根。 */
const execution = runQuickJSScript({
  source: shippedSource('chan'),
  bars: syntheticBars(2600),
  params: {},
})

/** 只取矩形的文字标识，保留创建顺序。 */
function hubLabels(drawings: Awaited<typeof execution>['drawings']): string[] {
  return (drawings ?? [])
    .filter((drawing) => drawing.kind === 'rectangle')
    .map((drawing) => drawing.text?.value ?? '')
    .filter((text) => text.length > 0)
}

describe('CHAN 结构输出', () => {
  it('笔级与段级中枢都能结束并再次成立，标识递增', async () => {
    const labels = hubLabels((await execution).drawings)
    expect(labels).toContain('中枢一（周）')
    expect(labels).toContain('中枢二（周）')
    expect(labels).toContain('段中枢一（周）')
    // 序号超过十也要用中文，避免图例里出现「中枢12」这类混排。
    expect(labels.filter((text) => /中枢\d/.test(text))).toEqual([])
  })

  it('笔与段不被默认 50 条线额度淘汰', async () => {
    const drawings = (await execution).drawings ?? []
    const lines = drawings.filter((drawing) => drawing.kind === 'trend-line')
    expect(lines.length).toBeGreaterThan(50)
  })

  it('中枢存续期间右边界随时间延伸，不会停在成立那一刻', async () => {
    const rectangles = ((await execution).drawings ?? []).filter(
      (drawing) => drawing.kind === 'rectangle',
    )
    const widths = rectangles.map((drawing) => {
      const left = drawing.anchors[0]?.logicalIndex ?? Number.NaN
      const right = drawing.anchors[1]?.logicalIndex ?? Number.NaN
      return right - left
    })
    // 三笔合成一个中枢，跨度必然覆盖多个合成 bar；成立即冻结的旧实现宽度只有 0~1 步。
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(9)
  })
})
