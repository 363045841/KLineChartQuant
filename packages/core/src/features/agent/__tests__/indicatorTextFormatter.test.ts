// 本文件验证专用转义器匹配和通用 Markdown 表格的降级规则。

import { describe, expect, it } from 'vitest'

import { createIndicatorTextFormatter } from '../impl/indicator/indicatorTextFormatter'

const TIMESTAMPS = [1000, 2000, 3000]

/** 创建文本转义器测试使用的最小上下文。 */
function createContext(series: unknown, definitionId = 'unknown') {
  return {
    definitionId,
    params: {},
    timestamps: TIMESTAMPS,
    series,
    from: Number.NEGATIVE_INFINITY,
    to: Number.POSITIVE_INFINITY,
    limit: 20,
  }
}

describe('createIndicatorTextFormatter', () => {
  it('uses Markdown tables for unregistered result shapes', () => {
    const formatter = createIndicatorTextFormatter()

    expect(
      formatter.format(
        createContext({
          summary: { upper: 5, lower: 2 },
          levels: [1, 2],
        }),
      ),
    ).toBe(`unknown

| summary.upper | summary.lower | levels |
| --- | --- | --- |
| 5 | 2 | [2] |`)
  })

  it('skips circular fields without rejecting the result', () => {
    const formatter = createIndicatorTextFormatter()
    const circular: { readonly name: string; self?: unknown } = { name: 'root' }
    circular.self = circular

    expect(formatter.format(createContext({ node: circular }))).toBe(`unknown

| node.name |
| --- |
| root |`)
  })

  it('normalizes all line ending variants inside Markdown table cells', () => {
    const formatter = createIndicatorTextFormatter()

    expect(
      formatter.format(createContext({ note: 'first\rsecond\r\nthird\nfourth' })),
    ).toBe(`unknown

| note |
| --- |
| first second third fourth |`)
  })

  it('maps internal indexes to dates instead of exposing indexes to the Agent', () => {
    const formatter = createIndicatorTextFormatter()

    expect(formatter.format(createContext([{ index: 1, value: 5 }]))).toBe(`unknown

| date | value |
| --- | --- |
| 1970-01-01 08:00 | 5 |`)
  })

  it('formats interval results through the common table output', () => {
    const formatter = createIndicatorTextFormatter()

    expect(
      formatter.format(
        createContext(
          [
            { kind: 'FVG_BULL', low: 10, high: 12, startIndex: 1 },
            { kind: 'OB_BEAR', low: 13, high: 15, startIndex: 2, endIndex: 2 },
          ],
          'zones',
        ),
      ),
    ).toBe(`zones

| date | kind | low | high | endDate |
| --- | --- | --- | --- | --- |
| 1970-01-01 08:00 | FVG_BULL | 10 | 12 | - |
| 1970-01-01 08:00 | OB_BEAR | 13 | 15 | 1970-01-01 08:00 |`)
  })

  it('formats aggregate results without a native indicator special case', () => {
    const formatter = createIndicatorTextFormatter()

    expect(
      formatter.format(
        createContext(
          {
            poc: 12,
            val: 10,
            vah: 14,
            totalVolume: 100,
            bins: [
              { priceLow: 10, priceHigh: 11, volume: 20 },
              { priceLow: 11, priceHigh: 12, volume: 50 },
            ],
          },
          'volumeProfile',
        ),
      ),
    ).toBe(`volumeProfile

| poc | val | vah | totalVolume | bins |
| --- | --- | --- | --- | --- |
| 12 | 10 | 14 | 100 | [2] |`)
  })
})
