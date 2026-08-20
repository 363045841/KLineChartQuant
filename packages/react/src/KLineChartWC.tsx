/** 将 Vue Custom Element 映射为 React 组件，并在客户端延迟注册元素。 */

import type { SemanticChartConfig } from '@363045841yyt/klinechart-core/semantic'
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react'

declare global {
  interface HTMLElement {
    semanticConfig?: SemanticChartConfig | undefined
  }
}

export interface KLineChartWCProps {
  semanticConfig?: SemanticChartConfig

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
}

/** 同步可选 attribute，确保移除 props 时不会残留旧值。 */
function syncAttribute(el: HTMLElement, name: string, value: number | boolean | undefined): void {
  if (value === undefined) {
    el.removeAttribute(name)
    return
  }
  el.setAttribute(name, String(value))
}

/** 在 React 中渲染和管理 kline-chart Custom Element。 */
export const KLineChartWC = forwardRef<KLineChartWCHandle, KLineChartWCProps>(function KLineChartWC(
  props: KLineChartWCProps,
  ref: ForwardedRef<KLineChartWCHandle>,
) {
  const hostRef = useRef<HTMLElement>(null)
  const [registered, setRegistered] = useState(false)

  useImperativeHandle(ref, () => hostRef.current as KLineChartWCHandle)

  // Vue Custom Element 在模块加载时访问 customElements，只能在客户端 effect 中加载。
  useEffect(() => {
    let mounted = true
    void import('@363045841yyt/klinechart/web-component').then(() => {
      if (mounted) setRegistered(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const el = hostRef.current
    if (!el || !registered || props.semanticConfig === undefined) return
    el.semanticConfig = props.semanticConfig
  }, [props.semanticConfig, registered])

  useEffect(() => {
    const el = hostRef.current
    if (!el || !registered) return

    syncAttribute(el, 'y-padding-px', props.yPaddingPx)
    syncAttribute(el, 'min-k-width', props.minKWidth)
    syncAttribute(el, 'max-k-width', props.maxKWidth)
    syncAttribute(el, 'right-axis-width', props.rightAxisWidth)
    syncAttribute(el, 'bottom-axis-height', props.bottomAxisHeight)
    syncAttribute(el, 'price-label-width', props.priceLabelWidth)
    syncAttribute(el, 'zoom-levels', props.zoomLevels)
    syncAttribute(el, 'initial-zoom-level', props.initialZoomLevel)
    syncAttribute(el, 'is-fullscreen', props.isFullscreen)
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
    registered,
  ])

  useEffect(() => {
    const el = hostRef.current
    if (!el || !registered) return

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
  }, [props.onZoomLevelChange, props.onToggleFullscreen, registered])

  return createElement('kline-chart', {
    ref: hostRef,
    style: props.style,
    className: props.className,
  })
})
