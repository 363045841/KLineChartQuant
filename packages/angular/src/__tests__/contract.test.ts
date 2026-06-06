/**
 * Contract test for @363045841yyt/klinechart-angular.
 *
 * Approach: instantiate the component class directly inside a hand-built
 * Injector via `runInInjectionContext`, instead of TestBed + zone.js. This
 * keeps the suite fast and dependency-light while still exercising the real
 * lifecycle hooks (ngAfterViewInit / ngOnDestroy) and the core->Angular
 * signal bridge.
 */

import { describe, it, expect, vi } from 'vitest'
import {
    DestroyRef,
    Injector,
    PLATFORM_ID,
    runInInjectionContext,
    type ElementRef,
} from '@angular/core'
import * as AngularAdapter from '../index'
import {
    KLINE_CHART_FACTORY,
    KLINE_CHART_THEME,
    KLineChartComponent,
    coreSignalToAngular,
    createChart,
    provideKLineChart,
} from '../index'
import { createMockChartController } from './_mockController'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import type { ChartControllerFactory, ChartViewport } from '@363045841yyt/klinechart-core'

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

describe('@363045841yyt/klinechart-angular —public API surface', () => {
    it('exports KLineChartComponent, provideKLineChart, createChart', () => {
        expect(AngularAdapter.KLineChartComponent).toBeDefined()
        expect(typeof AngularAdapter.provideKLineChart).toBe('function')
        expect(typeof AngularAdapter.createChart).toBe('function')
    })
})

// ---------------------------------------------------------------------------
// SSR / import safety
// ---------------------------------------------------------------------------

