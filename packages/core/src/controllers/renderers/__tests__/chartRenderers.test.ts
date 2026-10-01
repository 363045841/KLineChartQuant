// @vitest-environment jsdom
/** 通过正式包入口验证第三方 Layer、指标和插件的实例生命周期。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChartDom,
  installAnimationFrameQueue,
  installChartDomStubs,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import {
  type ChartController,
  type ChartRendererAccess,
  createChartController,
  getChartRenderers,
  Indicator,
  IndicatorKind,
  type IndicatorRendererOptions,
  type Layer,
  makePluginLayerId,
  type Plugin,
  type RenderContext,
} from '@/index'

/** 构造第三方自有 Layer，记录真实 Scene 对其绘制和释放的调用。 */
function createExternalLayer(id: string, pane = 'main') {
  return {
    id,
    pane,
    role: 'overlay',
    z: 100,
    visible: true,
    paint: vi.fn((_ctx: RenderContext) => {}),
    dispose: vi.fn(() => {}),
  } satisfies Layer<RenderContext>
}

const indicatorName = 'vendorCustomLayer'
const indicatorLayerId = makePluginLayerId(indicatorName)
const indicatorLayers: ReturnType<typeof createExternalLayer>[] = []

@Indicator({
  name: indicatorName,
  displayName: 'Vendor Custom Layer',
  kind: IndicatorKind.Indicator,
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  mainPane: { rendererName: indicatorName },
})
class ExternalIndicator {
  /** 指标工厂返回同一 Layer 契约，实例创建由指标状态驱动。 */
  static rendererFactory(options?: IndicatorRendererOptions): Layer<RenderContext> {
    const layer = createExternalLayer(indicatorLayerId, options?.paneId)
    indicatorLayers.push(layer)
    return layer
  }
}
void ExternalIndicator

