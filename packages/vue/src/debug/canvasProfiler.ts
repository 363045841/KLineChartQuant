type MetricEntry = {
  count: number
  totalTime: number
}

type MetricBucket = Record<string, MetricEntry>

type CanvasProfilerMetrics = {
  ctxMethods: MetricBucket
  ctxProps: MetricBucket
  canvasProps: MetricBucket
  ctxMethodSources: Record<string, MetricBucket>
}

type CanvasProfilerReportRow = {
  name: string
  count: number
  totalTime: string
  averageTime: string
}

declare global {
  interface Window {
    __KMAP_CANVAS_PROFILER_INSTALLED__?: boolean
    __KMAP_CANVAS_PROFILER_METRICS__?: CanvasProfilerMetrics
    showCanvasReport?: () => void
    resetCanvasReport?: () => void
  }
}

function createBucket(): MetricBucket {
  return Object.create(null) as MetricBucket
}

function createMetrics(): CanvasProfilerMetrics {
  return {
    ctxMethods: createBucket(),
    ctxProps: createBucket(),
    canvasProps: createBucket(),
    ctxMethodSources: Object.create(null) as Record<string, MetricBucket>,
  }
}

function record(bucket: MetricBucket, name: string, duration: number): void {
  let entry = bucket[name]
  if (!entry) {
    entry = { count: 0, totalTime: 0 }
    bucket[name] = entry
  }
  entry.count += 1
  entry.totalTime += duration
}

function recordMethodSource(
  metrics: CanvasProfilerMetrics,
  methodName: string,
  source: string,
  duration: number,
): void {
  let bucket = metrics.ctxMethodSources[methodName]
  if (!bucket) {
    bucket = createBucket()
    metrics.ctxMethodSources[methodName] = bucket
  }
  record(bucket, source, duration)
}

function toRows(bucket: MetricBucket): CanvasProfilerReportRow[] {
  return Object.entries(bucket)
    .filter(([, entry]) => entry.count > 0)
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      totalTime: entry.totalTime.toFixed(2),
      averageTime: (entry.totalTime / entry.count).toFixed(4),
    }))
    .sort((a, b) => Number(b.totalTime) - Number(a.totalTime))
}

/** 全局开关：是否启用 Canvas Profiler 插桩 */
let isProfilerEnabled = false

/** 保存原始方法用于卸载 */
const originalMethods = new Map<string, (...args: unknown[]) => unknown>()
const originalSetters = new Map<string, PropertyDescriptor>()

/** 启用/禁用 Canvas Profiler */
export function setCanvasProfilerEnabled(enabled: boolean): void {
  isProfilerEnabled = enabled
  if (enabled) {
    if (typeof window !== 'undefined' && !window.__KMAP_CANVAS_PROFILER_INSTALLED__) {
      installCanvasProfiler()
    }
  } else {
    uninstallCanvasProfiler()
  }
}

/** 获取 Canvas Profiler 启用状态 */
function isCanvasProfilerEnabled(): boolean {
  return isProfilerEnabled
}

function getRelevantStackFrame(): string {
  // 如果未启用，直接返回空字符串避免开销
  if (!isProfilerEnabled) return 'disabled'

  const stack = new Error().stack
  if (!stack) return 'unknown'

  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const frame of frames) {
    if (
      frame.includes('canvasProfiler') ||
      frame.includes('CanvasRenderingContext2D') ||
      frame === 'Error'
    ) {
      continue
    }

    const normalized = frame.replace(/^at\s+/, '')
    const srcMatch = normalized.match(/((?:src|node_modules)[^\s)]+):(\d+):(\d+)/)
    if (srcMatch) {
      return `${srcMatch[1]}:${srcMatch[2]}`
    }

    const parenMatch = normalized.match(/\(([^)]+):(\d+):(\d+)\)$/)
    if (parenMatch) {
      return `${parenMatch[1]}:${parenMatch[2]}`
    }

    return normalized
  }

  return 'unknown'
}

function wrapMethod(
  proto: object,
  name: string,
  metrics: CanvasProfilerMetrics,
  options?: { captureSource?: boolean },
): void {
  const key = `${proto.constructor?.name ?? 'proto'}:${name}`
  if (originalMethods.has(key)) return

  const original = Reflect.get(proto, name)
  if (typeof original !== 'function') return

  originalMethods.set(key, original as (...args: unknown[]) => unknown)

  Reflect.set(proto, name, function (this: object, ...args: unknown[]) {
    // 快速路径：如果 profiler 未启用，直接调用原方法
    if (!isProfilerEnabled) {
      return original.apply(this, args)
    }
    const source = options?.captureSource ? getRelevantStackFrame() : null
    const start = performance.now()
    const result = original.apply(this, args)
    const duration = performance.now() - start
    record(metrics.ctxMethods, name, duration)
    if (source) {
      recordMethodSource(metrics, name, source, duration)
    }
    return result
  })
}

