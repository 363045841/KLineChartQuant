import { describe, it, expect } from 'vitest'

import {
  roundToPhysicalPixel,
  alignToPhysicalPixelCenter,
  alignRect,
  createVerticalLineRect,
  createHorizontalLineRect,
} from '../../../foundation/utils/pixelAlign'

describe('roundToPhysicalPixel', () => {
  it('应该正确对齐到物理像素边界（dpr=1）', () => {
    expect(roundToPhysicalPixel(0.5, 1)).toBe(1) // 0.5 * 1 = 0.5 -> round(0.5) = 1
    expect(roundToPhysicalPixel(1.2, 1)).toBe(1) // 1.2 * 1 = 1.2 -> round(1.2) = 1
    expect(roundToPhysicalPixel(1.8, 1)).toBe(2) // 1.8 * 1 = 1.8 -> round(1.8) = 2
  })

  it('应该正确对齐到物理像素边界（dpr=2）', () => {
    expect(roundToPhysicalPixel(0.25, 2)).toBe(0.5) // 0.25 * 2 = 0.5 -> round(0.5) = 1 -> 1/2 = 0.5
    expect(roundToPhysicalPixel(1.25, 2)).toBe(1.5) // 1.25 * 2 = 2.5 -> round(2.5) = 3 -> 3/2 = 1.5
    expect(roundToPhysicalPixel(1.75, 2)).toBe(2) // 1.75 * 2 = 3.5 -> round(3.5) = 4 -> 4/2 = 2
  })

  it('应该正确处理整数', () => {
    expect(roundToPhysicalPixel(0, 1)).toBe(0)
    expect(roundToPhysicalPixel(10, 1)).toBe(10)
    expect(roundToPhysicalPixel(10, 2)).toBe(10)
  })

  it('应该正确处理负值', () => {
    expect(roundToPhysicalPixel(-0.5, 1)).toBe(-0) // -0.5 * 1 = -0.5 -> round(-0.5) = -0
    expect(roundToPhysicalPixel(-1.2, 1)).toBe(-1) // -1.2 * 1 = -1.2 -> round(-1.2) = -1
    expect(roundToPhysicalPixel(-1.8, 1)).toBe(-2) // -1.8 * 1 = -1.8 -> round(-1.8) = -2
  })
})

describe('alignToPhysicalPixelCenter', () => {
  it('应该正确对齐到物理像素中心（dpr=1）', () => {
    expect(alignToPhysicalPixelCenter(0, 1)).toBe(0.5) // 0 * 1 = 0 -> floor(0) = 0 -> (0 + 0.5) / 1 = 0.5
    expect(alignToPhysicalPixelCenter(1, 1)).toBe(1.5) // 1 * 1 = 1 -> floor(1) = 1 -> (1 + 0.5) / 1 = 1.5
    expect(alignToPhysicalPixelCenter(1.9, 1)).toBe(1.5) // 1.9 * 1 = 1.9 -> floor(1.9) = 1 -> (1 + 0.5) / 1 = 1.5
  })

  it('应该正确对齐到物理像素中心（dpr=2）', () => {
    expect(alignToPhysicalPixelCenter(0, 2)).toBe(0.25) // 0 * 2 = 0 -> floor(0) = 0 -> (0 + 0.5) / 2 = 0.25
    expect(alignToPhysicalPixelCenter(1, 2)).toBe(1.25) // 1 * 2 = 2 -> floor(2) = 2 -> (2 + 0.5) / 2 = 1.25
    expect(alignToPhysicalPixelCenter(1.9, 2)).toBe(1.75) // 1.9 * 2 = 3.8 -> floor(3.8) = 3 -> (3 + 0.5) / 2 = 1.75
  })

  it('应该正确处理负值', () => {
    expect(alignToPhysicalPixelCenter(0, 1)).toBe(0.5)
    expect(alignToPhysicalPixelCenter(-0.9, 1)).toBe(-0.5) // -0.9 * 1 = -0.9 -> floor(-0.9) = -1 -> (-1 + 0.5) / 1 = -0.5
    expect(alignToPhysicalPixelCenter(-1.9, 1)).toBe(-1.5) // -1.9 * 1 = -1.9 -> floor(-1.9) = -2 -> (-2 + 0.5) / 1 = -1.5
  })
})

