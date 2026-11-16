/**
 * 期权面板的渲染验收：标题带数据场所，波动卡底部显示 25Δ 偏斜与到期日。
 *
 * 只验「组件把字段渲染出来」，不涉及轮询：状态用 shallowRef 直接给值。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import OptionPanel from '../components/OptionPanel.vue'
import type { OptionPanelState } from '../impl/use-option-panel.js'
import type { OptionPanelView, OptionVolatilityStats } from '../types.js'
import { sampleView } from './fixtures.js'

/**
 * 造一份带偏斜的统计。
 *
 * @param overrides 覆盖项
 * @returns 统计
 */
function statsOf(overrides: Partial<OptionVolatilityStats> = {}): OptionVolatilityStats {
  return {
    source: 'daily',
    stale: false,
    latestCapturedAt: 1_764_000_000_000,
    rv20: 43.2,
    vrp: 3.4,
    termStructure: null,
    skew25dVolPoints: -5.07,
    skew25dExpiryIso: '2026-12-25',
    windows: [
      {
        windowDays: 30,
        sampleDays: 6,
        expectedDays: 30,
        ivLatest: 51.6,
        ivHigh: 55.1,
        ivLow: 44,
        ivRank: 68.47,
        ivPercentile: 83.33,
      },
    ],
    ...overrides,
  }
}

/**
 * 造一个只读面板状态。
 *
 * @param view 快照
 * @returns 面板状态
 */
function stateOf(view: OptionPanelView | null): OptionPanelState {
  return {
    view: shallowRef(view),
    loading: shallowRef(false),
    error: shallowRef(null),
    lastUpdated: shallowRef(Date.now()),
    refresh: async () => {},
  }
}

describe('OptionPanel', () => {
  it('标题带数据场所，波动卡显示 25Δ 偏斜与到期日', () => {
    const wrapper = mount(OptionPanel, {
      props: { state: stateOf(sampleView({ volatility: statsOf() })) },
    })

    // 行里存的是枚举值 deribit，界面映射成 Deribit
    expect(wrapper.find('.op-symbol').text()).toBe('BTC 期权 · Deribit')
    const statsLine = wrapper.find('.op-stats').text()
    expect(statsLine).toContain('IVR 68 / IVP 83')
    expect(statsLine).toContain('25Δ RR -5.1pp@2026-12-25')
  })

  it('alt 标的显示自己的场所', () => {
    const wrapper = mount(OptionPanel, {
      props: {
        state: stateOf(sampleView({ currency: 'XRP', venue: 'binance', volatility: statsOf() })),
      },
    })

    expect(wrapper.find('.op-symbol').text()).toBe('XRP 期权 · Binance')
  })

  it('服务失败时只显示错误，不留旧数字', () => {
    const state = stateOf(null)
    state.error.value = '读取期权数据失败：Failed to fetch'
    const wrapper = mount(OptionPanel, { props: { state } })

    expect(wrapper.find('.op-error').text()).toBe('读取期权数据失败：Failed to fetch')
    expect(wrapper.findAll('.op-card')).toHaveLength(0)
  })

  it('旧行没有场所时不拼后缀，统计缺失时写明不可用', () => {
    const wrapper = mount(OptionPanel, {
      props: { state: stateOf(sampleView({ venue: null, volatility: null })) },
    })

    expect(wrapper.find('.op-symbol').text()).toBe('BTC 期权')
    expect(wrapper.find('.op-stats').text()).toBe('历史分位：统计不可用。')
  })
})
