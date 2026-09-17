/** 将 Core ReadonlySignal 接入 Vue 响应式系统。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { type ComputedRef, computed, type Ref, shallowRef, watch } from 'vue'

type ReadonlyControllerSignal<T> = {
  peek(): T
  subscribe(listener: () => void): () => void
}

/** 订阅 Controller 信号并返回只读 Vue computed，不镜像业务状态。 */
export function useControllerSignal<T>(
  controllerRef: Ref<ChartController | null>,
  select: (controller: ChartController) => ReadonlyControllerSignal<T> | undefined,
  fallback: () => T,
): ComputedRef<T> {
  const snapshot = shallowRef<T>(fallback())
  watch(
    controllerRef,
    (controller, _previous, onCleanup) => {
      if (!controller) {
        snapshot.value = fallback()
        return
      }
      const signal = select(controller)
      if (!signal) {
        snapshot.value = fallback()
        return
      }
      snapshot.value = signal.peek()
      const unsubscribe = signal.subscribe(() => {
        snapshot.value = signal.peek()
      })
      onCleanup(unsubscribe)
    },
    { immediate: true },
  )
  return computed(() => snapshot.value)
}

/**
 * 订阅 Controller 信号的一个字段，仅投影值变化时才通知 Vue。
 * 高频快照可保持 Core 内部更新，避免对象引用变化导致 Vue 无效刷新。
 */
export function useControllerSignalValue<T, TValue>(
  controllerRef: Ref<ChartController | null>,
  select: (controller: ChartController) => ReadonlyControllerSignal<T> | undefined,
  project: (value: T) => TValue,
  fallback: () => TValue,
): ComputedRef<TValue> {
  const snapshot = shallowRef<TValue>(fallback())
  watch(
    controllerRef,
    (controller, _previous, onCleanup) => {
      if (!controller) {
        snapshot.value = fallback()
        return
      }
      const signal = select(controller)
      if (!signal) {
        snapshot.value = fallback()
        return
      }
      const sync = () => {
        const next = project(signal.peek())
        if (Object.is(snapshot.value, next)) return
        snapshot.value = next
      }
      sync()
      onCleanup(signal.subscribe(sync))
    },
    { immediate: true },
  )
  return computed(() => snapshot.value)
}