describe('alignRect', () => {
  it('应该正确对齐矩形到物理像素边界（dpr=1）', () => {
    const result = alignRect(0.5, 0.5, 10.5, 10.5, 1)
    expect(result.x).toBe(1) // round(0.5) = 1
    expect(result.y).toBe(1) // round(0.5) = 1
    expect(result.width).toBe(10) // round(11) - 1 = 10
    expect(result.height).toBe(10) // round(11) - 1 = 10
  })

  it('应该正确对齐矩形到物理像素边界（dpr=2）', () => {
    const result = alignRect(0.25, 0.25, 5.25, 5.25, 2)
    expect(result.x).toBe(0.5)
    expect(result.y).toBe(0.5)
    expect(result.width).toBe(5)
    expect(result.height).toBe(5)
  })

  it('应该确保宽度和高度至少为 1/dpr', () => {
    const result = alignRect(0, 0, 0.1, 0.1, 2)
    expect(result.width).toBe(0.5) // 1/dpr = 1/2 = 0.5
    expect(result.height).toBe(0.5)
  })

  it('应该正确处理负坐标', () => {
    const result = alignRect(-0.5, -0.5, 10, 10, 1)
    expect(result.x).toBe(-0) // round(-0.5) = -0
    expect(result.y).toBe(-0) // round(-0.5) = -0
    expect(result.width).toBe(10) // round(9.5) - (-0) = 10
    expect(result.height).toBe(10) // round(9.5) - (-0) = 10
  })
})

describe('createVerticalLineRect', () => {
  it('应该创建1物理像素宽的垂直线矩形（dpr=1）', () => {
    const result = createVerticalLineRect(10, 0, 20, 1)
    expect(result).not.toBeNull()
    expect(result?.x).toBe(10)
    expect(result?.y).toBe(0)
    expect(result?.width).toBe(1) // 1/dpr = 1/1 = 1
    expect(result?.height).toBe(20)
  })

  it('应该创建1物理像素宽的垂直线矩形（dpr=2）', () => {
    const result = createVerticalLineRect(10, 0, 20, 2)
    expect(result).not.toBeNull()
    expect(result?.x).toBe(10)
    expect(result?.y).toBe(0)
    expect(result?.width).toBe(0.5) // 1/dpr = 1/2 = 0.5
    expect(result?.height).toBe(20)
  })

  it('应该正确处理反转的y坐标', () => {
    const result = createVerticalLineRect(10, 20, 0, 1)
    expect(result?.y).toBe(0)
    expect(result?.height).toBe(20)
  })

  it('应该返回null当y1等于y2时', () => {
    const result = createVerticalLineRect(10, 5, 5, 1)
    expect(result).toBeNull()
  })

  it('应该正确对齐到物理像素边界', () => {
    const result = createVerticalLineRect(10.25, 0, 20, 2)
    expect(result?.x).toBe(10.5) // 对齐到物理像素边界
  })

  it('应该确保高度至少为1', () => {
    const result = createVerticalLineRect(10, 0, 0.5, 1)
    expect(result?.height).toBe(1)
  })
})

describe('createHorizontalLineRect', () => {
  it('应该创建1物理像素高的水平线矩形（dpr=1）', () => {
    const result = createHorizontalLineRect(0, 20, 10, 1)
    expect(result).not.toBeNull()
    expect(result?.x).toBe(0)
    expect(result?.y).toBe(10)
    expect(result?.width).toBe(20)
    expect(result?.height).toBe(1) // 1/dpr = 1/1 = 1
  })

  it('应该创建1物理像素高的水平线矩形（dpr=2）', () => {
    const result = createHorizontalLineRect(0, 20, 10, 2)
    expect(result).not.toBeNull()
    expect(result?.x).toBe(0)
    expect(result?.y).toBe(10)
    expect(result?.width).toBe(20)
    expect(result?.height).toBe(0.5) // 1/dpr = 1/2 = 0.5
  })

  it('应该正确处理反转的x坐标', () => {
    const result = createHorizontalLineRect(20, 0, 10, 1)
    expect(result?.x).toBe(0)
    expect(result?.width).toBe(20)
  })

  it('应该返回null当x1等于x2时', () => {
    const result = createHorizontalLineRect(10, 10, 5, 1)
    expect(result).toBeNull()
  })

  it('应该正确对齐到物理像素边界', () => {
    const result = createHorizontalLineRect(0.25, 20.25, 10, 2)
    expect(result?.x).toBe(0.5) // 对齐到物理像素边界
    expect(result?.width).toBe(20)
  })

  it('应该确保宽度至少为1', () => {
    const result = createHorizontalLineRect(0, 0.5, 10, 1)
    expect(result?.width).toBe(1)
  })

  it('应该正确处理小数坐标（dpr=1）', () => {
    const result = createHorizontalLineRect(1.3, 5.7, 10.2, 1)
    expect(result?.x).toBe(1) // 1.3 * 1 = 1.3 -> round(1.3) = 1 -> 1/1 = 1
    expect(result?.width).toBe(5) // left=1.3 -> physLeft=1, right=5.7 -> physRight=6 -> (6-1)/1 = 5
    expect(result?.y).toBe(10) // 10.2 * 1 = 10.2 -> round(10.2) = 10 -> 10/1 = 10 (对齐到物理像素)
    expect(result?.height).toBe(1)
  })
})
