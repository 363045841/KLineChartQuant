// @vitest-environment jsdom

import { type Static, Type } from 'typebox'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { loadBuiltinIndicators } from '../../engine/indicators/registerBuiltins'
import { getRegisteredChartTools, Tool } from '../../foundation/agent/chartToolRegistry'
import { createChartController } from '../createChartController'
import type { KLineData } from '../types'

function createBars(length = 30): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: (index + 1) * 60_000,
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }))
}

const hostInputSchema = Type.Object({ value: Type.Number() })

/** @Tool 宿主样例：模拟外部宿主经装饰器暴露领域方法。 */
class SampleToolHost {
  @Tool({
    name: 'sample_echo_tool',
    label: 'Sample Echo',
    description: 'Returns the provided value; test-only tool host.',
    parameters: hostInputSchema,
    safety: 'read-only',
  })
  sampleEchoTool(input: Static<typeof hostInputSchema>): string {
    return `echo:${String(input.value)}`
  }
}

async function mountController() {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  document.body.appendChild(container)
  const ctrl = await createChartController({ container, data: createBars() })
  return {
    ctrl,
    cleanup: () => {
      ctrl.dispose()
      container.remove()
    },
  }
}

describe('createChartController agent tool hosts', () => {
  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubAnimationFrame()
    HTMLCanvasElement.prototype.getContext = createCanvasGetContextMock()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registerToolHost exposes the host via agent.toolHosts (idempotent)', async () => {
    const { ctrl, cleanup } = await mountController()
    const host = new SampleToolHost()

    ctrl.registerToolHost(host)
    ctrl.registerToolHost(host)

    expect(ctrl.agent.toolHosts.filter((h) => h === host)).toHaveLength(1)
    cleanup()
  })

  it('unregisterToolHost removes a previously registered host', async () => {
    const { ctrl, cleanup } = await mountController()
    const host = new SampleToolHost()

    ctrl.registerToolHost(host)
    expect(ctrl.agent.toolHosts).toContain(host)
    ctrl.unregisterToolHost(host)
    expect(ctrl.agent.toolHosts).not.toContain(host)
    cleanup()
  })

  it('a @Tool method on a registered host resolves via owns and executes', async () => {
    const { ctrl, cleanup } = await mountController()
    const host = new SampleToolHost()
    ctrl.registerToolHost(host)

    const registered = getRegisteredChartTools().find((t) => t.config.name === 'sample_echo_tool')
    expect(registered).toBeDefined()
    const target = registered!.owns(host) ? host : null
    expect(target).toBe(host)
    await expect(
      registered!.execute(
        target!,
        { value: 42 },
        { signal: new AbortController().signal, progress: () => {} },
      ),
    ).resolves.toBe('echo:42')
    ctrl.unregisterToolHost(host)
    cleanup()
  })
})
