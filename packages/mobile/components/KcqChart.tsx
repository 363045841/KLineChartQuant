'use dom'

/**
 * WebView 内的 KCQ 图表（Expo DOM component，ADR 0010）。
 *
 * 图表、行情与手势都留在 WebView 内；跨桥的只有指令（imperative handle）、
 * 低频指标与 ping/pong，用来测量 spike 退出标准里的首帧、FPS、内存与桥延迟。
 */

import type { ChartController, KLineData } from '@363045841yyt/klinechart-core'
import { KLineChart } from '@363045841yyt/klinechart-react/direct'
import { type DOMImperativeFactory, type DOMProps, useDOMImperativeHandle } from 'expo/dom'
import { type Ref, useEffect, useMemo, useRef, useState } from 'react'

export interface ChartMetrics {
  /** WebView JS 开始执行到控制器就绪的毫秒数。 */
  mountMs?: number
  /** 实际生效的渲染后端（webgpu / webgl / canvas2d）及状态。 */
  renderer?: string
  /** 最近 1 秒的帧数。 */
  fps?: number
  /** 压力测试期间的最低 1 秒帧数。 */
  minFps?: number
  /** Chromium 系 WebView 才有的 JS 堆占用（MB）。 */
  heapMb?: number
  bars?: number
}

export interface KcqChartHandle extends DOMImperativeFactory {
  /** 每帧切换缩放级别，持续压测渲染；再次调用停止。 */
  toggleStress(): void
  /** 立即回调 onPong(token)，用于测量桥往返延迟；跨桥参数只能是 JSON 值。 */
  ping(token: BridgeValue): void
}

interface KcqChartProps {
  barCount: number
  theme: 'light' | 'dark'
  /** 覆盖能力探测选出的渲染后端，用于在同一设备上对比各后端。 */
  renderer?: 'webgpu' | 'webgl' | 'canvas'
  onMetrics: (metrics: ChartMetrics) => Promise<void>
  onPong: (token: number) => Promise<void>
  ref: Ref<KcqChartHandle>
  dom?: DOMProps
}

/** 跨桥参数类型；expo/dom 未导出 JSONValue，从 handle 签名推导。 */
type BridgeValue = Parameters<DOMImperativeFactory[string]>[number]

const SCRIPT_START = performance.now()
const DAY_MS = 86_400_000

/** 确定性随机游走，保证每次 spike 的数据一致、结果可比。 */
function createBars(count: number): KLineData[] {
  let seed = 42
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  const start = Date.UTC(2006, 0, 2)
  const bars: KLineData[] = []
  let close = 100
  for (let i = 0; i < count; i++) {
    const open = close
    close = Math.max(1, open * (1 + (random() - 0.5) * 0.04))
    const high = Math.max(open, close) * (1 + random() * 0.01)
    const low = Math.min(open, close) * (1 - random() * 0.01)
    bars.push({
      timestamp: start + i * DAY_MS,
      open,
      high,
      low,
      close,
      volume: Math.round(1e6 * (0.5 + random())),
    } as KLineData)
  }
  return bars
}

function readHeapMb(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : undefined
}

export default function KcqChart({
  barCount,
  theme,
  renderer,
  onMetrics,
  onPong,
  ref,
}: KcqChartProps) {
  const data = useMemo(() => createBars(barCount), [barCount])
  const settings = useMemo(() => (renderer ? { rendererBackend: renderer } : undefined), [renderer])
  const [controller, setController] = useState<ChartController | null>(null)
  // imperative handle 跨桥只注册一次，读最新控制器要走 ref，不能闭包捕获 state。
  const controllerRef = useRef<ChartController | null>(null)
  const stressRef = useRef<{
    frame: number
    level: number
    direction: 1 | -1
    startLevel: number
  } | null>(null)
  // 原生 action prop 在原生侧每次重渲染都会换新的代理；effect 依赖它会不断重启计时窗口。
  const onMetricsRef = useRef(onMetrics)
  onMetricsRef.current = onMetrics
  const onPongRef = useRef(onPong)
  onPongRef.current = onPong
  const minFpsRef = useRef<number | undefined>(undefined)

  useDOMImperativeHandle(
    ref,
    () => ({
      toggleStress: () => {
        const active = stressRef.current
        if (active) {
          cancelAnimationFrame(active.frame)
          stressRef.current = null
          controllerRef.current?.zoomToLevel(active.startLevel)
          return
        }
        const controller = controllerRef.current
        if (!controller) {
          console.warn('[kcq] toggleStress before controller is ready')
          return
        }
        minFpsRef.current = undefined
        const levels = controller.getZoomLevelCount()
        const startLevel = controller.viewport.peek().zoomLevel
        const state = { frame: 0, level: startLevel, direction: 1 as 1 | -1, startLevel }
        const step = () => {
          if (state.level <= 1 || state.level >= levels - 1) state.direction *= -1
          state.level += state.direction
          controller.zoomToLevel(state.level)
          state.frame = requestAnimationFrame(step)
        }
        state.frame = requestAnimationFrame(step)
        stressRef.current = state
      },
      ping: (token: BridgeValue) => {
        void onPongRef.current(Number(token))
      },
    }),
    [],
  )

  // 每秒上报一次帧率与内存；压力测试期间同时记录最低帧率。
  useEffect(() => {
    let frames = 0
    let windowStart = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      frames++
      if (now - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (now - windowStart))
        if (stressRef.current) {
          minFpsRef.current = Math.min(minFpsRef.current ?? fps, fps)
        }
        void onMetricsRef.current({ fps, minFps: minFpsRef.current, heapMb: readHeapMb() })
        frames = 0
        windowStart = now
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!controller) return
    const report = () => {
      const runtime = controller.rendererRuntime.peek()
      void onMetricsRef.current({ renderer: `${runtime.effective} (${runtime.status})` })
    }
    report()
    return controller.rendererRuntime.subscribe(report)
  }, [controller])

  useEffect(
    () => () => {
      if (stressRef.current) cancelAnimationFrame(stressRef.current.frame)
    },
    [],
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: theme === 'dark' ? '#0b0e11' : '#ffffff' }}
    >
      <KLineChart
        data={data}
        theme={theme}
        settings={settings}
        onReady={(ready) => {
          controllerRef.current = ready
          setController(ready)
          void onMetricsRef.current({
            mountMs: Math.round(performance.now() - SCRIPT_START),
            bars: barCount,
          })
        }}
      />
    </div>
  )
}
