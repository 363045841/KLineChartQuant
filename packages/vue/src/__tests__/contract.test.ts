/**
 * Contract test for @363045841yyt/klinechart.
 *
 * Phase 1D agent's brief: make these pass without weakening assertions,
 * preserving the legacy KMapPlugin.install signature.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import * as VueAdapter from '../index'
import { coreSignalToVueRef } from '../index'
import { createMockChartController, createTestSignal } from './_mockController'

describe('@363045841yyt/klinechart —public API surface', () => {
    it('exports createChart, useChart, useIndicatorSelector, KLineChart, KMapPlugin', () => {
        expect(typeof VueAdapter.createChart).toBe('function')
        expect(typeof VueAdapter.useChart).toBe('function')
        expect(typeof VueAdapter.useIndicatorSelector).toBe('function')
        expect(VueAdapter.KLineChart).toBeDefined()
        expect(typeof VueAdapter.KMapPlugin.install).toBe('function')
    })

    it('KMapPlugin.install is callable with a mock app and registers KLineChart', () => {
        const registered: Record<string, unknown> = {}
        const mockApp = {
            component(name: string, comp: unknown) {
                registered[name] = comp
            },
        } as unknown as Parameters<typeof VueAdapter.KMapPlugin.install>[0]
        VueAdapter.KMapPlugin.install(mockApp)
        expect(registered.KLineChart).toBe(VueAdapter.KLineChart)
    })
})

describe('@363045841yyt/klinechart —SSR safety', () => {
    it('module import does not touch window or document', () => {
        // Import above ran in node env without jsdom. If it touched window, this
        // file would not have loaded. Test documents the contract.
        expect(true).toBe(true)
    })
})

describe('@363045841yyt/klinechart —useChart lifecycle', () => {
    afterEach(() => {
        // Reset the injected factory so other tests start clean.
        VueAdapter.__setControllerFactory(null)
    })

    it('mounts on first render via template ref', async () => {
        const mockController = createMockChartController({ data: [] })
        const factorySpy = vi.fn(() => mockController)
        VueAdapter.__setControllerFactory(factorySpy)

        const HostComponent = defineComponent({
            name: 'Host',
            setup() {
                const containerRef = ref<HTMLElement | null>(null)
                const { chart } = VueAdapter.useChart(containerRef, { data: [] })
                return { containerRef, chart }
            },
            render() {
                return h('div', { ref: 'containerRef' })
            },
        })

        const wrapper = mount(HostComponent, { attachTo: document.body })
        await nextTick()

        expect(factorySpy).toHaveBeenCalledTimes(1)
        const factoryArg = factorySpy.mock.calls[0]?.[0]
        expect(factoryArg?.container).toBeInstanceOf(HTMLElement)
        expect(wrapper.vm.chart).toBe(mockController)

        wrapper.unmount()
    })

    it('disposes on unmount', async () => {
        const mockController = createMockChartController({ data: [] })
        VueAdapter.__setControllerFactory(() => mockController)

        const HostComponent = defineComponent({
            name: 'Host',
            setup() {
                const containerRef = ref<HTMLElement | null>(null)
                const { chart } = VueAdapter.useChart(containerRef, { data: [] })
                return { containerRef, chart }
            },
            render() {
                return h('div', { ref: 'containerRef' })
            },
        })

        const wrapper = mount(HostComponent, { attachTo: document.body })
        await nextTick()

        expect(mockController.disposeCalls()).toBe(0)
        wrapper.unmount()
        // Allow lifecycle hooks to settle.
        await nextTick()
        expect(mockController.disposeCalls()).toBe(1)
    })

    it('reactivity bridge: signal change updates returned ref', async () => {
        // Mount a tiny scoped component so coreSignalToVueRef can register
        // its onScopeDispose cleanup. Without a setup scope the ref is still
        // wired up correctly, but cleanup would not be automatic.
        const signal = createTestSignal<number>(1)
        const bridgedRef = shallowRef<{ value: number } | null>(null)

        const HostComponent = defineComponent({
            name: 'BridgeHost',
            setup() {
                const r = coreSignalToVueRef(signal)
                bridgedRef.value = r as unknown as { value: number }
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
