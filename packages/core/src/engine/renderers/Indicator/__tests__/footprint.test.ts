import { describe, expect, it, vi } from 'vitest'
import { createFootprintCalculator } from '../../../../components/footprint/impl/calculateFootprint.js'
import type { FootprintBar, FootprintRenderState } from '../../../../components/footprint/types.js'
import { EMPTY_TRADE_SNAPSHOT } from '../../../../data/trades/types.js'
import {
  createContextWithInstanceState,
  createKLineData,
  createMockCanvasContext,
} from '../../../__tests__/helpers/renderTestKit.js'
import { getRegisteredIndicatorDefinition } from '../../../indicators/indicatorDefinitionRegistry.js'
import { composeInstanceRenderState } from '../../../indicators/stateComposer.js'
import { FootprintIndicatorDefinition } from '../footprint.js'

describe('Footprint Layer', () => {
  it.each([0, 80])(
    'draws loaded trades with viewport start %i using visible frame coordinates',
    (start) => {
      const data = createKLineData(100)
      const params = { ticksPerRow: 1, imbalanceRatio: 3 }
      const series = createFootprintCalculator()(data, params, {
        ...EMPTY_TRADE_SNAPSHOT,
        revision: 1,
        status: 'ready',
        tickSize: '2',
        batches: [
          {
            complete: true,
            range: { from: data[start]!.timestamp, to: data[start + 2]!.timestamp },
            items: [start, start + 1].map((index) => ({
              tradeId: String(index + 1),
              timestamp: data[index]!.timestamp,
              price: '100',
              size: '0.25',
              side: 'sell' as const,
            })),
          },
        ],
      })
      const definition = getRegisteredIndicatorDefinition('footprint')!
      const range = { start, end: start + 2 }
      const state = composeInstanceRenderState(
        definition,
        {
          instanceId: 'fp',
          calculationKey: 'fp',
          dataRevision: 1,
          params,
          series,
          firstReadyIndex: start,
        },
        {},
        range,
        1,
      )
      const ctx = createMockCanvasContext()
      const layer = FootprintIndicatorDefinition.rendererFactory({
        paneId: 'main',
        instanceId: 'fp',
      })
      layer.paint(
        createContextWithInstanceState(ctx, 'fp', state, {
          data,
          range,
          kLineCenters: [100, 150],
          scrollLeft: 80,
          pane: { yAxis: { priceToY: (price) => 1100 - price * 10 } },
        }),
      )
      expect(ctx.fillRect).toHaveBeenCalledTimes(2)
      expect(ctx.fillRect).toHaveBeenNthCalledWith(1, -3, 80, 23, 19)
      expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 47, 80, 23, 19)
      expect(ctx.fillText).toHaveBeenCalledWith('0.25', 18, 93, 20)
    },
  )

  it('uses one linear volume scale across prices, sides and visible candles, without zero-volume backgrounds', () => {
    const makeBar = (timestamp: number, volumes: [string, string][]): FootprintBar => ({
      timestamp,
      complete: true,
      delta: '0',
      totalVolume: '0',
      cells: volumes.map(([bidVolume, askVolume], index) => ({
        price: String(100 + index * 2),
        bidVolume,
        askVolume,
        bidImbalance: false,
        askImbalance: false,
      })),
    })
    const state: FootprintRenderState = {
      timestamp: 1,
      series: {
        status: 'ready',
        message: null,
        rowSize: '2',
        asOf: 3,
        bars: [
          makeBar(1, [
            ['2', '8'],
            ['0', '4'],
            ['0', '0'],
          ]),
          makeBar(2, [['1', '4']]),
        ],
      },
    }
    const ctx = createMockCanvasContext()
    FootprintIndicatorDefinition.rendererFactory({ paneId: 'main', instanceId: 'fp' }).paint(
      createContextWithInstanceState(ctx, 'fp', state, {
        range: { start: 0, end: 2 },
        kLineCenters: [100, 200],
        scrollLeft: 40,
        pane: { yAxis: { priceToY: (price) => 1100 - price * 10 } },
      }),
    )
    const rectangles = vi.mocked(ctx.fillRect).mock.calls
    // 最大量 8 对应半柱宽 48，其他量严格按相同比例缩放。
    expect(rectangles.map(([x, , width]) => [x, width])).toEqual([
      [48, 12],
      [60, 48],
      [60, 24],
      [154, 6],
      [160, 24],
    ])
    expect(rectangles).toHaveLength(5)
  })

  it('clips a price row crossing the pane boundary instead of discarding it', () => {
    const state: FootprintRenderState = {
      timestamp: 1,
      series: {
        status: 'ready',
        message: null,
        rowSize: '2',
        asOf: 2,
        bars: [
          {
            timestamp: 1,
            complete: false,
            delta: '1',
            totalVolume: '1',
            cells: [
              {
                price: '89',
                bidVolume: '0',
                askVolume: '1',
                bidImbalance: false,
                askImbalance: false,
              },
            ],
          },
        ],
      },
    }
    const ctx = createMockCanvasContext()
    FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' }).paint(
      createContextWithInstanceState(ctx, 'fp', state, {
        range: { start: 0, end: 1 },
        kLineCenters: [100],
        kWidth: 50,
        kGap: 4,
        pane: { height: 200, yAxis: { priceToY: (price) => 1100 - price * 10 } },
      }),
    )
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 190, 25, 10)
    expect(ctx.strokeRect).toHaveBeenCalled()
  })

  it.each([1, 1.25, 1.5, 2, 3])(
    'aligns all histogram edges after fractional scrolling at DPR=%s',
    (dpr) => {
      const state: FootprintRenderState = {
        timestamp: 1,
        series: {
          status: 'ready',
          message: null,
          rowSize: '1.37',
          asOf: 2,
          bars: [
            {
              timestamp: 1,
              complete: true,
              delta: '0',
              totalVolume: '0',
              cells: [
                {
                  price: '100.23',
                  bidVolume: '0.000001',
                  askVolume: '3',
                  bidImbalance: false,
                  askImbalance: false,
                },
                {
                  price: '101.6',
                  bidVolume: '7',
                  askVolume: '0',
                  bidImbalance: false,
                  askImbalance: false,
                },
              ],
            },
          ],
        },
      }
      const ctx = createMockCanvasContext()
      FootprintIndicatorDefinition.rendererFactory({ instanceId: 'fp' }).paint(
        createContextWithInstanceState(ctx, 'fp', state, {
          dpr,
          range: { start: 0, end: 1 },
          kLineCenters: [150.73],
          scrollLeft: 40.19,
          kWidth: 53.7,
          kGap: 3.1,
          pane: { yAxis: { priceToY: (price) => 1100 - price * 10 } },
        }),
      )
      const rectangles = vi.mocked(ctx.fillRect).mock.calls
      expect(rectangles).toHaveLength(3)
      for (const [x, y, width, height] of rectangles) {
        for (const edge of [x, y, x + width, y + height]) {
          expect(edge * dpr).toBeCloseTo(Math.round(edge * dpr), 8)
        }
        expect(width * dpr).toBeGreaterThanOrEqual(1)
        expect(height * dpr).toBeGreaterThanOrEqual(1)
      }
      // 极小的非零卖量保持一个物理像素，且只向中心左侧延伸。
      expect(rectangles[0]![2] * dpr).toBeCloseTo(1, 8)
      expect(rectangles[0]![0] + rectangles[0]![2]).toBeCloseTo(rectangles[1]![0], 8)
      expect(rectangles[1]![2]).toBeLessThan(rectangles[2]![2])
    },
  )
})
