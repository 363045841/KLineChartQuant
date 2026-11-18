/** 交易日分隔线的渲染契约：只在日线以下周期按交易日归属绘制蓝色虚线。 */
import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createGridLinesLayer } from '@/engine/renderers/gridLines'
import { BUILTIN_MARKET_SESSIONS } from '@/foundation/config/marketSession/builtinMarketSessions'
import { createTimeFormatter } from '@/foundation/time/index'
import { ChartDataViewId } from '@/foundation/types/chartView'
import { ASHARE_MARKET_SESSION } from '@/foundation/utils/sessionTimeLabels'

/** 按市场时区墙钟构造 K 线；价格字段不参与分隔线判定。 */
function bars(...isos: readonly string[]) {
  return isos.map((iso) => ({
    timestamp: new Date(iso).getTime(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }))
}

/** 构造 5 分钟 K 线的绘制上下文；K 线中心等距，分隔线落在槽位边界。 */
function buildContext(data: ReturnType<typeof bars>, overrides: MockRenderContextOverrides = {}) {
  const ctx = createMockCanvasContext()
  const context = createMockRenderContext({
    ctx,
    data,
    period: '5min',
    dataView: ChartDataViewId.KLine,
    marketSession: ASHARE_MARKET_SESSION,
    displayTimeFormatter: createTimeFormatter('Asia/Shanghai'),
    range: { start: 0, end: data.length },
    kLineCenters: data.map((_, index) => 4 + index * 8),
    pane: { top: 0, height: 400 },
    ...overrides,
  })
  return { ctx, context }
}

/** 数据本身跨越交易日，但应当被周期或开关拦下。 */
const NO_SEPARATOR_CASES: ReadonlyArray<{
  readonly name: string
  readonly data: ReturnType<typeof bars>
  readonly overrides: MockRenderContextOverrides
}> = [
  {
    name: '日线及以上周期不画分隔线',
    data: bars('2026-01-05T09:30:00+08:00', '2026-01-06T09:30:00+08:00'),
    overrides: { period: 'daily' },
  },
  {
    name: '关闭交易日间隔后不再绘制',
    data: bars('2026-01-05T15:00:00+08:00', '2026-01-06T09:30:00+08:00'),
    overrides: { settings: { showTradingDaySeparator: false } },
  },
]

describe('交易日分隔线', () => {
  it('在相邻两个交易日之间画一条贯穿 pane 的虚线', () => {
    const { ctx, context } = buildContext(
      bars('2026-01-05T14:55:00+08:00', '2026-01-05T15:00:00+08:00', '2026-01-06T09:30:00+08:00'),
    )

    createGridLinesLayer().paint(context)

    expect(ctx.dashedPaths).toHaveLength(1)
    expect(ctx.dashedPaths[0]).toEqual([
      { x: 16.5, y: 0 },
      { x: 16.5, y: 400 },
    ])
    expect(ctx.setLineDash).toHaveBeenLastCalledWith([4, 4])
  })

  it.each(NO_SEPARATOR_CASES)('$name', ({ data, overrides }) => {
    const { ctx, context } = buildContext(data, overrides)

    createGridLinesLayer().paint(context)

    expect(ctx.dashedPaths).toHaveLength(0)
  })

  it('关闭显示网格后分隔线仍然绘制', () => {
    const { ctx, context } = buildContext(
      bars('2026-01-05T15:00:00+08:00', '2026-01-06T09:30:00+08:00'),
      { settings: { showGridLines: false } },
    )

    createGridLinesLayer().paint(context)

    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.dashedPaths).toHaveLength(1)
  })

  it('分钟周期开启分隔线时不再叠加灰色日界网格', () => {
    const data = bars(
      '2026-01-05T14:55:00+08:00',
      '2026-01-05T15:00:00+08:00',
      '2026-01-06T09:30:00+08:00',
    )
    const enabled = buildContext(data)
    createGridLinesLayer().paint(enabled.context)
    expect(enabled.ctx.fillRect).not.toHaveBeenCalled()
    expect(enabled.ctx.dashedPaths).toHaveLength(1)

    // 关闭分隔线后回到原有灰色日界网格，行为与开关一一对应。
    const disabled = buildContext(data, { settings: { showTradingDaySeparator: false } })
    createGridLinesLayer().paint(disabled.context)
    expect(disabled.ctx.fillRect).toHaveBeenCalled()
    expect(disabled.ctx.dashedPaths).toHaveLength(0)
  })

  it('夜盘与次日日盘同属一个交易日，只在日盘收盘后切换', () => {
    const { ctx, context } = buildContext(
      bars(
        '2026-01-04T21:00:00+08:00',
        '2026-01-04T23:00:00+08:00',
        '2026-01-05T01:00:00+08:00',
        '2026-01-05T09:00:00+08:00',
        '2026-01-05T15:00:00+08:00',
        '2026-01-05T21:00:00+08:00',
      ),
      { marketSession: BUILTIN_MARKET_SESSIONS.SHFE },
    )

    createGridLinesLayer().paint(context)

    // 只有「15:00 日盘收盘 → 21:00 新交易日夜盘」之间有一条线，且跨零点不切分。
    expect(ctx.dashedPaths).toHaveLength(1)
    expect(ctx.dashedPaths[0]?.[0]).toEqual({ x: 40.5, y: 0 })
  })
})
