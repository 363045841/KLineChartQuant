/** Spike 原生外壳：展示 WebView 图表上报的指标，并测量冷启动与桥往返延迟。 */

import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native'

import KcqChart, { type ChartMetrics, type KcqChartHandle } from './components/KcqChart'

const BAR_COUNTS = [1_000, 5_000, 20_000] as const
// 设为 1 时图表就绪后自动跑一轮基准并输出 [kcq-bench] JSON，便于真机/模拟器重复测量。
const AUTO_BENCH = process.env.EXPO_PUBLIC_KCQ_AUTOBENCH === '1'
const RENDERER = process.env.EXPO_PUBLIC_KCQ_RENDERER as 'webgpu' | 'webgl' | 'canvas' | undefined
const PING_ROUNDS = 10
const STRESS_MS = 6_000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface NativeMetrics extends ChartMetrics {
  /** 原生 JS 开始执行到图表就绪的毫秒数。 */
  coldStartMs?: number
  /** 最近一次 ping/pong 往返毫秒数。 */
  bridgeRttMs?: number
  /** 自动基准中位数往返。 */
  bridgeRttP50Ms?: number
  /** 压测前的空闲帧率。 */
  idleFps?: number
}

export default function App() {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const chartRef = useRef<KcqChartHandle>(null)
  const pings = useRef(new Map<number, { sentAt: number; resolve: (rtt: number) => void }>())
  const [barCount, setBarCount] = useState<number>(5_000)
  const [stressing, setStressing] = useState(false)
  const [metrics, setMetrics] = useState<NativeMetrics>({})
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics
  const benchStarted = useRef(false)

  const onMetrics = useCallback(async (next: ChartMetrics) => {
    setMetrics((prev) => {
      const merged: NativeMetrics = { ...prev, ...next }
      if (next.mountMs !== undefined && prev.coldStartMs === undefined) {
        merged.coldStartMs = Math.round(performance.now() - (globalThis.__KCQ_NATIVE_START__ ?? 0))
      }
      return merged
    })
  }, [])

  const onPong = useCallback(async (token: number) => {
    const pending = pings.current.get(token)
    if (!pending) return
    pings.current.delete(token)
    const rtt = Math.round((performance.now() - pending.sentAt) * 10) / 10
    setMetrics((prev) => ({ ...prev, bridgeRttMs: rtt }))
    pending.resolve(rtt)
  }, [])

  const ping = useCallback(
    () =>
      new Promise<number>((resolve) => {
        const token = Date.now() + Math.random()
        pings.current.set(token, { sentAt: performance.now(), resolve })
        chartRef.current?.ping(token)
      }),
    [],
  )

  useEffect(() => {
    if (!AUTO_BENCH || metrics.mountMs === undefined || benchStarted.current) return
    benchStarted.current = true
    void (async () => {
      await wait(3_000)
      const idleFps = metricsRef.current.fps
      const rtts: number[] = []
      for (let i = 0; i < PING_ROUNDS; i++) rtts.push(await ping())
      rtts.sort((a, b) => a - b)
      const bridgeRttP50Ms = rtts[Math.floor(rtts.length / 2)]
      chartRef.current?.toggleStress()
      setStressing(true)
      await wait(STRESS_MS)
      chartRef.current?.toggleStress()
      setStressing(false)
      await wait(1_500)
      setMetrics((prev) => ({ ...prev, idleFps, bridgeRttP50Ms }))
      console.log(
        `[kcq-bench] ${JSON.stringify({ ...metricsRef.current, idleFps, bridgeRttP50Ms, rtts })}`,
      )
    })()
  }, [metrics.mountMs, ping])

  const toggleStress = () => {
    chartRef.current?.toggleStress()
    setStressing((value) => !value)
  }

  const dark = theme === 'dark'
  const fg = dark ? '#e6e8ea' : '#11161b'

  return (
    <View style={[styles.root, { backgroundColor: dark ? '#0b0e11' : '#ffffff' }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.panel}>
        <Text style={[styles.metrics, { color: fg }]}>
          {`冷启动 ${metrics.coldStartMs ?? '—'} ms · WebView 挂载 ${metrics.mountMs ?? '—'} ms\n`}
          {`FPS ${metrics.fps ?? '—'} · 空闲 ${metrics.idleFps ?? '—'} · 压测最低 ${metrics.minFps ?? '—'}\n`}
          {`桥往返 ${metrics.bridgeRttMs ?? '—'} ms · P50 ${metrics.bridgeRttP50Ms ?? '—'} ms\n`}
          {`渲染 ${metrics.renderer ?? '—'} · 堆 ${metrics.heapMb ?? 'n/a'} MB · ${barCount} 根 K 线`}
        </Text>
        <View style={styles.actions}>
          {BAR_COUNTS.map((count) => (
            <Pressable
              key={count}
              onPress={() => setBarCount(count)}
              style={[styles.button, count === barCount && styles.buttonActive]}
            >
              <Text style={styles.buttonText}>{count / 1000}k</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={toggleStress}
            style={[styles.button, stressing && styles.buttonActive]}
          >
            <Text style={styles.buttonText}>{stressing ? '停止压测' : '缩放压测'}</Text>
          </Pressable>
          <Pressable onPress={() => void ping()} style={styles.button}>
            <Text style={styles.buttonText}>Ping</Text>
          </Pressable>
        </View>
      </View>
      <KcqChart
        ref={chartRef}
        barCount={barCount}
        theme={theme}
        renderer={RENDERER}
        onMetrics={onMetrics}
        onPong={onPong}
        dom={DOM_PROPS}
      />
    </View>
  )
}

// 模块级常量：每次渲染传新对象会让 DOM component 重新同步 WebView 属性。
// style 只作用于 WebView，外层容器也要撑满，否则 WebView 高度为 0、rAF 不触发。
const DOM_PROPS = {
  style: { flex: 1 },
  containerStyle: { flex: 1 },
  scrollEnabled: false,
} as const

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56 },
  panel: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  metrics: { fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2a3340',
  },
  buttonActive: { backgroundColor: '#2f5bea' },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  chart: { flex: 1 },
})
