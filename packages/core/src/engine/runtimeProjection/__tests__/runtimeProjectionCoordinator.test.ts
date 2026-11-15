/** 协调提交契约：重入状态必须再次收敛，失败阶段不能提交绘制。 */
import { describe, expect, it, vi } from 'vitest'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import { RuntimeProjectionCoordinator } from '../impl/runtimeProjectionCoordinator.js'
import type { RuntimeProjectionDependencies, RuntimeProjectionSnapshot } from '../types.js'

/** 使用真实 signal 驱动独立协调者，夹具只提供各阶段的资源端口。 */
function createHarness() {
  const state = createSignal<RuntimeProjectionSnapshot>({
    panes: [],
    axes: new Map(),
    indicators: { instances: [], colors: resolveThemeColors('dark', true), definitionRevision: 0 },
    ranges: {},
    pricePaneId: 'main',
    leftAxisVisible: false,
    layoutOptions: {},
  })
  const deps = {
    capture: () => state(),
    projectPanes: vi.fn<RuntimeProjectionDependencies['projectPanes']>(),
    projectAxes: vi.fn<RuntimeProjectionDependencies['projectAxes']>(),
    configureAxes: vi.fn<RuntimeProjectionDependencies['configureAxes']>(),
    projectLayers: vi.fn<RuntimeProjectionDependencies['projectLayers']>(),
    invalidateFrame: vi.fn<RuntimeProjectionDependencies['invalidateFrame']>(),
    requestDraw: vi.fn<RuntimeProjectionDependencies['requestDraw']>(),
  }
  return { state, deps, coordinator: new RuntimeProjectionCoordinator(deps) }
}

describe('RuntimeProjectionCoordinator', () => {
  it('settles writes during commit before drawing and keeps tracking subsequent changes', () => {
    const harness = createHarness()
    harness.deps.projectAxes.mockImplementation(() => {
      if (!harness.state.peek().leftAxisVisible)
        harness.state.set({ ...harness.state.peek(), leftAxisVisible: true })
    })
    harness.deps.requestDraw.mockImplementation(() => {
      expect(harness.deps.configureAxes).toHaveBeenLastCalledWith(harness.state.peek())
    })
    harness.coordinator.start()
    expect(harness.deps.requestDraw).toHaveBeenCalledOnce()
    harness.state.set({ ...harness.state.peek(), ranges: {} })
    expect(harness.deps.requestDraw).toHaveBeenCalledTimes(2)
    harness.coordinator.dispose()
    harness.state.set({ ...harness.state.peek(), ranges: {} })
    expect(harness.deps.requestDraw).toHaveBeenCalledTimes(2)
  })

  it('does not draw failed partial resources and retries the complete projection on the next synchronization', () => {
    const failure = new Error('configuration failed')
    const harness = createHarness()
    harness.deps.configureAxes.mockImplementationOnce(() => { throw failure })
    expect(() => harness.coordinator.synchronize()).toThrow(failure)
    expect(harness.deps.projectLayers).not.toHaveBeenCalled()
    expect(harness.deps.requestDraw).not.toHaveBeenCalled()
    harness.coordinator.synchronize()
    expect(harness.deps.projectPanes).toHaveBeenCalledTimes(2)
    expect(harness.deps.projectLayers).toHaveBeenCalledOnce()
    expect(harness.deps.requestDraw).toHaveBeenCalledOnce()
  })
})
