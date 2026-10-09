/** 验证直接挂载 Core 的 React 适配器：挂载、释放、增量同步与 Signal 桥接。 */

import type {
  ChartController,
  ChartControllerFactory,
  KLineData,
  ReadonlySignal,
} from '@363045841yyt/klinechart-core'
import { act, render, waitFor } from '@testing-library/react'
import { Component, createElement, createRef, type ReactNode, StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KLineChart, type KLineChartHandle, useCoreSignal } from '../index'

type WritableSignal<T> = ReadonlySignal<T> & { set: (next: T) => void }

/** 最小可写 signal，行为与 Core 一致：Object.is 相等时不通知。 */
function fakeSignal<T>(initial: T): WritableSignal<T> {
  let current = initial
  const listeners = new Set<() => void>()
  const read = (() => current) as WritableSignal<T>
  read.peek = () => current
  read.set = (next: T) => {
    if (Object.is(current, next)) return
    current = next
    for (const listener of listeners) listener()
  }
  read.subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return read
}

function createFakeController() {
  const theme = fakeSignal<'light' | 'dark'>('light')
  const controller = {
    theme,
    setData: vi.fn(),
    setTheme: vi.fn((next: 'light' | 'dark') => theme.set(next)),
    setSystemTheme: vi.fn(),
    updateSettingsFacade: vi.fn(),
    dispose: vi.fn(),
  }
  return { controller, asController: controller as unknown as ChartController }
}

/** 返回可控的工厂：resolve 时机由测试决定。 */
function deferredFactory() {
  const fakes: ReturnType<typeof createFakeController>[] = []
  const pending: Array<() => void> = []
  const factory = vi.fn<ChartControllerFactory>(
    () =>
      new Promise<ChartController>((resolve) => {
        const fake = createFakeController()
        fakes.push(fake)
        pending.push(() => resolve(fake.asController))
      }),
  )
  const resolveAll = async () => {
    await act(async () => {
      for (const resume of pending.splice(0)) resume()
    })
  }
  return { factory, fakes, resolveAll }
}

const bar = (timestamp: number): KLineData =>
  ({ timestamp, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }) as KLineData

describe('KLineChart', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('mounts the core controller into its container and disposes it on unmount', async () => {
    const { factory, fakes, resolveAll } = deferredFactory()
    const onReady = vi.fn()
    const ref = createRef<KLineChartHandle>()
    const data = [bar(1)]
    const { container, unmount } = render(
      createElement(KLineChart, { factory, data, zoomLevels: 8, onReady, ref }),
    )

    await waitFor(() => expect(factory).toHaveBeenCalledOnce())
    const mountOptions = factory.mock.calls[0]?.[0]
    expect(mountOptions?.container).toBe(container.firstElementChild)
    expect(mountOptions?.data).toBe(data)
    expect(mountOptions?.zoomLevels).toBe(8)

    await resolveAll()
    const fake = fakes[0]
    expect(ref.current?.getController()).toBe(fake?.asController)
    expect(onReady).toHaveBeenCalledWith(fake?.asController)
    // 挂载时已带入的 data 不重复同步。
    expect(fake?.controller.setData).not.toHaveBeenCalled()

    unmount()
    expect(fake?.controller.dispose).toHaveBeenCalledOnce()
  })

  it('disposes a controller that resolves after unmount', async () => {
    const { factory, fakes, resolveAll } = deferredFactory()
    const onReady = vi.fn()
    const { unmount } = render(createElement(KLineChart, { factory, onReady }))
    await waitFor(() => expect(factory).toHaveBeenCalledOnce())

    unmount()
    await resolveAll()
    expect(fakes[0]?.controller.dispose).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('keeps exactly one live controller under StrictMode double mount', async () => {
    const { factory, fakes, resolveAll } = deferredFactory()
    render(createElement(StrictMode, null, createElement(KLineChart, { factory })))
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2))
    await resolveAll()

    const live = fakes.filter((fake) => fake.controller.dispose.mock.calls.length === 0)
    expect(live).toHaveLength(1)
  })

  it('syncs data, theme and settings changes after mount', async () => {
    const { factory, fakes, resolveAll } = deferredFactory()
    const first = [bar(1)]
    const { rerender } = render(createElement(KLineChart, { factory, data: first }))
    await waitFor(() => expect(factory).toHaveBeenCalledOnce())
    await resolveAll()
    const fake = fakes[0]

    rerender(createElement(KLineChart, { factory, data: first }))
    expect(fake?.controller.setData).not.toHaveBeenCalled()

    const second = [bar(1), bar(2)]
    rerender(createElement(KLineChart, { factory, data: second }))
    expect(fake?.controller.setData).toHaveBeenCalledWith(second)

    rerender(createElement(KLineChart, { factory, data: second, settings: { theme: 'dark' } }))
    expect(fake?.controller.updateSettingsFacade).toHaveBeenCalledOnce()
    expect(fake?.controller.setTheme).toHaveBeenLastCalledWith('dark')

    rerender(
      createElement(KLineChart, {
        factory,
        data: second,
        settings: { theme: 'dark' },
        theme: 'light',
      }),
    )
    expect(fake?.controller.setTheme).toHaveBeenLastCalledWith('light')
  })

  it('injects the system theme when settings.theme is auto', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const { factory, fakes, resolveAll } = deferredFactory()
    render(createElement(KLineChart, { factory, settings: { theme: 'auto' } }))
    await waitFor(() => expect(factory).toHaveBeenCalledOnce())
    await resolveAll()

    expect(fakes[0]?.controller.setSystemTheme).toHaveBeenCalledWith('dark')
    expect(fakes[0]?.controller.setTheme).not.toHaveBeenCalled()
  })

  it('surfaces factory failures to the nearest error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('no gpu')
    const factory = vi.fn<ChartControllerFactory>(() => Promise.reject(failure))
    const caught = vi.fn()

    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      override state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      override componentDidCatch(error: unknown) {
        caught(error)
      }
      override render() {
        return this.state.failed ? null : this.props.children
      }
    }

    render(createElement(Boundary, null, createElement(KLineChart, { factory })))
    await waitFor(() => expect(caught).toHaveBeenCalledWith(failure))
  })
})

describe('useCoreSignal', () => {
  it('re-renders when the core signal changes', () => {
    const theme = fakeSignal<'light' | 'dark'>('light')
    function Probe() {
      return createElement('span', null, useCoreSignal(theme))
    }
    const { container } = render(createElement(Probe))
    expect(container.textContent).toBe('light')

    act(() => theme.set('dark'))
    expect(container.textContent).toBe('dark')
  })

  it('returns undefined before a controller exists', () => {
    function Probe() {
      return createElement('span', null, String(useCoreSignal(null)))
    }
    const { container } = render(createElement(Probe))
    expect(container.textContent).toBe('undefined')
  })
})
