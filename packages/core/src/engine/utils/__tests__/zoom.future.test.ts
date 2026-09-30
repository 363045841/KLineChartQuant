/**
 * computeZoom 锚点回归测试。
 *
 * 唯一行为：缩放以**指针所在的槽位**为中心，该槽位在缩放前后保持同一屏幕位置。
 * 数据区与未来区共用同一槽位网格，因此三种指针位置（未来区 / 数据区 / 数据左侧空白）
 * 走同一条公式，不存在按「有无数据」分流的第二种行为。
 *
 * 数值基准：zoomLevelCount=6，[minKWidth, maxKWidth]=[3, 21]，
 * 级别 6→5 缩小一级：kWidth 21→17.4；dpr=1 时 unitPx 24→20、startXPx 均为 3。
 */
import { describe, expect, it } from 'vitest'
import type { ZoomConfigBase, ZoomInput } from '../zoom'
import { computeZoom, kGapFromKWidth } from '../zoom'

/** 缩放映射基准：6 个级别，宽度区间 [3, 21]。 */
const CONFIG: ZoomConfigBase = { minKWidth: 3, maxKWidth: 21, zoomLevelCount: 6 }
const FROM_LEVEL = 6
const TO_LEVEL = 5
const FROM_KWIDTH = 21

/** 构造一次「级别 6 → 5」缩小的输入，用例只声明差异。 */
function shrink(overrides: Partial<ZoomInput> = {}): ZoomInput {
  const dpr = overrides.dpr ?? 1
  return {
    targetLevel: TO_LEVEL,
    currentLevel: FROM_LEVEL,
    currentKWidth: FROM_KWIDTH,
    currentKGap: kGapFromKWidth(FROM_KWIDTH, dpr),
    anchorViewportX: 0,
    scrollLeftLogical: 0,
    dpr,
    config: CONFIG,
    ...overrides,
  }
}

describe('computeZoom 锚点 = 指针所在槽位', () => {
  it.each([
    {
      label: '未来区',
      anchorViewportX: 900,
      scrollLeftLogical: 2000,
      dpr: 1,
      expected: 36412 / 24,
    },
    { label: '数据区', anchorViewportX: 100, scrollLeftLogical: 0, dpr: 1, expected: -388 / 24 },
    {
      label: '数据左侧空白',
      anchorViewportX: -100,
      scrollLeftLogical: 0,
      dpr: 1,
      expected: 412 / 24,
    },
    {
      label: '高 DPR 未来区',
      anchorViewportX: 900,
      scrollLeftLogical: 2000,
      dpr: 2,
      expected: 1604.75,
    },
  ])(
    '$label：缩放前后指针槽位停在原屏幕位置',
    ({ anchorViewportX, scrollLeftLogical, dpr, expected }) => {
      const result = computeZoom(shrink({ anchorViewportX, scrollLeftLogical, dpr }))
      expect(result?.scrollLeftLogical).toBeCloseTo(expected, 10)
    },
  )

  it('目标级别与当前相同（已到边界）时返回 null', () => {
    expect(computeZoom(shrink({ targetLevel: FROM_LEVEL }))).toBeNull()
  })
})
