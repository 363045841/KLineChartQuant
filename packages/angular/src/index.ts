/**
 * @363045841yyt/klinechart-angular —public API surface.
 *
 * Standalone Angular 17+/18+/19+ bindings for @363045841yyt/klinechart-core.
 * No NgModule. Bridges the core push-based signal layer into Angular's
 * own `signal()` so OnPush components refresh when controllers mutate state.
 */

import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    InjectionToken,
    Input,
    OnChanges,
    OnDestroy,
    PLATFORM_ID,
    Provider,
    Signal as NgSignal,
    SimpleChanges,
    ViewChild,
    inject,
    signal,
} from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    ChartViewport,
    DrawingControllerCallbacks,
    IndicatorInstance,
    InteractionSnapshot,
    KLineData,
    Signal as CoreSignal,
} from '@363045841yyt/klinechart-core'
import { createChartController } from '@363045841yyt/klinechart-core'

export type { ChartController, ChartMountOptions, ChartControllerFactory } from '@363045841yyt/klinechart-core'

// ---------------------------------------------------------------------------
// DI tokens
// ---------------------------------------------------------------------------

/** Globally-configured default theme. Component @Input wins per-instance. */
export const KLINE_CHART_THEME = new InjectionToken<'light' | 'dark'>(
    'KLINE_CHART_THEME',
    { providedIn: 'root', factory: () => 'light' as const },
)

/**
 * Factory used by `<kline-chart>` to produce a controller. Defaults to the
 * production `createChartController` from `@363045841yyt/klinechart-core`, so
 * consumers don't need to register it manually. Override per-application
 * via `provideKLineChart({ factory })` —useful for tests that inject a
 * mock factory.
 */
export const KLINE_CHART_FACTORY = new InjectionToken<ChartControllerFactory | null>(
    'KLINE_CHART_FACTORY',
    { providedIn: 'root', factory: (): ChartControllerFactory => createChartController },
)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProvideKLineChartOptions {
    theme?: 'light' | 'dark'
    factory?: ChartControllerFactory
}

/**
 * DI provider factory. Usage:
 *
 *   providers: [provideKLineChart({ theme: 'dark', factory: createChartController })]
 */
export function provideKLineChart(opts: ProvideKLineChartOptions = {}): Provider[] {
    const providers: Provider[] = []
    if (opts.theme !== undefined) {
        providers.push({ provide: KLINE_CHART_THEME, useValue: opts.theme })
    }
    if (opts.factory !== undefined) {
        providers.push({ provide: KLINE_CHART_FACTORY, useValue: opts.factory })
    }
    return providers
}

// ---------------------------------------------------------------------------
// Signal bridge: core Signal<T> -> Angular Signal<T>
// ---------------------------------------------------------------------------

/**
 * Wrap a core signal into an Angular readonly signal. Unsubscribes via
 * the supplied `DestroyRef` —or, if omitted, `inject(DestroyRef)` from
 * the surrounding injection context.
 */
export function coreSignalToAngular<T>(
    source: CoreSignal<T>,
    destroyRef?: DestroyRef,
): NgSignal<T> {
    const ng = signal<T>(source.peek())
    const unsubscribe = source.subscribe(() => {
        ng.set(source.peek())
    })
    const ref = destroyRef ?? inject(DestroyRef)
    ref.onDestroy(unsubscribe)
    return ng.asReadonly()
}

// ---------------------------------------------------------------------------
// createChart —imperative escape hatch
// ---------------------------------------------------------------------------

/**
 * Imperative escape hatch. Mirrors React/Vue.
 */
export function createChart(
    opts: ChartMountOptions & { factory?: ChartControllerFactory },
): ChartController {
    if (opts.container === null || opts.container === undefined) {
        throw new Error('createChart: container is required')
    }
    if (typeof opts.factory !== 'function') {
        throw new Error(
            'createChart: no ChartControllerFactory provided. Pass `factory` in opts or register one via provideKLineChart({ factory }).',
        )
    }
    const { factory, ...mountOpts } = opts
    return factory(mountOpts)
}

// ---------------------------------------------------------------------------
// <kline-chart> standalone component
// ---------------------------------------------------------------------------