function wrapSetter(proto: object, prop: string, bucket: MetricBucket): void {
  const descriptor = Object.getOwnPropertyDescriptor(proto, prop)
  if (!descriptor?.set || !descriptor.configurable) return

  const key = `${proto.constructor?.name ?? 'proto'}:${prop}`
  if (originalSetters.has(key)) return

  originalSetters.set(key, descriptor)

  Object.defineProperty(proto, prop, {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get: descriptor.get,
    set(this: object, value: unknown) {
      // 快速路径：如果 profiler 未启用，直接调用原 setter
      if (!isProfilerEnabled) {
        descriptor.set!.call(this, value)
        return
      }
      const start = performance.now()
      descriptor.set!.call(this, value)
      record(bucket, prop, performance.now() - start)
    },
  })
}

function installCanvasProfiler(): void {
  if (typeof window === 'undefined') return
  if (window.__KMAP_CANVAS_PROFILER_INSTALLED__) return

  const ctxProto = CanvasRenderingContext2D?.prototype
  const canvasProto = HTMLCanvasElement?.prototype
  if (!ctxProto || !canvasProto) return

  const metrics = createMetrics()

  wrapMethod(ctxProto, 'fillText', metrics, { captureSource: true })
  wrapMethod(ctxProto, 'measureText', metrics, { captureSource: true })
  wrapMethod(ctxProto, 'drawImage', metrics)
  wrapMethod(ctxProto, 'save', metrics)
  wrapMethod(ctxProto, 'restore', metrics)
  wrapMethod(ctxProto, 'clip', metrics)
  wrapMethod(ctxProto, 'setTransform', metrics)
  wrapMethod(ctxProto, 'scale', metrics)

  wrapSetter(ctxProto, 'font', metrics.ctxProps)
  wrapSetter(ctxProto, 'filter', metrics.ctxProps)
  wrapSetter(ctxProto, 'shadowBlur', metrics.ctxProps)
  wrapSetter(ctxProto, 'lineWidth', metrics.ctxProps)

  wrapSetter(canvasProto, 'width', metrics.canvasProps)
  wrapSetter(canvasProto, 'height', metrics.canvasProps)

  window.__KMAP_CANVAS_PROFILER_METRICS__ = metrics
  window.__KMAP_CANVAS_PROFILER_INSTALLED__ = true

  window.showCanvasReport = () => {
    const currentMetrics = window.__KMAP_CANVAS_PROFILER_METRICS__
    if (!currentMetrics) return

    console.group('[kmap] Canvas profiler report')
    console.log('ctx methods')
    console.table(toRows(currentMetrics.ctxMethods))
    console.log('ctx props')
    console.table(toRows(currentMetrics.ctxProps))
    console.log('canvas props')
    console.table(toRows(currentMetrics.canvasProps))

    for (const methodName of ['fillText', 'measureText']) {
      const bucket = currentMetrics.ctxMethodSources[methodName]
      if (!bucket) continue
      console.log(`${methodName} sources`)
      console.table(toRows(bucket).slice(0, 20))
    }

    console.groupEnd()
  }

  window.resetCanvasReport = () => {
    window.__KMAP_CANVAS_PROFILER_METRICS__ = createMetrics()
  }

  console.info(
    '[kmap] Canvas profiler enabled. Use window.showCanvasReport() and window.resetCanvasReport().',
  )
}

/** 卸载 Canvas Profiler，恢复原始方法 */
function uninstallCanvasProfiler(): void {
  if (typeof window === 'undefined') return
  if (!window.__KMAP_CANVAS_PROFILER_INSTALLED__) return

  const ctxProto = CanvasRenderingContext2D?.prototype
  const canvasProto = HTMLCanvasElement?.prototype

  // 恢复原始方法
  originalMethods.forEach((original, key) => {
    const match = key.match(/^(.+):(.+)$/)
    if (!match) return
    const [, protoName, methodName] = match

    let proto: object | null = null
    if (protoName === 'CanvasRenderingContext2D') {
      proto = ctxProto
    } else if (protoName === 'HTMLCanvasElement') {
      proto = canvasProto
    }
    if (proto) {
      Reflect.set(proto, methodName, original)
    }
  })
  originalMethods.clear()

  // 恢复原始 setter
  originalSetters.forEach((descriptor, key) => {
    const match = key.match(/^(.+):(.+)$/)
    if (!match) return
    const [, protoName, propName] = match

    let proto: object | null = null
    if (protoName === 'CanvasRenderingContext2D') {
      proto = ctxProto
    } else if (protoName === 'HTMLCanvasElement') {
      proto = canvasProto
    }
    if (proto && descriptor.configurable) {
      Object.defineProperty(proto, propName, descriptor)
    }
  })
  originalSetters.clear()

  // 清理全局状态
  window.__KMAP_CANVAS_PROFILER_INSTALLED__ = false
  window.__KMAP_CANVAS_PROFILER_METRICS__ = undefined
  window.showCanvasReport = undefined
  window.resetCanvasReport = undefined

  console.info('[kmap] Canvas profiler disabled.')
}