describe('public chart renderer access', () => {
  const controllers: ChartController[] = []
  const containers: HTMLElement[] = []
  let restoreDom: () => void
  let frames: ReturnType<typeof installAnimationFrameQueue>

  beforeEach(() => {
    restoreDom = installChartDomStubs()
    frames = installAnimationFrameQueue()
    indicatorLayers.length = 0
    localStorage.clear()
  })

  afterEach(async () => {
    await Promise.all(controllers.splice(0).map((controller) => controller.dispose()))
    for (const container of containers.splice(0)) container.remove()
    restoreDom()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** 使用真实 Controller 和现有 DOM 夹具挂载图表。 */
  async function mount(): Promise<ChartController> {
    const dom = createChartDom(800, 600)
    document.body.appendChild(dom.container)
    containers.push(dom.container)
    const controller = await createChartController({
      ...dom,
      settings: { rendererBackend: 'canvas' },
      data: [
        { timestamp: 60_000, open: 10, high: 12, low: 9, close: 11 },
        { timestamp: 120_000, open: 11, high: 13, low: 10, close: 12 },
      ],
    })
    controllers.push(controller)
    return controller
  }

  it('uses exact Layer IDs and isolates registrations between chart instances', async () => {
    const first = await mount()
    const second = await mount()
    const layer = createExternalLayer('vendor:overlay')
    const duplicate = createExternalLayer(layer.id)
    first.useRenderer(layer)
    first.useRenderer(duplicate)
    expect(first.getRenderer(layer.id)).toBe(layer)
    expect(first.getRenderer(makePluginLayerId(layer.id))).toBeUndefined()
    expect(second.getRenderer(layer.id)).toBeUndefined()
    first.removeRenderer(layer.id)
    first.removeRenderer(layer.id)
    expect(first.getRenderer(layer.id)).toBeUndefined()
    expect(layer.dispose).toHaveBeenCalledTimes(1)
    expect(duplicate.dispose).not.toHaveBeenCalled()
    duplicate.dispose()
    await first.dispose()
    expect(layer.dispose).toHaveBeenCalledTimes(1)
  })

  it('repaints external private data and merges repeated requests into one frame', async () => {
    const controller = await mount()
    let value = 1
    const painted: number[] = []
    const layer = createExternalLayer('external-data')
    layer.paint.mockImplementation(() => painted.push(value))
    controller.useRenderer(layer)
    frames.flush()
    expect(painted).toEqual([1])
    value = 2
    controller.requestRender()
    controller.requestRender()
    controller.requestRender()
    expect(frames.pending()).toBe(1)
    frames.flush()
    expect(painted).toEqual([1, 2])
    controller.removeRenderer(layer.id)
    frames.flush()
    expect(painted).toEqual([1, 2])
  })

  it('mounts third-party indicator Layers from state and releases them on removal', async () => {
    const controller = await mount()
    const instanceId = controller.addIndicator(indicatorName, 'main')
    expect(instanceId).not.toBeNull()
    expect(indicatorLayers).toHaveLength(1)
    const layer = indicatorLayers[0]!
    expect(controller.getRenderer(indicatorLayerId)).toBe(layer)
    expect(controller.removeIndicator(instanceId!)).toBe(true)
    expect(controller.getRenderer(indicatorLayerId)).toBeUndefined()
    expect(layer.dispose).toHaveBeenCalledTimes(1)
    expect(controller.addIndicator(indicatorName, 'main')).not.toBeNull()
    expect(indicatorLayers).toHaveLength(2)
    expect(controller.getRenderer(indicatorLayerId)).toBe(indicatorLayers[1])
  })

  it('installs and uninstalls plugin Layers through the existing PluginHost', async () => {
    const controller = await mount()
    const layer = createExternalLayer('vendor:plugin')
    let renderers: ChartRendererAccess | undefined
    const plugin: Plugin = {
      name: 'vendor-plugin',
      version: '1.0.0',
      install(host) {
        renderers = getChartRenderers(host)
        renderers.useRenderer(layer)
      },
      uninstall() {
        renderers?.removeRenderer(layer.id)
      },
    }
    await controller.usePlugin(plugin)
    expect(controller.getRenderer(layer.id)).toBe(layer)
    await controller.removePlugin(plugin.name)
    expect(controller.getRenderer(layer.id)).toBeUndefined()
    expect(layer.dispose).toHaveBeenCalledTimes(1)
  })

  it('waits for pending plugin installation before uninstalling and releasing the Scene', async () => {
    const controller = await mount()
    const layer = createExternalLayer('pending-plugin')
    const hostLayer = createExternalLayer('host-layer')
    controller.useRenderer(hostLayer)
    let finishInstallation!: () => void
    const installation = new Promise<void>((resolve) => {
      finishInstallation = resolve
    })
    let renderers: ChartRendererAccess | undefined
    const uninstall = vi.fn(() => {
      expect(renderers?.getRenderer(layer.id)).toBe(layer)
      expect(hostLayer.dispose).not.toHaveBeenCalled()
      renderers?.removeRenderer(layer.id)
    })
    const pending = controller.usePlugin({
      name: 'pending-plugin',
      version: '1.0.0',
      async install(host) {
        renderers = getChartRenderers(host)
        await installation
        renderers.useRenderer(layer)
      },
      uninstall,
    })
    const disposed = controller.dispose()
    expect(controller.dispose()).toBe(disposed)
    finishInstallation()
    await pending
    await disposed
    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(layer.dispose).toHaveBeenCalledTimes(1)
    expect(hostLayer.dispose).toHaveBeenCalledTimes(1)
    const rejected = createExternalLayer('after-dispose')
    controller.useRenderer(rejected)
    controller.requestRender()
    expect(controller.getRenderer(rejected.id)).toBeUndefined()
    expect(rejected.dispose).not.toHaveBeenCalled()
    rejected.dispose()
    expect(frames.pending()).toBe(0)
  })
})
