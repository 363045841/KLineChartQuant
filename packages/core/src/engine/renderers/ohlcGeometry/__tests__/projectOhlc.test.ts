/** OHLC 共用几何验证：美国线方向、像素对齐和透明色下不重叠。 */
import { describe, expect, it } from 'vitest'
import { projectOhlc } from '../impl/projectOhlc.js'
import type { OhlcGeometryInput, OhlcRect } from '../types.js'

/** 矩形的内部是否相交；共用边界不算重叠。 */
function overlap(a: OhlcRect, b: OhlcRect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
}

describe('OHLC geometry', () => {
  it.each([1, 1.25, 1.5, 2, 3])('高低线以实体宽度覆盖完整区间，DPR=%s', (dpr) => {
    for (const zoomLevel of [1, 10]) {
      for (const [highY, lowY] of [
        [10, 80],
        [80, 10],
        [30, 30],
      ]) {
        const input: OhlcGeometryInput = {
          openY: 30,
          closeY: 60,
          highY: highY!,
          lowY: lowY!,
          center: 100,
          widthPx: 11,
          dpr,
          zoomLevel,
          shape: 'high-low',
          separateBorder: false,
        }
        const geometry = projectOhlc(input)
        const stem = geometry.body[0]
        expect(geometry.body).toHaveLength(1)
        expect(geometry.border).toEqual([])
        expect(geometry.wick).toEqual([])
        expect(stem?.[1]).toBe(Math.min(Math.round(highY! * dpr), Math.round(lowY! * dpr)) / dpr)
        const candle = projectOhlc({ ...input, shape: 'candlestick', openY: highY!, closeY: lowY! })
        expect(stem?.[0]).toBe(candle.body[0]?.[0])
        expect(stem?.[2]).toBe(candle.body[0]?.[2])
        expect(stem?.[2]).toBeGreaterThan(2 / dpr)
        expect(stem?.[3]).toBe(
          Math.max(1, Math.abs(Math.round(lowY! * dpr) - Math.round(highY! * dpr))) / dpr,
        )
        expect(projectOhlc({ ...input, openY: 500, closeY: -500 })).toEqual(geometry)
      }
    }
  })

  it.each([1, 1.25, 1.5, 2, 3])('同色等宽蜡烛合并后保留全部物理像素，DPR=%s', (dpr) => {
    for (const shape of ['candlestick', 'hollow-candlestick'] as const) {
      for (const prices of [
        { openY: 30, highY: 10, lowY: 80, closeY: 60 },
        { openY: 60, highY: 10, lowY: 80, closeY: 30 },
        { openY: 30, highY: 30, lowY: 30, closeY: 30 },
      ]) {
        const input: OhlcGeometryInput = {
          ...prices,
          center: 100,
          widthPx: 1,
          dpr,
          zoomLevel: 1,
          shape,
          separateBorder: false,
        }
        const original = projectOhlc(input)
        const merged = projectOhlc({ ...input, mergeWick: true })
        const rects = [...original.body, ...original.border, ...original.wick]
        const top = Math.min(...rects.map((rect) => rect[1]))
        const bottom = Math.max(...rects.map((rect) => rect[1] + rect[3]))
        expect(merged.body).toHaveLength(1)
        expect(merged.body[0]?.[0]).toBe(rects[0]?.[0])
        expect(merged.body[0]?.[1]).toBeCloseTo(top)
        expect(merged.body[0]?.[2]).toBe(1 / dpr)
        expect(merged.body[0]?.[3]).toBeCloseTo(bottom - top)
        expect(merged.border).toEqual([])
        expect(merged.wick).toEqual([])
      }
    }
  })

  it('独立边框和宽实体保留分段几何', () => {
    const input: OhlcGeometryInput = {
      openY: 30,
      highY: 10,
      lowY: 80,
      closeY: 60,
      center: 100,
      widthPx: 1,
      dpr: 1,
      zoomLevel: 1,
      shape: 'candlestick',
      separateBorder: false,
    }
    for (const change of [{ separateBorder: true }, { widthPx: 3 }]) {
      expect(projectOhlc({ ...input, ...change, mergeWick: true })).toEqual(
        projectOhlc({ ...input, ...change }),
      )
    }
    expect(projectOhlc(input).wick).toHaveLength(2)
  })

  it.each([1, 1.25, 1.5, 2, 3])('美国线左开右收，DPR=%s', (dpr) => {
    const geometry = projectOhlc({
      openY: 30,
      highY: 10,
      lowY: 80,
      closeY: 60,
      center: 100,
      widthPx: 11,
      dpr,
      zoomLevel: 1,
      shape: 'ohlc-bar',
      separateBorder: false,
    })
    expect(geometry.body).toHaveLength(3)
    const [stem, open, close] = geometry.body
    if (!stem || !open || !close) throw new Error('Missing OHLC ticks')
    expect(open[0] + open[2]).toBeCloseTo(stem[0])
    expect(close[0]).toBeCloseTo(stem[0] + stem[2])
    expect(open[1]).toBeCloseTo(Math.round(30 * dpr) / dpr)
    expect(close[1]).toBeCloseTo(Math.round(60 * dpr) / dpr)
    for (const rect of geometry.body)
      for (const value of rect) expect(value * dpr).toBeCloseTo(Math.round(value * dpr))
  })

  it('不同颜色的实体、边框和影线不重叠，空心模式保留内部透明', () => {
    for (const shape of ['candlestick', 'hollow-candlestick'] as const) {
      const geometry = projectOhlc({
        openY: 30,
        highY: 10,
        lowY: 80,
        closeY: 60,
        center: 100,
        widthPx: 11,
        dpr: 1,
        zoomLevel: 1,
        shape,
        separateBorder: true,
      })
      const rects = [...geometry.body, ...geometry.border, ...geometry.wick]
      rects.forEach((rect, index) => {
        for (const other of rects.slice(index + 1)) expect(overlap(rect, other)).toBe(false)
      })
      expect(geometry.body).toHaveLength(shape === 'candlestick' ? 1 : 0)
      expect(geometry.border).toHaveLength(4)
    }
  })
})
