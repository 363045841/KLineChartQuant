/**
 * 直接挂载 Core 的 React 适配器，不经过 Vue Web Component。
 *
 * Core 在客户端 effect 中按需加载，SSR 期间只输出容器节点。控制器就绪后通过 Core 的
 * `bindChartInput` 接入指针、滚轮与触控输入，与 Vue 组件共用同一份接线（见 docs/adr/0008、0009）。
 */

import type {
  ChartController,
  ChartControllerFactory,
  ChartMountOptions,
  KLineData,
  ReadonlySignal,
  SymbolSpec,
} from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartInputHooks } from '@363045841yyt/klinechart-core/input'
import {
  type CSSProperties,
  createElement,
  type ForwardedRef,
  forwardRef,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

type ResolveSettings = typeof import('@363045841yyt/klinechart-core/config')['resolveSettings']
type BindChartInput = typeof import('@363045841yyt/klinechart-core/input')['bindChartInput']

export interface KLineChartOptions {
  data?: ReadonlyArray<KLineData>
  symbols?: ReadonlyArray<SymbolSpec>
  marketSessions?: ChartMountOptions['marketSessions']
  /** 显式主题优先于 `settings.theme`。 */
  theme?: 'light' | 'dark'
  settings?: Partial<ChartSettings>
  initialZoomLevel?: number
  zoomLevels?: number
  /** 测试或宿主注入的控制器工厂；缺省时加载 Core 的 `createChartController`。 */
  factory?: ChartControllerFactory
  /**
   * 输入接线，仅在挂载时读取。缺省接入容器上的指针、滚轮与触控；传入钩子可注入画线等拦截；
   * `false` 表示宿主自行转发事件。
   */
  input?: boolean | ChartInputHooks
}

export interface KLineChartProps extends KLineChartOptions {
  /** 控制器创建完成后调用一次。 */
  onReady?: (controller: ChartController) => void
  style?: CSSProperties
  className?: string
}

export interface KLineChartHandle {
  getController: () => ChartController | null
}

interface CoreRuntime {
  factory: ChartControllerFactory
  resolveSettings: ResolveSettings
  bindChartInput: BindChartInput
}

/** 在客户端加载 Core；Core 模块加载期会访问浏览器全局，不能进入 SSR 求值路径。 */
async function loadCoreRuntime(factory: ChartControllerFactory | undefined): Promise<CoreRuntime> {
  const [config, input] = await Promise.all([
    import('@363045841yyt/klinechart-core/config'),
    import('@363045841yyt/klinechart-core/input'),
  ])
  const shared = { resolveSettings: config.resolveSettings, bindChartInput: input.bindChartInput }
  if (factory) return { factory, ...shared }
  const controllers = await import('@363045841yyt/klinechart-core/controllers')
  return { factory: controllers.createChartController, ...shared }
}

/** 未显式指定主题时应用 settings.theme；auto 只注入系统主题，不覆盖用户偏好。 */
function applySettingsTheme(controller: ChartController, settingsTheme: unknown): void {
  if (settingsTheme === 'auto') {
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    controller.setSystemTheme(prefersDark ? 'dark' : 'light')
  } else if (settingsTheme === 'light' || settingsTheme === 'dark') {
    controller.setTheme(settingsTheme)
  }
}

/** 把 Core Signal 桥接为 React 外部 store；signal 为空时返回 undefined。 */
export function useCoreSignal<T>(signal: ReadonlySignal<T>): T
export function useCoreSignal<T>(signal: ReadonlySignal<T> | null | undefined): T | undefined
export function useCoreSignal<T>(signal: ReadonlySignal<T> | null | undefined): T | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (signal ? signal.subscribe(onChange) : () => {}),
    [signal],
  )
  const getSnapshot = useCallback(() => signal?.peek(), [signal])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * 在容器上挂载 Core 控制器，卸载时释放。挂载参数只在首次挂载时读取，
 * 之后 data / theme / settings 的变化通过控制器方法增量同步。
 */
export function useKLineChart(
  containerRef: RefObject<HTMLElement | null>,
  options: KLineChartOptions = {},
): ChartController | null {
  const [controller, setController] = useState<ChartController | null>(null)
  // 包一层对象，reject(undefined) 也能被识别为失败。
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null)
  const runtimeRef = useRef<CoreRuntime | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  // 记录已下发给控制器的值，避免挂载后重复同步同一引用。
  const appliedRef = useRef<Pick<KLineChartOptions, 'data' | 'theme' | 'settings'>>({})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let created: ChartController | null = null
    let disposeInput: (() => void) | null = null
    const mount = optionsRef.current

    void (async () => {
      try {
        const runtime = await loadCoreRuntime(mount.factory)
        const next = await runtime.factory({
          container,
          data: mount.data,
          symbols: mount.symbols,
          marketSessions: mount.marketSessions,
          settings: mount.settings,
          initialZoomLevel: mount.initialZoomLevel,
          zoomLevels: mount.zoomLevels,
          theme: mount.theme,
        })
        // StrictMode 双挂载或创建期间卸载：迟到的控制器立即释放。
        if (cancelled) {
          next.dispose()
          return
        }
        created = next
        if (mount.input !== false) {
          const hooks = mount.input && typeof mount.input === 'object' ? mount.input : {}
          disposeInput = runtime.bindChartInput(next, { surface: container }, hooks)
        }
        runtimeRef.current = runtime
        appliedRef.current = { data: mount.data, theme: mount.theme, settings: mount.settings }
        if (mount.theme === undefined) applySettingsTheme(next, mount.settings?.theme)
        setController(next)
      } catch (cause) {
        if (!cancelled) setFailure({ cause })
      }
    })()

    return () => {
      cancelled = true
      setController(null)
      disposeInput?.()
      created?.dispose()
    }
  }, [containerRef])

  const { data, theme, settings } = options

  useEffect(() => {
    if (!controller || appliedRef.current.data === data) return
    appliedRef.current.data = data
    controller.setData(data ?? [])
  }, [controller, data])

  useEffect(() => {
    if (!controller || appliedRef.current.theme === theme) return
    appliedRef.current.theme = theme
    if (theme !== undefined) controller.setTheme(theme)
  }, [controller, theme])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!controller || !runtime || appliedRef.current.settings === settings) return
    appliedRef.current.settings = settings
    if (settings === undefined) return
    const resolved = runtime.resolveSettings(settings)
    controller.updateSettingsFacade(resolved)
    if (theme === undefined) applySettingsTheme(controller, resolved.theme)
  }, [controller, settings, theme])

  // 交给最近的 Error Boundary 处理创建失败。
  if (failure) throw failure.cause
  return controller
}

/** 渲染图表容器并挂载 Core；通过 ref 的 `getController()` 获取控制器。 */
export const KLineChart = forwardRef<KLineChartHandle, KLineChartProps>(function KLineChart(
  props: KLineChartProps,
  ref: ForwardedRef<KLineChartHandle>,
) {
  const { onReady, style, className, ...options } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const controller = useKLineChart(containerRef, options)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useImperativeHandle(ref, () => ({ getController: () => controller }), [controller])

  useEffect(() => {
    if (controller) onReadyRef.current?.(controller)
  }, [controller])

  return createElement('div', {
    ref: containerRef,
    className,
    style: { width: '100%', height: '100%', ...style },
  })
})
