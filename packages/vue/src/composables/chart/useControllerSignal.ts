/** 将 Core ReadonlySignal 接入 Vue 响应式系统。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { computed, shallowRef, watch, type ComputedRef, type Ref } from 'vue'

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