describe('@363045841yyt/klinechart-angular —SSR safety', () => {
    it('module import does not touch window or document', () => {
        // The import at the top of this file occurred in Node (no jsdom).
        // If the module touched `window`/`document` at top level, that import
        // would already have crashed. This test documents the contract.
        expect(true).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal stand-in for Angular's internal NodeInjector DestroyRef. The real
 * one is wired by the framework when a component is instantiated through the
 * runtime; without TestBed/zone we provide our own.
 */
class MockDestroyRef extends DestroyRef {
    private readonly callbacks = new Set<() => void>()
    override onDestroy(cb: () => void): () => void {
        this.callbacks.add(cb)
        return () => {
            this.callbacks.delete(cb)
        }
    }
    callbackCount(): number {
        return this.callbacks.size
    }
    fireDestroy(): void {
        for (const cb of [...this.callbacks]) {
            try {
                cb()
            } catch {
                /* ignore */
            }
        }
        this.callbacks.clear()
    }
}

function buildInjector(
    factory: ChartControllerFactory | null,
    opts: { platformId?: string; theme?: 'light' | 'dark' } = {},
): { injector: Injector; destroyRef: MockDestroyRef } {
    const destroyRef = new MockDestroyRef()
    const injector = Injector.create({
        providers: [
            { provide: PLATFORM_ID, useValue: opts.platformId ?? 'browser' },
            { provide: KLINE_CHART_THEME, useValue: opts.theme ?? 'light' },
            { provide: KLINE_CHART_FACTORY, useValue: factory },
            { provide: DestroyRef, useValue: destroyRef },
        ],
    })
    return { injector, destroyRef }
}

function makeContainerRef(): ElementRef<HTMLElement> {
    // We don't need a real HTMLElement —the mock factory ignores it.
    return { nativeElement: {} as HTMLElement }
}

// ---------------------------------------------------------------------------
// createChart imperative escape hatch
// ---------------------------------------------------------------------------

describe('createChart()', () => {
    it('throws when container is null', () => {
        expect(() =>
            createChart({
                container: null as unknown as HTMLElement,
                data: [],
            }),
        ).toThrow(/container is required/)
    })

    it('throws when no factory is registered', () => {
        expect(() =>
            createChart({
                container: {} as HTMLElement,
                data: [],
            }),
        ).toThrow(/no ChartControllerFactory/)
    })

    it('delegates to factory when provided', () => {
        const { controller } = createMockChartController()
        const factory = vi.fn<ChartControllerFactory>(() => controller)
        const result = createChart({
            container: {} as HTMLElement,
            data: [],
            factory,
        })
        expect(factory).toHaveBeenCalledOnce()
        expect(result).toBe(controller)
    })
})

// ---------------------------------------------------------------------------
// provideKLineChart
// ---------------------------------------------------------------------------

describe('provideKLineChart()', () => {
    it('returns an empty provider array when no options given', () => {
        const providers = provideKLineChart()
        expect(Array.isArray(providers)).toBe(true)
        expect(providers).toHaveLength(0)
    })

    it('provides theme via DI when theme option is set', () => {
        const providers = provideKLineChart({ theme: 'dark' })
        const injector = Injector.create({ providers })
        expect(injector.get(KLINE_CHART_THEME)).toBe('dark')
    })

    it('provides factory via DI when factory option is set', () => {
        const { controller } = createMockChartController()
        const factory: ChartControllerFactory = () => controller
        const providers = provideKLineChart({ factory })
        const injector = Injector.create({ providers })
        expect(injector.get(KLINE_CHART_FACTORY)).toBe(factory)
    })
})

// ---------------------------------------------------------------------------
// coreSignalToAngular bridge
// ---------------------------------------------------------------------------

describe('coreSignalToAngular()', () => {
    it('mirrors initial value and reacts synchronously to core signal changes', () => {
        const destroyRef = new MockDestroyRef()
        const source = createSignal<number>(7)
        // Pass DestroyRef explicitly —`inject(DestroyRef)` is special-cased
        // by Angular's runtime and only resolves inside a NodeInjector / view,
        // so we cannot override it from a plain Injector.create() provider.
        const ng = coreSignalToAngular(source, destroyRef)
        expect(ng()).toBe(7)
        source.set(42)
        expect(ng()).toBe(42)
        expect(destroyRef.callbackCount()).toBe(1)
        // After destroy, further core changes must NOT propagate.
        destroyRef.fireDestroy()
        source.set(99)
        expect(ng()).toBe(42)
    })
})

// ---------------------------------------------------------------------------
// Component lifecycle (formerly .todo)
// ---------------------------------------------------------------------------

describe('@363045841yyt/klinechart-angular —component lifecycle', () => {
    it('renders <kline-chart> with default theme —ngAfterViewInit calls createChart', () => {
        const handle = createMockChartController()
        const factory = vi.fn<ChartControllerFactory>(() => handle.controller)
        const { injector } = buildInjector(factory, { theme: 'light' })

        const component = runInInjectionContext(injector, () => new KLineChartComponent())
        component.container = makeContainerRef()
        component.data = []
        component.ngAfterViewInit()

        expect(factory).toHaveBeenCalledOnce()
        const call = factory.mock.calls[0][0]
        expect(call.theme).toBe('light')
        expect(call.container).toBeDefined()
        expect(component.controller).toBe(handle.controller)
    })

    it('OnPush refresh: Angular viewport signal reflects core signal change synchronously', () => {
        const handle = createMockChartController()
        const factory: ChartControllerFactory = () => handle.controller
        const { injector } = buildInjector(factory)

        const component = runInInjectionContext(injector, () => new KLineChartComponent())
        component.container = makeContainerRef()
        component.ngAfterViewInit()

        const initial = component.viewport()
        expect(initial).not.toBeNull()
        expect((initial as ChartViewport).zoomLevel).toBe(1)

        // Mutate via the controller's public API —this fires through the
        // core signal, the bridge listener writes into the Angular signal,
        // and component.viewport() returns the new value on the next read.
        handle.controller.zoomToLevel(5)
        expect((component.viewport() as ChartViewport).zoomLevel).toBe(5)
    })

    it('ngOnDestroy disposes the controller and unsubscribes the bridge', () => {
        const handle = createMockChartController()
        const factory: ChartControllerFactory = () => handle.controller
        const { injector } = buildInjector(factory)

        const component = runInInjectionContext(injector, () => new KLineChartComponent())
        component.container = makeContainerRef()
        component.ngAfterViewInit()

        const disposeSpy = vi.spyOn(handle.controller, 'dispose')
        component.ngOnDestroy()

        expect(disposeSpy).toHaveBeenCalledOnce()
        expect(handle.getDisposeCount()).toBe(1)
        expect(component.controller).toBeNull()

        // Subsequent ngOnDestroy must be idempotent (no double-dispose).
        component.ngOnDestroy()
        expect(handle.getDisposeCount()).toBe(1)
    })

    it.todo(
        'provideKLineChart provides theme via DI through the full bootstrap pipeline —requires TestBed + zone.js; covered indirectly by the provideKLineChart() injector-level test above',
    )
})
