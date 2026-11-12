// 订单流面板的挂载测试。
//
// 存在的理由：类型检查抓不到模板里的解包错误、ref 读取错误和组合式函数的调用顺序问题，
// 而这些恰好是「面板打开一片空白」的典型原因。这里用假数据源挂载组件，
// 断言六张卡片的关键数字真的渲染出来。

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrderflowPanel from '../components/OrderflowPanel.vue'
import type { OrderflowPanelSource } from '../types'

/**
 * 造一份结构完整的面板快照。
 *
 * @returns 面板原始值
 */
function samplePanel(): unknown {
  return {
    symbol: 'BTCUSDT',
    timestamp: Date.now(),
    totals: {
      openInterestBase: 283120,
      openInterestNotional: 21_080_000_000,
      netFlow1h: 60_500_000,
      takerBuyRatio1h: 0.536,
      depthHalfPercent: { bidNotional: 92_900_000, askNotional: 82_600_000, imbalance: 0.059 },
      accountRatioMean: 2.88,
      topPositionRatioMean: 2.21,
    },
    venues: [
      {
        venue: 'binance',
        depth: {
          midPrice: 74476.55,
          bidCoveragePct: 0.18,
          askCoveragePct: 0.2,
          bands: [
            {
              band: 0.5,
              bidNotional: 53_500_000,
              askNotional: 42_800_000,
              imbalance: 0.111,
              complete: false,
            },
          ],
          nearImbalance: 0.812,
          walls: [],
        },
        flows: [
          {
            windowSeconds: 3600,
            takerBuyRatio: 0.493,
            netNotional: -5_700_000,
            granularity: 'aggregated',
          },
          {
            windowSeconds: 60,
            takerBuyRatio: 0.716,
            netNotional: 1_000_000,
            granularity: 'aggregated',
          },
        ],
        largeOrders: {
          trades: 24491,
          spanMs: 3_600_000,
          takerBuyRatio: 0.467,
          buckets: [
            {
              minNotional: 0,
              maxNotional: 10000,
              notional: 19_507_082,
              share: 0.142,
              takerBuyRatio: 0.526,
            },
            {
              minNotional: 500000,
              maxNotional: null,
              notional: 14_102_255,
              share: 0.103,
              takerBuyRatio: 0.447,
            },
          ],
        },
        positioning: {
          venue: 'binance',
          openInterestBase: 98544,
          openInterestNotional: 7_340_000_000,
          accountRatio: 2.66,
          topPositionRatio: 2.21,
        },
        errors: [],
      },
    ],
    contradictions: [{ kind: 'depth-divergence', detail: 'binance 区间卖厚、近端买厚' }],
  }
}

/**
 * 造一个固定返回面板的数据源。
 *
 * @param value 返回的原始值
 * @returns 数据源
 */
function fakeSource(value: unknown): OrderflowPanelSource {
  return {
    async fetchPanelText(): Promise<string> {
      return '文本'
    },
    async fetchPanel(): Promise<unknown> {
      return value
    },
  }
}

/**
 * 挂载并等待首次取数完成。
 *
 * @param source 数据源
 * @returns 组件包装器
 */
async function mountPanel(source: OrderflowPanelSource) {
  const wrapper = mount(OrderflowPanel, { props: { source, symbol: 'BTCUSDT' } })
  // 首帧只是「正在读取面板」，需要等异步取数落地
  await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('OrderflowPanel', () => {
  it('渲染六张卡片与品种标题', async () => {
    const wrapper = await mountPanel(fakeSource(samplePanel()))
    const text = wrapper.text()
    expect(text).toContain('BTCUSDT')
    for (const title of [
      '① 总览',
      '② 分场所资金流',
      '③ 主动买入占比',
      '④ 深度',
      '⑤ 持仓结构',
      '⑥ 大单分层',
      '⑦ 互相打架的证据',
    ]) {
      expect(text).toContain(title)
    }
    wrapper.unmount()
  })

  it('把关键数字按口径渲染出来', async () => {
    const wrapper = await mountPanel(fakeSource(samplePanel()))
    const text = wrapper.text()
    // 总览：名义额 21.08B
    expect(text).toContain('$21.08B')
    // 深度区间失衡 +11.1%
    expect(text).toContain('+11.1%')
    // 钟级大单：小时累计笔数
    expect(text).toContain('24491')
    // 矛盾详情
    expect(text).toContain('区间卖厚')
    wrapper.unmount()
  })

  it('结构不符时显示错误而不是画 0', async () => {
    const wrapper = await mountPanel(fakeSource({ symbol: 'BTCUSDT' }))
    expect(wrapper.text()).toContain('结构不符合预期')
    wrapper.unmount()
  })

  it('数据源失败时显示原因', async () => {
    const wrapper = await mountPanel({
      async fetchPanelText(): Promise<string> {
        return ''
      },
      async fetchPanel(): Promise<unknown> {
        throw new Error('连接被拒绝')
      },
    })
    expect(wrapper.text()).toContain('连接被拒绝')
    wrapper.unmount()
  })
})
