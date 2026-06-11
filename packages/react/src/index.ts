export {
    KLineChartWC,
    type KLineChartWCProps,
    type KLineChartWCHandle,
} from './KLineChartWC'

export type { SemanticChartConfig } from '@363045841yyt/klinechart-core/semantic'

import {
    createElement,
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react'
import type { CSSProperties, ForwardedRef, FC, RefObject } from 'react'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    ChartViewport,
    IndicatorInstance,
    InteractionSnapshot,
    KLineData,
    SymbolSpec,
    DataFetcher,
    DrawingControllerCallbacks,
} from '@363045841yyt/klinechart-core'

export type {
    ChartController,
    ChartMountOptions,
    ChartViewport,
    SymbolSpec,
    DataFetcher,
} from '@363045841yyt/klinechart-core'

let chartFactory: ChartControllerFactory | null = null

export function __setChartFactory(factory: ChartControllerFactory | null): void {
    chartFactory = factory
}

function resolveFactory(): ChartControllerFactory {
    if (chartFactory === null) {
        throw new Error(
            '[@363045841yyt/klinechart-react] No ChartControllerFactory registered. ' +
                'Call __setChartFactory(factory) before mounting, or import the ' +
                'production factory from @363045841yyt/klinechart-core/controllers.',
        )
    }
    return chartFactory
}

export function createChart(opts: ChartMountOptions): ChartController {
    if (opts === null || opts === undefined) {
        throw new Error('[@363045841yyt/klinechart-react] createChart: opts is required')
    }
    if (opts.container === null || opts.container === undefined) {
        throw new Error(
            '[@363045841yyt/klinechart-react] createChart: opts.container must be a non-null HTMLElement',
        )
    }
    const factory = resolveFactory()
    return factory(opts)
}

export function useChart(
    ref: RefObject<HTMLElement | null>,
    opts: Omit<ChartMountOptions, 'container'>,
): ChartController | null {
    const [controller, setController] = useState<ChartController | null>(null)
    const optsRef = useRef(opts)
    optsRef.current = opts

    useEffect(() => {
        const container = ref.current
        if (container === null || container === undefined) {
            return
        }
        const created = createChart({
            ...optsRef.current,
            container,
        })
        setController(created)
        return () => {
            setController(null)
            created.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref])

    return controller
}

type IndicatorsView = {
    indicators: ReadonlyArray<IndicatorInstance>
    add: ChartController['addIndicator']
    remove: ChartController['removeIndicator']
    updateParams: ChartController['updateIndicatorParams']
}

export function useIndicators(controller: ChartController): IndicatorsView {
    const indicators = controller.indicators

    const subscribe = useCallback(
        (cb: () => void) => indicators.subscribe(cb),
        [indicators],
    )

    const { getSnapshot } = useMemo(() => {
        let cached: IndicatorsView | null = null
        return {
            getSnapshot: (): IndicatorsView => {
                const next = indicators()
                if (cached !== null && cached.indicators === next) return cached
                cached = {
                    indicators: next,
                    add: controller.addIndicator.bind(controller),
                    remove: controller.removeIndicator.bind(controller),
                    updateParams: controller.updateIndicatorParams.bind(controller),
                }
                return cached
            },
        }
    }, [indicators, controller])

    const getServerSnapshot = getSnapshot

    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    return snapshot
}

export function useInteractionState(
    controller: ChartController,
): InteractionSnapshot {
    const store = controller.interactionState

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function usePaneRatios(
    controller: ChartController,
): Readonly<Record<string, number>> {
    const store = controller.paneRatios

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useViewport(
    controller: ChartController,
): ChartViewport {
    const store = controller.viewport

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export interface KLineChartProps {
    data: ChartMountOptions['data']
    symbols?: ChartMountOptions['symbols']
    dataFetcher?: ChartMountOptions['dataFetcher']
    initialZoomLevel?: number
    theme?: 'light' | 'dark'
    zoomLevels?: number
    className?: string
    style?: CSSProperties
}

export interface KLineChartHandle {
    getController: () => ChartController | null
    handlePointerEvent: (e: PointerEvent, drawingController?: DrawingControllerCallbacks) => boolean
    handleWheelEvent: (e: WheelEvent) => void
    handleScrollEvent: () => void
    zoomToLevel: (level: number, anchorX?: number) => void
    zoomIn: (anchorX?: number) => void
    zoomOut: (anchorX?: number) => void
    addIndicator: (
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ) => string | null
    removeIndicator: (instanceId: string) => boolean
    setTheme: (theme: 'light' | 'dark') => void
    setData: (next: ReadonlyArray<KLineData>) => void
    setSymbols: (next: ReadonlyArray<SymbolSpec>) => void
    setDataFetcher: (fetcher: DataFetcher | null) => void
}

export const KLineChart = forwardRef<KLineChartHandle, KLineChartProps>(
    function KLineChart(
        { data, symbols, dataFetcher, initialZoomLevel, theme, zoomLevels, className, style },
        ref: ForwardedRef<KLineChartHandle>,
    ) {
        const divRef = useRef<HTMLDivElement | null>(null)
        const controllerRef = useRef<ChartController | null>(null)

        useEffect(() => {
            const container = divRef.current
            if (container === null) return
            const created = createChart({
                container,
                data,
                symbols,
                dataFetcher,
                initialZoomLevel,
                zoomLevels,
                theme,
            })
            controllerRef.current = created
            return () => {
                controllerRef.current = null
                created.dispose()
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        useEffect(() => {
            controllerRef.current?.setData(data)
        }, [data])

        useEffect(() => {
            if (theme !== undefined) {
                controllerRef.current?.setTheme(theme)
            }
        }, [theme])

        useImperativeHandle(
            ref,
            (): KLineChartHandle => ({
                getController: (): ChartController | null => controllerRef.current,
                handlePointerEvent: (e, dc) =>
                    controllerRef.current?.handlePointerEvent(e, dc) ?? false,
                handleWheelEvent: (e) => controllerRef.current?.handleWheelEvent(e),
                handleScrollEvent: () => controllerRef.current?.handleScrollEvent(),
                zoomToLevel: (level, anchorX) =>
                    controllerRef.current?.zoomToLevel(level, anchorX),
                zoomIn: (anchorX) => controllerRef.current?.zoomIn(anchorX),
                zoomOut: (anchorX) => controllerRef.current?.zoomOut(anchorX),
                addIndicator: (id, role, params) =>
                    controllerRef.current?.addIndicator(id, role, params) ?? null,
                removeIndicator: (id) =>
                    controllerRef.current?.removeIndicator(id) ?? false,
                setTheme: (t) => controllerRef.current?.setTheme(t),
                setData: (next) => controllerRef.current?.setData(next),
                setSymbols: (next) => controllerRef.current?.setSymbols(next),
                setDataFetcher: (fetcher) => controllerRef.current?.setDataFetcher(fetcher),
            }),
            [],
        )

        return createElement('div', { ref: divRef, className, style })
    },
)

import { createChartController } from '@363045841yyt/klinechart-core'
__setChartFactory(createChartController)