@Component({
    selector: 'kline-chart',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<div #container style="width:100%;height:100%;"></div>',
})
export class KLineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() data: ReadonlyArray<KLineData> = []
    @Input() theme: 'light' | 'dark' | undefined = undefined
    @Input() initialZoomLevel: number | undefined = undefined
    @Input() zoomLevels: number | undefined = undefined

    @ViewChild('container', { static: true })
    container!: ElementRef<HTMLElement>

    // Private writable signals —only values change, never reassigned
    private _viewport = signal<ChartViewport | null>(null)
    private _interactionState = signal<InteractionSnapshot | null>(null)
    private _paneRatios = signal<Readonly<Record<string, number>> | null>(null)
    private _indicators = signal<ReadonlyArray<IndicatorInstance> | null>(null)

    /** Angular signals mirroring controller state —readonly wrappers, references never change. */
    readonly viewport = this._viewport.asReadonly()
    readonly interactionState = this._interactionState.asReadonly()
    readonly paneRatios = this._paneRatios.asReadonly()
    readonly indicators = this._indicators.asReadonly()

    /** Underlying core controller; null until ngAfterViewInit. */
    controller: ChartController | null = null

    private readonly platformId = inject(PLATFORM_ID)
    private readonly defaultTheme = inject(KLINE_CHART_THEME)
    private readonly factory = inject(KLINE_CHART_FACTORY)
    private readonly destroyRef = inject(DestroyRef)

    ngAfterViewInit(): void {
        if (!isPlatformBrowser(this.platformId)) return

        const containerEl = this.container?.nativeElement ?? null
        if (containerEl === null) return
        if (typeof this.factory !== 'function') {
            throw new Error(
                '<kline-chart>: no ChartControllerFactory registered. Add provideKLineChart({ factory }) at the application bootstrap.',
            )
        }

        const controller = createChart({
            container: containerEl,
            data: this.data,
            initialZoomLevel: this.initialZoomLevel,
            zoomLevels: this.zoomLevels,
            theme: this.theme ?? this.defaultTheme,
            factory: this.factory,
        })
        this.controller = controller

        // Bridge viewport
        this._viewport.set(controller.viewport.peek())
        this.destroyRef.onDestroy(
            controller.viewport.subscribe(() => this._viewport.set(controller.viewport.peek())),
        )

        // Bridge interactionState
        this._interactionState.set(controller.interactionState.peek())
        this.destroyRef.onDestroy(
            controller.interactionState.subscribe(() => this._interactionState.set(controller.interactionState.peek())),
        )

        // Bridge paneRatios
        this._paneRatios.set(controller.paneRatios.peek())
        this.destroyRef.onDestroy(
            controller.paneRatios.subscribe(() => this._paneRatios.set(controller.paneRatios.peek())),
        )

        // Bridge indicators
        this._indicators.set(controller.indicators.peek())
        this.destroyRef.onDestroy(
            controller.indicators.subscribe(() => this._indicators.set(controller.indicators.peek())),
        )
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data'] && !changes['data'].isFirstChange()) {
            this.controller?.setData(this.data)
        }
        if (changes['theme'] && !changes['theme'].isFirstChange()) {
            if (this.theme !== undefined) {
                this.controller?.setTheme(this.theme)
            }
        }
    }

    ngOnDestroy(): void {
        if (this.controller !== null) {
            try {
                this.controller.dispose()
            } finally {
                this.controller = null
            }
        }
    }

    // -------------------------------------------------------------------
    // Event handler passthroughs
    // -------------------------------------------------------------------

    handlePointerEvent(e: PointerEvent, drawingController?: DrawingControllerCallbacks): boolean {
        return this.controller?.handlePointerEvent(e, drawingController) ?? false
    }

    handleWheelEvent(e: WheelEvent): void {
        this.controller?.handleWheelEvent(e)
    }

    handleScrollEvent(): void {
        this.controller?.handleScrollEvent()
    }

    zoomToLevel(level: number, anchorX?: number): void {
        this.controller?.zoomToLevel(level, anchorX)
    }

    zoomIn(anchorX?: number): void {
        this.controller?.zoomIn(anchorX)
    }

    zoomOut(anchorX?: number): void {
        this.controller?.zoomOut(anchorX)
    }

    addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null {
        return this.controller?.addIndicator(definitionId, role, params) ?? null
    }

    removeIndicator(instanceId: string): boolean {
        return this.controller?.removeIndicator(instanceId) ?? false
    }

    setTheme(theme: 'light' | 'dark'): void {
        this.controller?.setTheme(theme)
    }

    setData(next: ReadonlyArray<KLineData>): void {
        this.controller?.setData(next)
    }

}
