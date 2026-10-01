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
  /** 指标工厂在每次实例挂载时创建新的 Layer。 */
  static rendererFactory = vi.fn((options?: IndicatorRendererOptions) =>
    createExternalLayer(indicatorLayerId, options?.paneId),
  )
}
void ExternalIndicator

/** 读取指标工厂最近一次创建的 Layer。 */
function lastIndicatorLayer(): Layer<RenderContext> {
  const { results } = ExternalIndicator.rendererFactory.mock
  return results[results.length - 1]!.value
}

describe('public chart renderer access', () => {
  const controllers: ChartController[] = []
  const containers: HTMLElement[] = []
  let restoreDom: () => void
  let frames: ReturnType<typeof installAnimationFrameQueue>

  beforeEach(() => {
    restoreDom = installChartDomStubs()
    frames = installAnimationFrameQueue()
    ExternalIndicator.rendererFactory.mockClear()
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

  it('mounts, reads and removes a Layer by its exact id', async () => {
    const controller = await mount()
    const layer = createExternalLayer('vendor:overlay')

    controller.useRenderer(layer)
    expect(controller.getRenderer(layer.id)).toBe(layer)

    controller.removeRenderer(layer.id)
    expect(controller.getRenderer(layer.id)).toBeUndefined()
    expect(layer.dispose).toHaveBeenCalledTimes(1)

    // 重复移除是幂等 no-op
    controller.removeRenderer(layer.id)
    expect(layer.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps renderer registrations isolated between chart instances', async () => {
    const first = await mount()
    const second = await mount()
    const layer = createExternalLayer('vendor:overlay')

    first.useRenderer(layer)

    expect(first.getRenderer(layer.id)).toBe(layer)
    expect(second.getRenderer(layer.id)).toBeUndefined()
  })

  it('keeps the first layer for a duplicate id and leaves the loser to the caller', async () => {
    const controller = await mount()
    const winner = createExternalLayer('vendor:overlay')
    const loser = createExternalLayer(winner.id)

    controller.useRenderer(winner)
    controller.useRenderer(loser)

    expect(controller.getRenderer(winner.id)).toBe(winner)
    expect(loser.dispose).not.toHaveBeenCalled()
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

  it('releases remaining host layers on dispose and ignores later mutations', async () => {
    const controller = await mount()
    const layer = createExternalLayer('host-layer')
    controller.useRenderer(layer)

    await controller.dispose()
    expect(layer.dispose).toHaveBeenCalledTimes(1)

    const rejected = createExternalLayer('after-dispose')
    controller.useRenderer(rejected)
    controller.requestRender()
    expect(controller.getRenderer(rejected.id)).toBeUndefined()
    expect(rejected.dispose).not.toHaveBeenCalled()
  })

  it('mounts a third-party indicator layer from state and releases it on removal', async () => {
    const controller = await mount()

    const instanceId = controller.addIndicator(indicatorName, 'main')
    expect(instanceId).not.toBeNull()
    const layer = lastIndicatorLayer()
    expect(controller.getRenderer(indicatorLayerId)).toBe(layer)

    expect(controller.removeIndicator(instanceId!)).toBe(true)
    expect(controller.getRenderer(indicatorLayerId)).toBeUndefined()
    expect(layer.dispose).toHaveBeenCalledTimes(1)
  })

  it('installs and uninstalls a plugin layer through the existing PluginHost', async () => {
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

  it('waits for a pending plugin install before unloading the plugin on dispose', async () => {
    const controller = await mount()
    const layer = createExternalLayer('pending-plugin')
    let finishInstallation!: () => void
    const installation = new Promise<void>((resolve) => {
      finishInstallation = resolve
    })
    let renderers: ChartRendererAccess | undefined
    const uninstall = vi.fn(() => {
      // 卸载期间 Scene 仍未释放，插件仍能访问自有 Layer
      expect(renderers?.getRenderer(layer.id)).toBe(layer)
      renderers?.removeRenderer(layer.id)
    })

    const installing = controller.usePlugin({
      name: 'pending-plugin',
      version: '1.0.0',
      async install(host) {
        renderers = getChartRenderers(host)
        await installation
        renderers.useRenderer(layer)
      },
      uninstall,
    })

    const disposing = controller.dispose()
    expect(controller.dispose()).toBe(disposing)

    finishInstallation()
    await installing
    await disposing

    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(layer.dispose).toHaveBeenCalledTimes(1)
  })
})
