/**
 * Tests for the internalization of the Vue KLineChart SFC:
 *   1. theme prop (controlled) applied on mount + on change, themeChange still emits
 *   2. fullscreen internalization (uncontrolled toggles DOM, controlled does not)
 *
 * Strategy: mock `@363045841yyt/klinechart-core/controllers` so the heavy real
 * `createChartController` (canvas engine) is swapped for the shape-compatible mock.
 */

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { createMockChartController, type MockChartController } from './_mockController'

// ── Shared mock controller (one per mount, reset in beforeEach) ──
let mockController: MockChartController

vi.mock('@363045841yyt/klinechart-core/controllers', async () => {
  const actual = await vi.importActual<typeof import('@363045841yyt/klinechart-core/controllers')>(
    '@363045841yyt/klinechart-core/controllers',
  )
  return {
    ...actual,
    createChartController: () => Promise.resolve(mockController),
  }
})

import { KlineChart } from '../components/index'
import type { LegendSlotProps } from '../index'

import { loadBuiltinIndicators } from '@363045841yyt/klinechart-core/controllers'

// ── Pre-load builtin indicators so IndicatorSelector mounted hook doesn't
//    trigger in-flight dynamic imports after environment teardown ──
await loadBuiltinIndicators()

// ── jsdom environment shims ──
function installMatchMedia(): void {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

interface FullscreenSpies {
  requestFullscreen: ReturnType<typeof vi.fn>
  exitFullscreen: ReturnType<typeof vi.fn>
  setElement: (el: Element | null) => void
}

function installFullscreenApi(): FullscreenSpies {
  let fullscreenElement: Element | null = null
  const requestFullscreen = vi.fn(function (this: Element) {
    fullscreenElement = this
    return Promise.resolve()
  })
  const exitFullscreen = vi.fn(() => {
    fullscreenElement = null
    return Promise.resolve()
  })

  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    writable: true,
    value: exitFullscreen,
  })
  // jsdom does not implement requestFullscreen on elements
  ;(HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen =
    requestFullscreen

  return {
    requestFullscreen,
    exitFullscreen,
    setElement: (el) => {
      fullscreenElement = el
    },
  }
}

let fullscreenSpies: FullscreenSpies

beforeEach(() => {
  mockController = createMockChartController({ data: [] })
  installMatchMedia()
  fullscreenSpies = installFullscreenApi()
})

afterEach(() => {
  vi.clearAllMocks()
})

