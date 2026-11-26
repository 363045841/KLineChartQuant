/**
 * Contract test for @363045841yyt/klinechart.
 *
 * Locks the public surface: chart mount, tooltip slot shape and the
 * workbench entry. Assertions must reflect the current API, not legacy
 * plugin signatures.
 */

import { mount } from '@vue/test-utils'
import KLineTooltip from '@vue-src/components/chart/KLineTooltip.vue'
import type { KlineTooltipSlotProps } from '@vue-src/index'
import * as VueAdapter from '@vue-src/index'
import { coreSignalToVueRef } from '@vue-src/index'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { createTestSignal } from './_mockController'

/** 将颜色归一化为当前测试环境 DOM 的序列化形式，避免断言耦合具体环境的色彩格式。 */
function normalizeColor(color: string): string {
  const probe = document.createElement('span')
  probe.style.color = color
  return probe.style.color
}

describe('@363045841yyt/klinechart — public API surface', () => {
  it('exports the workbench product entry', () => {
    expect(VueAdapter.KlineWorkbench).toBeDefined()
    expect(VueAdapter.KlineChart).toBeDefined()
  })
})

describe('@363045841yyt/klinechart — reactivity bridge', () => {
  it('signal change updates returned ref', async () => {
    // Mount a tiny scoped component so coreSignalToVueRef can register
    // its onScopeDispose cleanup. Without a setup scope the ref is still
    // wired up correctly, but cleanup would not be automatic.
    const signal = createTestSignal<number>(1)
    const bridgedRef = shallowRef<{ value: number } | null>(null)

    const HostComponent = defineComponent({
      name: 'BridgeHost',
      setup() {
        const r = coreSignalToVueRef(signal)
        bridgedRef.value = r
        return () => h('div', String(r.value))
      },
    })

    const wrapper = mount(HostComponent, { attachTo: document.body })
    expect(bridgedRef.value?.value).toBe(1)
    expect(wrapper.text()).toBe('1')

    signal.set(42)
    await nextTick()

    expect(bridgedRef.value?.value).toBe(42)
    expect(wrapper.text()).toBe('42')

    wrapper.unmount()
  })
})

describe('@363045841yyt/klinechart —tooltip slot contracts', () => {
  it('exports KLineTooltip component', () => {
    expect(VueAdapter.KLineTooltip).toBe(KLineTooltip)
  })

  it('KLineTooltip renders with hoverData', () => {
    const kline = {
      timestamp: 1748736000000,
      open: 30,
      high: 32,
      low: 29,
      close: 31.5,
      volume: 1500000,
      symbol: 'TEST',
    }
    const wrapper = mount(KLineTooltip, {
      props: {
        hoverData: kline,
        index: 0,
        data: [kline],
        pos: { x: 100, y: 200 },
      },
    })
    expect(wrapper.find('.kline-tooltip').exists()).toBe(true)
    expect(wrapper.text()).toContain('TEST')
    expect(wrapper.text()).toContain('30.00')
    expect(wrapper.text()).toContain('32.00')
    expect(wrapper.text()).toContain('29.00')
    expect(wrapper.text()).toContain('31.50')
    wrapper.unmount()
  })

  it('KLineTooltip renders nothing when hoverData is null', () => {
    const wrapper = mount(KLineTooltip, {
      props: {
        hoverData: null,
        index: null,
        data: [],
        pos: { x: 0, y: 0 },
      },
    })
    expect(wrapper.find('.kline-tooltip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('KLineTooltip renders up/down colors', () => {
    const upKline = {
      timestamp: 1748736000000,
      open: 30,
      high: 32,
      low: 29,
      close: 31.5,
    }
    const downKline = {
      timestamp: 1748736000000,
      open: 32,
      high: 33,
      low: 28,
      close: 29,
    }
    const upWrapper = mount(KLineTooltip, {
      props: {
        hoverData: upKline,
        index: 0,
        data: [upKline],
        pos: { x: 0, y: 0 },
        upColor: '#ef4444',
        downColor: '#22c55e',
      },
    })
    const downWrapper = mount(KLineTooltip, {
      props: {
        hoverData: downKline,
        index: 0,
        data: [downKline],
        pos: { x: 0, y: 0 },
        upColor: '#ef4444',
        downColor: '#22c55e',
      },
    })
    // close > open: closeColor → upColor (red)
    const upCloseSpan = upWrapper.find('.row:nth-child(4) span:last-child')
    expect(upCloseSpan.attributes('style')).toContain(normalizeColor('#ef4444'))
    // close < open: closeColor → downColor (green)
    const downCloseSpan = downWrapper.find('.row:nth-child(4) span:last-child')
    expect(downCloseSpan.attributes('style')).toContain(normalizeColor('#22c55e'))
    upWrapper.unmount()
    downWrapper.unmount()
  })
})
