import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { batch, createSignal } from '@363045841yyt/klinechart-core/reactivity'
import { describe, expect, it } from 'vitest'
import {
  type ComputedRef,
  effectScope,
  isProxy,
  isReadonly,
  nextTick,
  ref,
  shallowRef,
  watchEffect,
} from 'vue'
import { createMockChartController } from '../__tests__/_mockController.js'
import {
  useControllerSignal,
  useControllerSignalValue,
} from '../composables/chart/useControllerSignal.js'
import { useAlerts } from '../composables/useAlerts.js'
import { coreSignalToVueRef, useSignalSource } from './signalBridge.js'

function observedSignal<T>(initial: T) {
  const signal = createSignal(initial)
  const subscribe = signal.subscribe
  let subscribers = 0
  signal.subscribe = (listener) => {
    subscribers++
    const stop = subscribe(listener)
    return () => {
      subscribers--
      stop()
    }
  }
  return Object.assign(signal, { subscriberCount: () => subscribers })
}

describe('Core signal views', () => {
  it('keeps unread alert history local while switching the Core event source', () => {
    const event = (id: number) => ({
      ruleId: String(id),
      ruleName: 'price',
      triggeredAt: id,
      snapshotBar: { timestamp: id, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    })
    const first = createMockChartController()
    const second = createMockChartController()
    first.alertController.events.set([event(1)])
    second.alertController.events.set([event(10)])
    const controller = shallowRef<ChartController | null>(first)
    const scope = effectScope()
    const alerts = scope.run(() => useAlerts(controller))!
    expect(alerts.events.value).toBe(first.alertController.events.peek())
    expect(alerts.unreadCount.value).toBe(0)
    first.alertController.events.set([event(1), event(2)])
    first.alertController.events.set([event(1), event(2), event(3)])
    expect(alerts.unreadCount.value).toBe(2)
    alerts.resetUnread()
    first.alertController.events.set([event(1), event(2), event(3), event(4)])
    expect(alerts.unreadCount.value).toBe(1)
    controller.value = second
    expect(alerts.events.value).toBe(second.alertController.events.peek())
    expect(alerts.unreadCount.value).toBe(0)
    first.alertController.events.set([])
    expect(alerts.events.value).toBe(second.alertController.events.peek())
    controller.value = null
    expect(alerts.events.value).toEqual([])
    expect(alerts.unreadCount.value).toBe(0)
    scope.stop()
  })
  it('preserves Core object identity and batches notifications without a writable Vue value', async () => {
    const signal = createSignal({ count: 1 })
    const scope = effectScope()
    let view!: ComputedRef<{ count: number }>
    let runs = 0
    scope.run(() => {
      view = coreSignalToVueRef(signal)
      watchEffect(() => {
        void view.value
        runs++
      })
    })
    expect(isReadonly(view)).toBe(true)
    expect(view.value).toBe(signal.peek())
    expect(isProxy(view.value)).toBe(false)
    batch(() => {
      signal.set({ count: 2 })
      signal.set({ count: 3 })
    })
    expect(view.value).toBe(signal.peek())
    await nextTick()
    expect(runs).toBe(2)
    scope.stop()
  })

  it('switches controllers synchronously and releases old and disposed subscriptions', () => {
    const firstSignal = observedSignal(false)
    const secondSignal = observedSignal(true)
    const first = Object.assign(createMockChartController(), { canUndoDrawing: firstSignal })
    const second = Object.assign(createMockChartController(), { canUndoDrawing: secondSignal })
    const controller = shallowRef<ChartController | null>(first)
    const scope = effectScope()
    let view!: ComputedRef<boolean>
    scope.run(() => {
      view = useControllerSignal(
        controller,
        (chart) => chart.canUndoDrawing,
        () => false,
      )
    })
    expect(firstSignal.subscriberCount()).toBe(1)
    controller.value = second
    expect(view.value).toBe(true)
    expect(firstSignal.subscriberCount()).toBe(0)
    expect(secondSignal.subscriberCount()).toBe(1)
    controller.value = null
    expect(view.value).toBe(false)
    expect(secondSignal.subscriberCount()).toBe(0)
    controller.value = first
    scope.stop()
    expect(firstSignal.subscriberCount()).toBe(0)
  })

  it('detaches gated sources and reads their latest value when re-enabled', () => {
    const signal = observedSignal(1)
    const enabled = ref(true)
    const scope = effectScope()
    let view!: ComputedRef<number>
    scope.run(() => {
      view = useSignalSource(
        () => (enabled.value ? signal : undefined),
        (value) => value,
        () => 0,
      )
    })
    enabled.value = false
    expect(view.value).toBe(0)
    expect(signal.subscriberCount()).toBe(0)
    signal.set(2)
    enabled.value = true
    expect(view.value).toBe(2)
    expect(signal.subscriberCount()).toBe(1)
    scope.stop()
    expect(signal.subscriberCount()).toBe(0)
  })

  it('ignores viewport changes unrelated to the selected field', async () => {
    const chart = createMockChartController()
    const source = observedSignal(chart.viewport.peek())
    Object.assign(chart, { viewport: source })
    const controller = shallowRef<ChartController | null>(chart)
    const scope = effectScope()
    let view!: ComputedRef<number>
    let projections = 0
    let runs = 0
    scope.run(() => {
      view = useControllerSignalValue(
        controller,
        (api) => api.viewport,
        (viewport) => {
          projections++
          return viewport.zoomLevel
        },
        () => 1,
      )
      watchEffect(() => {
        void view.value
        runs++
      })
    })
    const before = projections
    const viewport = source.peek()
    source.set({ ...viewport, visibleFrom: viewport.visibleFrom + 1 })
    await nextTick()
    expect(runs).toBe(1)
    // One comparison, no recomputation of the cached Vue view.
    expect(projections).toBe(before + 1)
    source.set({ ...viewport, zoomLevel: viewport.zoomLevel + 1 })
    expect(view.value).toBe(viewport.zoomLevel + 1)
    await nextTick()
    expect(runs).toBe(2)
    scope.stop()
    expect(source.subscriberCount()).toBe(0)
  })
})