async function flushMount() {
  // onMounted is async (awaits createChartController), give microtasks a beat
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('KLineChart legend slot lifecycle', () => {
  it('does not subscribe to legend context or enable external mode without a legend slot', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    expect(mockController.legendSubscriberCount()).toBe(0)
    expect(mockController.rendererConfigCalls()).toEqual([
      { name: 'mainIndicatorLegend', config: { renderMode: 'canvas' } },
    ])

    wrapper.unmount()
  })

  it('switches legend rendering when a conditional slot changes', async () => {
    const showLegend = ref(false)
    const Host = defineComponent({
      setup() {
        return () =>
          h(KlineChart, null, {
            legend: showLegend.value ? () => h('span', 'custom legend') : undefined,
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flushMount()

    expect(mockController.legendSubscriberCount()).toBe(0)

    showLegend.value = true
    await nextTick()
    await nextTick()

    expect(mockController.legendSubscriberCount()).toBe(1)
    expect(mockController.rendererConfigCalls().at(-1)).toEqual({
      name: 'mainIndicatorLegend',
      config: { renderMode: 'external' },
    })

    showLegend.value = false
    await nextTick()
    await nextTick()

    expect(mockController.legendSubscriberCount()).toBe(0)
    expect(mockController.rendererConfigCalls().at(-1)).toEqual({
      name: 'mainIndicatorLegend',
      config: { renderMode: 'canvas' },
    })

    wrapper.unmount()
  })

  it('binds the complete LegendSlotProps context to the legend slot', async () => {
    const wrapper = mount(KlineChart, {
      attachTo: document.body,
      slots: {
        legend: (props: LegendSlotProps) =>
          h(
            'output',
            { class: 'legend-contract' },
            JSON.stringify({
              period: props.period,
              index: props.index,
              hasCrosshair: props.hasCrosshair,
              layout: props.layout,
              colors: props.colors,
              currentBar: props.currentBar,
              timeshare: props.timeshare,
              indicators: props.indicators,
              comparisons: props.comparisons,
              bar: props.bar,
            }),
          ),
      },
    })
    await flushMount()

    const context: LegendSlotProps = {
      period: 'timeshare',
      index: 3,
      hasCrosshair: true,
      layout: { x: 12, y: 16, lineHeight: 18, gap: 10, paneWidth: 800, compact: false },
      colors: { textPrimary: '#111111', textTertiary: '#777777', up: '#ff0000', down: '#00aa00' },
      currentBar: {
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 1000,
        volumeText: '1000.00',
        color: '#ff0000',
      },
      timeshare: {
        price: 11,
        average: 10.5,
        changeAmount: 1,
        changePercent: 10,
        volume: 1000,
        volumeText: '1000.00',
        amount: 11000,
        amountText: '11000.00',
        changeColor: '#ff0000',
      },
      indicators: [
        { name: 'MA', params: [5], values: [{ label: 'MA5', value: 10.5, color: '#2962ff' }] },
      ],
      comparisons: [{ symbol: 'SPY', percent: 1.25, color: '#f59e0b', percentColor: '#ff0000' }],
      bar: { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 1000 },
    }

    ;(
      mockController.legendTemplateContext as unknown as { set: (next: LegendSlotProps) => void }
    ).set(context)
    await nextTick()

    expect(wrapper.get('.legend-contract').text()).toBe(JSON.stringify(context))
    expect(mockController.rendererConfigCalls().at(-1)).toEqual({
      name: 'mainIndicatorLegend',
      config: { renderMode: 'external' },
    })

    wrapper.unmount()
  })
})

describe('KLineChart internalization — theme prop', () => {
  it('still emits themeChange when the controller theme changes', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    mockController._emitTheme('dark')
    await nextTick()

    const emitted = wrapper.emitted('themeChange')
    expect(emitted).toBeTruthy()
    expect(emitted?.at(-1)).toEqual(['dark'])

    wrapper.unmount()
  })
})

describe('KLineChart internalization — fullscreen (uncontrolled)', () => {
  it('requests fullscreen on the wrapper when toggled with no isFullscreen prop', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    wrapper.findComponent({ name: 'LeftToolbar' }).vm.$emit('toggleFullscreen')
    await nextTick()

    expect(fullscreenSpies.requestFullscreen).toHaveBeenCalledTimes(1)
    // the element that received requestFullscreen is the chart wrapper
    const calledOn = fullscreenSpies.requestFullscreen.mock.instances[0] as HTMLElement
    expect(calledOn.classList.contains('chart-wrapper')).toBe(true)
    // notification emit still fires
    expect(wrapper.emitted('toggleFullscreen')).toBeTruthy()

    wrapper.unmount()
  })

  it('fullscreenchange updates internal state, emits update:isFullscreen, flips icon', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    // simulate entering fullscreen
    fullscreenSpies.setElement(wrapper.element)
    document.dispatchEvent(new Event('fullscreenchange'))
    await flushMount()

    const emitted = wrapper.emitted('update:isFullscreen')
    expect(emitted).toBeTruthy()
    expect(emitted?.at(-1)).toEqual([true])

    // LeftToolbar receives the effective fullscreen flag → minimize icon
    const toolbar = wrapper.findComponent({ name: 'LeftToolbar' })
    expect(toolbar.props('isFullscreen')).toBe(true)

    wrapper.unmount()
  })

  it('removes the fullscreenchange listener on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    wrapper.unmount()
    await nextTick()

    expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function))
    removeSpy.mockRestore()
  })
})

describe('KLineChart internalization — fullscreen (controlled)', () => {
  it('does NOT touch the Fullscreen DOM API when isFullscreen prop is set', async () => {
    const wrapper = mount(KlineChart, {
      attachTo: document.body,
      props: { isFullscreen: false },
    })
    await flushMount()

    wrapper.findComponent({ name: 'LeftToolbar' }).vm.$emit('toggleFullscreen')
    await nextTick()

    expect(fullscreenSpies.requestFullscreen).not.toHaveBeenCalled()
    expect(fullscreenSpies.exitFullscreen).not.toHaveBeenCalled()
    // controlled consumers still get the notification emit (legacy behavior)
    expect(wrapper.emitted('toggleFullscreen')).toBeTruthy()

    wrapper.unmount()
  })
})

describe('KLineChart internalization — SSR import safety', () => {
  it('module import does not throw and exposes the component', async () => {
    const mod = await import('../components/KLineChart.vue')
    expect(mod.default).toBeDefined()
  })
})
