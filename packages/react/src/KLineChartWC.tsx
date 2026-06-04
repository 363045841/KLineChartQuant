import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    type CSSProperties,
    type ForwardedRef,
} from 'react'
import type { SemanticChartConfig, DataFetcher } from '@363045841yyt/klinechart-core/semantic'

declare global {
    interface HTMLElement {
        semanticConfig?: SemanticChartConfig | undefined
        dataFetcher?: DataFetcher | undefined
    }
}

export interface KLineChartWCProps {
    semanticConfig: SemanticChartConfig
    dataFetcher: DataFetcher

    yPaddingPx?: number
    minKWidth?: number
    maxKWidth?: number
    rightAxisWidth?: number
    bottomAxisHeight?: number
    priceLabelWidth?: number
    zoomLevels?: number
    initialZoomLevel?: number
    isFullscreen?: boolean

    onZoomLevelChange?: (detail: { level: number; kWidth: number }) => void
    onToggleFullscreen?: () => void

    style?: CSSProperties
    className?: string
}

export type KLineChartWCHandle = HTMLElement & {
    semanticConfig: SemanticChartConfig
    dataFetcher: DataFetcher
}

export const KLineChartWC = forwardRef<KLineChartWCHandle, KLineChartWCProps>(
    function KLineChartWC(
        props: KLineChartWCProps,
        ref: ForwardedRef<KLineChartWCHandle>,
    ) {
        const hostRef = useRef<HTMLElement>(null)

        useImperativeHandle(ref, () => hostRef.current as KLineChartWCHandle)

        useEffect(() => {
            const el = hostRef.current
            if (!el) return
            el.semanticConfig = props.semanticConfig
            el.dataFetcher = props.dataFetcher
        }, [props.semanticConfig, props.dataFetcher])

        useEffect(() => {
            const el = hostRef.current
            if (!el) return

            const setNum = (attr: string, val?: number) => {
                if (val !== undefined) el.setAttribute(attr, String(val))
            }

            setNum('y-padding-px', props.yPaddingPx)
            setNum('min-k-width', props.minKWidth)
            setNum('max-k-width', props.maxKWidth)
            setNum('right-axis-width', props.rightAxisWidth)
            setNum('bottom-axis-height', props.bottomAxisHeight)
            setNum('price-label-width', props.priceLabelWidth)
            setNum('zoom-levels', props.zoomLevels)
            setNum('initial-zoom-level', props.initialZoomLevel)
            if (props.isFullscreen !== undefined) {
                el.setAttribute('is-fullscreen', String(props.isFullscreen))
            }
        }, [
            props.yPaddingPx,
            props.minKWidth,
            props.maxKWidth,
            props.rightAxisWidth,
            props.bottomAxisHeight,
            props.priceLabelWidth,
            props.zoomLevels,
            props.initialZoomLevel,
            props.isFullscreen,
        ])

        useEffect(() => {
            const el = hostRef.current
            if (!el) return

            const onZoom = (e: Event) => {
                props.onZoomLevelChange?.((e as CustomEvent).detail)
            }
            const onToggle = () => {
                props.onToggleFullscreen?.()
            }

            if (props.onZoomLevelChange) {
                el.addEventListener('zoom-level-change', onZoom as EventListener)
            }
            if (props.onToggleFullscreen) {
                el.addEventListener('toggle-fullscreen', onToggle as EventListener)
            }

            return () => {
                el.removeEventListener('zoom-level-change', onZoom as EventListener)
                el.removeEventListener('toggle-fullscreen', onToggle as EventListener)
            }
        }, [props.onZoomLevelChange, props.onToggleFullscreen])

        return (
            <kline-chart
                ref={hostRef}
                style={props.style}
                className={props.className}
            />
        )
    },
)
