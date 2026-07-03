/**
 * Tests for the 3-part internalization of the Vue KLineChart SFC:
 *   1. dataFetcher default (routerDataFetcher) + override
 *   2. theme prop (controlled) applied on mount + on change, themeChange still emits
 *   3. fullscreen internalization (uncontrolled toggles DOM, controlled does not)
 *
 * Strategy: mock `@363045841yyt/klinechart-core/controllers` so the heavy real
 * `createChartController` (canvas engine) is swapped for the shape-compatible
 * mock, while `routerDataFetcher` and all other named exports stay real.
 */

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

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

import { loadBuiltinIndicators, routerDataFetcher } from '@363045841yyt/klinechart-core/controllers'

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

describe('KLineChart internalization — dataFetcher default', () => {
  it('applies the built-in routerDataFetcher when no prop is bound', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    const calls = mockController.setDataFetcherCalls()
    expect(calls.length).toBe(1)
    expect(calls[0]).toBe(routerDataFetcher)

    wrapper.unmount()
  })

  it('uses the caller-provided dataFetcher when the prop is bound', async () => {
    const customFetcher = vi.fn(async () => [])
    const wrapper = mount(KlineChart, {
      attachTo: document.body,
      props: { dataFetcher: customFetcher },
    })
    await flushMount()

    const calls = mockController.setDataFetcherCalls()
    expect(calls.length).toBe(1)
    expect(calls[0]).toBe(customFetcher)
    expect(calls[0]).not.toBe(routerDataFetcher)

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
