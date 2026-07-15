import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createScene } from '../../rendering/scene/createScene'
import { createLayerFromPlugin } from '../../rendering/scene/createLayerFromPlugin'
import { RendererPluginManager } from '../../foundation/plugin/rendererPluginManager'
import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index'

/**
 * Phase 0 契约：绘制只走 Scene；Manager 仅注册表；
 * useRenderer 桥 = register + addLayer；setRendererEnabled 驱动 Layer 显隐。
 */
describe('render single-path (Phase 0)', () => {
  let scene: ReturnType<typeof createScene>
  let manager: RendererPluginManager
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scene = createScene()
    manager = new RendererPluginManager()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    scene.dispose()
    manager.clear()
    consoleError.mockRestore()
  })

  function makePlugin(name: string, draw = vi.fn()): RendererPlugin {
    return {
      name,
      paneId: 'main',
      priority: RENDERER_PRIORITY.MAIN,
      enabled: true,
      draw,
    }
  }

  function paintMain() {
    scene.paintPane({
      renderer: {} as never,
      region: { x: 0, y: 0, width: 100, height: 100, dpr: 1 },
      paneRole: 'main',
      paneId: 'main',
      frameNumber: 1,
      deltaMs: 0,
    })
  }

  it('bridge: register + createLayerFromPlugin paints via scene only', () => {
    const draw = vi.fn()
    const plugin = makePlugin('bridge-a', draw)
    const ctx = { theme: 'dark' } as unknown as RenderContext
    manager.register(plugin)
    scene.addLayer(createLayerFromPlugin(plugin, () => ctx, 'main'))

    paintMain()
    expect(draw).toHaveBeenCalledOnce()
    expect(draw).toHaveBeenCalledWith(ctx)
  })

  it('setLayerVisibility false skips paint (timeshare candle path)', () => {
    const draw = vi.fn()
    const plugin = makePlugin('candle', draw)
    scene.addLayer(createLayerFromPlugin(plugin, () => ({}) as RenderContext, 'main'))

    expect(scene.setLayerVisibility('plugin:candle', false)).toBe(true)
    paintMain()
    expect(draw).not.toHaveBeenCalled()

    scene.setLayerVisibility('plugin:candle', true)
    paintMain()
    expect(draw).toHaveBeenCalledOnce()
  })

  it('remove path: Manager.unregister owns onUninstall; removeLayer does not dispose-call it', () => {
    const onUninstall = vi.fn()
    const plugin = makePlugin('to-remove', vi.fn())
    plugin.onUninstall = onUninstall
    manager.register(plugin)
    scene.addLayer(createLayerFromPlugin(plugin, () => null, 'main'))

    manager.unregister('to-remove')
    expect(onUninstall).toHaveBeenCalledOnce()

    scene.removeLayer('plugin:to-remove')
    // layer.dispose empty — no second onUninstall
    expect(onUninstall).toHaveBeenCalledOnce()
  })

  it('one layer throw does not abort sibling layers', () => {
    const ok = vi.fn()
    const boom = vi.fn(() => {
      throw new Error('boom')
    })
    scene.addLayer(
      createLayerFromPlugin(makePlugin('boom', boom), () => ({}) as RenderContext, 'main'),
    )
    scene.addLayer(
      createLayerFromPlugin(makePlugin('ok', ok), () => ({}) as RenderContext, 'main'),
    )

    expect(() => paintMain()).not.toThrow()
    expect(boom).toHaveBeenCalledOnce()
    expect(ok).toHaveBeenCalledOnce()
  })

  it('Manager.render is not required for paint (single path)', () => {
    const draw = vi.fn()
    const plugin = makePlugin('only-scene', draw)
    manager.register(plugin)
    manager.setEnabled(plugin.name, false)
    scene.addLayer(createLayerFromPlugin(plugin, () => ({}) as RenderContext, 'main'))

    // 旧路径：enabled false → Manager 不画
    const errors = manager.render('main', { pane: { id: 'main' } } as RenderContext)
    expect(errors).toEqual([])
    expect(draw).not.toHaveBeenCalled()

    // 新路径：Scene 仍画
    paintMain()
    expect(draw).toHaveBeenCalledOnce()
  })
})
