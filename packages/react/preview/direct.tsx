/** 直连 Core 的预览：不经过 Vue Web Component，只挂 KLineChart。 */
import type { ChartController, KLineData } from '@363045841yyt/klinechart-core'
import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { KLineChart } from '../src/direct'

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
    bars.push({
      timestamp: start + i * 86_400_000,
      open,
      high: Math.max(open, close) * (1 + random() * 0.01),
      low: Math.min(open, close) * (1 - random() * 0.01),
      close,
      volume: Math.round(1e6 * (0.5 + random())),
    } as KLineData)
  }
  return bars
}

function App() {
  // ?late=1：先以空数据挂载，稍后再给数据，复现宿主异步传入 props 的时序。
  const late = new URLSearchParams(location.search).has('late')
  const [count, setCount] = useState(late ? 0 : 5000)
  useEffect(() => {
    if (!late) return
    const timer = setTimeout(() => setCount(5000), 500)
    return () => clearTimeout(timer)
  }, [late])
  const data = useMemo(() => createBars(count), [count])
  const renderer = new URLSearchParams(location.search).get('renderer') as 'webgl' | 'canvas' | null
  const settings = useMemo(() => (renderer ? { rendererBackend: renderer } : undefined), [renderer])
  return (
    <KLineChart
      data={data}
      settings={settings}
      onReady={(controller: ChartController) => {
        ;(window as unknown as { kcq: ChartController }).kcq = controller
        console.log('[kcq] ready', JSON.stringify(controller.viewport.peek()), controller.rendererRuntime.peek())
      }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
