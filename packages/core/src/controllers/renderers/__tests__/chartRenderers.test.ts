// @vitest-environment jsdom
/** 通过正式包入口验证第三方 Layer、指标和插件的实例生命周期。 */
import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataContext } from '@/data/management/impl/context.js'
import { createDataSourceFixture } from '@/data/provider/__tests__/helpers/providerTestKit.js'
import {
  createChartDom,
  installAnimationFrameQueue,
  installChartDomStubs,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { registerPlotIndicatorFixture } from '@/engine/indicators/__tests__/helpers/plotIndicatorTestKit'
import { resolveIndicatorLayerId } from '@/engine/indicators/indicatorLayerNaming.js'
import { PRICE_AXIS_RANGE_MODE } from '@/foundation/config/priceAxisRangeMode.js'
import {
  type ChartController,
  type ChartRendererAccess,
  createChartController,
  getChartRenderers,
  type IndicatorMetadata,
  type IndicatorRendererOptions,
  type Layer,
  makePluginLayerId,
  type Plugin,
  type RenderContext,
  registerIndicators,
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

const ExternalIndicator = {
  kind: 'indicator',
  name: indicatorName,
  displayName: 'Vendor Custom Layer',
  category: 'main',
  defaultPaneId: 'main',
  getRendererName: () => indicatorName,
  /** 指标工厂在每次实例挂载时创建新的 Layer。 */
  rendererFactory: vi.fn((options?: IndicatorRendererOptions) =>
    createExternalLayer(indicatorLayerId, options?.paneId),
  ),
} satisfies IndicatorMetadata
registerIndicators([
  {
    kind: 'definition',
    candidate: { key: indicatorName, origin: 'third-party', identity: 'native' },
    definition: ExternalIndicator,
  },
])

/** 远价位主图指标：用于验证自动口径与 K 线口径对轴范围的取舍。 */
const FAR_PRICE = 300
const FAR_PRICE_INDICATOR = 'farPriceRange'
const CANDLE_OBJECT_ID = 'plugin:candle'
/** 与 mount 的行情夹具一致：两根 K 线的 high/low 合并区间。 */
const BAR_MIN = 9
const BAR_MAX = 13

registerPlotIndicatorFixture({
  name: FAR_PRICE_INDICATOR,
  category: 'main',
  compute: (data) => ({
    plots: [
      {
        kind: 'line',
        id: 'far',
        label: 'FAR',
        data: data.map(() => ({ value: FAR_PRICE, color: 'red' })),
        visible: true,
        offset: 0,
        size: ShapeSize.auto,
        dash: [],
      },
    ],
    fills: [],
  }),
})

/** 读取指标工厂最近一次创建的 Layer。 */
function lastIndicatorLayer(): Layer<RenderContext> {
  const { results } = ExternalIndicator.rendererFactory.mock
  return results[results.length - 1]!.value
}

describe('public chart renderer access', () => {
  const controllers: ChartController[] = []
  const containers: HTMLElement[] = []
  const hosts: MarketDataContext[] = []
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
    for (const host of hosts.splice(0)) host.dispose()
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
    const host = new MarketDataContext()
    hosts.push(host)
    host.registerDataSource(
      createDataSourceFixture(
        [
          { timestamp: 60_000, open: 10, high: 12, low: 9, close: 11 },
          { timestamp: 120_000, open: 11, high: 13, low: 10, close: 12 },
        ],
        false,
      ).source,
    )
    const instrument = await host.resolveInstrument('test', 'A')
    const controller = await createChartController({
      ...dom,
      marketDataContext: host,
      symbols: [{ instrument, period: 'daily' }],
      settings: { rendererBackend: 'canvas' },
    })
    controllers.push(controller)
    await vi.waitFor(() => expect(controller.getData()).toHaveLength(2))
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

  it('价格轴范围由可见行情与当前口径决定', async () => {
    const controller = await mount()
    const priceAxisId = controller.axes.bindingFor(CANDLE_OBJECT_ID).axisId
    controller.addIndicator(FAR_PRICE_INDICATOR, {}, 'main')

    // 自动适应：远价位指标参与定轴。
    await vi.waitFor(() => {
      frames.flush()
      expect(controller.axes.get(priceAxisId).getDisplayRange().maxPrice).toBeCloseTo(FAR_PRICE)
    })

    // 仅缩放价格图表：指标不再撑轴，范围回到可见行情。
    controller.axes.setRangeMode(priceAxisId, PRICE_AXIS_RANGE_MODE.Bars)
    await vi.waitFor(() => {
      frames.flush()
      const range = controller.axes.get(priceAxisId).getDisplayRange()
      expect(range.minPrice).toBeCloseTo(BAR_MIN)
      expect(range.maxPrice).toBeCloseTo(BAR_MAX)
    })
  })

  it('同窗口主图指标并入行情对象轴，最新价签绘制到行情轴列', async () => {
    const controller = await mount()
    const price = controller.axes.bindingFor('plugin:candle')
    const indicatorId = controller.addIndicator(indicatorName, {}, 'main')!
    expect(controller.axes.bindingFor(indicatorId).axisId).toBe(price.axisId)
    const captured = controller.captureFrame(() => {
      const canvas =
        containers[containers.length - 1]!.querySelector<HTMLCanvasElement>('.right-axis-overlay')!
      const context = canvas.getContext('2d')!
      const latest = vi.mocked(context.fillText).mock.calls.filter(([text]) => text === '12.00')
      expect(latest.length).toBeGreaterThan(0)
      for (const [, x] of latest)
        expect(controller.axes.hitTest(price.paneId, x)).toBe(price.axisId)
    })
    frames.flush()
    await captured
  })

  it('重复 Layer 身份在 API 入口抛异常，既有对象不受影响', async () => {
    const controller = await mount()
    const winner = createExternalLayer('vendor:overlay')
    const loser = createExternalLayer(winner.id)

    controller.useRenderer(winner)
    expect(() => controller.useRenderer(loser)).toThrow(winner.id)

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

    const instanceId = controller.addIndicator(indicatorName)
    expect(instanceId).not.toBeNull()
    const layer = lastIndicatorLayer()
    const expectedLayerId = resolveIndicatorLayerId(indicatorName, 'main', 'renderer', instanceId!)
    expect(controller.getRenderer(expectedLayerId)).toBeDefined()

    expect(controller.removeIndicator(instanceId!)).toBe(true)
    expect(controller.getRenderer(expectedLayerId)).toBeUndefined()
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

