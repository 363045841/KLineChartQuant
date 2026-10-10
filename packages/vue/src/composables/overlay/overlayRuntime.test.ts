import { type ComputePositionReturn, flip, offset, shift, size } from '@floating-ui/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFallbackLayer } from './fallbackLayers.js'
import { startFloatingPosition } from './floatingPosition.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const stop of cleanup.splice(0).reverse()) stop()
  document.body.innerHTML = ''
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function layer(trigger: HTMLElement, panel: HTMLElement) {
  const close = vi.fn((_restoreFocus: boolean) => instance.leave())
  const instance = createFallbackLayer({ trigger: () => trigger, panel: () => panel, close })
  cleanup.push(instance.leave)
  return { ...instance, close }
}

function position(x: number): ComputePositionReturn {
  return { x, y: 0, strategy: 'fixed', placement: 'bottom-start', middlewareData: {} }
}

function floatingFixture(computePosition: () => Promise<ComputePositionReturn>) {
  const stop = vi.fn()
  const updates: Array<() => void> = []
  const backend = {
    flip,
    offset,
    shift,
    size,
    computePosition,
    autoUpdate: vi.fn((_trigger: unknown, _panel: unknown, update: () => void) => {
      updates.push(update)
      update()
      return stop
    }),
  }
  const apply = vi.fn()
  const onError = vi.fn()
  const options = {
    trigger: document.createElement('button'),
    panel: document.createElement('div'),
    placement: 'auto' as const,
    offset: 4,
    matchTriggerWidth: false,
    apply,
    onError,
  }
  const lifetime = new AbortController()
  cleanup.push(() => lifetime.abort())
  return { backend, options, lifetime, apply, onError, stop, updates }
}

describe('overlay resource lifetimes', () => {
  it('dismisses only the top nested layer and closes descendants with their parent', () => {
    const trigger = document.createElement('button')
    const parentPanel = document.createElement('div')
    const childTrigger = document.createElement('button')
    parentPanel.append(childTrigger)
    const childPanel = document.createElement('div')
    document.body.append(trigger, parentPanel, childPanel)
    const parent = layer(trigger, parentPanel)
    const child = layer(childTrigger, childPanel)
    parent.enter()
    child.enter()
    childPanel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(child.close).toHaveBeenCalledWith(true)
    expect(parent.close).not.toHaveBeenCalled()
    child.enter()
    childPanel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(parent.close).not.toHaveBeenCalled()
    expect(child.close).toHaveBeenCalledTimes(1)
    parent.leave()
    expect(child.close).toHaveBeenLastCalledWith(false)
    childPanel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(child.close).toHaveBeenCalledTimes(2)
  })

  it('cancels positioning resources and ignores stale asynchronous results', async () => {
    const measurement = deferred<ComputePositionReturn>()
    const fixture = floatingFixture(() => measurement.promise)
    const loading = deferred<typeof fixture.backend>()
    const cancelled = startFloatingPosition(
      fixture.options,
      fixture.lifetime.signal,
      () => loading.promise,
    )
    fixture.lifetime.abort()
    loading.resolve(fixture.backend)
    await cancelled
    expect(fixture.backend.autoUpdate).not.toHaveBeenCalled()

    const active = floatingFixture(() => measurement.promise)
    await startFloatingPosition(active.options, active.lifetime.signal, async () => active.backend)
    active.lifetime.abort()
    expect(active.stop).toHaveBeenCalledOnce()
    measurement.resolve(position(10))
    await measurement.promise
    expect(active.apply).not.toHaveBeenCalled()

    const older = deferred<ComputePositionReturn>()
    const newer = deferred<ComputePositionReturn>()
    const measure = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const ordered = floatingFixture(measure)
    await startFloatingPosition(
      ordered.options,
      ordered.lifetime.signal,
      async () => ordered.backend,
    )
    ordered.updates[0]!()
    newer.resolve(position(20))
    await newer.promise
    const accepted = ordered.apply.mock.calls[0]?.[0]
    expect(accepted).toBeDefined()
    older.resolve(position(10))
    await older.promise
    expect(ordered.apply).toHaveBeenCalledOnce()
    expect(ordered.apply.mock.calls[0]?.[0]).toBe(accepted)
    ordered.lifetime.abort()
    expect(ordered.stop).toHaveBeenCalledOnce()
  })
})
